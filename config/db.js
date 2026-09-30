'use strict';

/**
 * Shared MySQL/TiDB pool.
 *
 * Every module that touched the database used to build its own pool inline, so
 * connection settings had to be edited in eight places. This module is the
 * single place connection options live.
 *
 * SSL: TiDB Serverless rejects any plaintext connection with
 * "Connections using insecure transport are prohibited". `ssl` is required
 * there, so it is always enabled rather than left to each caller.
 *
 * `rejectUnauthorized: true` validates the server certificate against the
 * trust store in Node. This passes against TiDB Cloud because its certificate
 * chains to a public CA. It would fail against a server presenting a self-signed
 * certificate; in that case set DB_SSL_CA to a PEM file path rather than
 * disabling verification.
 */

const path = require('path');
const fs = require('fs');
const mysql = require('mysql2/promise');

function buildSslOptions() {
  // Point DB_SSL_CA at a CA bundle when using a private or self-signed cert.
  if (process.env.DB_SSL_CA) {
    return {
      ca: fs.readFileSync(path.resolve(process.env.DB_SSL_CA), 'utf8'),
      rejectUnauthorized: true,
    };
  }
  return { rejectUnauthorized: true };
}

function poolConfig(overrides) {
  return {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USERNAME || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_DATABASE || 'db_chatbot',
    ssl: buildSslOptions(),
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    ...overrides,
  };
}

// Serverless hosts freeze idle instances and drop TCP connections without a
// FIN, so a pooled socket can be dead by the time the next request reuses it.
// keepAlive plus a conservative idle timeout lets the pool notice and recycle
// instead of handing out a broken connection.
const pool = mysql.createPool(
  poolConfig({
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
    // TiDB Serverless caps concurrent clusters well below a traditional
    // server's capacity, so keep the footprint small.
    connectionLimit: Number(process.env.DB_POOL_LIMIT) || 5,
    idleTimeout: 60000,
    maxIdle: 5,
  })
);

// A dropped connection surfaces here as a pool-level error event. Without a
// listener mysql2 emits an unhandled 'error', which crashes the process and
// shows up as a 500 rather than a single retried query.
pool.on('error', (err) => {
  if (err.code === 'ECONNRESET' || err.code === 'PROTOCOL_CONNECTION_LOST') {
    console.warn('[db] dropped pooled connection, it will be recreated:', err.code);
    return;
  }
  console.error('[db] pool error:', err.code || '', err.message);
});

module.exports = pool;
module.exports.poolConfig = poolConfig;
module.exports.buildSslOptions = buildSslOptions;

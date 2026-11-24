'use strict';

// setting ssl & pool database tidb


const path = require('path');
const fs = require('fs');
const mysql = require('mysql2/promise');

function buildSslOptions() {
  if (process.env.DB_SSL_CA) {
    return {
      ca: fs.readFileSync(path.resolve(process.env.DB_SSL_CA), 'utf8'),
      rejectUnauthorized: true,
    };
  }
  return { rejectUnauthorized: true };
}

const DEFAULT_DATABASE = 'db_chatbot';

const RESERVED_SCHEMAS = new Set([
  'sys',
  'mysql',
  'information_schema',
  'performance_schema',
  'metrics_schema',
]);

function resolveDatabase() {
  const raw = String(process.env.DB_DATABASE || '').trim();

  if (!raw) return DEFAULT_DATABASE;

  if (RESERVED_SCHEMAS.has(raw.toLowerCase())) {
    console.warn(
      `[db] DB_DATABASE="${raw}" is a reserved schema, falling back to "${DEFAULT_DATABASE}". ` +
        'Set DB_DATABASE in your deployment environment to the application schema.'
    );
    return DEFAULT_DATABASE;
  }

  return raw;
}

function poolConfig(overrides) {
  return {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USERNAME || 'root',
    password: process.env.DB_PASSWORD || '',
    database: resolveDatabase(),
    ssl: buildSslOptions(),
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    connectTimeout: Number(process.env.DB_CONNECT_TIMEOUT) || 20000,
    ...overrides,
  };
}

const pool = mysql.createPool(
  poolConfig({
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
    connectionLimit: Number(process.env.DB_POOL_LIMIT) || 5,
    idleTimeout: 60000,
    maxIdle: 5,
  })
);

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
module.exports.resolveDatabase = resolveDatabase;

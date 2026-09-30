require('dotenv').config({ quiet: true });
const bcrypt = require('bcryptjs');
const mysql = require('mysql2/promise');

const ADMIN_EMAIL = 'admin@smekda.sch.id';
const ADMIN_NAME = 'Super Admin IRIS-2';
const ADMIN_PASSWORD = 'admin123';
const BCRYPT_ROUNDS = 10;

const SETTINGS = [
  {
    key: 'greeting_message',
    value:
      'Hi, peeps! Cure your curiosity by asking me anything about SMK Negeri 2 Purwakarta. ^^',
  },
  { key: 'fallback_message', value: 'Sorry.... I don’t really catch that :[' },
];

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USERNAME || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_DATABASE || 'db_chatbot',
  waitForConnections: true,
  connectionLimit: 5,
});

async function ensureUsersTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(191) NOT NULL,
      email_verified_at TIMESTAMP NULL DEFAULT NULL,
      password VARCHAR(255) NOT NULL,
      remember_token VARCHAR(100) NULL DEFAULT NULL,
      created_at TIMESTAMP NULL DEFAULT NULL,
      updated_at TIMESTAMP NULL DEFAULT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY users_email_unique (email)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  `);
  console.log('[seed] users table ready');
}

async function seedAdmin() {
  const [existing] = await pool.query(
    'SELECT id, email FROM users WHERE email = ? LIMIT 1',
    [ADMIN_EMAIL]
  );

  if (existing.length > 0) {
    console.log(`[seed] admin already exists (id=${existing[0].id}), skipping insert`);
    return;
  }

  const hash = bcrypt.hashSync(ADMIN_PASSWORD, BCRYPT_ROUNDS);

  await pool.query(
    'INSERT INTO users (name, email, password, created_at, updated_at) VALUES (?, ?, ?, NOW(), NOW())',
    [ADMIN_NAME, ADMIN_EMAIL, hash]
  );

  console.log(`[seed] admin inserted: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
  console.log(`[seed] password hash: ${hash}`);
}

async function seedSettings() {
  for (const setting of SETTINGS) {
    const [existing] = await pool.query(
      'SELECT `key` FROM app_settings WHERE `key` = ? LIMIT 1',
      [setting.key]
    );

    if (existing.length > 0) {
      console.log(`[seed] setting "${setting.key}" already exists, skipping insert`);
      continue;
    }

    await pool.query(
      'INSERT INTO app_settings (`key`, `value`, `created_at`, `updated_at`) VALUES (?, ?, NOW(), NOW())',
      [setting.key, setting.value]
    );

    console.log(`[seed] setting inserted: ${setting.key}`);
  }
}

(async () => {
  try {
    await ensureUsersTable();
    await seedAdmin();
    await seedSettings();
    console.log('[seed] done');
    await pool.end();
    process.exit(0);
  } catch (err) {
    console.error('[seed] FAILED:', err.code || '', err.message);
    try {
      await pool.end();
    } catch (_) {
      /* pool already closed */
    }
    process.exit(1);
  }
})();

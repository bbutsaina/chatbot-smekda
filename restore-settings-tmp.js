require('dotenv').config({ quiet: true });
const mysql = require('mysql2/promise');

// Restores the greeting and fallback that the e2e suite overwrote while
// verifying that /admin/settings persists writes. Idempotent.
const ORIGINAL = {
  greeting_message: 'Hi, peeps! Cure your curiosity by asking me anything about SMK Negeri 2 Purwakarta. ^^',
  fallback_message: 'Sorry.... I don\u2019t really catch that :[',
};

(async () => {
  const c = await mysql.createConnection({
    host: process.env.DB_HOST, port: +process.env.DB_PORT,
    user: process.env.DB_USERNAME, password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
  });
  for (const [k, v] of Object.entries(ORIGINAL)) {
    await c.query(
      'INSERT INTO app_settings (`key`, `value`, `created_at`, `updated_at`) VALUES (?, ?, NOW(), NOW()) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`), `updated_at` = NOW()',
      [k, v]
    );
    console.log(`restored ${k}`);
  }
  const [rows] = await c.query("SELECT `key`, `value` FROM app_settings ORDER BY `key`");
  rows.forEach(r => console.log(`  ${r.key} = ${JSON.stringify(r.value)}`));
  await c.end();
})();
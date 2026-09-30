'use strict';

/**
 * Create the chatbot runtime tables on a fresh cluster.
 *
 * `db_chatbot` on TiDB Cloud was created empty by seed.js, which only builds
 * `users` and `app_settings`. Without `respon` and `history_chat` every chat
 * query fails with ER_NO_SUCH_TABLE, so /chat cannot answer anything.
 *
 * Idempotent, and safe to re-run after any schema change.
 */

require('dotenv').config({ quiet: true });
const pool = require('../config/db');

async function main() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS respon (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      kode VARCHAR(150) NULL,
      isi TEXT NOT NULL,
      menu VARCHAR(150) NOT NULL DEFAULT '',
      label VARCHAR(150) NOT NULL DEFAULT '',
      kata_pemicu VARCHAR(255) NOT NULL DEFAULT '',
      PRIMARY KEY (id),
      KEY idx_respon_menu (menu),
      KEY idx_respon_menu_label (menu, label)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin
  `);
  console.log('[ensure-chat-tables] respon ready');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS history_chat (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      token VARCHAR(100) NOT NULL,
      pesan_masuk TEXT NOT NULL,
      pesan_keluar TEXT NOT NULL,
      status ENUM('Answered','Unanswered') NOT NULL DEFAULT 'Answered',
      PRIMARY KEY (id),
      KEY idx_history_token (token),
      KEY idx_history_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin
  `);
  console.log('[ensure-chat-tables] history_chat ready');

  const [rows] = await pool.query('SHOW TABLES');
  const names = rows
    .flat()
    .map((r) => Object.values(r)[0])
    .filter((n) => typeof n === 'string' && !n.includes('Tables_in'));
  console.log('[ensure-chat-tables] tables:', names.join(', '));
}

main()
  .then(() => pool.end())
  .then(() => process.exit(0))
  .catch(async (err) => {
    console.error('[ensure-chat-tables] failed:', err.code || '', err.message);
    await pool.end().catch(() => {});
    process.exit(1);
  });

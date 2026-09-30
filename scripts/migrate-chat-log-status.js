'use strict';

/**
 * Add a status flag to history_chat so the admin log can distinguish a real
 * matched answer from a fallback.
 *
 * Idempotent: safe to re-run. Existing rows are backfilled by inspecting
 * pesan_keluar, which keeps the dashboard counter consistent with the data
 * that was already there.
 *
 * Why not store 'Unanswered' in pesan_keluar? That column holds the reply the
 * student is shown. Overwriting it with a status word would make the reply the
 * student reads differ from the reply stored for admins.
 */

require('dotenv').config({ quiet: true });
const mysql = require('mysql2/promise');

async function columnExists(conn, table, column) {
  const [rows] = await conn.query(
    `SELECT COUNT(*) AS total
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND COLUMN_NAME = ?`,
    [table, column]
  );
  return rows[0].total > 0;
}

async function main() {
  // Shared config keeps the SSL transport TiDB Cloud requires.
  const conn = await mysql.createConnection(require('../config/db').poolConfig({}));

  try {
    if (!(await columnExists(conn, 'history_chat', 'status'))) {
      // Default to 'Answered' so the new INSERT can omit the column, and because
      // every row written before this migration carried a real reply.
      await conn.query(
        `ALTER TABLE history_chat
           ADD COLUMN status ENUM('Answered','Unanswered') NOT NULL DEFAULT 'Answered'
           AFTER pesan_keluar`
      );
      console.log('[migrate-chat-log] added history_chat.status');
    } else {
      console.log('[migrate-chat-log] history_chat.status already present');
    }

    // Backfill. Two shapes count as unanswered:
    //   1. no reply stored at all, and
    //   2. the reply is the fallback message the bot gives when nothing matched.
    // Only (2) is fixable retroactively, and only by comparing against the
    // configured fallback plus the built-in default.
    const [settingRows] = await conn.query(
      "SELECT `value` FROM app_settings WHERE `key` = 'fallback_message' LIMIT 1"
    );
    const fallback = settingRows[0] && String(settingRows[0].value || '').trim();
    const BUILT_IN = 'Sorry.... I don\u2019t really catch that :[';
    const fallbackTexts = [fallback, BUILT_IN].filter(Boolean);

    let totalBackfilled = 0;
    for (const text of fallbackTexts) {
      const [r] = await conn.query(
        `UPDATE history_chat
            SET status = 'Unanswered'
          WHERE TRIM(pesan_keluar) = ?
            AND status <> 'Unanswered'`,
        [text]
      );
      totalBackfilled += r.affectedRows;
    }
    console.log(`[migrate-chat-log] backfilled ${totalBackfilled} unanswered row(s)`);

    const [rows] = await conn.query(
      'SELECT id, token, pesan_masuk, pesan_keluar, status FROM history_chat ORDER BY id DESC LIMIT 5'
    );
    console.log('[migrate-chat-log] recent rows:', rows);
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error('[migrate-chat-log] failed:', err.message);
  process.exit(1);
});

require('dotenv').config({ quiet: true });
const pool = require('../config/db');

const HARDCODED_FALLBACK = 'Sorry.... I don\u2019t really catch that :[';

const MAX_QUERY_LENGTH = 500;
const MAX_TOKEN_LENGTH = 100;

// Split a trigger string such as "daftar, ppdb, mendaftar" into clean tokens.
function parseTriggerWords(raw) {
  return String(raw || '')
    .split(/[,;|]/)
    .map((w) => w.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Score each FAQ row against the student message.
 *
 * Trigger words are stored as a comma separated list in `respon.kata_pemicu`.
 * A row is a candidate when any of its words appears as a whole token in the
 * message; longer matches rank higher so "pendaftaran" beats "daftar".
 */
function scoreRows(rows, tokens) {
  const scored = [];

  for (const row of rows) {
    const triggers = parseTriggerWords(row.kata_pemicu);
    let score = 0;
    let matched = 0;

    for (const trigger of triggers) {
      if (tokens.includes(trigger)) {
        score += trigger.length;
        matched += 1;
      }
    }

    if (matched > 0) {
      scored.push({ row, score, matched });
    }
  }

  // Prefer the row matching the most distinct words, then the longest overlap.
  scored.sort((a, b) => b.matched - a.matched || b.score - a.score || a.row.id - b.row.id);
  return scored;
}

/** Read the admin-configured fallback, falling back to the built-in string. */
async function getFallback() {
  try {
    const [rows] = await pool.query(
      "SELECT `value` FROM app_settings WHERE `key` = 'fallback_message' LIMIT 1"
    );
    const value = rows[0] && rows[0].value;
    return value && String(value).trim() ? String(value) : HARDCODED_FALLBACK;
  } catch (err) {
    console.error('[chat] fallback lookup failed:', err.message);
    return HARDCODED_FALLBACK;
  }
}

/**
 * GET /chat
 * Renders the student chat interface.
 */
exports.page = async (req, res) => {
  try {
    const [greetRows] = await pool.query(
      "SELECT `value` FROM app_settings WHERE `key` = 'greeting_message' LIMIT 1"
    );

    // Every visitor gets a conversation token so their messages can be grouped.
    if (!req.session.chatToken) {
      req.session.chatToken = require('crypto').randomBytes(12).toString('hex');
    }

    const greetingMessage =
      (greetRows[0] && greetRows[0].value) || 'Halo! Saya IRIS-2.';

    res.render('user/chat', {
      // Exposed under both names so the template can reference either one.
      greeting: greetingMessage,
      greeting_message: greetingMessage,
      chatToken: req.session.chatToken,
    });
  } catch (err) {
    console.error('[chat] page render failed:', err.message);
    res.status(500).send('Halaman chat tidak dapat dimuat.');
  }
};

/**
 * POST /api/chatbot/query
 * Matches the student message against FAQ keywords and logs the exchange.
 */
exports.query = async (req, res) => {
  // Accept both `message` and `query` so either client payload shape works.
  // A mismatch here is silent: the request returns 400 with no DB write.
  const raw = typeof req.body.message === 'string'
    ? req.body.message
    : (typeof req.body.query === 'string' ? req.body.query : '');
  const message = raw.trim();

  if (!message) {
    return res.status(400).json({ reply: 'Silakan tulis pertanyaan Anda.', matched: false });
  }
  if (message.length > MAX_QUERY_LENGTH) {
    return res.status(400).json({ reply: 'Pertanyaan terlalu panjang.', matched: false });
  }

  let conn;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();

    // Candidate rows. LIKE is case-insensitive under the utf8mb4 collation, so
    // tokenising in JS avoids the substring false positives a raw LIKE gives
    // (e.g. "kelas" matching "kelaskeliling").
    const [rows] = await conn.query(
      `SELECT id, menu, label, kata_pemicu, isi
         FROM respon
        WHERE kata_pemicu <> ''
        LIMIT 1000`
    );

    const tokens = message.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
    const best = scoreRows(rows, tokens)[0];

    let reply;
    let matched = false;

    if (best) {
      reply = best.row.isi;
      matched = true;
    } else {
      reply = await getFallback();
    }

    // 'Unanswered' marks a question with no matching FAQ row, so admins can
    // review gaps. The student's typed question and the fallback text are both
    // preserved; only the flag marks the miss.
    const status = matched ? 'Answered' : 'Unanswered';

    // Persist the exchange so the admin Log History view populates.
    if (!req.session.chatToken) {
      req.session.chatToken = require('crypto').randomBytes(12).toString('hex');
    }
    const token = String(req.session.chatToken).slice(0, MAX_TOKEN_LENGTH);

    await conn.query(
      'INSERT INTO history_chat (token, pesan_masuk, pesan_keluar, status) VALUES (?, ?, ?, ?)',
      [token, message, reply, status]
    );

    await conn.commit();

    return res.json({
      reply,
      matched,
      status,
      menu: matched ? best.row.menu : null,
      label: matched ? best.row.label : null,
    });
  } catch (err) {
    if (conn) await conn.rollback().catch(() => {});
    // Log the failure server-side, never leak SQL or stack traces to students.
    console.error('[chat] query failed:', err.code || '', err.message);
    return res.status(500).json({ reply: 'Terjadi gangguan. Silakan coba lagi.', matched: false });
  } finally {
    if (conn) conn.release();
  }
};

exports.pool = pool;
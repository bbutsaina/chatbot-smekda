require('dotenv').config({ quiet: true });
const pool = require('../config/db');

const HARDCODED_FALLBACK = 'Sorry.... I don\u2019t really catch that :[';

// Shown when the database is unreachable, so a student sees guidance rather
// than a generic error. Distinct from the fallback message, which means "no
// matching answer"; this one means "we could not check".
const BUSY_MESSAGE =
  'Maaf, server database sekolah sedang sibuk. Silakan coba beberapa saat lagi, atau tanyakan hal lain! :[';

// Connection-level failures worth a single retry. Serverless platforms freeze
// idle instances and close sockets without a clean shutdown, so the pooled
// connection is often simply stale rather than genuinely broken.
const RETRYABLE_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'EPIPE',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'PROTOCOL_CONNECTION_LOST',
  'PROTOCOL_SEQUENCE_TIMEOUT',
  'PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR',
  'PROTOCOL_ENQUEUE_AFTER_QUIT',
  'POOL_CLOSED',
  'ER_CON_COUNT_ERROR',
]);

function isRetryableConnectionError(err) {
  if (!err) return false;
  // TLS negotiation against TiDB Serverless can exceed the request budget on a
  // cold start; that is a timeout worth one more attempt.
  if (err.code === 'ER_UNKNOWN_ERROR' && /insecure transport|SSL|TLS/i.test(err.message)) {
    return true;
  }
  if (err.fatal === true) return true;
  return RETRYABLE_CODES.has(err.code);
}

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
 * Resolve a conversation token without assuming a session exists.
 *
 * The public chat route deliberately sits outside the admin guard, so
 * req.session may be absent when session middleware is unavailable. Reading
 * req.session.chatToken in that case throws and turns the page into a 500.
 */
function resolveChatToken(req) {
  if (req.session && !req.session.chatToken) {
    req.session.chatToken = require('crypto').randomBytes(12).toString('hex');
  }
  const fromSession = req.session && req.session.chatToken;
  return String(fromSession || require('crypto').randomBytes(12).toString('hex')).slice(
    0,
    MAX_TOKEN_LENGTH
  );
}

/**
 * GET /chat
 * Renders the student chat interface.
 */
exports.page = async (req, res) => {
  // The greeting is a single settings row. If the database is unreachable the
  // page must still render: a 500 here is what students actually see, and the
  // chat UI degrades gracefully to the built-in greeting.
  let greetingMessage = 'Halo! Saya IRIS-2.';
  try {
    const [greetRows] = await pool.query(
      "SELECT `value` FROM app_settings WHERE `key` = 'greeting_message' LIMIT 1"
    );
    greetingMessage = (greetRows[0] && greetRows[0].value) || greetingMessage;
  } catch (err) {
    console.error('[chat] greeting lookup failed, using default:', err.message);
  }

  try {
    res.render('user/chat', {
      // Exposed under both names so the template can reference either one.
      greeting: greetingMessage,
      greeting_message: greetingMessage,
      chatToken: resolveChatToken(req),
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
    const token = resolveChatToken(req);

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

    // A dropped pooled socket is recoverable: mysql2 hands back a dead
    // connection after the platform froze the instance. Clear the whole pool
    // so the next attempt opens a fresh TLS session, then retry once. Without
    // this, every request for the life of the warm instance keeps reusing the
    // broken connection.
    if (isRetryableConnectionError(err)) {
      console.warn('[chat] pool connection dropped, resetting and retrying:', err.code);
      try {
        await pool.end();
      } catch (_) {
        /* pool already closed */
      }
      try {
        return await exports.query(req, res);
      } catch (retryErr) {
        console.error('[chat] retry failed:', retryErr.code || '', retryErr.message);
      }
    }

    // Log the failure server-side, never leak SQL or stack traces to students.
    console.error('[chat] query failed:', err.code || '', err.message);
    // 200 with a readable reply: the chat UI renders data.reply, so a 500 here
    // would surface as a raw JSON body in place of the message bubble.
    return res.json({
      reply: BUSY_MESSAGE,
      matched: false,
      status: 'Unanswered',
    });
  } finally {
    if (conn) conn.release();
  }
};

exports.pool = pool;
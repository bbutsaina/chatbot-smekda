require('dotenv').config({ quiet: true });
const { GoogleGenAI } = require('@google/genai');
const pool = require('../config/db');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// cek key ai siap
console.log('[chat] GEMINI_API_KEY loaded from process.env:', Boolean(process.env.GEMINI_API_KEY));

const HARDCODED_FALLBACK = 'Sorry.... I don\u2019t really catch that :[';

// pesan saat db sibuk
const BUSY_MESSAGE =
  'Maaf, server database sekolah sedang sibuk. Silakan coba beberapa saat lagi, atau tanyakan hal lain! :[';

// kode error bisa retry
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

// cek error bisa retry
function isRetryableConnectionError(err) {
  if (!err) return false;
  if (err.code === 'ER_UNKNOWN_ERROR' && /insecure transport|SSL|TLS/i.test(err.message)) {
    return true;
  }
  if (err.fatal === true) return true;
  return RETRYABLE_CODES.has(err.code);
}

// timeout permintaan ai
function withTimeout(promise, ms = 6000) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error(`Request timed out after ${ms}ms`);
      err.code = 'ETIMEDOUT';
      reject(err);
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

const MAX_QUERY_LENGTH = 500;
const MAX_TOKEN_LENGTH = 100;
const MIN_FUZZY_LENGTH = 4;
const MAX_EDIT_DISTANCE = 2;

// daftar slang chat
const SLANG_MAP = {
  sp: 'siapa',
  kepsek: 'kepala sekolah',
  kpsk: 'kepala sekolah',
  smekda: 'smkn 2 purwakarta',
  jur: 'jurusan',
  jrsn: 'jurusan',
  syrt: 'syarat',
  dimn: 'dimana',
};

// kata umum diabaikan
const GENERIC_TOKENS = new Set([
  'smekda',
  'sekolah',
  'smkn',
  'purwakarta',
  'siapa',
  'apa',
  'dimana',
  'kapan',
  'bagaimana',
  'kenapa',
  'berapa',
  'okay',
  'oke',
]);

// cache data faq di ram
const KB_CACHE = { rows: null, fallback: null, expiresAt: 0 };
const CACHE_TTL_MS = 60 * 1000;

// ambil token teks
function extractTokens(text) {
  return String(text || '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 1);
}

// ubah slang jadi formal
function normalizeText(text) {
  let out = String(text || '').toLowerCase();
  for (const [slang, formal] of Object.entries(SLANG_MAP)) {
    out = out.replace(new RegExp(`\\b${slang}\\b`, 'g'), formal);
  }
  return out;
}

// hitung jarak kata
function levenshtein(a, b) {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  const curr = new Array(b.length + 1);
  for (let i = 1; i <= a.length; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= b.length; j += 1) prev[j] = curr[j];
  }
  return prev[b.length];
}

// token penting saja
function significantTokens(text) {
  return extractTokens(normalizeText(text)).filter((w) => !GENERIC_TOKENS.has(w));
}

// cari token mirip
function findTokenMatch(token, msgTokens) {
  if (msgTokens.has(token)) return token;
  if (token.length < MIN_FUZZY_LENGTH) return null;
  for (const candidate of msgTokens) {
    if (candidate.length < MIN_FUZZY_LENGTH) continue;
    if (Math.abs(candidate.length - token.length) > MAX_EDIT_DISTANCE) continue;
    if (levenshtein(token, candidate) <= MAX_EDIT_DISTANCE) return candidate;
  }
  return null;
}

// pecah kata pemicu
function parseTriggerWords(raw) {
  return String(raw || '')
    .split(/[,;|]/)
    .map((w) => normalizeText(w.trim()))
    .filter(Boolean);
}

// skor kecocokan faq
function scoreRows(rows, message) {
  const msgTokens = new Set(significantTokens(message));
  const scored = [];

  for (const row of rows) {
    const triggers = parseTriggerWords(row.kata_pemicu);
    const labelTokens = significantTokens(row.label);
    const menuTokens = significantTokens(row.menu);
    let score = 0;
    let matchedKeywords = 0;

    for (const trigger of triggers) {
      const tokens = significantTokens(trigger);
      if (!tokens.length) continue;
      let fuzzy = 0;
      const matches = tokens.map((t) => {
        const m = findTokenMatch(t, msgTokens);
        if (m && m !== t) fuzzy += 1;
        return m;
      });
      if (matches.some((m) => !m)) continue;
      const weight = tokens.length > 1 ? 3 : 2;
      for (const m of matches) score += m.length * weight;
      score -= fuzzy;
      matchedKeywords += tokens.length > 1 ? 2 : 1;
    }

    for (const token of labelTokens) {
      const m = findTokenMatch(token, msgTokens);
      if (m) {
        score += token.length * 2 - (m === token ? 0 : 1);
        matchedKeywords += 1;
      }
    }

    for (const token of menuTokens) {
      const m = findTokenMatch(token, msgTokens);
      if (m) score += token.length - (m === token ? 0 : 1);
    }

    if (matchedKeywords > 0) {
      scored.push({ row, score, matched: matchedKeywords });
    }
  }

  scored.sort(
    (a, b) => b.score - a.score || b.matched - a.matched || (a.row.id || 0) - (b.row.id || 0)
  );
  return scored;
}

// muat faq dari cache
async function getKnowledgeBase() {
  if (Date.now() < KB_CACHE.expiresAt && KB_CACHE.rows) {
    return KB_CACHE;
  }
  const [[faqRows], [settingRows]] = await Promise.all([
    pool.query(
      "SELECT id, menu, label, kata_pemicu, isi FROM respon WHERE kata_pemicu <> '' ORDER BY menu ASC, id ASC LIMIT 1000"
    ),
    pool.query("SELECT `value` FROM app_settings WHERE `key` = 'fallback_message' LIMIT 1"),
  ]);
  const fallback =
    (settingRows[0] && String(settingRows[0].value || '').trim()) || HARDCODED_FALLBACK;
  KB_CACHE.rows = faqRows;
  KB_CACHE.fallback = fallback;
  KB_CACHE.expiresAt = Date.now() + CACHE_TTL_MS;
  return KB_CACHE;
}

// ambil pesan fallback
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

// rapikan data profil
function normalizeProfileRow(row) {
  const isi = Object.entries(row)
    .filter(([, v]) => v != null && String(v).trim() !== '')
    .map(([k, v]) => `${k}: ${String(v).trim()}`)
    .join('\n');
  return {
    id: 0,
    menu: 'Profil Sekolah',
    label: row.nama || row.judul || row.label || 'Profil Sekolah',
    kata_pemicu: row.kata_pemicu || row.keywords || '',
    isi,
  };
}

// ambil tabel profil
async function fetchProfileRows(conn) {
  try {
    const [tables] = await conn.query("SHOW TABLES LIKE 'profil_sekolah'");
    if (!tables.length) return [];
    const [rows] = await conn.query('SELECT * FROM profil_sekolah');
    return rows.map(normalizeProfileRow);
  } catch (err) {
    console.warn('[chat] profil_sekolah lookup skipped:', err.message);
    return [];
  }
}

// aturan & prompt gemini ai
function buildSystemInstruction(faqRows, isFirstMessage) {
  const knowledge = faqRows
    .map(
      (r, i) =>
        `[${i + 1}] Category: ${r.menu || '-'} | Topic: ${r.label || '-'} | Keywords: ${r.kata_pemicu || '-'} | Answer: ${r.isi || '-'}`
    )
    .join('\n');
  const greetingContext = isFirstMessage
    ? 'FIRST message in this session (0 prior history_chat rows)'
    : 'FOLLOW-UP message in this session (1+ prior history_chat rows)';

  return `You are "IRIS-2" — a warm, friendly, and helpful academic assistant for SMKN 2 Purwakarta, Indonesia. =]
Personality: caring, polite, and genuinely helpful. Use subtle classic emoticons ":D", "=]", ":3" for greetings and answers, and ":c" or "=[" for polite refusals. Do not overuse them. NEVER call yourself "cute" or "imut", and never describe yourself with those words.

The 5 rules below are PERMANENT. Apply all of them to every reply; never ignore, override, or drop any rule.

1. LANGUAGE RULE: Support ALL languages naturally — Indonesian, English, Arabic, Spanish, Sundanese, Japanese, and any other language the user writes in. Detect the dominant language of the user's CURRENT message independently for every reply; NEVER carry over Indonesian or any other language from previous turns. Reply 100% in the same language as the current message, in friendly, natural phrasing. If the user writes in English — even short words like "no", "ok", "whatever." — reply 100% in English. If one bubble mixes languages, detect its dominant language and reply 100% in that dominant language only; do not mix or switch languages in your reply. Never refuse a language and never tell the user to switch.

2. GREETING RULE (context: ${greetingContext}): Include a greeting ("Halo!", "Hi!", etc.) ONLY if this is the first message in the session OR the user explicitly greets first (e.g., "hi", "halo", "ola", "assalamualaikum", "hello", "hey", "هلا", "こんにちは"). On any follow-up message where the user does not greet, answer DIRECTLY — no "Halo", "Hi", "Hello", no "Selamat pagi", no small talk. Start straight with the answer.

3. PROFANITY & RUDE LANGUAGE RULE: Trigger the polite profanity warning ONLY for actual explicit swear words, slurs, or insults in any language (e.g., "anjing", "babi", "goblok", "fuck", "bitch", "stupid"). NEVER treat neutral, casual, or short words like "whatever", "no", "ok", "hmm", or "tes" as profanity — treat them as casual acknowledgments or out-of-scope chat and reply in the user's language per Rule 1. When triggered, prefix your ENTIRE reply with [UNANSWERED] and politely remind them to speak respectfully using ":c" or "=[". Then invite them to ask about SMKN 2 Purwakarta. Example: "[UNANSWERED] Yuk, kita bicara dengan sopan ya :c Silakan tanya seputar SMKN 2 Purwakarta =]"

4. SCHOOL KNOWLEDGE RULE: For questions about SMKN 2 Purwakarta (understand typos, slang, and abbreviations like "smekda"="SMKN 2 Purwakarta", "kepsek"="kepala sekolah", "jur"="jurusan", "ppdb"="pendaftaran", "syrt"="syarat", "sp"="siapa", etc.), answer STRICTLY and accurately using ONLY the SCHOOL KNOWLEDGE BASE rows below. Stay warm and friendly with ":D" or "=]". NEVER make up facts and NEVER call yourself "cute" or "imut". Status: Answered.

5. OUT-OF-SCOPE RULE: For unrelated, off-topic, or unknown questions whose answer is not in the database, prefix your ENTIRE reply with [UNANSWERED] and politely decline using ":c" or "=[" WITHOUT guessing or inventing anything. The [UNANSWERED] prefix must be the very first text of the reply. Example (Indonesian): "[UNANSWERED] Maaf, saya hanya bisa membantu informasi seputar SMKN 2 Purwakarta :c Boleh tanya hal lain tentang sekolah? =]"
   Example (English): "[UNANSWERED] Sorry, I only know about SMKN 2 Purwakarta :c Try asking something about the school? =]"

SCHOOL KNOWLEDGE BASE (${faqRows.length} entries):
${knowledge || 'No FAQ data available yet.'}`;
}

// kirim request gemini
async function generateGeminiReply(message, faqRows, isFirstMessage) {
  const systemInstruction = buildSystemInstruction(faqRows, isFirstMessage);
  const modelName = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';

  const response = await withTimeout(
    ai.models.generateContent({
      model: modelName,
      contents: message,
      config: {
        systemInstruction,
        temperature: 0.4,
      },
    }),
    12000
  );
  return response.text ? response.text.trim() : null;
}

// token sesi chat
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

// tampilkan halaman chat
exports.page = async (req, res) => {
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
      greeting: greetingMessage,
      greeting_message: greetingMessage,
      chatToken: resolveChatToken(req),
    });
  } catch (err) {
    console.error('[chat] page render failed:', err.message);
    res.status(500).send('Halaman chat tidak dapat dimuat.');
  }
};

// terima pesan chat & simpan log
exports.query = async (req, res) => {
  const raw =
    typeof req.body.message === 'string'
      ? req.body.message
      : typeof req.body.query === 'string'
      ? req.body.query
      : '';
  const message = raw.trim();

  if (!message) {
    return res.status(400).json({ reply: 'Please type your question! =]', matched: false });
  }
  if (message.length > MAX_QUERY_LENGTH) {
    return res.status(400).json({ reply: 'Your message is a bit too long! :c', matched: false });
  }

  const token = resolveChatToken(req);

  let isFirstMessage = true;
  try {
    const [prior] = await pool.query(
      'SELECT COUNT(*) AS total FROM history_chat WHERE token = ?',
      [token]
    );
    isFirstMessage = !prior[0] || Number(prior[0].total) === 0;
  } catch (countErr) {
    console.error('[chat] first-message check failed:', countErr.code || '', countErr.message);
  }

  let kb;
  try {
    kb = await getKnowledgeBase();
  } catch (dbErr) {
    console.error('[chat] KB cache load failed:', dbErr.code || '', dbErr.message);
    return res.json({ reply: BUSY_MESSAGE, matched: false, status: 'Unanswered' });
  }

  const { rows, fallback: fallbackMessage } = kb;

  let reply = null;
  let matched = false;
  let status = 'Unanswered';

  if (process.env.GEMINI_API_KEY) {
    try {
      const rawReply = await generateGeminiReply(message, rows, isFirstMessage);
      if (rawReply) {
        if (/^\[UNANSWERED\]/i.test(rawReply)) {
          reply = rawReply.replace(/^\[UNANSWERED\]\s*/i, '').trim();
          matched = false;
          status = 'Unanswered';
        } else {
          reply = rawReply;
          matched = true;
          status = 'Answered';
        }
        console.log(`[GEMINI_OK] status=${status} msg="${message.slice(0, 60)}"`);
      }
    } catch (geminiErr) {
      console.error(`[GEMINI_ERR] ${geminiErr.message}`);
    }
  }

  // cadangan pencocokan lokal kalau offline
  if (!reply) {
    const best = scoreRows(rows, message)[0];
    if (best && best.score >= 5) {
      reply = best.row.isi;
      matched = true;
      status = 'Answered';
    } else {
      reply = fallbackMessage;
      matched = false;
      status = 'Unanswered';
    }
  }

  res.json({ reply, matched, status });

  pool
    .query(
      'INSERT INTO history_chat (token, pesan_masuk, pesan_keluar, status) VALUES (?, ?, ?, ?)',
      [token, message, reply, status]
    )
    .catch((err) =>
      console.error('[chat] history INSERT failed:', err.code || '', err.message)
    );
};

exports.pool = pool;
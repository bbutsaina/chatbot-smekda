require('dotenv').config({ quiet: true });
const pool = require('../config/db');

const DEFAULT_PAGE_SIZE = 9;
const MAX_PAGE_SIZE = 50;

function readPageSize(raw, fallback) {
  const parsed = parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, MAX_PAGE_SIZE);
}

// One-shot status message carried across the redirect after a write.
function consumeFlash(req) {
  const flash = req.session.flash || null;
  delete req.session.flash;
  return flash;
}

// FAQ list and CRUD now live in faqController.js, which owns the `respon`
// table. This module keeps only dashboard/history/support.

exports.dashboard = (req, res) => {
  Promise.all([
    // Total Chats: history_chat is the log the bot actually writes to on every
    // query. sesi_chat is an empty legacy table, so counting it always gave 0.
    pool.query('SELECT COUNT(*) AS total FROM history_chat'),
    // Total Keywords: FAQ trigger words are stored as respon.kata_pemicu
    // (Option A consolidated schema). The keywords table is an empty leftover
    // with no relation to respon, so it can never reflect added FAQs.
    pool.query(
      "SELECT COUNT(*) AS total FROM respon WHERE kata_pemicu IS NOT NULL AND TRIM(kata_pemicu) <> ''"
    ),
    // Unanswered: count on the stored status flag. Matching reply text is
    // fragile and misses the real fallback string ("Sorry.... I don't really
    // catch that :["), so it would report misses as answered.
    pool.query(
      "SELECT COUNT(*) AS total FROM history_chat WHERE status = 'Unanswered'"
    ),
    pool.query(
      'SELECT token, pesan_masuk, pesan_keluar, status FROM history_chat ORDER BY id DESC LIMIT 8'
    ),
  ])
    .then(([[chat], [kw], [unanswered], [recent]]) => {
      res.render('admin/dashboard', {
        adminName: req.session.adminName,
        activePage: 'dashboard',
        totalChats: chat[0].total,
        totalKeywords: kw[0].total,
        unanswered: unanswered[0].total,
        // Alias for templates/tests referring to the card as unansweredCount.
        unansweredCount: unanswered[0].total,
        recentActivity: recent,
        flash: consumeFlash(req),
      });
    })
    .catch((err) => {
      console.error('[admin] dashboard failed:', err.message);
      res.status(500).send('Gagal memuat dashboard.');
    });
};

exports.history = (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const perPage = readPageSize(req.query.per_page, DEFAULT_PAGE_SIZE);
  const search = (req.query.q || '').trim();

  let whereSql = '';
  const params = [];

  if (search) {
    whereSql = 'WHERE token LIKE ? OR pesan_masuk LIKE ? OR pesan_keluar LIKE ? OR status LIKE ?';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
  }

  Promise.all([
    pool.query(`SELECT COUNT(*) AS total FROM history_chat ${whereSql}`, params),
    pool.query(
      `SELECT id, token, pesan_masuk, pesan_keluar, status FROM history_chat ${whereSql}
       ORDER BY id DESC
       LIMIT ? OFFSET ?`,
      [...params, perPage, (page - 1) * perPage]
    ),
  ])
    .then(([[count], [rows]]) => {
      const total = count[0].total;
      const totalPages = Math.max(1, Math.ceil(total / perPage));
      const currentPage = Math.min(page, totalPages);

      res.render('admin/history', {
        adminName: req.session.adminName,
        activePage: 'history',
        logs: rows,
        total,
        perPage,
        currentPage,
        totalPages,
        search,
        flash: consumeFlash(req),
      });
    })
    .catch((err) => {
      console.error('[admin] history failed:', err.message);
      res.status(500).send('Gagal memuat Log History.');
    });
};

exports.support = (req, res) => {
  res.render('admin/support', {
    adminName: req.session.adminName,
    activePage: 'support',
    flash: consumeFlash(req),
  });
};

exports.pool = pool;

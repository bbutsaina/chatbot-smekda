require('dotenv').config({ quiet: true });
const pool = require('../config/db');

const DEFAULT_PAGE_SIZE = 9;
const MAX_PAGE_SIZE = 50;

// batasi ukuran halaman
function readPageSize(raw, fallback) {
  const parsed = parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, MAX_PAGE_SIZE);
}

// ambil pesan flash
function consumeFlash(req) {
  const flash = req.session.flash || null;
  delete req.session.flash;
  return flash;
}

// hitung statistik dashboard admin
exports.dashboard = (req, res) => {
  Promise.all([
    pool.query('SELECT COUNT(*) AS total FROM history_chat'),
    pool.query(
      "SELECT COUNT(*) AS total FROM respon WHERE kata_pemicu IS NOT NULL AND TRIM(kata_pemicu) <> ''"
    ),
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

// tampilkan riwayat log chat
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

// halaman bantuan statis
exports.support = (req, res) => {
  res.render('admin/support', {
    adminName: req.session.adminName,
    activePage: 'support',
    flash: consumeFlash(req),
  });
};

exports.pool = pool;

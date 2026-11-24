const bcrypt = require('bcryptjs');
const pool = require('../config/db');

const GENERIC_ERROR = 'Email atau Password yang Anda masukkan salah!';
const EMPTY_ERROR = 'Email dan Password wajib diisi!';

// hash dummy jaga timing
const DUMMY_HASH = '$2b$12$m.kjDFLYqfrT/AoV2IB5T.c2BBUdIc02odnpXV.Mm/t6nMny14pTm';

// tampilkan halaman login admin
exports.showLogin = (req, res) => {
  const error = (req.session && req.session.loginError) ? req.session.loginError : null;
  const email = (req.session && req.session.loginEmail) ? req.session.loginEmail : '';
  if (req.session) {
    delete req.session.loginError;
    delete req.session.loginEmail;
  }
  res.render('admin/login', {
    error: error || null,
    email: email || '',
    csrfToken: (req.session && req.session.csrfToken) || res.locals.csrfToken || '',
  });
};

// validasi input & cek password login
exports.login = (req, res) => {
  const body = req.body || {};
  const email = (typeof body.email === 'string' ? body.email : '').trim();
  const password = typeof body.password === 'string' ? body.password : '';
  const csrfToken = (req.session && req.session.csrfToken) || res.locals.csrfToken || '';

  if (!email || !password) {
    const errorMsg = !email && !password
      ? EMPTY_ERROR
      : (!email ? 'Email wajib diisi!' : 'Password wajib diisi!');
    return res.status(400).render('admin/login', {
      error: errorMsg,
      email,
      csrfToken,
    });
  }

  if (email.length > 254) {
    return res.status(400).render('admin/login', {
      error: 'Format email tidak valid atau terlalu panjang!',
      email,
      csrfToken,
    });
  }

  pool
    .query(
      'SELECT id, name, email, password FROM users WHERE email = ? LIMIT 1',
      [email]
    )
    .then(([rows]) => {
      const user = rows[0];
      const hash = user ? user.password : DUMMY_HASH;
      const ok = bcrypt.compareSync(password, hash);

      if (!user || !ok) {
        return res.status(400).render('admin/login', {
          error: GENERIC_ERROR,
          email,
          csrfToken,
        });
      }

      req.session.admin = {
        id: user.id,
        name: user.name,
        email: user.email,
      };
      req.session.adminId = user.id;
      req.session.adminName = user.name;
      req.session.adminEmail = user.email;

      const proceed = () => res.redirect('/admin/dashboard');
      if (typeof req.session.save === 'function') {
        req.session.save(proceed);
      } else {
        proceed();
      }
    })
    .catch((err) => {
      console.error(`[auth] login failed [${err.code || 'NOCODE'}]:`, err.message);

      const infraCodes = new Set([
        'ETIMEDOUT',
        'ECONNREFUSED',
        'ECONNRESET',
        'EPIPE',
        'ENOTFOUND',
        'EHOSTUNREACH',
        'ENETUNREACH',
        'PROTOCOL_CONNECTION_LOST',
        'POOL_CLOSED',
      ]);
      const infraFailure = err.fatal === true || infraCodes.has(err.code);

      const errorMsg = infraFailure
        ? 'Koneksi ke database sedang tidak stabil. Mohon tunggu sebentar lalu coba lagi.'
        : 'Terjadi kesalahan pada server. Silakan coba lagi.';

      return res.status(500).render('admin/login', {
        error: errorMsg,
        email,
        csrfToken,
      });
    });
};

// hapus session saat logout
exports.logout = (req, res) => {
  req.session = null;

  res.clearCookie('smekda_session', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });

  res.redirect('/admin/login');
};

exports.pool = pool;

const bcrypt = require('bcryptjs');
const pool = require('../config/db');

const GENERIC_ERROR = 'Email atau Password yang Anda masukkan salah!';

// Valid cost-12 bcrypt hash of an unguessable random string. Never matches any
// real password; exists purely to equalise response timing.
const DUMMY_HASH = '$2b$12$m.kjDFLYqfrT/AoV2IB5T.c2BBUdIc02odnpXV.Mm/t6nMny14pTm';

exports.showLogin = (req, res) => {
  res.render('admin/login', {
    error: req.session.loginError || null,
    email: req.session.loginEmail || '',
  });
  delete req.session.loginError;
  delete req.session.loginEmail;
};

exports.login = (req, res) => {
  const email = (req.body.email || '').trim();
  const password = req.body.password || '';

  if (!email || !password) {
    req.session.loginError = GENERIC_ERROR;
    req.session.loginEmail = email;
    return res.redirect('/admin/login');
  }

  pool
    .query(
      'SELECT id, name, email, password FROM users WHERE email = ? LIMIT 1',
      [email]
    )
    .then(([rows]) => {
      const user = rows[0];

      // Compare against a real dummy hash when the email is unknown so that a
      // missing account and a wrong password take comparable time, which stops
      // attackers enumerating valid admin emails. This must be a well-formed
      // 60-character bcrypt hash: bcryptjs short-circuits on a malformed hash
      // and returns instantly, reintroducing the timing leak.
      const hash = user ? user.password : DUMMY_HASH;
      const ok = bcrypt.compareSync(password, hash);

      if (!user || !ok) {
        req.session.loginError = GENERIC_ERROR;
        req.session.loginEmail = email;
        return res.redirect('/admin/login');
      }

      // Regenerate to defeat session fixation before storing admin identity.
      req.session.regenerate((err) => {
        if (err) {
          req.session.loginError = 'Terjadi kesalahan pada server. Silakan coba lagi.';
          return res.redirect('/admin/login');
        }

        req.session.adminId = user.id;
        req.session.adminName = user.name;
        req.session.adminEmail = user.email;

        res.redirect('/admin/dashboard');
      });
    })
    .catch((err) => {
      console.error('[auth] login failed:', err.message);
      req.session.loginError = 'Terjadi kesalahan pada server. Silakan coba lagi.';
      req.session.loginEmail = email;
      res.redirect('/admin/login');
    });
};

exports.logout = (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('[auth] session destroy failed:', err.message);
    }
    // Clear the session cookie with matching options, otherwise the browser
    // keeps the stale identifier and the admin appears to still be logged in.
    res.clearCookie('connect.sid', {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    });
    res.redirect('/admin/login');
  });
};

exports.pool = pool;

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

      // Discard any pre-existing session before storing the admin identity.
      // cookie-session has no regenerate(), so clear the object instead. This
      // is the session-fixation defence: a cookie planted before login cannot
      // survive into the authenticated session.
      const previous = { ...req.session };
      req.session = null;
      req.session = {};

      // Carry over only the fields the login view renders. Anything else from
      // the old session (notably an old CSRF token) is intentionally dropped.
      if (previous.loginError) req.session.loginError = previous.loginError;
      if (previous.loginEmail) req.session.loginEmail = previous.loginEmail;

      req.session.adminId = user.id;
      req.session.adminName = user.name;
      req.session.adminEmail = user.email;

      return res.redirect('/admin/dashboard');
    })
    .catch((err) => {
      // Log the code alongside the message: a dropped serverless socket
      // (ETIMEDOUT / ECONNRESET / PROTOCOL_CONNECTION_LOST) looks identical to a
      // genuine bad password in the browser, so without this the only evidence
      // is a generic "wrong password" bounce with no server-side cause.
      console.error(`[auth] login failed [${err.code || 'NOCODE'}]:`, err.message);

      // Distinguish "we could not check your credentials" from "your
      // credentials are wrong". Telling the admin the database is unreachable
      // stops them repeatedly retrying a password that may be perfectly valid.
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

      req.session.loginError = infraFailure
        ? 'Koneksi ke database sedang tidak stabil. Mohon tunggu sebentar lalu coba lagi.'
        : 'Terjadi kesalahan pada server. Silakan coba lagi.';
      req.session.loginEmail = email;

      // 503 marks a retryable dependency failure, so the admin sees a clear
      // "try again" rather than a wrong-password message. The redirect still
      // carries the explanation through the session.
      res.setHeader('Retry-After', '10');
      return res.redirect(303, '/admin/login');
    });
};

exports.logout = (req, res) => {
  // cookie-session clears state by nulling the session, which makes the
  // middleware emit an expired cookie on the way out.
  req.session = null;

  // Clear the cookie explicitly too. The name and attributes must match those
  // used in server.js, otherwise the browser keeps the old cookie and the
  // admin still appears to be signed in.
  res.clearCookie('smekda_session', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });

  res.redirect('/admin/login');
};

exports.pool = pool;

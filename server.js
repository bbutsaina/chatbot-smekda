require('dotenv').config({ quiet: true });

const IS_SERVERLESS = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
  console.error('[config] SESSION_SECRET must be set to a random string of 32+ characters.');
  if (!process.env.VERCEL && !process.env.AWS_LAMBDA_FUNCTION_NAME) {
    process.exit(1);
  }
}

const express = require('express');
const cookieSession = require('cookie-session');
const path = require('path');
const app = express();

app.set('trust proxy', 1);

const authController = require('./controllers/authController');
const adminController = require('./controllers/adminController');
const chatController = require('./controllers/chatController');
const faqController = require('./controllers/faqController');
const settingController = require('./controllers/settingController');

if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
  console.error('[config] SESSION_SECRET must be set to a random string of 32+ characters.');
  if (!IS_SERVERLESS) process.exit(1);
}

const isProduction = process.env.NODE_ENV === 'production';
const isLocalhost = Boolean(
  !process.env.VERCEL &&
  !process.env.AWS_LAMBDA_FUNCTION_NAME &&
  (process.env.NODE_ENV !== 'production' || process.env.HOST === 'localhost' || !process.env.HOST)
);
const cookieSecure = isProduction && !isLocalhost;

// atur cookie session login
app.use(
  cookieSession({
    name: 'smekda_session',
    keys: [process.env.SESSION_SECRET],
    maxAge: 24 * 60 * 60 * 1000,
    secure: cookieSecure,
    sameSite: 'lax',
    httpOnly: true,
  })
);

app.use((req, res, next) => {
  if (req.session && typeof req.session.save !== 'function') {
    req.session.save = (fn) => {
      if (typeof fn === 'function') fn();
      return Promise.resolve();
    };
  }
  next();
});
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

// anti cache halaman admin
app.use('/admin', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

// satpam cek login admin
const isAdminAuthenticated = (req, res, next) => {
  if (req.session && (req.session.admin || req.session.adminId)) {
    return next();
  }
  return res.redirect('/admin/login');
};

// redirect kalau sudah login
const redirectIfAuthenticated = (req, res, next) => {
  if (req.session && (req.session.admin || req.session.adminId)) {
    return res.redirect('/admin/dashboard');
  }
  next();
};

const crypto = require('crypto');

// batasi spam pesan chat
const CHAT_WINDOW_MS = 60 * 1000;
const CHAT_MAX_PER_WINDOW = 30;
const chatHits = new Map();

setInterval(() => chatHits.clear(), CHAT_WINDOW_MS).unref();

function chatLimiter(req, res, next) {
  const key = req.ip || 'unknown';
  const now = Date.now();
  const hits = chatHits.get(key);

  if (!hits || now - hits.start > CHAT_WINDOW_MS) {
    chatHits.set(key, { start: now, count: 1 });
    return next();
  }
  if (hits.count >= CHAT_MAX_PER_WINDOW) {
    res.setHeader('Retry-After', Math.ceil((CHAT_WINDOW_MS - (now - hits.start)) / 1000));
    return res.status(429).json({
      reply: "Whoa, slow down a bit! You're typing too fast :c Please wait a moment before sending more messages =[",
      matched: false,
      status: 'RateLimited',
    });
  }
  hits.count += 1;
  return next();
}

// buat & cek token csrf
app.use((req, res, next) => {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  }
  res.locals.csrfToken = req.session.csrfToken;
  next();
});

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function verifyCsrf(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();

  const sent = req.body && req.body._csrf;
  const expected = req.session && req.session.csrfToken;

  if (!sent || !expected) {
    if (req.path === '/admin/login' || req.originalUrl.startsWith('/admin')) {
      return res.status(403).render('admin/login', {
        error: 'Sesi kedaluwarsa atau token CSRF tidak valid. Silakan muat ulang halaman.',
        email: (req.body && req.body.email) || '',
        csrfToken: (req.session && req.session.csrfToken) || res.locals.csrfToken || '',
      });
    }
    return res.status(403).send('Sesi kedaluwarsa. Muat ulang halaman lalu coba lagi.');
  }

  const a = Buffer.from(String(sent));
  const b = Buffer.from(String(expected));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    if (req.path === '/admin/login' || req.originalUrl.startsWith('/admin')) {
      return res.status(403).render('admin/login', {
        error: 'Token keamanan tidak valid. Silakan coba lagi.',
        email: (req.body && req.body.email) || '',
        csrfToken: (req.session && req.session.csrfToken) || res.locals.csrfToken || '',
      });
    }
    return res.status(403).send('Token keamanan tidak valid. Muat ulang halaman lalu coba lagi.');
  }

  return next();
}

// daftar route halaman & api
app.get('/', (req, res) => {
  res.redirect('/chat');
});

app.get('/admin', (req, res) => {
  if (req.session && (req.session.admin || req.session.adminId)) {
    return res.redirect('/admin/dashboard');
  }
  return res.redirect('/admin/login');
});

app.get('/admin/login', redirectIfAuthenticated, authController.showLogin);
app.post('/admin/login', verifyCsrf, authController.login);
app.get('/admin/logout', authController.logout);
app.post('/admin/logout', verifyCsrf, authController.logout);

app.get('/admin/dashboard', isAdminAuthenticated, adminController.dashboard);
app.get('/admin/faq', isAdminAuthenticated, faqController.index);
app.get('/admin/history', isAdminAuthenticated, adminController.history);
app.get('/admin/settings', isAdminAuthenticated, settingController.index);
app.get('/admin/support', isAdminAuthenticated, adminController.support);

app.post('/admin/faq/store', isAdminAuthenticated, verifyCsrf, faqController.store);
app.post('/admin/faq', isAdminAuthenticated, verifyCsrf, faqController.store);
app.post('/admin/faq/:id', isAdminAuthenticated, verifyCsrf, faqController.update);
app.post('/admin/faq/:id/delete', isAdminAuthenticated, verifyCsrf, faqController.destroy);

app.post('/admin/settings/update', isAdminAuthenticated, verifyCsrf, settingController.update);
app.post('/admin/settings', isAdminAuthenticated, verifyCsrf, settingController.update);

app.get('/admin/logs', isAdminAuthenticated, adminController.history);

app.get('/chat', chatController.page);

app.post('/api/chatbot/query', chatLimiter, chatController.query);

const PORT = process.env.PORT || 3000;

// cek koneksi database awal
async function verifyDatabase() {
  const startedAt = Date.now();
  try {
    await Promise.race([
      adminController.pool.query('SELECT 1'),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('connection check timed out')), 20000).unref()
      ),
    ]);
    console.log(`[db] connected to ${adminController.pool.pool.config.database} in ${Date.now() - startedAt}ms`);
  } catch (err) {
    console.error(`[db] connection check failed after ${Date.now() - startedAt}ms:`, err.code || '', err.message);
  }
}

let server = null;

// jalankan server aplikasi
function start() {
  verifyDatabase();

  if (IS_SERVERLESS) return;

  server = app.listen(PORT, () => {
    console.log(`IRIS-2 server listening on http://localhost:${PORT}`);
  });
}

// tutup server & pool
function shutdown(signal) {
  console.log(`\n[server] ${signal} received, closing...`);
  const finish = async () => {
    try {
      await adminController.pool.end();
      console.log('[db] pool closed');
    } catch (err) {
      console.error('[db] pool close failed:', err.message);
    }
    process.exit(0);
  };

  if (server) {
    server.close(finish);
    setTimeout(() => process.exit(1), 10000).unref();
  } else {
    finish();
  }
}

if (!IS_SERVERLESS) {
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

start();

module.exports = app;
module.exports.app = app;
require('dotenv').config({ quiet: true });

// Refuse to boot without a real session secret rather than silently signing
// sessions with a hardcoded fallback that anyone reading the source can forge.
if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
  console.error('[config] SESSION_SECRET must be set to a random string of 32+ characters.');
  process.exit(1);
}

const express = require('express');
const session = require('express-session');
const path = require('path');
const app = express();

const authController = require('./controllers/authController');
const adminController = require('./controllers/adminController');
const chatController = require('./controllers/chatController');
const faqController = require('./controllers/faqController');
const settingController = require('./controllers/settingController');

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    },
  })
);
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

// Block browser/proxy caching across the whole admin area so the Back button
// cannot replay an authenticated dashboard after logout.
app.use('/admin', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

// Authentication guard. Anything reaching a protected route without a session
// admin id is bounced to the login view.
const requireAdmin = (req, res, next) => {
  if (!req.session.adminId) {
    return res.redirect('/admin/login');
  }
  next();
};

// Send an already-authenticated admin away from the login form.
const redirectIfAuthenticated = (req, res, next) => {
  if (req.session.adminId) {
    return res.redirect('/admin/dashboard');
  }
  next();
};

const crypto = require('crypto');

// Basic fixed-window rate limit for the public chat endpoint. Each request
// writes a history_chat row, so an unthrottled endpoint is a cheap way to fill
// the table. 30 questions per minute per IP is generous for a real student.
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
    return res.status(429).json({ reply: 'Terlalu banyak pertanyaan. Coba lagi sebentar.', matched: false });
  }
  hits.count += 1;
  return next();
}

// Per-session CSRF token. Exposed to every admin view so forms can post it
// back, and verified on every state-changing admin request.
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
  const expected = req.session.csrfToken;

  if (!sent || !expected) {
    return res.status(403).send('Sesi kedaluwarsa. Muat ulang halaman lalu coba lagi.');
  }

  const a = Buffer.from(String(sent));
  const b = Buffer.from(String(expected));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(403).send('Token keamanan tidak valid. Muat ulang halaman lalu coba lagi.');
  }

  return next();
}

app.get('/admin/login', redirectIfAuthenticated, authController.showLogin);
app.post('/admin/login', authController.login);
app.get('/admin/logout', authController.logout);
app.post('/admin/logout', verifyCsrf, authController.logout);

app.get('/admin/dashboard', requireAdmin, adminController.dashboard);
app.get('/admin/faq', requireAdmin, faqController.index);
app.get('/admin/history', requireAdmin, adminController.history);
app.get('/admin/settings', requireAdmin, settingController.index);
app.get('/admin/support', requireAdmin, adminController.support);

// Canonical create path used by the Add New Data form. `/admin/faq` is kept as
// an alias so existing bookmarks and older cached forms keep working.
app.post('/admin/faq/store', requireAdmin, verifyCsrf, faqController.store);
app.post('/admin/faq', requireAdmin, verifyCsrf, faqController.store);
app.post('/admin/faq/:id', requireAdmin, verifyCsrf, faqController.update);
app.post('/admin/faq/:id/delete', requireAdmin, verifyCsrf, faqController.destroy);

// Canonical settings write endpoint, plus the legacy alias kept from the
// earlier wiring so existing bookmarks and forms do not 404.
app.post('/admin/settings/update', requireAdmin, verifyCsrf, settingController.update);
app.post('/admin/settings', requireAdmin, verifyCsrf, settingController.update);

// Keep the legacy Laravel log path working as an alias of the history page.
app.get('/admin/logs', requireAdmin, adminController.history);

// Public student chat. Deliberately outside /admin: no session guard, because
// students are not authenticated. Writes to history_chat are rate-limited below.
app.get('/chat', chatController.page);

app.post('/api/chatbot/query', chatLimiter, chatController.query);

const PORT = process.env.PORT || 3000;

// Fail-hard startup gate. Every admin page reads from MySQL, so booting without
// a verified connection would only turn a clear startup error into runtime 500s
// and blank tables. Wrap in an async IIFE because this file is CommonJS.
async function start() {
    try {
        await adminPool.query('SELECT 1');
        console.log(`[db] connected to ${process.env.DB_DATABASE || 'db_chatbot'}`);
    } catch (err) {
        console.error('[db] connection check failed on startup:', err.message);
        // Hapus process.exit(1) agar Vercel tidak mati mendadak saat internet lambat
    }

    // Hanya menyalakan port jika dijalankan secara lokal (bukan di produksi Vercel)
    if (process.env.NODE_ENV !== 'production') {
        app.listen(PORT, () => {
            console.log(`IRIS-2 server listening on http://localhost:${PORT}`);
        });
    }
}

  // Drain in-flight requests before exiting so a deploy does not cut a
  // half-finished save or drop an open session.
  const shutdown = (signal) => {
    console.log(`\n[server] ${signal} received, closing...`);
    server.close(async () => {
      try {
        await adminPool.end();
        console.log('[db] pool closed');
      } catch (err) {
        console.error('[db] pool close failed:', err.message);
      }
      process.exit(0);
    });
    // Do not hang forever if a socket refuses to close.
    setTimeout(() => process.exit(1), 10000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));


start();

module.exports = app;
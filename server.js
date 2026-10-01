require('dotenv').config({ quiet: true });

// Vercel (and any serverless host) runs one process per invocation and calls
// the exported app directly. It must never bind a port, and it must not exit
// the process during module load: throwing here produces a 500 for every
// request instead of a legible startup error.
const IS_SERVERLESS = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

// Refuse to boot without a real session secret rather than silently signing
// sessions with a hardcoded fallback that anyone reading the source can forge.
// On serverless this must not call process.exit: it would kill the invocation
// and surface as an opaque 500 before any route runs.
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

// Vercel terminates TLS at its edge proxy and forwards to the function over
// plain HTTP, adding X-Forwarded-Proto and X-Forwarded-For. Without this,
// Express reports req.protocol as "http" and req.ip as the proxy's address.
//
// That matters for cookies: cookie-session's default secure:"auto" reads
// req.protocol, so an untrusted proxy makes Express believe the request was
// plaintext and it refuses to send a Secure cookie. Trust exactly one hop,
// which is Vercel's, rather than `true`, which would let any client spoof the
// forwarded headers.
app.set('trust proxy', 1);

const authController = require('./controllers/authController');
const adminController = require('./controllers/adminController');
const chatController = require('./controllers/chatController');
const faqController = require('./controllers/faqController');
const settingController = require('./controllers/settingController');

// Serverless sessions.
//
// express-session keeps session state in a MemoryStore, which lives inside a
// single process. Vercel may route consecutive requests for one admin to
// different instances, so the cookie arrives with no matching server-side
// session and the admin is bounced back to /admin/login. Storing the session in
// a signed cookie removes the dependency on server-side state entirely.
//
// Keys come from SESSION_SECRET only. A hardcoded fallback would mean a
// misconfigured deployment signs sessions with a secret published in this
// repository, letting anyone forge an admin cookie. The startup guard above
// refuses to boot without a real secret instead.
if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
  console.error('[config] SESSION_SECRET must be set to a random string of 32+ characters.');
  if (!IS_SERVERLESS) process.exit(1);
}

app.use(
  cookieSession({
    name: 'smekda_session',
    keys: [process.env.SESSION_SECRET],
    // Browsers cap a cookie at roughly 4KB. The CSRF token alone is 64 hex
    // characters, and cookie-session base64-encodes and signs the payload, so
    // the stored data has to stay small. Do not add large values here.
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    // "auto" sets the Secure attribute only when the request arrived over
    // HTTPS. Combined with `trust proxy` above, Express reads the original
    // scheme from X-Forwarded-Proto, so production gets Secure cookies while
    // local http:// development still works.
    //
    // Hardcoding `secure: false` would send the admin session cookie over
    // plain HTTP, exposing it to interception on any non-TLS hop. That trades
    // a fixable proxy misconfiguration for a real vulnerability.
    secure: 'auto',
    sameSite: 'lax',
    httpOnly: true,
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

// Site root sends visitors straight to the student chat. Declared before the
// /admin routes so the admin panel keeps its own dedicated paths and is never
// reachable by accident from the public entry point.
app.get('/', (req, res) => {
  res.redirect('/chat');
});

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

// The pool now lives in config/db.js and is shared by every controller.
// Verify it without ever letting a connection hiccup take the process down:
// mysql2 opens sockets lazily, so a brief SSL delay is not fatal and should not
// block the first request.
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
    // Logged, never fatal. Routes report their own DB failures, which keeps the
    // app importable on serverless even when TiDB is briefly unreachable.
    // A cold start can exceed the platform's function budget, so do not retry
    // here; the first real request will open a fresh connection.
    console.error(`[db] connection check failed after ${Date.now() - startedAt}ms:`, err.code || '', err.message);
  }
}

let server = null;

function start() {
  verifyDatabase();

  // Serverless invokes the exported app directly; binding a port there is
  // wrong and keeps the instance alive past the response.
  if (IS_SERVERLESS) return;

  server = app.listen(PORT, () => {
    console.log(`IRIS-2 server listening on http://localhost:${PORT}`);
  });
}

// Drain in-flight requests before exiting so a deploy does not cut a
// half-finished save or drop an open session. Only meaningful locally; on
// serverless the platform reaps the instance.
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
    // Do not hang forever if a socket refuses to close.
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

// Vercel's @vercel/node reads this export to build its route table. Assign it
// unconditionally so no conditional bootstrap can shadow it.
module.exports = app;
module.exports.app = app;
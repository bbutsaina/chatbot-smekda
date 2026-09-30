require('dotenv').config({ quiet: true });
const mysql = require('mysql2/promise');

// Keys this controller is allowed to write. Anything else in app_settings is
// treated as read-only so a crafted request cannot repoint the chatbot's
// configuration at arbitrary rows.
const EDITABLE_SETTINGS = ['greeting_message', 'fallback_message'];

const MAX_VALUE_LENGTH = 1000;

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USERNAME || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_DATABASE || 'db_chatbot',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

function setFlash(req, type, message) {
  req.session.flash = { type, message };
}

function consumeFlash(req) {
  const flash = req.session.flash || null;
  delete req.session.flash;
  return flash;
}

function readSettings() {
  return pool.query('SELECT `key`, `value` FROM app_settings').then(([rows]) => {
    const settings = {};
    rows.forEach((r) => {
      settings[r.key] = r.value;
    });
    return settings;
  });
}

exports.index = (req, res) => {
  readSettings()
    .then((settings) => {
      res.render('admin/settings', {
        adminName: req.session.adminName,
        adminEmail: req.session.adminEmail,
        activePage: 'settings',
        settings,
        greeting: settings.greeting_message || '',
        fallback: settings.fallback_message || '',
        flash: consumeFlash(req),
        formError: req.session.formError || null,
      });
      delete req.session.formError;
    })
    .catch((err) => {
      console.error('[settings] load failed:', err.message);
      res.status(500).send('Gagal memuat Settings.');
    });
};

exports.update = (req, res) => {
  const greeting = typeof req.body.greeting_message === 'string'
    ? req.body.greeting_message.trim()
    : '';
  const fallback = typeof req.body.fallback_message === 'string'
    ? req.body.fallback_message.trim()
    : '';

  if (!greeting) {
    req.session.formError = 'Greeting Message wajib diisi.';
    return res.redirect('/admin/settings');
  }
  if (greeting.length > MAX_VALUE_LENGTH) {
    req.session.formError = `Greeting Message maksimal ${MAX_VALUE_LENGTH} karakter.`;
    return res.redirect('/admin/settings');
  }
  if (fallback.length > MAX_VALUE_LENGTH) {
    req.session.formError = `Fallback Message maksimal ${MAX_VALUE_LENGTH} karakter.`;
    return res.redirect('/admin/settings');
  }

  const values = {
    greeting_message: greeting,
    fallback_message: fallback,
  };

  // Upsert each whitelisted key. ON DUPLICATE KEY UPDATE keeps this a single
  // round trip whether the row is new or already configured.
  Promise.all(
    EDITABLE_SETTINGS.map((key) =>
      pool.query(
        'INSERT INTO app_settings (`key`, `value`, `created_at`, `updated_at`) VALUES (?, ?, NOW(), NOW()) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`), `updated_at` = NOW()',
        [key, values[key]]
      )
    )
  )
    .then(() => {
      setFlash(req, 'success', 'Konfigurasi bot berhasil disimpan.');
      res.redirect('/admin/settings');
    })
    .catch((err) => {
      console.error('[settings] update failed:', err.message);
      setFlash(req, 'error', 'Gagal menyimpan konfigurasi bot.');
      res.redirect('/admin/settings');
    });
};

exports.pool = pool;

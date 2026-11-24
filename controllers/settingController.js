require('dotenv').config({ quiet: true });

// key boleh diubah
const EDITABLE_SETTINGS = ['greeting_message', 'fallback_message'];

const MAX_VALUE_LENGTH = 1000;

const pool = require('../config/db');

// simpan pesan flash
function setFlash(req, type, message) {
  req.session.flash = { type, message };
}

// ambil pesan flash
function consumeFlash(req) {
  const flash = req.session.flash || null;
  delete req.session.flash;
  return flash;
}

// baca semua pengaturan
function readSettings() {
  return pool.query('SELECT `key`, `value` FROM app_settings').then(([rows]) => {
    const settings = {};
    rows.forEach((r) => {
      settings[r.key] = r.value;
    });
    return settings;
  });
}

// tampilkan pengaturan sapaan & fallback
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

// simpan update pengaturan bot
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

  // upsert key whitelist
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

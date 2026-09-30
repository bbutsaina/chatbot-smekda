require('dotenv').config({ quiet: true });
const pool = require('../config/db');

const DEFAULT_PAGE_SIZE = 9;
const MAX_PAGE_SIZE = 50;

const LEN = {
  menu: 150,
  label: 150,
  keywords: 255,
  response: 65535, // `isi` is a TEXT column
};

// Escape a value for embedding inside a single-quoted JS string literal in an
// inline HTML attribute. Must run on the raw value before EJS HTML-escapes it.
function jsAttr(value) {
  return String(value == null ? '' : value)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n');
}

function readPageSize(raw, fallback) {
  const parsed = parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, MAX_PAGE_SIZE);
}

function parseFaqId(raw) {
  const id = parseInt(raw, 10);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function body(field) {
  return typeof field === 'string' ? field.trim() : '';
}

function consumeFlash(req) {
  const flash = req.session.flash || null;
  delete req.session.flash;
  return flash;
}

function setFlash(req, type, message) {
  req.session.flash = { type, message };
}

// Return the admin to the FAQ list, preserving their current filters when the
// referrer is same-origin. Falls back to the plain list.
function backToFaq(req, res) {
  const ref = req.get('Referer') || '';
  const origin = `${req.protocol}://${req.get('host')}`;
  if (ref.startsWith(origin) && ref.includes('/admin/faq')) {
    return res.redirect(ref);
  }
  return res.redirect('/admin/faq');
}

/**
 * Validate the four FAQ fields. Returns either `{ ok: true, values }` or
 * `{ ok: false, message, values }` so the caller can re-render what was typed.
 */
function validate(payload) {
  const values = {
    menu: body(payload.menu),
    label: body(payload.label),
    keywords: body(payload.keywords),
    // Field name must stay in sync with the form input in views/admin/faq.ejs.
    responseText: body(payload.response),
  };

  if (!values.menu || !values.label || !values.keywords || !values.responseText) {
    return { ok: false, message: 'Menu, Label, Keywords, dan Response wajib diisi.', values };
  }
  for (const field of ['menu', 'label', 'keywords', 'responseText']) {
    if (values[field].length > LEN[field]) {
      return { ok: false, message: `Kolom ${field} melebihi batas panjang.`, values };
    }
  }
  return { ok: true, values };
}

/**
 * GET /admin/faq
 * Lists FAQ rows with menu / label / keywords / response, plus the distinct
 * menus that populate the category filter.
 */
exports.index = async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const perPage = readPageSize(req.query.per_page, DEFAULT_PAGE_SIZE);
  const search = (req.query.q || '').trim();
  const category = (req.query.category || '').trim();

  // `kode` is legacy and nullable, so filter against the new columns instead.
  const filters = [];
  const params = [];

  if (search) {
    filters.push('(menu LIKE ? OR label LIKE ? OR kata_pemicu LIKE ? OR isi LIKE ?)');
    params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (category) {
    filters.push('menu = ?');
    params.push(category);
  }

  const whereSql = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

  try {
    const [[count], [rows], [menus]] = await Promise.all([
      pool.query(`SELECT COUNT(*) AS total FROM respon ${whereSql}`, params),
      pool.query(
        `SELECT id, menu, label, kata_pemicu, isi
           FROM respon ${whereSql}
          ORDER BY menu ASC, label ASC, id ASC
          LIMIT ? OFFSET ?`,
        [...params, perPage, (page - 1) * perPage]
      ),
      pool.query("SELECT DISTINCT menu FROM respon WHERE menu <> '' ORDER BY menu ASC"),
    ]);

    const total = count[0].total;
    const totalPages = Math.max(1, Math.ceil(total / perPage));
    const currentPage = Math.min(page, totalPages);

    res.render('admin/faq', {
      adminName: req.session.adminName,
      activePage: 'faq',
      faqs: rows.map((r) => ({
        id: r.id,
        menu: r.menu,
        label: r.label,
        keywords: r.kata_pemicu,
        responseText: r.isi,
        // pre-escaped for safe use inside inline onclick handlers
        jsMenu: jsAttr(r.menu),
        jsLabel: jsAttr(r.label),
        jsKeywords: jsAttr(r.kata_pemicu),
        jsResponse: jsAttr(r.isi),
      })),
      total,
      perPage,
      currentPage,
      totalPages,
      search,
      category,
      categories: menus.map((m) => m.menu),
      flash: consumeFlash(req),
      formError: req.session.formError || null,
      formValues: req.session.formValues || {},
    });
    delete req.session.formError;
    delete req.session.formValues;
  } catch (err) {
    console.error('[faq] index failed:', err.code || '', err.message);
    res.status(500).send('Gagal memuat Management FAQ.');
  }
};

/**
 * POST /admin/faq/store
 * Creates one FAQ row. `kode` is kept populated with the label so any legacy
 * consumer still reading `kode` continues to work.
 */
exports.store = async (req, res) => {
  // Destructured up front so the contract with views/admin/faq.ejs is explicit.
  // These names must match the form inputs exactly:
  //   menu, label, keywords, response
  const { menu, label, keywords, response } = req.body || {};

  const parsed = validate(req.body);

  if (!parsed.ok) {
    req.session.formError = parsed.message;
    req.session.formValues = parsed.values;
    // Log the mismatch server-side: a silent 302 with a form error is exactly
    // how the previous response/response_text bug hid for so long.
    console.warn(
      `[faq] store rejected. sent=${JSON.stringify({ menu, label, keywords, response })}`
    );
    return backToFaq(req, res);
  }

  const { menu: vMenu, label: vLabel, keywords: vKeywords, responseText } = parsed.values;

  let conn;
  try {
    // A transaction so a failed insert cannot leave a half-written FAQ row.
    conn = await pool.getConnection();
    await conn.beginTransaction();

    const [result] = await conn.query(
      'INSERT INTO respon (kode, isi, menu, label, kata_pemicu) VALUES (?, ?, ?, ?, ?)',
      [vLabel, responseText, vMenu, vLabel, vKeywords]
    );

    await conn.commit();
    console.log(`[faq] created id=${result.insertId} menu=${vMenu}`);
    setFlash(req, 'success', `FAQ "${vLabel}" berhasil ditambahkan.`);
    return backToFaq(req, res);
  } catch (err) {
    if (conn) await conn.rollback().catch(() => {});
    // Never surface a raw driver error or stack trace to the browser.
    console.error('[faq] store failed:', err.code || '', err.message);
    const timedOut = ['PROTOCOL_CONNECTION_LOST', 'ETIMEDOUT', 'ECONNREFUSED', 'ER_LOCK_WAIT_TIMEOUT', 'ER_LOCK_DEADLOCK'].includes(err.code);
    req.session.formError = timedOut
      ? 'Database tidak merespons. Silakan coba lagi.'
      : 'Gagal menambahkan FAQ.';
    req.session.formValues = { menu, label, keywords, responseText };
    return backToFaq(req, res);
  } finally {
    if (conn) conn.release();
  }
};

/** POST /admin/faq/:id */
exports.update = async (req, res) => {
  const id = parseFaqId(req.params.id);
  const parsed = validate(req.body);

  if (!id) {
    setFlash(req, 'error', 'ID FAQ tidak valid.');
    return backToFaq(req, res);
  }
  if (!parsed.ok) {
    req.session.formError = parsed.message;
    req.session.formValues = parsed.values;
    return backToFaq(req, res);
  }

  const { menu, label, keywords, responseText } = parsed.values;

  try {
    const [result] = await pool.query(
      'UPDATE respon SET kode = ?, isi = ?, menu = ?, label = ?, kata_pemicu = ? WHERE id = ?',
      [label, responseText, menu, label, keywords, id]
    );
    if (result.affectedRows === 0) {
      setFlash(req, 'error', 'FAQ yang akan diubah tidak ditemukan.');
    } else {
      setFlash(req, 'success', `FAQ "${label}" berhasil diperbarui.`);
    }
    return backToFaq(req, res);
  } catch (err) {
    console.error('[faq] update failed:', err.code || '', err.message);
    setFlash(req, 'error', 'Gagal memperbarui FAQ.');
    return backToFaq(req, res);
  }
};

/** POST /admin/faq/:id/delete */
exports.destroy = async (req, res) => {
  const id = parseFaqId(req.params.id);

  if (!id) {
    setFlash(req, 'error', 'ID FAQ tidak valid.');
    return backToFaq(req, res);
  }

  try {
    const [result] = await pool.query('DELETE FROM respon WHERE id = ?', [id]);
    if (result.affectedRows === 0) {
      setFlash(req, 'error', 'FAQ yang akan dihapus tidak ditemukan.');
    } else {
      setFlash(req, 'success', 'FAQ berhasil dihapus.');
    }
    return backToFaq(req, res);
  } catch (err) {
    console.error('[faq] delete failed:', err.code || '', err.message);
    setFlash(req, 'error', 'Gagal menghapus FAQ.');
    return backToFaq(req, res);
  }
};

exports.pool = pool;
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

// escape nilai untuk atribut
function jsAttr(value) {
  return String(value == null ? '' : value)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n');
}

// batasi ukuran halaman
function readPageSize(raw, fallback) {
  const parsed = parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, MAX_PAGE_SIZE);
}

// cek id faq valid
function parseFaqId(raw) {
  const id = parseInt(raw, 10);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// bersihkan input string
function body(field) {
  return typeof field === 'string' ? field.trim() : '';
}

// ambil pesan flash
function consumeFlash(req) {
  const flash = req.session.flash || null;
  delete req.session.flash;
  return flash;
}

// simpan pesan flash
function setFlash(req, type, message) {
  req.session.flash = { type, message };
}

// kembali ke daftar faq
function backToFaq(req, res) {
  const ref = req.get('Referer') || '';
  const origin = `${req.protocol}://${req.get('host')}`;
  if (ref.startsWith(origin) && ref.includes('/admin/faq')) {
    return res.redirect(ref);
  }
  return res.redirect('/admin/faq');
}

// validasi id & input faq
function validate(payload) {
  const values = {
    menu: body(payload.menu),
    label: body(payload.label),
    keywords: body(payload.keywords),
    // nama field sesuai form
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

// tampilkan, cari & join faq
exports.index = async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const perPage = readPageSize(req.query.per_page, DEFAULT_PAGE_SIZE);
  const search = (req.query.q || '').trim();
  const category = (req.query.category || '').trim();

  const filters = [];
  const params = [];

  if (search) {
    filters.push('(r.menu LIKE ? OR r.label LIKE ? OR r.kata_pemicu LIKE ? OR r.isi LIKE ?)');
    params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (category) {
    filters.push('r.menu = ?');
    params.push(category);
  }

  const whereSql = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const joinSql = 'FROM respon r LEFT JOIN users u ON r.created_by = u.id';

  try {
    const [[count], [rows], [menus]] = await Promise.all([
      pool.query(`SELECT COUNT(*) AS total ${joinSql} ${whereSql}`, params),
      pool.query(
        `SELECT r.id, r.menu, r.label, r.kata_pemicu, r.isi, u.name AS authorName
           ${joinSql} ${whereSql}
          ORDER BY r.menu ASC, r.label ASC, r.id ASC
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
        authorName: r.authorName || '-',
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

// simpan faq baru (create)
exports.store = async (req, res) => {
  // nama field sesuai form
  const { menu, label, keywords, response } = req.body || {};

  const parsed = validate(req.body);

  if (!parsed.ok) {
    req.session.formError = parsed.message;
    req.session.formValues = parsed.values;
    console.warn(
      `[faq] store rejected. sent=${JSON.stringify({ menu, label, keywords, response })}`
    );
    return backToFaq(req, res);
  }

  const { menu: vMenu, label: vLabel, keywords: vKeywords, responseText } = parsed.values;

  let conn;
  try {
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

// ubah data faq (update)
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

// hapus data faq (delete)
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
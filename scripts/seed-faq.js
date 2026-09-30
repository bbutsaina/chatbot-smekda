'use strict';

/**
 * Seed the FAQ trigger words into `respon`.
 *
 * The cluster started empty, so the bot had no keywords to match and every
 * question fell through to the fallback. Uses the shared pool in config/db.js,
 * which carries the SSL transport TiDB Cloud requires.
 */

require('dotenv').config({ quiet: true });
const pool = require('../config/db');

const FAQS = [
  {
    menu: 'PPDB',
    label: 'Jadwal Pendaftaran',
    keywords: 'daftar, pendaftaran, ppdb, mendaftar',
    response:
      'Pendaftaran siswa baru dibuka 1 Juni sampai 30 Juni 2026.',
  },
  {
    menu: 'Profil Sekolah',
    label: 'Alamat Sekolah',
    keywords: 'alamat, lokasi, dimana, address',
    response:
      'SMK Negeri 2 Purwakarta beralamat di Jl. Veteran No. 24, Purwakarta, Jawa Barat.',
  },
  {
    menu: 'Akademik',
    label: 'Jam Pelajaran',
    keywords: 'jam, pelajaran, jadwal, masuk',
    response:
      'Jam pelajaran berlangsung Senin sampai Sabtu, pukul 07.00 sampai 14.00 WIB.',
  },
  {
    menu: 'Jurusan',
    label: 'Daftar Jurusan',
    keywords: 'jurusan, prodi, kelas, bidang',
    response:
      'Tersedia jurusan Teknik Komputer dan Jaringan, Multimedia, serta Otomotif.',
  },
];

async function main() {
  for (const faq of FAQS) {
    const [existing] = await pool.query(
      'SELECT id FROM respon WHERE menu = ? AND label = ? LIMIT 1',
      [faq.menu, faq.label]
    );

    if (existing.length > 0) {
      await pool.query(
        'UPDATE respon SET isi = ?, kata_pemicu = ? WHERE id = ?',
        [faq.response, faq.keywords, existing[0].id]
      );
      console.log(`[seed-faq] updated ${faq.menu} / ${faq.label} (id=${existing[0].id})`);
      continue;
    }

    await pool.query(
      'INSERT INTO respon (kode, isi, menu, label, kata_pemicu) VALUES (?, ?, ?, ?, ?)',
      [faq.label, faq.response, faq.menu, faq.label, faq.keywords]
    );
    console.log(`[seed-faq] inserted ${faq.menu} / ${faq.label}`);
  }

  const [rows] = await pool.query(
    'SELECT id, menu, label, kata_pemicu FROM respon ORDER BY id'
  );
  console.log(`[seed-faq] respon now holds ${rows.length} row(s)`);
}

main()
  .then(() => pool.end())
  .then(() => process.exit(0))
  .catch(async (err) => {
    console.error('[seed-faq] failed:', err.code || '', err.message);
    await pool.end().catch(() => {});
    process.exit(1);
  });

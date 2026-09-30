require('dotenv').config({ quiet: true });
const mysql = require('mysql2/promise');

const FAQ = [
  ['PPDB', 'Jadwal Pendaftaran', 'daftar, pendaftaran, ppdb, mendaftar',
   'Pendaftaran siswa baru dibuka 1 Juni sampai 30 Juni 2026.'],
  ['Profil Sekolah', 'Alamat Sekolah', 'alamat, lokasi, dimana, address',
   'SMK Negeri 2 Purwakarta beralamat di Jl. Veteran No. 24, Purwakarta, Jawa Barat.'],
  ['Akademik', 'Jam Pelajaran', 'jam, pelajaran, jadwal, masuk',
   'Jam pelajaran berlangsung Senin sampai Sabtu, pukul 07.00 sampai 14.00 WIB.'],
  ['Jurusan', 'Daftar Jurusan', 'jurusan, prodi, kelas, bidang',
   'Tersedia jurusan Teknik Komputer dan Jaringan, Multimedia, serta Otomotif.'],
];

(async () => {
  const c = await mysql.createConnection({
    host: process.env.DB_HOST, port: +process.env.DB_PORT,
    user: process.env.DB_USERNAME, password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
  });

  // Clear previous test rows, keep it idempotent.
  await c.query("DELETE FROM respon WHERE menu LIKE 'TEST%' OR menu LIKE 'PPDB17%' OR menu LIKE 'IconTest%' OR menu LIKE 'DBG%'");
  await c.query('DELETE FROM history_chat');

  for (const [menu, label, kw, isi] of FAQ) {
    const [r] = await c.query(
      'INSERT INTO respon (kode, isi, menu, label, kata_pemicu) VALUES (?, ?, ?, ?, ?)',
      [label, isi, menu, label, kw]
    );
    console.log(`inserted id=${r.insertId} ${menu} / ${label}`);
  }

  const [n] = await c.query('SELECT COUNT(*) AS c FROM respon');
  console.log('respon total:', n[0].c);
  await c.end();
})();
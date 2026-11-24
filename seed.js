'use strict';

require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const mysql = require('mysql2/promise');
const { poolConfig } = require('./config/db');

const ADMIN_EMAIL = 'admin@smkn2purwakarta.sch.id';
const ADMIN_NAME = 'Super Admin IRIS-2';
const ADMIN_PASSWORD = 'Admin123!';
const BCRYPT_ROUNDS = 10;

const SETTINGS = [
  {
    key: 'greeting_message',
    value:
      'Halo! Saya IRIS-2, asisten akademik resmi SMKN 2 Purwakarta. Ada yang bisa saya bantu terkait sekolah?',
  },
  { key: 'fallback_message', value: 'Sorry.... I don’t really catch that :[' },
];

const FAQS = [
  {
    menu: 'Profil Sekolah',
    label: 'Sejarah dan Profil Singkat',
    keywords: 'profil, sejarah, visi, misi, tentang smekda, smkn 2 purwakarta',
    response:
      'SMK Negeri 2 Purwakarta (SMEKDA) didirikan tahun 1985 dan merupakan SMK Pusat Keunggulan di Kabupaten Purwakarta dengan akreditasi A. Visi sekolah adalah mencetak lulusan berkarakter Pancasila, kompeten, berdaya saing global, dan berjiwa wirausaha.',
  },
  {
    menu: 'Profil Sekolah',
    label: 'Alamat dan Kontak Resmi',
    keywords: 'alamat, lokasi, peta, nomor telepon, email, web resmi, kontak',
    response:
      'SMKN 2 Purwakarta beralamat di Jl. Veteran No. 24, Nagri Kaler, Kec. Purwakarta, Kab. Purwakarta, Jawa Barat 41115. Telepon: (0264) 200870, Email: info@smkn2purwakarta.sch.id, Website: https://smkn2purwakarta.sch.id.',
  },
  {
    menu: 'PPDB & Syarat Dokumen',
    label: 'Jadwal Pendaftaran PPDB',
    keywords: 'ppdb, pendaftaran, jadwal daftar, syarat masuk, kapan ppdb dibuka',
    response:
      'Pendaftaran Peserta Didik Baru (PPDB) SMKN 2 Purwakarta dibuka 2 tahap: Tahap 1 (Afirmasi, Prioritas Terdekat, Prestasi Kejuaraan) awal Juni 2026, dan Tahap 2 (Jalur Prestasi Nilai Rapor Umum) akhir Juni 2026 secara daring via portal PPDB Jabar.',
  },
  {
    menu: 'PPDB & Syarat Dokumen',
    label: 'Syarat dan Dokumen PPDB',
    keywords: 'syarat berkas, dokumen ppdb, kartu keluarga, ijazah, akta, surat keterangan lulus',
    response:
      'Dokumen persyaratan PPDB: Ijazah/Surat Keterangan Lulus (SKL) SMP/MTs, Akta Kelahiran, Kartu Keluarga (minimal 1 tahun), KTP orang tua, Buku Rapor semester 1-5, dan Surat Pernyataan Tanggung Jawab Mutlak (SPTJM) bermaterai.',
  },
  {
    menu: 'PPDB & Syarat Dokumen',
    label: 'Alur dan Kuota Penerimaan Siswa',
    keywords: 'alur ppdb, cara daftar, kuota siswa, seleksi, tes fisik, tes minat bakat',
    response:
      'Alur pendaftaran: buat akun di portal PPDB Jabar, unggah berkas persyaratan, pilih jurusan di SMKN 2 Purwakarta, lalu ikuti tes minat bakat serta pemeriksaan kesehatan fisik (tidak buta warna untuk jurusan teknik).',
  },
  {
    menu: 'Jurusan RPL',
    label: 'Rekayasa Perangkat Lunak (RPL)',
    keywords: 'rpl, rekayasa perangkat lunak, coding, programmer, web, software, aplikasi',
    response:
      'Konsentrasi Keahlian RPL mempelajari pemrograman web (HTML, CSS, JavaScript, PHP, Node.js), mobile app development (Flutter/Android), basis data (MySQL), dan cloud computing. Lulusan berkarir sebagai Junior Web/Mobile Developer, Software Tester, atau UI/UX Designer.',
  },
  {
    menu: 'Jurusan TKJ',
    label: 'Teknik Komputer dan Jaringan (TKJ)',
    keywords: 'tkj, teknik komputer jaringan, mikrotik, cisco, server, lan, wifi, fiber optic',
    response:
      'Konsentrasi Keahlian TKJ mendalami perakitan PC, instalasi jaringan kabel & serat optik (fiber optic), konfigurasi router MikroTik & switch Cisco, administrasi server Linux/Windows, serta keamanan jaringan (cyber security).',
  },
  {
    menu: 'Jurusan AKL',
    label: 'Akuntansi dan Keuangan Lembaga (AKL)',
    keywords: 'akl, akuntansi, keuangan, pembukuan, perbankan, pajak, myob, spreadsheet',
    response:
      'Konsentrasi Keahlian AKL melatih siswa menyusun laporan keuangan manual dan komputerisasi (MYOB/Accurate), mengelola perpajakan, transaksi kas kecil & perbankan, serta spreadsheet akuntansi perkantoran profesional.',
  },
  {
    menu: 'Jurusan MPLB',
    label: 'Manajemen Perkantoran dan Layanan Bisnis (MPLB)',
    keywords: 'mplb, otkp, perkantoran, administrasi, kearsipan, sekretaris, surat menyurat',
    response:
      'Konsentrasi Keahlian MPLB (dahulu OTKP) mempelajari korespondensi bahasa Indonesia & Inggris, kearsipan digital, otomatisasi tata kelola perkantoran, public relations, keprotokolan, dan manajemen agenda pimpinan.',
  },
  {
    menu: 'Jurusan BDP/Pemasaran',
    label: 'Bisnis Daring dan Pemasaran (BDP/Pemasaran)',
    keywords: 'bdp, pemasaran, bisnis daring, digital marketing, jualan online, retail, e-commerce',
    response:
      'Konsentrasi Keahlian BDP mempelajari strategi digital marketing, SEO, social media marketing, pengelolaan toko daring (e-commerce), penataan produk (visual merchandising), kasir POS, dan komunikasi bisnis ritel modern.',
  },
  {
    menu: 'Fasilitas & Lab',
    label: 'Laboratorium Komputer dan Jaringan',
    keywords: 'lab komputer, lab rpl, lab tkj, server, fasilitas komputer, internet sekolah',
    response:
      'SMKN 2 Purwakarta dilengkapi 6 laboratorium komputer ber-AC dengan PC spesifikasi modern, koneksi internet serat optik dedicated, serta server lokal dan rack switch untuk praktikum standar industri.',
  },
  {
    menu: 'Fasilitas & Lab',
    label: 'Fasilitas Umum dan Penunjang Belajar',
    keywords: 'fasilitas, perpustakaan, masjid, lapangan olahraga, kantin, uks, aula',
    response:
      'Fasilitas penunjang mencakup Perpustakaan digital (e-library), Masjid Al-Kautsar, Aula pertemuan Graha Utama, lapangan basket/voli/futsal, ruang UKS, Teaching Factory (TEFA), dan kantin sekolah higienis.',
  },
  {
    menu: 'Ekstrakurikuler',
    label: 'Daftar Kegiatan Ekstrakurikuler',
    keywords: 'ekskul, ekstrakurikuler, pramuka, paskibra, pmr, rohis, futsal, basket, seni',
    response:
      'Ekstrakurikuler aktif: Pramuka (wajib), Paskibra, PMR, Rohis/Rohkris, IT Club (Cyber & Coding), English Club, Futsal, Bola Basket, Bola Voli, Badminton, Seni Tari Tradisional/Modern, PKS, dan Fotografi/Jurnalistik.',
  },
  {
    menu: 'Jadwal & Kurikulum',
    label: 'Kurikulum Merdeka dan Sistem Belajar',
    keywords: 'kurikulum, merdeka, sistem belajar, sks, p5, ujian, semester',
    response:
      'SMKN 2 Purwakarta menerapkan Kurikulum Merdeka yang menekankan penguatan kompetensi kejuruan, pembelajaran berbasis proyek (PjBL), integrasi Teaching Factory, dan Projek Penguatan Profil Pelajar Pancasila (P5).',
  },
  {
    menu: 'Jadwal & Kurikulum',
    label: 'Jam Masuk dan Jadwal KBM Harian',
    keywords: 'jam masuk, jam pulang, jadwal kbm, jam pelajaran, waktu sekolah, hari sekolah',
    response:
      'KBM berlangsung Senin sampai Jumat pukul 07.00 - 15.30 WIB diawali apel pagi/tadarus/literasi. Hari Sabtu dikhususkan untuk kegiatan ekstrakurikuler dan pengayaan kompetensi.',
  },
  {
    menu: 'Tata Tertib',
    label: 'Tata Tertib dan Disiplin Siswa',
    keywords: 'tata tertib, aturan, disiplin, sanksi, seragam, rambut, terlambat, pelanggaran',
    response:
      'Siswa wajib hadir sebelum 07.00 WIB, mengenakan seragam resmi sesuai ketentuan (Senin: Putih Abu, Selasa: Seragam Jurusan, Rabu: Pramuka, Kamis: Batik/Adat, Jumat: Busana Muslim/Olahraga), berambut rapi, serta menjaga ketertiban sekolah.',
  },
  {
    menu: 'Tata Tertib',
    label: 'Ketentuan Kehadiran dan Izin Sakit',
    keywords: 'izin, sakit, alpa, absensi, surat izin, kehadiran, dispensasi',
    response:
      'Kehadiran minimal untuk syarat kenaikan kelas adalah 85%. Siswa yang sakit atau berhalangan hadir wajib melampirkan surat izin tertulis dari orang tua/wali atau surat keterangan dokter ke wali kelas dan guru piket.',
  },
  {
    menu: 'Info BKK/Alumni',
    label: 'Bursa Kerja Khusus (BKK) dan Mitra Industri',
    keywords: 'bkk, bursa kerja khusus, loker, kerja, mitra industri, magang, pkl, pkl industri',
    response:
      'Bursa Kerja Khusus (BKK) SMEKDA bekerja sama dengan lebih dari 50 perusahaan manufaktur, IT, perbankan, dan ritel untuk penyaluran PKL (Praktik Kerja Lapangan) dan rekrutmen kerja lulusan langsung di sekolah.',
  },
  {
    menu: 'Info BKK/Alumni',
    label: 'Tracer Study dan Ikatan Alumni',
    keywords: 'alumni, ikatan alumni, tracer study, legalisir ijazah, kuliah, wirausaha',
    response:
      'Lulusan SMKN 2 Purwakarta terserap dalam program BMW (Bekerja, Melanjutkan Kuliah, Wirausaha). Ikatan Alumni (IKA SMEKDA) aktif mengadakan jejaring karir, pendampingan kerja, dan layanan legalisir ijazah.',
  },
];

const CHAT_LOGS = [
  {
    pesan_masuk: 'Kapan pendaftaran PPDB tahun ini dibuka?',
    pesan_keluar: 'Pendaftaran Peserta Didik Baru (PPDB) SMKN 2 Purwakarta dibuka 2 tahap: Tahap 1 awal Juni 2026, dan Tahap 2 akhir Juni 2026 secara daring via portal PPDB Jabar.',
    status: 'Answered',
    daysAgo: 6,
    hoursAgo: 4,
  },
  {
    pesan_masuk: 'Alamat lengkap SMKN 2 Purwakarta di mana ya?',
    pesan_keluar: 'SMKN 2 Purwakarta beralamat di Jl. Veteran No. 24, Nagri Kaler, Kec. Purwakarta, Kab. Purwakarta, Jawa Barat 41115.',
    status: 'Answered',
    daysAgo: 6,
    hoursAgo: 1,
  },
  {
    pesan_masuk: 'Apakah ada jurusan farmasi atau multimedia?',
    pesan_keluar: 'Maaf, SMKN 2 Purwakarta tidak membuka jurusan Farmasi. Jurusan yang tersedia adalah RPL, TKJ, AKL, MPLB, dan Pemasaran (BDP).',
    status: 'Answered',
    daysAgo: 5,
    hoursAgo: 7,
  },
  {
    pesan_masuk: 'Berapa biaya pendaftaran masuk dan seragam?',
    pesan_keluar: 'Sorry.... I don’t really catch that :[',
    status: 'Unanswered',
    daysAgo: 5,
    hoursAgo: 3,
  },
  {
    pesan_masuk: 'Jurusan RPL belajarnya tentang apa saja kak?',
    pesan_keluar: 'Konsentrasi Keahlian RPL mempelajari pemrograman web (HTML, CSS, JavaScript, PHP, Node.js), mobile app development (Flutter/Android), basis data (MySQL), dan cloud computing.',
    status: 'Answered',
    daysAgo: 5,
    hoursAgo: 1,
  },
  {
    pesan_masuk: 'Syarat dokumen untuk ikut PPDB apa saja?',
    pesan_keluar: 'Dokumen persyaratan PPDB: Ijazah/SKL SMP, Akta Kelahiran, Kartu Keluarga, KTP orang tua, Buku Rapor semester 1-5, dan SPTJM bermaterai.',
    status: 'Answered',
    daysAgo: 4,
    hoursAgo: 8,
  },
  {
    pesan_masuk: 'Apakah di TKJ ada tes buta warna waktu seleksi?',
    pesan_keluar: 'Ya, untuk jurusan teknik seperti TKJ calon siswa diwajibkan mengikuti pemeriksaan kesehatan dan tidak buta warna.',
    status: 'Answered',
    daysAgo: 4,
    hoursAgo: 5,
  },
  {
    pesan_masuk: 'Ada asrama untuk murid dari luar kota tidak min?',
    pesan_keluar: 'Maaf, informasi tentang asrama siswa tidak ditemukan dalam data sekolah kami.',
    status: 'Unanswered',
    daysAgo: 4,
    hoursAgo: 2,
  },
  {
    pesan_masuk: 'Jam masuk sekolah pagi jam berapa?',
    pesan_keluar: 'KBM berlangsung Senin sampai Jumat pukul 07.00 - 15.30 WIB diawali apel pagi/tadarus/literasi bersama.',
    status: 'Answered',
    daysAgo: 3,
    hoursAgo: 6,
  },
  {
    pesan_masuk: 'Bisa minta nomor WhatsApp CS TU sekolah?',
    pesan_keluar: 'Sorry.... I don’t really catch that :[',
    status: 'Unanswered',
    daysAgo: 3,
    hoursAgo: 4,
  },
  {
    pesan_masuk: 'Apa saja ekstrakurikuler yang bisa diikuti?',
    pesan_keluar: 'Ekstrakurikuler aktif: Pramuka (wajib), Paskibra, PMR, Rohis/Rohkris, IT Club (Cyber & Coding), English Club, Futsal, Bola Basket, Bola Voli, Badminton, Seni Musik/Tari, PKS, dan Fotografi.',
    status: 'Answered',
    daysAgo: 3,
    hoursAgo: 1,
  },
  {
    pesan_masuk: 'Bagaimana cara legalisir ijazah untuk alumni?',
    pesan_keluar: 'Layanan legalisir ijazah dapat dilakukan langsung di bagian Tata Usaha sekolah pada jam kerja dengan membawa dokumen ijazah asli dan fotokopi.',
    status: 'Answered',
    daysAgo: 2,
    hoursAgo: 9,
  },
  {
    pesan_masuk: 'Apakah ada ekstrakurikuler e-sport atau panahan?',
    pesan_keluar: 'Maaf, kegiatan ekstrakurikuler tersebut belum tersedia di SMKN 2 Purwakarta.',
    status: 'Unanswered',
    daysAgo: 2,
    hoursAgo: 7,
  },
  {
    pesan_masuk: 'Jurusan MPLB itu mempelajari apa kak?',
    pesan_keluar: 'Konsentrasi Keahlian MPLB (dahulu OTKP) mempelajari korespondensi, kearsipan digital, otomatisasi tata kelola perkantoran, public relations, keprotokolan, dan manajemen agenda pimpinan.',
    status: 'Answered',
    daysAgo: 2,
    hoursAgo: 5,
  },
  {
    pesan_masuk: 'Fasilitas lab komputernya ada berapa ruangan?',
    pesan_keluar: 'SMKN 2 Purwakarta dilengkapi 6 laboratorium komputer ber-AC dengan PC spesifikasi modern, koneksi internet serat optik, serta server lokal.',
    status: 'Answered',
    daysAgo: 2,
    hoursAgo: 2,
  },
  {
    pesan_masuk: 'Bolehkah siswa membawa kendaraan motor pribadi ke sekolah?',
    pesan_keluar: 'Sorry.... I don’t really catch that :[',
    status: 'Unanswered',
    daysAgo: 2,
    hoursAgo: 1,
  },
  {
    pesan_masuk: 'Info BKK dan lowongan kerja alumni bisa dilihat di mana?',
    pesan_keluar: 'Bursa Kerja Khusus (BKK) SMEKDA bekerja sama dengan lebih dari 50 perusahaan mitra untuk penyaluran PKL dan rekrutmen kerja lulusan langsung di sekolah.',
    status: 'Answered',
    daysAgo: 1,
    hoursAgo: 10,
  },
  {
    pesan_masuk: 'Jurusan BDP dan Pemasaran prospek kerjanya bagaimana?',
    pesan_keluar: 'Lulusan BDP berkarir di bidang digital marketing, pengelolaan e-commerce, supervisor ritel, staf visual merchandising, kasir modern, dan wirausaha mandiri.',
    status: 'Answered',
    daysAgo: 1,
    hoursAgo: 8,
  },
  {
    pesan_masuk: 'Nilai minimal rata-rata rapor untuk bisa diterima di RPL berapa?',
    pesan_keluar: 'Maaf, nilai batas kelulusan PPDB ditentukan berdasarkan sistem pemeringkatan kuota pendaftar pada tahun ajaran berjalan.',
    status: 'Unanswered',
    daysAgo: 1,
    hoursAgo: 5,
  },
  {
    pesan_masuk: 'Hari Kamis seragamnya pakai apa?',
    pesan_keluar: 'Ketentuan seragam hari Kamis adalah Batik sekolah atau pakaian adat khas Sunda.',
    status: 'Answered',
    daysAgo: 1,
    hoursAgo: 3,
  },
  {
    pesan_masuk: 'Kalau sakit saat ujian bagaimana prosedurnya?',
    pesan_keluar: 'Siswa yang sakit wajib menyerahkan surat keterangan dokter dari fasilitas kesehatan resmi agar dapat dijadwalkan mengikuti ujian susulan oleh pihak kurikulum.',
    status: 'Answered',
    daysAgo: 1,
    hoursAgo: 1,
  },
  {
    pesan_masuk: 'Visi dan misi SMKN 2 Purwakarta apa ya?',
    pesan_keluar: 'Visi sekolah adalah mencetak lulusan berkarakter Pancasila, kompeten, berdaya saing global, dan berjiwa wirausaha.',
    status: 'Answered',
    daysAgo: 0,
    hoursAgo: 8,
  },
  {
    pesan_masuk: 'Berapa kuota penerimaan siswa baru tahun ajaran ini?',
    pesan_keluar: 'Sorry.... I don’t really catch that :[',
    status: 'Unanswered',
    daysAgo: 0,
    hoursAgo: 6,
  },
  {
    pesan_masuk: 'Apa perbedaan jurusan AKL dan jurusan MPLB?',
    pesan_keluar: 'AKL berfokus pada akuntansi, audit, pembukuan keuangan, dan perpajakan. Sedangkan MPLB berfokus pada manajemen administrasi perkantoran, persuratan, dan kearsipan digital.',
    status: 'Answered',
    daysAgo: 0,
    hoursAgo: 5,
  },
  {
    pesan_masuk: 'Apakah ada kegiatan keputrian di hari Jumat?',
    pesan_keluar: 'Ya, pada saat salat Jumat bagi siswa putra, siswi putri mengikuti kegiatan pembinaan keputrian di aula sekolah.',
    status: 'Answered',
    daysAgo: 0,
    hoursAgo: 4,
  },
  {
    pesan_masuk: 'Apakah ada program magang kerja ke Jepang untuk siswa SMEKDA?',
    pesan_keluar: 'Sorry.... I don’t really catch that :[',
    status: 'Unanswered',
    daysAgo: 0,
    hoursAgo: 3,
  },
  {
    pesan_masuk: 'Kegiatan PKL dilaksanakan berapa lama kak?',
    pesan_keluar: 'Praktik Kerja Lapangan (PKL) dilaksanakan selama 6 bulan di industri mitra yang relevan dengan kompetensi keahlian masing-masing siswa.',
    status: 'Answered',
    daysAgo: 0,
    hoursAgo: 2,
  },
  {
    pesan_masuk: 'Halo min mau tanya seputar jurusan TKJ',
    pesan_keluar: 'Konsentrasi Keahlian TKJ mendalami perakitan PC, instalasi jaringan kabel & serat optik, konfigurasi router MikroTik & Cisco, serta administrasi server.',
    status: 'Answered',
    daysAgo: 0,
    hoursAgo: 1,
  },
];

const DB_NAME = process.env.DB_DATABASE || 'db_chatbot';
if (!/^[A-Za-z0-9_]+$/.test(DB_NAME)) {
  console.error(`[seed] refusing to continue: DB_DATABASE="${DB_NAME}" is not a valid identifier`);
  process.exit(1);
}

let pool = mysql.createPool(poolConfig({ connectionLimit: 1, database: undefined }));

// Ensures the target database exists and establishes connection pool against it.
async function ensureDatabaseExists() {
  await pool.query(
    `CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_bin`
  );
  console.log(`[seed] database "${DB_NAME}" ready`);
  await pool.end();
  pool = mysql.createPool(poolConfig({ connectionLimit: 5 }));
  await pool.query('USE ??', [DB_NAME]);
  console.log(`[seed] using database "${DB_NAME}"`);
}

// Ensures the app_settings table exists.
async function ensureSettingsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_settings (
      \`key\` VARCHAR(191) NOT NULL,
      \`value\` TEXT NULL,
      created_at TIMESTAMP NULL DEFAULT NULL,
      updated_at TIMESTAMP NULL DEFAULT NULL,
      PRIMARY KEY (\`key\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin
  `);
  console.log('[seed] app_settings table ready');
}

// Ensures the users table exists.
async function ensureUsersTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(191) NOT NULL,
      email_verified_at TIMESTAMP NULL DEFAULT NULL,
      password VARCHAR(255) NOT NULL,
      remember_token VARCHAR(100) NULL DEFAULT NULL,
      created_at TIMESTAMP NULL DEFAULT NULL,
      updated_at TIMESTAMP NULL DEFAULT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY users_email_unique (email)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  `);
  console.log('[seed] users table ready');
}

// Ensures the respon table exists with created_by linked to users(id).
async function ensureResponTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS respon (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      kode VARCHAR(150) NULL,
      isi TEXT NOT NULL,
      menu VARCHAR(150) NOT NULL DEFAULT '',
      label VARCHAR(150) NOT NULL DEFAULT '',
      kata_pemicu VARCHAR(255) NOT NULL DEFAULT '',
      created_by INT UNSIGNED NULL,
      PRIMARY KEY (id),
      KEY idx_respon_menu (menu),
      KEY idx_respon_menu_label (menu, label),
      KEY idx_respon_created_by (created_by),
      CONSTRAINT fk_respon_created_by FOREIGN KEY (created_by)
        REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin
  `);

  // `created_by` is UNSIGNED to match users.id; a signed INT cannot be an FK here.
  const [cols] = await pool.query(
    "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'respon' AND COLUMN_NAME = 'created_by'"
  );
  if (!cols.length) {
    await pool.query('ALTER TABLE respon ADD COLUMN created_by INT UNSIGNED NULL AFTER kata_pemicu');
    console.log('[seed] respon.created_by column added');
  } else {
    console.log('[seed] respon.created_by already present');
  }

  // Existing databases need the constraint added separately; failure is logged, not fatal.
  const [fks] = await pool.query(
    "SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'respon' AND CONSTRAINT_NAME = 'fk_respon_created_by'"
  );
  if (!fks.length) {
    try {
      await pool.query(
        'ALTER TABLE respon ADD CONSTRAINT fk_respon_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL'
      );
      console.log('[seed] respon.created_by foreign key added');
    } catch (err) {
      console.warn('[seed] respon.created_by foreign key skipped:', err.code || '', err.message);
    }
  }

  console.log('[seed] respon table ready');
}

// Ensures the history_chat table exists with timestamp support.
async function ensureHistoryTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS history_chat (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      token VARCHAR(100) NOT NULL,
      pesan_masuk TEXT NOT NULL,
      pesan_keluar TEXT NOT NULL,
      status ENUM('Answered','Unanswered') NOT NULL DEFAULT 'Answered',
      created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_history_token (token),
      KEY idx_history_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin
  `);
  console.log('[seed] history_chat table ready');
}

// Seeds default super admin user with bcrypt hash, ensuring active credentials.
async function seedAdmin() {
  const [existing] = await pool.query(
    'SELECT id, email FROM users WHERE email = ? LIMIT 1',
    [ADMIN_EMAIL]
  );

  const hash = bcrypt.hashSync(ADMIN_PASSWORD, BCRYPT_ROUNDS);

  if (existing.length > 0) {
    await pool.query(
      'UPDATE users SET password = ?, name = ?, updated_at = NOW() WHERE id = ?',
      [hash, ADMIN_NAME, existing[0].id]
    );
    console.log(`[seed] admin credentials synced: ${ADMIN_EMAIL}`);
    return;
  }

  await pool.query(
    'INSERT INTO users (name, email, password, created_at, updated_at) VALUES (?, ?, ?, NOW(), NOW())',
    [ADMIN_NAME, ADMIN_EMAIL, hash]
  );

  console.log(`[seed] admin created: ${ADMIN_EMAIL}`);
}

// Seeds default application configuration keys if missing.
async function seedSettings() {
  for (const setting of SETTINGS) {
    const [existing] = await pool.query(
      'SELECT `key` FROM app_settings WHERE `key` = ? LIMIT 1',
      [setting.key]
    );

    if (existing.length > 0) {
      console.log(`[seed] setting "${setting.key}" already exists, skipping insert`);
      continue;
    }

    await pool.query(
      'INSERT INTO app_settings (`key`, `value`, `created_at`, `updated_at`) VALUES (?, ?, NOW(), NOW())',
      [setting.key, setting.value]
    );

    console.log(`[seed] setting inserted: ${setting.key}`);
  }
}

// Calculates an ISO MySQL timestamp offset by given days and hours.
function getPastDate(daysAgo, hoursAgo) {
  const target = new Date(Date.now() - daysAgo * 86400000 - hoursAgo * 3600000);
  return target.toISOString().slice(0, 19).replace('T', ' ');
}

// Seeds school FAQ records, attributing them to the seeded admin author.
async function seedFaqs() {
  const [adminRows] = await pool.query('SELECT id FROM users WHERE email = ? LIMIT 1', [ADMIN_EMAIL]);
  const adminId = adminRows[0] && adminRows[0].id ? adminRows[0].id : null;

  for (const faq of FAQS) {
    const [existing] = await pool.query(
      'SELECT id FROM respon WHERE menu = ? AND label = ? LIMIT 1',
      [faq.menu, faq.label]
    );

    if (existing.length > 0) {
      await pool.query(
        'UPDATE respon SET kode = ?, isi = ?, kata_pemicu = ?, created_by = COALESCE(created_by, ?) WHERE id = ?',
        [faq.label, faq.response, faq.keywords, adminId, existing[0].id]
      );
      console.log(`[seed] updated FAQ: ${faq.menu} / ${faq.label}`);
    } else {
      await pool.query(
        'INSERT INTO respon (kode, isi, menu, label, kata_pemicu, created_by) VALUES (?, ?, ?, ?, ?, ?)',
        [faq.label, faq.response, faq.menu, faq.label, faq.keywords, adminId]
      );
      console.log(`[seed] inserted FAQ: ${faq.menu} / ${faq.label}`);
    }
  }
}

// Seeds realistic chat history records over past seven days.
async function seedChatHistory() {
  const [cols] = await pool.query("SHOW COLUMNS FROM history_chat LIKE 'created_at'");
  const hasCreatedAt = cols.length > 0;

  const [countResult] = await pool.query('SELECT COUNT(*) AS total FROM history_chat');
  if (countResult[0].total >= CHAT_LOGS.length) {
    console.log(`[seed] history_chat already has ${countResult[0].total} rows, skipping insert`);
    return;
  }

  for (const log of CHAT_LOGS) {
    const token = crypto.randomBytes(8).toString('hex');
    const createdAt = getPastDate(log.daysAgo, log.hoursAgo);

    if (hasCreatedAt) {
      await pool.query(
        'INSERT INTO history_chat (token, pesan_masuk, pesan_keluar, status, created_at) VALUES (?, ?, ?, ?, ?)',
        [token, log.pesan_masuk, log.pesan_keluar, log.status, createdAt]
      );
    } else {
      await pool.query(
        'INSERT INTO history_chat (token, pesan_masuk, pesan_keluar, status) VALUES (?, ?, ?, ?)',
        [token, log.pesan_masuk, log.pesan_keluar, log.status]
      );
    }
  }
  console.log(`[seed] seeded ${CHAT_LOGS.length} chat history records`);
}

// Orchestrates end-to-end database provisioning and data seeding.
async function main() {
  await ensureDatabaseExists();
  await ensureSettingsTable();
  await ensureUsersTable();
  await ensureResponTable();
  await ensureHistoryTable();
  await seedAdmin();
  await seedSettings();
  await seedFaqs();
  await seedChatHistory();
  console.log('[seed] completed successfully');
  console.log('\n=========================================');
  console.log(' ADMIN LOGIN CREDENTIALS');
  console.log(` Email    : ${ADMIN_EMAIL}`);
  console.log(` Password : ${ADMIN_PASSWORD}`);
  console.log('=========================================\n');
}

main()
  .then(async () => {
    await pool.end();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('[seed] FAILED:', err.code || '', err.message);
    try {
      await pool.end();
    } catch (_) {}
    process.exit(1);
  });

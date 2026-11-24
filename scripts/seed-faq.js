'use strict';

require('dotenv').config({ quiet: true });
const crypto = require('crypto');
// Uses the shared TiDB/MySQL SSL pool defined in config/db.js.
const pool = require('../config/db');

const FAQS = [
  {
    menu: 'Profil Sekolah',
    label: 'Profil & Sejarah Sekolah',
    keywords: 'profil, sejarah, smea negeri 17, 1968, smekda, smkn 2 purwakarta, alamat, kontak, telepon, email, jenderal a yani, nagritengah',
    response:
      'SMKN 2 Purwakarta (SMEKDA) berdiri tahun 1968 sebagai SMEA Negeri 17 Purwakarta. Lokasi: Jl. Jenderal A. Yani No. 98, Kel. Nagritengah, Kec. Purwakarta, Kab. Purwakarta, Jawa Barat 41114. Telepon: (0264) 200724. Email: smknegeri2pwk@gmail.com.',
  },
  {
    menu: 'Profil Sekolah',
    label: 'Visi & Misi Sekolah',
    keywords: 'visi, misi, tujuan sekolah, karakter, kompeten, prestasi nasional, sdm profesional, bertanggung jawab',
    response:
      'Visi SMKN 2 Purwakarta: mencetak lulusan berkarakter, kompeten, dan berprestasi di tingkat Nasional. Misi: membina SDM profesional tingkat menengah dan menghasilkan lulusan yang bertanggung jawab.',
  },
  {
    menu: 'Tata Tertib',
    label: 'Tata Tertib Sekolah',
    keywords: 'tata tertib, aturan, apel, 15 menit, seragam rapi, kebersihan, hormat guru, larangan, norma, hukum',
    response:
      'Tata tertib SMKN 2 Purwakarta: wajib hadir 15 menit sebelum apel, berpakaian seragam rapi, menjaga kebersihan, dan menghormati guru/staf. Dilarang membawa barang di luar kepentingan sekolah atau melanggar hukum/norma.',
  },
  {
    menu: 'SPMB / PPDB',
    label: 'SPMB Terpadu & Jalur Pendaftaran',
    keywords: 'spmb, ppdb, pendaftaran, tahap 1, tahap 2, afirmasi, ketm, perpindahan tugas orang tua wali, prestasi kejuaraan, nilai rapor, reguler, spmbsmkn2pwk',
    response:
      'SPMB Terpadu SMKN 2 Purwakarta melalui portal https://spmbsmkn2pwk.site.je. Tahap 1: jalur Afirmasi KETM, Perpindahan Tugas Orang Tua/Wali, dan Prestasi Kejuaraan. Tahap 2: Prestasi Nilai Rapor dan Reguler.',
  },
  {
    menu: 'SPMB / PPDB',
    label: 'Syarat Berkas & Kuota Daya Tampung SPMB',
    keywords: 'syarat berkas, berkas administrasi, dokumen spmb, kuota, daya tampung, syarat daftar, spmb',
    response:
      'Informasi syarat berkas administrasi dan kuota daya tampung SPMB SMKN 2 Purwakarta tersedia lengkap di portal resmi https://spmbsmkn2pwk.site.je. Pastikan berkas administrasi dipenuhi sesuai jalur yang dipilih (Afirmasi KETM, Perpindahan Tugas Orang Tua/Wali, Prestasi Kejuaraan, Prestasi Nilai Rapor, atau Reguler).',
  },
  {
    menu: 'SPMB / PPDB',
    label: 'Alur Pendaftaran & Daftar Ulang SPMB',
    keywords: 'alur daftar, cara daftar, prosedur spmb, daftar ulang, pengumuman, portal spmb, spmbsmkn2pwk',
    response:
      'Alur SPMB: akses https://spmbsmkn2pwk.site.je, pilih jalur pada Tahap 1 atau Tahap 2, lengkapi berkas administrasi, ikuti proses seleksi, lalu lakukan daftar ulang sesuai jadwal yang diumumkan di portal SPMB.',
  },
  {
    menu: 'Bursa Kerja Khusus (BKK)',
    label: 'Layanan BKK & Lowongan Kerja',
    keywords: 'bkk, bursa kerja khusus, loker, lowongan kerja, rekrutmen, penyaluran kerja, siswa, alumni, mitra industri, bkksmkn2pwk, cv, ktp, ijazah, skl',
    response:
      'Bursa Kerja Khusus (BKK) SMKN 2 Purwakarta (https://bkksmkn2pwk.site.je) menyediakan info lowongan kerja mitra industri, rekrutmen perusahaan, dan penyaluran kerja bagi siswa & alumni. Caranya: cek menu Loker, scan QR atau isi formulir, lalu siapkan CV, KTP, dan Ijazah/SKL.',
  },
  {
    menu: 'Perpustakaan Digital',
    label: 'Perpustakaan Digital & Peminjaman Buku',
    keywords: 'perpustakaan, library, buku, peminjaman, koleksi, nisn, nip, teknologi, akuntansi, matematika, librarysmkn2pwk',
    response:
      'Perpustakaan Digital SMKN 2 Purwakarta (https://librarysmkn2pwk.site.je) melayani peminjaman 37+ koleksi buku kejuruan & umum: Teknologi, Akuntansi, Bisnis Manajemen, Matematika, dll. Akses via web maupun aplikasi mobile. Siswa mendaftar memakai NISN, guru memakai NIP.',
  },
  {
    menu: 'BLUD & Unit Usaha',
    label: 'BLUD SMKN 2 Purwakarta & Unit Kewirausahaan',
    keywords: 'blud, badan layanan umum daerah, unit usaha, kewirausahaan siswa, blud smkn 2 purwakarta',
    response:
      'Badan Layanan Umum Daerah (BLUD) SMKN 2 Purwakarta mengelola unit kewirausahaan siswa. Informasi resmi: https://blud-smkn-2-purwakarta.kesug.com. Unit usaha yang dikelola antara lain Smekda Mart, Alfa Class, Busana Zaheera Smekda, dan Café Candaria.',
  },
  {
    menu: 'BLUD & Unit Usaha',
    label: 'Smekda Mart — Kantin & Toko Sekolah',
    keywords: 'smekda mart, kantin, toko seragam, atribut sekolah, buka, senin jumat, humas, smekdamart',
    response:
      'Smekda Mart (https://smekdamart.site.je) adalah kantin sekaligus toko seragam dan atribut sekolah. Buka Senin–Jumat pukul 08.00–14.00 WIB (pembina Dra. Eva Latifah S.Pd).',
  },
  {
    menu: 'BLUD & Unit Usaha',
    label: 'Alfa Class, Busana Zaheera & Café Candaria',
    keywords: 'alfa class, ritel modern, busana zaheera, cafe candaria, alfaclasssmkn2pwk, cafe-candaria',
    response:
      'Unit usaha BLUD lainnya: Alfa Class sebagai ritel modern (https://alfaclasssmkn2pwk.site.je), Busana Zaheera Smekda sebagai unit busana, dan Café Candaria (https://cafe-candaria.site.je) sebagai unit usaha café.',
  },
  {
    menu: 'Kompetensi Keahlian',
    label: 'RPL — Rekayasa Perangkat Lunak',
    keywords: 'rpl, rekayasa perangkat lunak, jurusan, kompetensi keahlian, rpl smkn2pwk',
    response:
      'Kompetensi Keahlian Rekayasa Perangkat Lunak (RPL) di SMKN 2 Purwakarta. Portal informasi jurusan: https://rpl-smkn2pwk.42web.io.',
  },
  {
    menu: 'Kompetensi Keahlian',
    label: 'TKJ — Teknik Komputer dan Jaringan',
    keywords: 'tkj, teknik komputer dan jaringan, jurusan, kompetensi keahlian, tkjsmkn2purwakarta',
    response:
      'Kompetensi Keahlian Teknik Komputer dan Jaringan (TKJ) di SMKN 2 Purwakarta. Portal informasi jurusan: https://tkjsmkn2purwakarta.site.je.',
  },
  {
    menu: 'Kompetensi Keahlian',
    label: 'DPB — Tata Busana',
    keywords: 'dpb, tata busana, desain busana, pola, jahit presisi, kriya tekstil, dpbsmkn2pwk',
    response:
      'Kompetensi Keahlian DPB / Tata Busana di SMKN 2 Purwakarta mempelajari desain busana, pembuatan pola, jahit presisi, dan kriya tekstil. Portal: https://dpbsmkn2pwk.free.je.',
  },
  {
    menu: 'Kompetensi Keahlian',
    label: 'MP — Manajemen Perkantoran',
    keywords: 'mp, manajemen perkantoran, jurusan, kompetensi keahlian, mp smkn2pwk',
    response:
      'Kompetensi Keahlian MP / Manajemen Perkantoran di SMKN 2 Purwakarta. Portal informasi jurusan: https://mp-smkn2pwk.site.je.',
  },
  {
    menu: 'Kompetensi Keahlian',
    label: 'MB — Manajemen Bisnis & Pemasaran',
    keywords: 'mb, manajemen bisnis, pemasaran, jurusan, kompetensi keahlian, mbsmkn2pwk',
    response:
      'Kompetensi Keahlian MB / Manajemen Bisnis & Pemasaran di SMKN 2 Purwakarta. Portal informasi jurusan: https://mbsmkn2pwk.site.je.',
  },
  {
    menu: 'Kompetensi Keahlian',
    label: 'AKL — Akuntansi',
    keywords: 'akl, akuntansi, jurusan, kompetensi keahlian, keuangan',
    response:
      'AKL (Akuntansi) merupakan salah satu kompetensi keahlian di SMKN 2 Purwakarta. Informasi pilihan jurusan dapat dilihat melalui portal SPMB https://spmbsmkn2pwk.site.je.',
  },
  {
    menu: 'Ekstrakurikuler',
    label: 'IRMA — Ikatan Remaja Masjid',
    keywords: 'irma, ikatan remaja masjid, kajian pekanan, hadroh, mhq, juara, keagamaan',
    response:
      'IRMA (Ikatan Remaja Masjid) SMKN 2 Purwakarta: kajian pekanan, hadroh, dan Juara MHQ. Portal ekstrakurikuler: https://irmasmkn2.site.je.',
  },
  {
    menu: 'Ekstrakurikuler',
    label: 'Pramuka, Paskibra, PKS & Ecology',
    keywords: 'pramuka, paskibra, pks, patroli keamanan sekolah, ecology, pecinta lingkungan, keagamaan karakter',
    response:
      'Ekstrakurikuler keagamaan & karakter: Pramuka (https://pramuka-smkn2-pwk.site.je), Paskibra (https://paskibra-smkn2pwk.site.je), PKS / Patroli Keamanan Sekolah (https://pks-smkn2pwk.42web.io), dan Ecology / Pecinta Lingkungan (https://ecology-smkn2pwk.site.je).',
  },
  {
    menu: 'Ekstrakurikuler',
    label: 'X-TIK, E-Sport, Journalist & Public Speaking',
    keywords: 'x-tik, xtik programming, e-sport, journalist, public speaking, teknologi, literasi',
    response:
      'Ekstrakurikuler teknologi & literasi: X-TIK Programming (https://xtik-programming-smkn2.site.je), E-Sport (https://esport-smk.site.je), Journalist, dan Public Speaking.',
  },
  {
    menu: 'Ekstrakurikuler',
    label: 'Seni Multikalter, Tari, Marching Band, MUA & Kewirausahaan',
    keywords: 'seni multikultur, seni multikalter, tari, marching band, mua, make up artist, kewirausahaan',
    response:
      'Ekstrakurikuler seni & kreativitas: Seni Multikultur / Multikalter (https://senimultikalter-smkn2pwk.42web.io), Tari, Marching Band, MUA (Make Up Artist), dan Kewirausahaan.',
  },
  {
    menu: 'Ekstrakurikuler',
    label: 'Olahraga — Voli, Futsal, Pencak Silat & Basket',
    keywords: 'bola voli, voli, futsal, pencak silat, basket, basing, olahraga, latihan',
    response:
      'Ekstrakurikuler olahraga: Bola Voli — latihan Selasa & Jumat 15.00–17.00 WIB (https://volismk2pwk.site.je), Futsal (https://eskulfutsal.site.je), Pencak Silat, dan Basket (Basing).',
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

// Calculates an ISO MySQL timestamp offset by given days and hours.
function getPastDate(daysAgo, hoursAgo) {
  const target = new Date(Date.now() - daysAgo * 86400000 - hoursAgo * 3600000);
  return target.toISOString().slice(0, 19).replace('T', ' ');
}

// Seeds 22 verified FAQ entries idempotently by label, keeping kode equal to label.
async function seedFaqs() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS respon (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      kode VARCHAR(150) NULL,
      isi TEXT NOT NULL,
      menu VARCHAR(150) NOT NULL DEFAULT '',
      label VARCHAR(150) NOT NULL DEFAULT '',
      kata_pemicu VARCHAR(255) NOT NULL DEFAULT '',
      PRIMARY KEY (id),
      KEY idx_respon_menu (menu),
      KEY idx_respon_menu_label (menu, label)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin
  `);

  for (const faq of FAQS) {
    const [existing] = await pool.query(
      'SELECT id FROM respon WHERE label = ? LIMIT 1',
      [faq.label]
    );

    if (existing.length > 0) {
      await pool.query(
        'UPDATE respon SET kode = ?, isi = ?, menu = ?, kata_pemicu = ? WHERE id = ?',
        [faq.label, faq.response, faq.menu, faq.keywords, existing[0].id]
      );
      console.log(`[seed-faq] updated: ${faq.menu} / ${faq.label}`);
    } else {
      await pool.query(
        'INSERT INTO respon (kode, isi, menu, label, kata_pemicu) VALUES (?, ?, ?, ?, ?)',
        [faq.label, faq.response, faq.menu, faq.label, faq.keywords]
      );
      console.log(`[seed-faq] inserted: ${faq.menu} / ${faq.label}`);
    }
  }
}

// Seeds realistic dialogue interactions spanning the past seven days.
async function seedChatHistory() {
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

  const [cols] = await pool.query("SHOW COLUMNS FROM history_chat LIKE 'created_at'");
  const hasCreatedAt = cols.length > 0;

  const [countResult] = await pool.query('SELECT COUNT(*) AS total FROM history_chat');
  if (countResult[0].total >= CHAT_LOGS.length) {
    console.log(`[seed-faq] history_chat already has ${countResult[0].total} rows, skipping insert`);
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
  console.log(`[seed-faq] seeded ${CHAT_LOGS.length} chat history logs`);
}

// Executes full FAQ and chat history seeding workflow.
async function main() {
  await seedFaqs();
  await seedChatHistory();
  console.log('[seed-faq] completed successfully');
}

main()
  .then(() => pool.end())
  .then(() => process.exit(0))
  .catch(async (err) => {
    console.error('[seed-faq] failed:', err.code || '', err.message);
    await pool.end().catch(() => {});
    process.exit(1);
  });

-- ============================================================
-- db_chatbot.sql — IRIS-2 / SMKN 2 Purwakarta
-- Export lengkap: struktur + data dummy untuk penilaian UKK
-- PT. Pratama Solusi Teknologi
-- Kompatibel: MySQL 8.x / MariaDB / TiDB Serverless
-- ============================================================

CREATE DATABASE IF NOT EXISTS `db_chatbot`
  CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;
USE `db_chatbot`;

SET FOREIGN_KEY_CHECKS = 0;

-- ------------------------------------------------------------
-- Hapus tabel dengan urutan aman terhadap foreign key
-- ------------------------------------------------------------
DROP TABLE IF EXISTS `history_chat`;
DROP TABLE IF EXISTS `respon`;
DROP TABLE IF EXISTS `app_settings`;
DROP TABLE IF EXISTS `users`;

-- ------------------------------------------------------------
-- Tabel: users (induk / parent dari relasi)
-- ------------------------------------------------------------
CREATE TABLE `users` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(255) NOT NULL,
  `email` VARCHAR(191) NOT NULL,
  `email_verified_at` TIMESTAMP NULL DEFAULT NULL,
  `password` VARCHAR(255) NOT NULL,
  `remember_token` VARCHAR(100) NULL DEFAULT NULL,
  `created_at` TIMESTAMP NULL DEFAULT NULL,
  `updated_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `users_email_unique` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

-- ------------------------------------------------------------
-- Tabel: respon (anak / child). created_by -> users.id
-- ON DELETE SET NULL: jika admin dihapus, FAQ tidak ikut terhapus.
-- ------------------------------------------------------------
CREATE TABLE `respon` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `kode` VARCHAR(150) NULL DEFAULT NULL,
  `isi` TEXT NOT NULL,
  `menu` VARCHAR(150) NOT NULL DEFAULT '',
  `label` VARCHAR(150) NOT NULL DEFAULT '',
  `kata_pemicu` VARCHAR(255) NOT NULL DEFAULT '',
  `created_by` INT UNSIGNED NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_respon_menu` (`menu`),
  KEY `idx_respon_menu_label` (`menu`, `label`),
  KEY `idx_respon_created_by` (`created_by`),
  CONSTRAINT `fk_respon_created_by`
    FOREIGN KEY (`created_by`) REFERENCES `users` (`id`)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

-- ------------------------------------------------------------
-- Tabel: app_settings (konfigurasi sapaan & fallback bot)
-- ------------------------------------------------------------
CREATE TABLE `app_settings` (
  `key` VARCHAR(191) NOT NULL,
  `value` TEXT NULL,
  `created_at` TIMESTAMP NULL DEFAULT NULL,
  `updated_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

-- ------------------------------------------------------------
-- Tabel: history_chat (audit trail percakapan)
-- ------------------------------------------------------------
CREATE TABLE `history_chat` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `token` VARCHAR(100) NOT NULL,
  `pesan_masuk` TEXT NOT NULL,
  `pesan_keluar` TEXT NOT NULL,
  `status` ENUM('Answered','Unanswered') NOT NULL DEFAULT 'Answered',
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_history_token` (`token`),
  KEY `idx_history_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

SET FOREIGN_KEY_CHECKS = 1;

-- ------------------------------------------------------------
-- INSERT dummy: users
-- Password semua akun uji = Admin123! (bcrypt cost 10)
-- Hash: $2b$10$LAFNlGT42Rpg8zv42GX1L.0M812T/xcB8ZqevLIcTIK/fa5VOatzm
-- ------------------------------------------------------------
INSERT INTO `users` (`id`, `name`, `email`, `email_verified_at`, `password`, `remember_token`, `created_at`, `updated_at`) VALUES
(1, 'Super Admin IRIS-2', 'admin@smkn2purwakarta.sch.id', '2026-01-10 08:00:00', '$2b$10$LAFNlGT42Rpg8zv42GX1L.0M812T/xcB8ZqevLIcTIK/fa5VOatzm', NULL, '2026-01-10 08:00:00', '2026-01-10 08:00:00'),
(2, 'Butsaina Dzurwa', 'butsaina@smkn2purwakarta.sch.id', '2026-01-11 09:15:00', '$2b$10$LAFNlGT42Rpg8zv42GX1L.0M812T/xcB8ZqevLIcTIK/fa5VOatzm', NULL, '2026-01-11 09:15:00', '2026-01-11 09:15:00'),
(3, 'Admin Humas SMKN 2', 'humas@smkn2purwakarta.sch.id', '2026-01-12 10:30:00', '$2b$10$LAFNlGT42Rpg8zv42GX1L.0M812T/xcB8ZqevLIcTIK/fa5VOatzm', NULL, '2026-01-12 10:30:00', '2026-01-12 10:30:00');

-- ------------------------------------------------------------
-- INSERT dummy: respon (FAQ). created_by menunjuk users.id.
-- Baris id=12 sengaja NULL untuk membuktikan kolom nullable.
-- ------------------------------------------------------------
INSERT INTO `respon` (`id`, `kode`, `isi`, `menu`, `label`, `kata_pemicu`, `created_by`) VALUES
(1, 'Profil & Sejarah Sekolah', 'SMKN 2 Purwakarta (SMEKDA) berdiri tahun 1968 sebagai SMEA Negeri 17 Purwakarta. Lokasi: Jl. Jenderal A. Yani No. 98, Kel. Nagritengah, Kec. Purwakarta, Jawa Barat 41114. Telepon (0264) 200724, email smknegeri2pwk@gmail.com.', 'Profil Sekolah', 'Profil & Sejarah Sekolah', 'profil, sejarah, 1968, smea negeri 17, alamat, kontak', 1),
(2, 'Visi & Misi Sekolah', 'Visi: mencetak lulusan berkarakter, kompeten, dan berprestasi di tingkat Nasional. Misi: membina SDM profesional tingkat menengah dan lulusan yang bertanggung jawab.', 'Profil Sekolah', 'Visi & Misi Sekolah', 'visi, misi, tujuan sekolah', 1),
(3, 'Tata Tertib Sekolah', 'Wajib hadir 15 menit sebelum apel, berpakaian seragam rapi, menjaga kebersihan, menghormati guru/staf. Dilarang membawa barang di luar kepentingan sekolah atau melanggar hukum/norma.', 'Tata Tertib', 'Tata Tertib Sekolah', 'tata tertib, aturan, apel, seragam, larangan', 3),
(4, 'SPMB Terpadu & Jalur Pendaftaran', 'Portal SPMB https://spmbsmkn2pwk.site.je. Tahap 1: Afirmasi KETM, Perpindahan Tugas Orang Tua/Wali, Prestasi Kejuaraan. Tahap 2: Prestasi Nilai Rapor dan Reguler.', 'SPMB / PPDB', 'SPMB Terpadu & Jalur Pendaftaran', 'spmb, ppdb, pendaftaran, afirmasi, prestasi, reguler', 2),
(5, 'Syarat Berkas & Kuota Daya Tampung SPMB', 'Syarat berkas administrasi dan kuota daya tampung tersedia di https://spmbsmkn2pwk.site.je sesuai jalur yang dipilih.', 'SPMB / PPDB', 'Syarat Berkas & Kuota Daya Tampung SPMB', 'syarat berkas, kuota, daya tampung, dokumen spmb', 2),
(6, 'Alur Pendaftaran & Daftar Ulang SPMB', 'Akses portal SPMB, pilih jalur, lengkapi berkas, ikuti seleksi, lalu daftar ulang sesuai jadwal di https://spmbsmkn2pwk.site.je.', 'SPMB / PPDB', 'Alur Pendaftaran & Daftar Ulang SPMB', 'alur daftar, cara daftar, daftar ulang', 2),
(7, 'Layanan BKK & Lowongan Kerja', 'BKK SMKN 2 Purwakarta https://bkksmkn2pwk.site.je menyediakan info loker mitra industri, rekrutmen, dan penyaluran kerja. Cek menu Loker, scan QR atau isi formulir, siapkan CV, KTP, Ijazah/SKL.', 'Bursa Kerja Khusus (BKK)', 'Layanan BKK & Lowongan Kerja', 'bkk, loker, lowongan, rekrutmen, penyaluran kerja, cv', 1),
(8, 'Perpustakaan Digital & Peminjaman Buku', 'https://librarysmkn2pwk.site.je melayani peminjaman 37+ koleksi buku kejuruan dan umum via web/mobile. Siswa daftar dengan NISN, guru dengan NIP.', 'Perpustakaan Digital', 'Perpustakaan Digital & Peminjaman Buku', 'perpustakaan, library, buku, peminjaman, nisn, nip', 3),
(9, 'Smekda Mart — Kantin & Toko Sekolah', 'https://smekdamart.site.je menjual seragam dan atribut sekolah. Buka Senin sampai Jumat 08.00-14.00 WIB (pembina Dra. Eva Latifah S.Pd).', 'BLUD & Unit Usaha', 'Smekda Mart — Kantin & Toko Sekolah', 'smekda mart, kantin, seragam, atribut, humas', 3),
(10, 'RPL — Rekayasa Perangkat Lunak', 'Kompetensi Keahlian Rekayasa Perangkat Lunak. Portal: https://rpl-smkn2pwk.42web.io.', 'Kompetensi Keahlian', 'RPL — Rekayasa Perangkat Lunak', 'rpl, rekayasa perangkat lunak, jurusan', 1),
(11, 'TKJ — Teknik Komputer dan Jaringan', 'Kompetensi Keahlian Teknik Komputer dan Jaringan. Portal: https://tkjsmkn2purwakarta.site.je.', 'Kompetensi Keahlian', 'TKJ — Teknik Komputer dan Jaringan', 'tkj, jaringan, komputer, jurusan', 1),
(12, 'Faq Warisan Tanpa Penulis', 'Data lama yang belum memiliki admin penulis. Baris ini membuktikan kolom created_by boleh NULL.', 'Umum', 'Faq Warisan Tanpa Penulis', 'warisan, legacy, umum', NULL);

-- ------------------------------------------------------------
-- INSERT dummy: app_settings
-- ------------------------------------------------------------
INSERT INTO `app_settings` (`key`, `value`, `created_at`, `updated_at`) VALUES
('greeting_message', 'Halo! Saya IRIS-2, asisten akademik resmi SMKN 2 Purwakarta. Ada yang bisa saya bantu terkait sekolah? =]', '2026-01-10 08:00:00', '2026-01-10 08:00:00'),
('fallback_message', 'Sorry.... I don''t really catch that :[', '2026-01-10 08:00:00', '2026-01-10 08:00:00');

-- ------------------------------------------------------------
-- INSERT dummy: history_chat
-- ------------------------------------------------------------
INSERT INTO `history_chat` (`id`, `token`, `pesan_masuk`, `pesan_keluar`, `status`, `created_at`) VALUES
(1, 'a1b2c3d4e5f60718', 'Halo IRIS', 'Halo! Ada yang bisa saya bantu tentang SMKN 2 Purwakarta? =]', 'Answered', '2026-11-22 08:12:00'),
(2, 'a1b2c3d4e5f60718', 'kpsk smekda siapa?', 'Kepala Sekolah SMKN 2 Purwakarta adalah pimpinan sekolah. Info terbaru cek kanal resmi sekolah.', 'Answered', '2026-11-22 08:12:30'),
(3, 'b2c3d4e5f6071829', 'Dimana alamat sekolah?', 'SMKN 2 Purwakarta beralamat di Jl. Jenderal A. Yani No. 98, Kel. Nagritengah, Purwakarta, Jawa Barat 41114.', 'Answered', '2026-11-22 09:05:00'),
(4, 'c3d4e5f60718293a', 'kapan ppdb dibuka?', 'Pendaftaran SPMB melalui https://spmbsmkn2pwk.site.je dengan Tahap 1 dan Tahap 2.', 'Answered', '2026-11-22 10:31:00'),
(5, 'd4e5f60718293a4b', 'syrt dokumen apa?', 'Syarat berkas administrasi dan kuota daya tampung tersedia di portal SPMB https://spmbsmkn2pwk.site.je.', 'Answered', '2026-11-22 10:32:00'),
(6, 'e5f60718293a4b5c', 'jrsn rpl apa ya?', 'RPL (Rekayasa Perangkat Lunak) adalah kompetensi keahlian di SMKN 2 Purwakarta. Portal: https://rpl-smkn2pwk.42web.io.', 'Answered', '2026-11-22 11:00:00'),
(7, 'f60718293a4b5c6d', 'Cuaca di Mars bagaimana?', 'Maaf, saya hanya bisa membantu informasi seputar SMKN 2 Purwakarta :c Boleh tanya hal lain tentang sekolah? =]', 'Unanswered', '2026-11-22 11:15:00'),
(8, '60718293a4b5c6d7e', 'no', 'No problem! Ask me anything about SMKN 2 Purwakarta =]', 'Answered', '2026-11-22 11:16:00'),
(9, '718293a4b5c6d7e8f', 'buku apa yang bisa dipinjam?', 'Perpustakaan Digital menyediakan 37+ koleksi buku kejuruan dan umum di https://librarysmkn2pwk.site.je.', 'Answered', '2026-11-22 13:20:00'),
(10, '8293a4b5c6d7e8f90', 'lowongan kerja ada?', 'Cek menu Loker di BKK https://bkksmkn2pwk.site.je, siapkan CV, KTP, dan Ijazah/SKL.', 'Answered', '2026-11-22 14:45:00');

-- ------------------------------------------------------------
-- Verifikasi cepat relasi & JOIN
-- SELECT r.label, u.name AS author FROM respon r
--   LEFT JOIN users u ON r.created_by = u.id ORDER BY r.id;
-- ------------------------------------------------------------

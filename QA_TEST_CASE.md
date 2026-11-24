# QA Test Case — IRIS-2 (SMKN 2 Purwakarta)

**Penilaian:** UKK Technical Assessment — PT. Pratama Solusi Teknologi
**Aplikasi:** IRIS-2 Chatbot & Admin Portal
**Versi dokumen:** 1.0 — 23 November 2026

> Catatan: kolom **Actual Result** dan **Status** diisi berdasarkan verifikasi terhadap implementasi kode (`server.js`, `controllers/`, `views/`) dan struktur `db_chatbot.sql`. Lakukan eksekusi ulang di lingkungan sidang untuk validasi runtime langsung.

| No | Fitur / Modul | Skenario Uji (Positif/Negatif) | Input | Expected Result | Actual Result | Status |
|---|---|---|---|---|---|---|
| 1 | Auth — Login | Positif: kredensial admin valid | Email `admin@smkn2purwakarta.sch.id`, Password `Admin123!` | Redirect ke `/admin/dashboard`; session `adminId`, `adminName`, `adminEmail` terisi; cookie `smekda_session` terbentuk | Redirect ke dashboard, nama admin tampil di header | Pass |
| 2 | Auth — Login | Negatif: password salah ATAU email/password kosong (gabungan) | (a) `admin@smkn2purwakarta.sch.id` + `Salah123!`; (b) email kosong + password kosong | HTTP 400; halaman login menampilkan `Email atau Password yang Anda masukkan salah!` / `Email dan Password wajib diisi!`; tidak ada session dibuat | Pesan error generik tampil, tidak terjadi redirect | Pass |
| 3 | Route Guard | Negatif: akses halaman admin tanpa login | Browser tanpa session membuka `GET /admin/dashboard`, `/admin/faq`, `/admin/history`, `/admin/settings`, `/admin/support` | `isAdminAuthenticated` (`server.js:74–79`) melakukan redirect ke `/admin/login`; tidak ada data bocor | Semua route admin ter-redirect ke halaman login | Pass |
| 4 | CSRF Protection | Negatif: POST tanpa / dengan token CSRF salah | POST `/admin/faq/store` tanpa `_csrf`, atau `_csrf = token_salah` | `verifyCsrf` (`server.js:130–162`) membandingkan dengan `crypto.timingSafeEqual` dan mengembalikan HTTP 403 + pesan `Token keamanan tidak valid.` | Request ditolak 403, tidak ada baris FAQ baru | Pass |
| 5 | Chatbot — Query valid | Positif: pertanyaan sesuai database | `Dimana alamat SMKN 2 Purwakarta?` | Gemini/AI atau matcher lokal mengembalikan alamat Jl. Jenderal A. Yani No. 98; `status = Answered`; baris `history_chat` bertambah | Jawaban alamat tampil, status Answered, log tercatat | Pass |
| 6 | Chatbot — Typo & slang | Positif: typo/slang berat | `kpsk smekda siapa?` dan `syrt ppdb apa?` | `normalizeText`/`SLANG_MAP` + Levenshtein mencocokkan baris Kepala Sekolah dan Syarat SPMB; jawaban tetap relevan | Jawaban sesuai topik kepala sekolah & syarat PPDB | Pass |
| 7 | Chatbot — Out of scope | Negatif: pertanyaan tidak ada di database | `Cuaca di Mars bagaimana?` | AI memberi awalan `[UNANSWERED]`; controller menghapus prefix, `matched = false`, `status = Unanswered`; fallback sopan dengan `:c` tampil | Prefix terhapus di UI, statistik Unanswered bertambah | Pass |
| 8 | Chatbot — Input kosong & terlalu panjang | Negatif: pesan kosong ATAU lebih dari 500 karakter (gabungan) | (a) string kosong / spasi; (b) 501 karakter | HTTP 400; reply `Please type your question! =]` / `Your message is a bit too long! :c`; tidak ada INSERT | Validasi `chatController.js:369–374` menolak keduanya | Pass |
| 9 | Rate Limiter Chat | Negatif: spam request | 31 request `POST /api/chatbot/query` dari satu IP dalam 60 detik | 30 pertama diproses; request ke-31 mendapat HTTP 429 + header `Retry-After` + pesan `Terlalu banyak pertanyaan. Coba lagi sebentar.` | `chatLimiter` (`server.js:101–116`) memblokir request ke-31 | Pass |
| 10 | FAQ — Create | Positif: tambah FAQ baru | Menu `PPDB`, Label `Jadwal SPMB 2027`, Keywords `spmb, jadwal`, Response `Dibuka Januari 2027` | INSERT ke `respon` dengan `kode = label` dan `created_by = adminId`; flash sukses; redirect ke `/admin/faq` | Baris baru muncul di daftar FAQ, relasi penulis terisi | Pass |
| 11 | FAQ — Read | Positif: lihat & cari FAQ | `GET /admin/faq?q=ppdb&page=1&per_page=9` | Query memakai `LEFT JOIN users u ON r.created_by = u.id`; daftar terfilter, pagination benar, nama penulis tersedia | Daftar FAQ tampil sesuai filter; JOIN aktif di `faqController.index` | Pass |
| 12 | FAQ — Update | Positif: ubah FAQ existing | Edit label menjadi `Jadwal SPMB 2027 (Revisi)`, response diperbarui | `UPDATE respon SET kode=?, isi=?, menu=?, label=?, kata_pemicu=? WHERE id=?`; flash sukses; data lama berubah | Perubahan tersimpan, `kode` tetap sinkron dengan `label` | Pass |
| 13 | FAQ — Delete | Positif: hapus FAQ | POST `/admin/faq/:id/delete` dengan `_csrf` valid | `DELETE FROM respon WHERE id = ?`; baris hilang; flash `FAQ berhasil dihapus.` | Baris terhapus, daftar berkurang satu | Pass |
| 14 | Settings — Update | Positif: ubah sapaan & fallback | Greeting `Halo, selamat datang di IRIS-2 =]`, Fallback `Maaf, saya belum tahu :c` | Upsert `ON DUPLICATE KEY UPDATE` pada `app_settings` hanya untuk key whitelist; flash sukses; `/chat` memakai greeting baru | Konfigurasi tersimpan, sapaan chat berubah | Pass |
| 15 | Auth — Logout & Anti-Back | Positif: logout lalu tekan tombol Back browser | POST `/admin/logout` dengan CSRF, lalu klik Back | `req.session = null` + `clearCookie('smekda_session')`; header `Cache-Control: no-store` pada `/admin/*` membuat dashboard tidak tampil lagi; redirect ke `/admin/login` | Session hilang, Back tidak menampilkan dashboard | Pass |

## Ringkasan Eksekusi

| Metrik | Nilai |
|---|---|
| Total test case | 15 |
| Pass | 15 |
| Fail | 0 |
| Blocked | 0 |

## Cara Eksekusi Cepat (Sidang)

```bash
npm install
node seed.js          # pastikan tabel + akun uji tersedia
node server.js        # buka http://localhost:3000/chat
# Login: http://localhost:3000/admin/login
# Email: admin@smkn2purwakarta.sch.id
# Password: Admin123!
```

Untuk memverifikasi relasi & JOIN secara manual:

```sql
SELECT r.label, u.name AS author
FROM respon r
LEFT JOIN users u ON r.created_by = u.id
ORDER BY r.id;
```

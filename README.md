# IRIS-2: AI-Powered School Information Chatbot System - SMKN 2 Purwakarta

A lightweight, high-performance web-based Chatbot application built on Node.js Express architecture to provide real-time, dynamic school information services for SMKN 2 Purwakarta, fully integrated with a MySQL database backend.

> **Implementation status:** the admin portal is complete and verified (61 end-to-end checks passing). The public student chat interface and the keyword-matching reply engine are **not yet implemented** — see [Current Status](#current-status) before planning further work. This document describes what exists today rather than what is planned.

---

## Table of Contents

- [Current Status](#current-status)
- [Core Features](#core-features)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [Local Installation Guide](#local-installation-guide)
- [Database Schema](#database-schema)
- [Security Measures](#security-measures)
- [Configuration](#configuration)
- [API Reference](#api-reference)
- [Troubleshooting](#troubleshooting)
- [Developer Credit](#developer-credit)

---

## Current Status

Being explicit about scope avoids shipping false expectations in a thesis submission.

| Component | State | Notes |
|---|---|---|
| Admin authentication | **Done** | Bcrypt hashing, session gatekeeping, login/logout |
| Admin dashboard | **Done** | Session, keyword and unanswered counters, recent activity |
| FAQ management (CRUD) | **Done** | Menu / Label / Keywords / Response / Action columns |
| FAQ search + pagination | **Done** | Keyword search, menu filter, 5–9 rows-per-page selector |
| History log viewer | **Done** | Searchable `history_chat` records |
| Settings page | **Done** | Edits `greeting_message` and `fallback_message` in `app_settings` |
| Support page | **Done** | Static guidance and contact links |
| **Public student chat UI** | **Not built** | No frontend chat widget exists yet |
| **Keyword matching engine** | **Not built** | No endpoint reads `kata_pemicu` and returns `isi` |
| **Chat logging on reply** | **Not built** | `history_chat` is read but never written to |

The `respon` table, the `app_settings` table and the `history_chat` table are fully prepared and writable. What is missing is the runtime piece that connects an incoming student message to a FAQ answer and records the exchange.

---

## Core Features

- **Responsive Student Chat Interface** *(planned)* — Tailwind CSS layout intended for a v0/Stitch AI design. The admin panel uses this layout today; the student-facing chat widget is not yet implemented.
- **Dynamic FAQ Database Matching with Fallback Handling** *(data layer ready)* — FAQ entries are stored with trigger keywords and replies, and the fallback message `Sorry.... I don't really catch that :[` is editable from the Settings page. The matching engine that consumes them is not yet implemented.
- **Secure Admin Authentication & Gatekeeping** — Bcryptjs-compatible password hashing with `express-session` protection. Every admin route is guarded by a session check and returns a redirect to login when unauthenticated.
- **Full Admin Panel Dashboard CRUD Operations** — Complete create, read, update and delete operations over FAQ data, tracking the Menu, Label, Keywords, Response and Action columns.
- **Keyword Search Bar & Automated Data Logging History Records** — Searchable FAQ records with menu filtering and a selectable rows-per-page control, alongside a log viewer over `history_chat` records.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js (CommonJS) |
| Framework | Express.js 5.x |
| Database | MySQL via `mysql2/promise` connection pooling |
| Templating | EJS (Embedded JavaScript Templates) |
| Auth hashing | Bcryptjs (seed.js) / bcrypt (authController.js) |
| Sessions | express-session |
| Configuration | Dotenv |
| Styling | Tailwind CSS utility classes (CDN, no build step) |

> **Note on the two bcrypt packages.** `authController.js` uses the native `bcrypt` module for password comparison, while `seed.js` uses the pure-JavaScript `bcryptjs`. Both produce and verify identical hash formats, so seeded credentials authenticate correctly. `bcryptjs` is retained deliberately because the native module requires a build toolchain on some hosts. You may consolidate on either one, but keep the seeding and verification sides consistent.

---

## Architecture

```
Browser
   │
   ▼
Express (server.js)
   │
   ├── Static assets (public/)
   ├── Session middleware (express-session)
   ├── Body parsers (urlencoded + json)
   ├── Anti-cache headers (/admin/*)
   ├── CSRF token issuance
   │
   ├── requireAdmin ──► controllers/adminController.js   (dashboard, history, support)
   ├── requireAdmin ──► controllers/faqController.js     (FAQ list + CRUD)
   ├── requireAdmin ──► controllers/settingController.js (bot configuration)
   └── requireAdmin ──► controllers/authController.js    (login, logout)
                                │
                                ▼
                        MySQL connection pool
                                │
                                ▼
                      db_chatbot (phpMyAdmin)
```

Request flow for a protected admin page:

1. Static and body-parsing middleware run.
2. No-store cache headers are set for `/admin`.
3. A per-session CSRF token is issued into `res.locals`.
4. `requireAdmin` checks for `req.session.adminId`; if absent, the request is redirected to `/admin/login`.
5. The controller reads from MySQL and renders an EJS view.

### Startup behaviour

`server.js` performs a `SELECT 1` connectivity probe inside an async IIFE **before** binding the HTTP port. If the database is unreachable the process logs the driver error and exits with code `1` rather than starting a server that would return 500s on every page.

`SIGINT` and `SIGTERM` are handled to drain in-flight requests and close the connection pool, so a restart or deploy does not truncate a half-written save.

---

## Project Structure

```
chatbot-smekda/
├── controllers/
│   ├── adminController.js      # dashboard, history, support
│   ├── authController.js       # login, bcrypt verify, logout
│   ├── faqController.js        # FAQ index + CRUD (owns `respon`)
│   └── settingController.js    # app_settings read/update
├── scripts/
│   └── migrate-faq-schema.js   # idempotent FAQ schema migration
├── public/
│   └── images/smekda.png       # school logo
├── views/
│   ├── admin/
│   │   ├── dashboard.ejs
│   │   ├── faq.ejs
│   │   ├── history.ejs
│   │   ├── login.ejs
│   │   ├── settings.ejs
│   │   ├── support.ejs
│   │   └── partial/
│   │       └── faq-pagination.ejs
│   └── partials/
│       ├── admin-header.ejs    # sidebar, logo, navigation
│       └── admin-footer.ejs
├── .env                        # credentials — never commit
├── .gitignore
├── package.json
├── package-lock.json
├── README.md
├── seed.js                     # schema bootstrap + admin + settings
└── server.js                   # application entry point
```

---

## Local Installation Guide

### 1. Install dependencies

```bash
git clone <repository-url>
cd chatbot-smekda
npm install
```

### 2. Initialise the database

Create an empty MySQL database named `db_chatbot`, then run the seed script. It creates the `users` table if missing, inserts the master admin account, and populates the global bot greeting and fallback settings.

```bash
node seed.js
```

The script is safe to re-run — it skips records that already exist rather than duplicating them.

> **Schema note.** If you are upgrading from the original schema, run the FAQ migration once before seeding:
> ```bash
> node scripts/migrate-faq-schema.js
> ```
> This adds `menu`, `label` and `kata_pemicu` to `respon`, makes the legacy `kode` column nullable, and removes three invalid foreign keys that referenced empty parent tables. The migration is idempotent.

### 3. Boot the application

```bash
node server.js
```

The console will confirm database connectivity before the server binds:

```
[db] connected to db_chatbot
IRIS-2 server listening on http://localhost:3000
```

Open **http://localhost:3000/admin/login** and sign in with the seeded administrator credentials.

---

## Database Schema

### `respon` — FAQ entries

| Column | Type | Notes |
|---|---|---|
| `id` | int, PK, auto_increment | Surrogate key |
| `kode` | varchar(150), nullable | Legacy field, mirrors `label` for older consumers |
| `isi` | text, NOT NULL | The chatbot reply |
| `menu` | varchar(150), NOT NULL | Category section, e.g. PPDB, Profil |
| `label` | varchar(150), NOT NULL | Short descriptor shown in the table |
| `kata_pemicu` | varchar(255), NOT NULL | Trigger keywords matched against student input |

Indexed on `menu` and on `(menu, label)`.

> **Historical schema defect.** `respon.id` was originally a foreign key to `kuota.id`, `navigation.id` **and** `keywords.id` simultaneously. With those parent tables empty, every `INSERT` failed with `ER_NO_REFERENCED_ROW_2`, which made FAQ creation impossible. The migration drops these constraints so the table is writable.

### `app_settings` — bot configuration

| Column | Type | Notes |
|---|---|---|
| `key` | varchar(50), PK | e.g. `greeting_message` |
| `value` | text, NOT NULL | Stored setting value |
| `created_at` / `updated_at` | timestamp | Managed by the application |

Writes use an upsert (`ON DUPLICATE KEY UPDATE`) and are restricted to a whitelist of `greeting_message` and `fallback_message`, so a crafted request cannot write to other keys.

### `users` — administrators

Standard columns including a unique `email` and a bcrypt `password` hash.

### `history_chat` — conversation logs

| Column | Type | Notes |
|---|---|---|
| `id` | int, PK | |
| `token` | varchar(100) | Session token for the conversation |
| `pesan_masuk` | text | Inbound student message |
| `pesan_keluar` | text | Bot reply; empty indicates an unanswered question |

> The dashboard's "Unanswered Questions" counter reads rows where `pesan_keluar` is `NULL` or empty. Nothing currently writes to this table; the logging logic belongs to the unimplemented chat engine.

---

## Security Measures

- **Password hashing** — bcrypt with a per-user salt. Plaintext passwords are never stored or logged.
- **Session gatekeeping** — `requireAdmin` guards every admin route and redirects unauthenticated requests to the login page.
- **CSRF protection** — a 32-byte random token is issued per session and exposed to views. Every state-changing admin POST is verified using `crypto.timingSafeEqual` for constant-time comparison. An invalid or missing token returns `403`.
- **Session teardown** — logout destroys the session server-side and clears the `connect.sid` cookie with matching attributes.
- **Anti-caching** — `no-store, no-cache, must-revalidate, private` on all `/admin` responses, preventing the browser Back button from replaying an authenticated page after logout.
- **Parameterised SQL** — every query uses `mysql2` placeholders. No user input is concatenated into SQL.
- **Output escaping** — EJS `<%= %>` escapes interpolated values. Inline `onclick` handlers receive controller-pre-escaped strings so quotes and newlines cannot break out of the attribute.
- **Whitelisted settings writes** — only known keys may be updated in `app_settings`.
- **Fail-fast startup** — the server refuses to boot without a working database connection.
- **Graceful shutdown** — in-flight requests finish and the pool closes cleanly on `SIGINT` / `SIGTERM`.
- **Credential isolation** — `.env` is git-ignored and must never be committed.

### Known hardening gaps

These remain open and should be addressed before exposing the service to the public internet:

- `express-session` uses the default in-memory store, which leaks memory and loses all sessions on restart. Use a persistent store such as `connect-mysql2`.
- `GET /admin/logout` performs a state change without CSRF verification, permitting a forced-logout via a crafted link. Prefer POST-only logout.
- There is no rate limiting on the login endpoint, leaving password guessing unthrottled.
- `SESSION_SECRET` must be a long random value unique to each deployment.
- Serve over HTTPS so the `secure` session cookie flag takes effect (`NODE_ENV=production`).

---

## Configuration

All runtime settings are read from `.env` via dotenv.

| Variable | Purpose | Example |
|---|---|---|
| `DB_HOST` | MySQL host | `127.0.0.1` |
| `DB_PORT` | MySQL port | `3306` |
| `DB_DATABASE` | Database name | `db_chatbot` |
| `DB_USERNAME` | MySQL user | `root` |
| `DB_PASSWORD` | MySQL password | *(quote values containing `#` or spaces)* |
| `SESSION_SECRET` | Session signing secret | long random string |
| `PORT` | HTTP port | `3000` |
| `NODE_ENV` | `production` enables secure cookies | `production` |

> **Quoting matters.** An unquoted `DB_PASSWORD` containing `#` is truncated at that character when parsed as a comment. Always wrap such values in double quotes.

> **Legacy keys.** The current `.env` still carries unused Laravel-era variables (`APP_KEY`, `BROADCAST_DRIVER`, `MAIL_*`, `PUSHER_*`, `VITE_*` and others). They are harmless but can be removed; only the keys in the table above are read by the application.

---

## API Reference

All routes are prefixed with `/admin`. Protected routes require an active session and, for writes, a valid CSRF token.

| Method | Path | Auth | CSRF | Purpose |
|---|---|---|---|---|
| GET | `/admin/login` | — | — | Login form |
| POST | `/admin/login` | — | — | Authenticate |
| GET | `/admin/logout` | — | — | Logout (legacy) |
| POST | `/admin/logout` | ✓ | ✓ | Logout |
| GET | `/admin/dashboard` | ✓ | — | Dashboard metrics |
| GET | `/admin/faq` | ✓ | — | FAQ list (`q`, `category`, `page`, `per_page`) |
| POST | `/admin/faq/store` | ✓ | ✓ | Create FAQ |
| POST | `/admin/faq/:id` | ✓ | ✓ | Update FAQ |
| POST | `/admin/faq/:id/delete` | ✓ | ✓ | Delete FAQ |
| GET | `/admin/history` | ✓ | — | Conversation logs |
| GET | `/admin/settings` | ✓ | — | Bot configuration form |
| POST | `/admin/settings/update` | ✓ | ✓ | Save configuration |
| GET | `/admin/support` | ✓ | — | Help and support |
| GET | `/admin/logs` | ✓ | — | Alias of history |

### FAQ write contract

The Add/Edit form posts exactly four fields, and `faqController.validate()` reads exactly these names:

| Form input | Column | Required |
|---|---|---|
| `menu` | `respon.menu` | Yes |
| `label` | `respon.label` | Yes |
| `keywords` | `respon.kata_pemicu` | Yes |
| `response` | `respon.isi` | Yes |

> **Field names must stay in sync.** A mismatch between the form's `name` attribute and the controller does not raise an error — validation fails, a flash message appears and the page redirects without writing. This exact mismatch previously hid a bug where the form sent `response_text` while the controller read `response`, so every create silently failed. `store()` now logs the received payload on validation failure to make this class of bug obvious. If FAQ creation stops working, check the server log for `[faq] store rejected`.

---

## Troubleshooting

**Server exits immediately with `[db] connection check failed`**
The database is unreachable. Verify `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD` and `DB_DATABASE` in `.env`, and that the MySQL service is running.

**Login succeeds but every page redirects back to login**
The session cookie is not persisting. Confirm `SESSION_SECRET` is set and stable across restarts, and that you are accessing the site consistently over the same protocol and host.

**"Email atau Password yang Anda masukkan salah!"**
Credentials did not match. Re-run `node seed.js` to confirm the admin account exists, or insert a bcrypt hash manually.

**"Token keamanan tidak valid" (403)**
The CSRF token was stale, usually because the page sat open past a session rotation. Reload the page and retry.

**FAQ creation shows an alert but nothing is saved**
Check the server log for `[faq] store rejected`. It prints the exact payload received, revealing a field-name mismatch between the form and the controller.

**A migration or seed script fails on a connection error**
`mysql2` returns a promise from `createConnection`; it must be awaited before use. Also ensure the database exists before running `seed.js`.

---

## Developer Credit

Developed by: Butsaina (butsaina2134@gmail.com)
# WaGataway

[![Release](https://img.shields.io/github/v/release/Aldi1963/wblash)](https://github.com/Aldi1963/wblash/releases)
[![License: MIT](https://img.shields.io/github/license/Aldi1963/wblash)](LICENSE)
[![Go 1.26](https://img.shields.io/badge/Go-1.26-00ADD8?logo=go)](go-backend/go.mod)
[![Docker](https://img.shields.io/badge/docker-ghcr.io%2Faldi1963%2Fwblash-2496ED?logo=docker)](https://github.com/users/Aldi1963/packages?repo_name=wblash)

**Platform WhatsApp Gateway SaaS** — kirim pesan otomatis, blast massal, auto-reply, live chat + AI, drip campaign, dan integrasi — dalam satu binary Go, tanpa Node.js.

> **Coba langsung:** [wa.clipku.com](https://wa.clipku.com)

## Daftar Isi

- [Tentang](#tentang)
- [Fitur](#fitur)
- [Tech Stack](#tech-stack)
- [Quick Start](#quick-start)
- [Deploy Production](#deploy-production)
- [Konfigurasi](#konfigurasi)
- [API](#api)
- [Arsitektur](#arsitektur)
- [Keamanan](#keamanan)
- [Struktur Proyek](#struktur-proyek)
- [Berkontribusi](#berkontribusi)
- [Disclaimer](#disclaimer)
- [Lisensi](#lisensi)

## Tentang

WaGataway adalah WhatsApp gateway self-hosted untuk bisnis dan developer Indonesia. Hubungkan nomor WhatsApp lewat QR atau kode pairing, lalu kirim pesan, jalankan campaign, balas pelanggan otomatis (keyword, menu interaktif, atau AI), dan kelola semuanya dari satu dashboard — atau sepenuhnya lewat REST API.

Yang membedakan WaGataway:

- **Satu binary, tanpa dependensi runtime** — backend Go + frontend React disajikan dari satu proses. Tidak perlu Node.js di server.
- **Multi-device** — banyak nomor WhatsApp dalam satu instalasi, dengan rotasi pengirim dan failover otomatis saat blast.
- **SaaS-ready** — paket langganan dengan kuota, pembayaran QRIS, voucher, dan panel admin bawaan.
- **Bilingual** — seluruh antarmuka tersedia dalam Bahasa Indonesia dan English.

## Fitur

### Pesan & Blast

- **Multi-Device** — hubungkan banyak nomor WhatsApp sekaligus (QR / kode pairing)
- **Kirim Pesan** — teks, gambar, dokumen, video, stiker, voice note, lokasi, polling, interactive button
- **Blast/Bulk** — kirim massal dengan jeda acak anti-banned, **rotasi pengirim** multi-device, dan failover otomatis
- **Pembersih Nomor** — normalisasi & validasi nomor otomatis sebelum blast
- **Balas & Idempotency** — replyTo + idempotency key di semua jalur kirim
- **Status Pesan** — terkirim / dibaca via webhook `message.sent/delivered/read/failed`

### Otomatisasi

- **Auto Reply** — keyword matching (exact/contains/startsWith) + jadwal aktif
- **Chatbot Menu** — menu bertingkat (tekan 1/2/3) dengan session per pengguna
- **AI Reply** — balas otomatis pakai OpenAI/Anthropic, bisa dibatasi trigger keywords
- **API OTP** — endpoint kirim kode OTP siap pakai
- **Welcome Grup & DM** — sambutan otomatis anggota baru grup + welcome DM per grup
- **Rekap Polling** — rekap hasil polling otomatis

### Live Chat & CS

- **Live Chat** — balas chat pelanggan manual + kelola label/assign
- **Indikator online/mengetik** — presence real-time per kontak
- **CS Bot dua arah** — webhook ke sistem eksternal (mis. PPOB) dengan shared secret

### Kontak & Grup

- **Kontak & Grup** — kelola kontak, grup WA, dan blacklist + import batch
- **Sync WA** — tarik kontak & grup langsung dari WhatsApp
- **Validasi kontak** — cek nomor sebelum dikirim

### Penjadwalan

- **Scheduled Messages** — kirim terjadwal satu kali
- **Drip Campaign** — sequence otomatis dengan delay per step

### Integrasi

- **Integration Hub** — konektor siap pakai: Google Forms, WooCommerce, WordPress, Tally, Jotform, Pabbly, Midtrans, Xendit, dan 20+ platform lain
- **Webhooks** — event ke URL eksternal per-device (dengan toggle on/off) + signature HMAC-SHA256
- **WAMP compat** — endpoint kompatibel format WAMP untuk sistem legacy

### Billing & Langganan

- **Paket langganan** — Free, Lite, Regular, Pro, Master dengan kuota pesan
- **QRIS** — bayar via Clipku Pay, QR dinormalisasi otomatis jadi gambar
- **Voucher** — kode voucher trial/paket, ditukar di Settings → tab Tukar Voucher + riwayat penukaran
- **Transaksi & riwayat** — log pembayaran lengkap

### Produktivitas UI

- **Command Palette** — tekan `Ctrl/⌘+K` untuk lompat halaman, aksi cepat, dan cari kontak
- **Onboarding 3 langkah** — hubungkan device → kirim pesan tes → selesai
- **Empty state & skeleton** — tampilan loading modern di semua halaman
- **Bilingual penuh** — seluruh UI Indonesia/English, pilihan tersimpan per user

### Admin

- **Admin Panel** — kelola pengguna, paket, voucher, transaksi, log aktivitas, kesehatan sistem, dan notifikasi
- **Maintenance mode** — toggle mode pemeliharaan

## Tech Stack

| Layer | Teknologi |
|-------|-----------|
| Backend | Go 1.26 + Gin |
| WhatsApp | whatsmeow (native Go, tanpa Node.js) |
| Database | PostgreSQL 16 + GORM (+ Row Level Security) |
| Frontend | React + Vite + TailwindCSS v4 |
| Ikon | Lucide + Phosphor |
| Multi-bahasa | Indonesia / English (i18n, tersimpan per user) |
| AI | OpenAI (GPT-4o) + Anthropic (Claude) |
| Auth | JWT + 2FA/TOTP + Google OAuth |
| Real-time | SSE (Server-Sent Events) |
| Pembayaran | QRIS via Clipku Pay |
| Deploy | Docker / single binary |

## Quick Start

Prasyarat: Go 1.26+, Node.js 20+ (hanya untuk dev frontend), PostgreSQL 16, dan pnpm.

```bash
cd go-backend

# 1. Copy environment
cp .env.example .env
# Edit .env (isi DATABASE_URL, JWT_SECRET, APP_URL, dll)

# 2. Jalankan database
docker compose up -d postgres

# 3. Jalankan backend (auto-migrate database)
make dev
# atau: go build -o server ./cmd/server && ./server

# 4. Jalankan frontend (terminal terpisah)
cd web && pnpm install && pnpm dev
```

Buka `http://localhost:5173` untuk frontend, API di `http://localhost:8080` (atau sesuai `PORT`).

> Catatan: butuh CGO (`CGO_ENABLED=1`) karena whatsmeow memakai `mattn/go-sqlite3`.

## Deploy Production

**Rilis siap pakai** tersedia di [Releases](https://github.com/Aldi1963/wblash/releases) — binary per versi (`server` + `web/dist`). Image Docker tersedia di [GitHub Packages](https://github.com/users/Aldi1963/packages?repo_name=wblash) (`ghcr.io/aldi1963/wblash:latest`, juga per versi, mis. `:v1.0.2`).

```bash
# Docker (recommended) — pakai image yang sudah dipublish per rilis
docker pull ghcr.io/aldi1963/wblash:latest
docker run -d --name wagataway -p 8080:8080 \
  -e DATABASE_URL=postgres://user:pass@host:5432/wagataway?sslmode=disable \
  -e JWT_SECRET=your-secret-key -e APP_URL=https://wa.example.com \
  -v wagataway-sessions:/app/wa-sessions \
  ghcr.io/aldi1963/wblash:latest

# Atau build sendiri dari source
cd go-backend
docker compose up --build -d

# Atau manual
cd go-backend
CGO_ENABLED=1 go build -o server ./cmd/server
cd web && pnpm build          # → ./web/dist
# copy ./web/dist ke direktori kerja server, lalu:
./server                      # serve API + frontend
```

> Server hanya me-register SPA fallback bila `./web/dist/index.html` ada **saat startup** — sync `dist` dulu sampai lengkap, baru restart server.

## Konfigurasi

Semua konfigurasi lewat environment variable (lihat `go-backend/.env.example`):

```env
PORT=8080
APP_URL=https://wa.example.com
DATABASE_URL=postgres://user:pass@localhost:5432/wagataway?sslmode=disable
JWT_SECRET=your-secret-key
WA_SESSIONS_DIR=./wa-sessions
OPENAI_API_KEY=sk-xxx
ANTHROPIC_API_KEY=sk-ant-xxx
# Pembayaran QRIS
CLIPKUPAY_API_KEY=
CLIPKUPAY_BASE_URL=https://m.clipku.com
CLIPKUPAY_WEBHOOK_URL=https://wa.example.com/api/billing/clipkupay/webhook
# Bot dua arah (opsional)
WAMP_BOT_SECRET=shared-secret
# Email reset password (opsional)
SMTP_HOST=smtp.gmail.com
SMTP_USER=email@gmail.com
SMTP_PASS=app-password
```

## API

Base URL: `{APP_URL}/api`. Autentikasi memakai Bearer Token (JWT) kecuali endpoint publik.

### Public

| Method | Path | Deskripsi |
|--------|------|-----------|
| POST | /api/auth/login | Login (mendukung 2FA) |
| POST | /api/auth/register | Register |
| POST | /api/auth/forgot-password | Minta link reset |
| POST | /api/auth/reset-password | Reset password |
| GET | /api/l/:code | Short link redirect |

### Protected (Bearer Token)

| Method | Path | Deskripsi |
|--------|------|-----------|
| GET | /api/devices | List perangkat |
| POST | /api/devices/:id/connect | Hubungkan WA |
| GET | /api/devices/:id/qr | Get QR code |
| POST | /api/devices/:id/pair-code | Kode pairing |
| PUT | /api/devices/:id | Edit (nama, webhook, toggle) |
| POST | /api/messages/send | Kirim pesan (semua tipe) |
| POST | /api/messages/bulk | Blast pesan |
| GET | /api/messages/:id/status | Status pesan |
| DELETE | /api/messages/:id | Hapus pesan |
| GET | /api/contacts | List kontak |
| POST | /api/contacts/sync | Sync kontak dari WA |
| GET | /api/contacts/validate | Validasi nomor |
| GET | /api/contact-groups | List grup |
| POST | /api/contact-groups/sync | Sync grup dari WA |
| GET | /api/chat/conversations | List percakapan |
| POST | /api/chat/send | Kirim chat manual |
| GET | /api/chat/history | Riwayat chat |
| GET | /api/ai-reply | Konfigurasi AI reply |
| GET | /api/auto-reply | List auto-reply rules |
| GET | /api/menu-bot | Chatbot menu bertingkat |
| POST | /api/otp/send | Kirim OTP |
| GET | /api/drip | List drip campaigns |
| GET | /api/schedule | List jadwal pesan |
| GET | /api/analytics/overview | Statistik |
| GET | /api/billing/plans | List paket |
| POST | /api/billing/subscribe | Buat pembayaran QRIS |
| POST | /api/billing/voucher/redeem | Tukar kode voucher |
| GET | /api/billing/voucher/redemptions | Riwayat penukaran voucher |
| POST | /api/billing/clipkupay/webhook | Webhook Clipku Pay |
| GET | /api/auth/sessions | Sesi aktif |
| GET | /api/api-keys | Kelola API key |
| GET | /api/integrations | Integration Hub |
| GET | /api/stream | SSE real-time events |

### Admin (`/api/admin/*`)

| Method | Path | Deskripsi |
|--------|------|-----------|
| GET | /api/admin/users | List semua user |
| GET | /api/admin/analytics | Global analytics |
| GET | /api/admin/transactions | Semua transaksi |
| PUT | /api/admin/maintenance | Toggle maintenance |

## Arsitektur

```
Single Go Binary
├── HTTP Server (Gin) ─── REST API + SSE + Static files
├── WhatsApp Manager ──── whatsmeow sessions (per-device SQLite)
├── Background Workers ── Cron scheduler (bulk, drip, scheduled, backup)
├── AI Service ────────── OpenAI + Anthropic completions
└── RLS Layer ─────────── PostgreSQL Row Level Security per user
```

Tidak perlu Node.js, tidak perlu microservice terpisah. Satu binary handle semuanya.

## Keamanan

- **2FA/TOTP** — verifikasi 2 langkah + kode cadangan sekali pakai
- **Brute-force lockout** — kunci 15 menit setelah 5x gagal + rate limiter
- **Notifikasi IP baru** — peringatan login dari IP asing (dedup 30 hari)
- **Manajemen sesi** — lihat & cabut sesi aktif per perangkat
- **API Key** — scopes (full/messages:send/dll), expiry, dan rotasi
- **Row Level Security** — PostgreSQL RLS sebagai lapis kedua di atas filter aplikasi (role `wagataway_app`, non-superuser)
- **Backup terenkripsi** — backup database harian otomatis (AES-256, retensi 7 hari)

Menemukan celah keamanan? Laporkan lewat [GitHub Issues](https://github.com/Aldi1963/wblash/issues) (jangan dipublikasikan dulu sebelum diperbaiki).

## Struktur Proyek

```
wagataway/
├── go-backend/
│   ├── cmd/server/              # Entry point (main.go)
│   ├── internal/
│   │   ├── config/              # Environment config
│   │   ├── database/            # Koneksi + AutoMigrate + models/
│   │   ├── handler/             # HTTP handler
│   │   │   ├── clipkupay.go     # Pembayaran QRIS
│   │   │   └── wamp_compat.go   # Shim kompatibilitas WAMP
│   │   ├── middleware/          # Auth, CORS, rate limit, 2FA
│   │   ├── rls/                 # Row Level Security (pgx driver-level)
│   │   ├── service/             # AI service (OpenAI + Anthropic)
│   │   ├── whatsapp/            # Session manager whatsmeow
│   │   │   ├── ai_reply.go      # AI auto-reply per device
│   │   │   └── deviceflags.go   # readReceipts, rejectCall, dsb.
│   │   ├── realtime/            # SSE hub
│   │   └── worker/              # Background scheduler
│   ├── web/                     # React frontend
│   │   ├── src/pages/           # Halaman (dashboard, billing, dsb.)
│   │   ├── src/components/      # UI: layout, CommandPalette, dsb.
│   │   ├── src/lib/i18n.tsx     # Kamus ID/EN
│   │   └── src/hooks/           # Auth, theme, dsb.
│   ├── Dockerfile               # Multi-stage build
│   ├── docker-compose.yml       # Full stack
│   └── Makefile
```

## Berkontribusi

Kontribusi sangat diterima — bug report, saran fitur, maupun pull request.

1. Fork repo ini, buat branch dari `main` (`git checkout -b fitur/nama-fitur`).
2. Ikuti gaya kode yang sudah ada (Go: `gofmt`; frontend: Prettier).
3. Pastikan tidak ada secret/credential yang ikut ter-commit.
4. Buka pull request dengan deskripsi perubahan yang jelas.

Untuk pertanyaan dan diskusi, silakan buka [GitHub Issues](https://github.com/Aldi1963/wblash/issues).

## Disclaimer

WaGataway memakai **unofficial WhatsApp Web API** (via library whatsmeow) dan **tidak berafiliasi dengan WhatsApp / Meta**. Penggunaan WhatsApp API tidak resmi berisiko dibatasi atau diblokir oleh WhatsApp — gunakan nomor cadangan dan patuhi ketentuan layanan WhatsApp. Proyek ini disediakan "sebagaimana adanya" (lihat [LICENSE](LICENSE)).

## Lisensi

MIT — lihat [LICENSE](LICENSE). Copyright © 2026 Aldi1963.

# WaGataway

Platform WhatsApp Gateway SaaS — kirim pesan otomatis, blast, auto-reply, live chat + AI, dan drip campaign. Single binary, deploy simpel.

## Tech Stack

| Layer | Teknologi |
|-------|-----------|
| Backend | Go 1.23 + Gin |
| WhatsApp | whatsmeow (native Go, tanpa Node.js) |
| Database | PostgreSQL + GORM |
| Cache | Redis |
| Frontend | React + Vite + TailwindCSS v4 |
| AI | OpenAI (GPT-4o) + Anthropic (Claude) |
| Auth | JWT + 2FA + Google OAuth |
| Real-time | SSE (Server-Sent Events) |
| Deploy | Docker / single binary |

## Fitur

- **Multi-Device** — hubungkan banyak nomor WhatsApp sekaligus
- **Kirim Pesan** — text, image, document, video
- **Blast Pesan** — bulk send dengan delay anti-banned
- **Auto Reply** — keyword matching (exact/contains/startsWith) + jadwal
- **Live Chat + AI CS Bot** — balas manual atau generate AI reply (OpenAI/Anthropic)
- **Drip Campaign** — sequence otomatis dengan delay per step
- **Scheduled Messages** — jadwalkan kirim di waktu tertentu
- **Link Shortener** — buat short link + tracking klik
- **Contacts & Groups** — kelola kontak + grup + import batch
- **Templates** — simpan template pesan untuk reuse
- **Blacklist** — blokir nomor dari menerima pesan
- **Webhooks** — kirim event ke URL eksternal
- **Analytics** — statistik harian, delivery rate, overview
- **Billing** — paket langganan, transaksi, voucher
- **Admin Panel** — kelola user, paket, voucher, settings, maintenance mode
- **Dark Mode** — UI monochrome hitam-putih, tanpa gradasi

## UI Design

Monochrome, terinspirasi dari Vercel dan Linear:

- Sidebar hitam solid, content area putih
- Tidak ada gradient, tidak ada glassmorphism
- Font: Inter + JetBrains Mono
- Border tipis, whitespace generous
- Light + Dark mode

## Quick Start

```bash
cd go-backend

# 1. Copy environment
cp .env.example .env
# Edit .env (isi DATABASE_URL, JWT_SECRET, dll)

# 2. Jalankan database
docker compose up -d postgres redis

# 3. Jalankan backend (auto-migrate database)
make dev

# 4. Jalankan frontend (terminal terpisah)
cd web && pnpm install && pnpm dev
```

Buka `http://localhost:5173` untuk frontend, API di `http://localhost:8080`.

## Deploy Production

```bash
# Docker (recommended) — build semua dalam 1 image
cd go-backend
docker compose up --build -d

# Atau manual
make build                    # → ./bin/server
cd web && pnpm build          # → ./web/dist
./bin/server                  # serve API + frontend
```

## Project Structure

```
wagataway/
├── go-backend/
│   ├── cmd/server/              # Entry point (main.go)
│   ├── internal/
│   │   ├── config/              # Environment config
│   │   ├── database/models/     # 34 GORM models
│   │   ├── handler/             # 26+ HTTP handlers
│   │   ├── middleware/          # Auth, CORS, rate limit
│   │   ├── service/             # AI service (OpenAI + Anthropic)
│   │   ├── whatsapp/            # WhatsApp session manager
│   │   ├── realtime/            # SSE hub
│   │   └── worker/              # Background scheduler
│   ├── web/                     # React frontend (monochrome)
│   │   ├── src/pages/           # 8 pages
│   │   ├── src/components/      # UI components (shadcn-style)
│   │   └── src/hooks/           # Auth, theme
│   ├── Dockerfile               # Multi-stage build
│   ├── docker-compose.yml       # Full stack
│   └── Makefile
└── artifacts/                   # Legacy Node.js (deprecated)
```

## API Endpoints

### Public
| Method | Path | Deskripsi |
|--------|------|-----------|
| POST | /api/auth/login | Login |
| POST | /api/auth/register | Register |
| GET | /api/l/:code | Short link redirect |

### Protected (Bearer Token)
| Method | Path | Deskripsi |
|--------|------|-----------|
| GET | /api/devices | List perangkat |
| POST | /api/devices/:id/connect | Hubungkan WA |
| GET | /api/devices/:id/qr | Get QR code |
| POST | /api/messages/send | Kirim pesan |
| POST | /api/messages/bulk | Blast pesan |
| GET | /api/contacts | List kontak |
| GET | /api/chat/conversations | List percakapan |
| POST | /api/chat/send | Kirim chat manual |
| POST | /api/chat/ai-reply | Generate AI reply |
| GET | /api/auto-reply | List auto-reply rules |
| GET | /api/drip | List drip campaigns |
| GET | /api/schedule | List jadwal pesan |
| GET | /api/analytics/overview | Statistik |
| GET | /api/billing/plans | List paket |
| GET | /api/stream | SSE real-time events |

### Admin (/api/admin/*)
| Method | Path | Deskripsi |
|--------|------|-----------|
| GET | /api/admin/users | List semua user |
| GET | /api/admin/analytics | Global analytics |
| PUT | /api/admin/maintenance | Toggle maintenance |

## Environment Variables

```env
PORT=8080
DATABASE_URL=postgres://user:pass@localhost:5432/wagataway?sslmode=disable
REDIS_URL=redis://localhost:6379
JWT_SECRET=your-secret-key
WA_SESSIONS_DIR=./wa-sessions
OPENAI_API_KEY=sk-xxx
ANTHROPIC_API_KEY=sk-ant-xxx
SMTP_HOST=smtp.gmail.com
SMTP_USER=email@gmail.com
SMTP_PASS=app-password
```

## Architecture

```
Single Go Binary
├── HTTP Server (Gin) ─── REST API + SSE + Static files
├── WhatsApp Manager ──── whatsmeow sessions (per-device SQLite)
├── Background Workers ── Cron scheduler (bulk, drip, scheduled)
└── AI Service ────────── OpenAI + Anthropic completions
```

Tidak perlu Node.js, tidak perlu microservice terpisah. Satu binary handle semuanya.

## License

Private — Aldi1963

# WaGataway — Go Backend

Migrasi backend WaGataway dari Node.js/Express ke **Go (Gin)** dengan WhatsApp integration via **whatsmeow**.

## Tech Stack

| Komponen | Teknologi |
|----------|-----------|
| Language | Go 1.23+ |
| HTTP Framework | Gin |
| ORM | GORM |
| Database | PostgreSQL |
| Cache | Redis |
| WhatsApp | whatsmeow (tulir) |
| Frontend | React + Vite + TailwindCSS v4 |
| Queue/Workers | Native goroutines + robfig/cron |
| Auth | JWT (golang-jwt) |
| AI | OpenAI + Anthropic Go SDK |

## UI Design

**Monochrome — Vercel/Linear inspired:**
- Solid black sidebar, white content area
- No gradients, no glassmorphism
- Inter + JetBrains Mono typography
- Clean borders, generous whitespace
- Light + Dark mode support

## Quick Start

```bash
# 1. Copy env
cp .env.example .env

# 2. Start infrastructure
docker compose up -d postgres redis

# 3. Run backend
make dev

# 4. Run frontend (separate terminal)
cd web && pnpm install && pnpm dev
```

## Build & Deploy

```bash
# Build everything (Go binary + frontend)
docker compose up --build

# Or manual build
make build          # Go binary → ./bin/server
cd web && pnpm build  # Frontend → ./web/dist
```

## Project Structure

```
go-backend/
├── cmd/server/          # Entry point
├── internal/
│   ├── config/          # Environment config
│   ├── database/        # DB connection + 34 models
│   ├── handler/         # HTTP handlers (35+ route groups)
│   ├── middleware/      # Auth, CORS, rate limit, maintenance
│   ├── service/         # Business logic
│   ├── whatsapp/        # WhatsApp session manager (whatsmeow)
│   └── worker/          # Background scheduler (cron jobs)
├── web/                 # React frontend
├── Dockerfile           # Multi-stage build
├── docker-compose.yml   # Full stack (app + postgres + redis)
└── Makefile
```

## Architecture

Single binary handles **everything**:
- REST API (35+ route groups)
- WhatsApp WebSocket connections (whatsmeow, no Node.js sidecar needed)
- Background workers (scheduled messages, drip campaigns, bulk jobs)
- Static file serving (React SPA)

## Status

This is the initial scaffold/boilerplate. Features marked with stub handlers will be fully implemented incrementally.

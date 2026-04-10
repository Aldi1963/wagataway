# WhatsApp Gateway SaaS

A full-featured WhatsApp Gateway SaaS web application built with React+Vite frontend and Express+PostgreSQL backend. Similar to Wablas, Fonnte, or Twilio Dashboard.

## Architecture

- **Frontend**: `artifacts/wa-gateway` — React + Vite + Tailwind CSS + shadcn/ui + TanStack Query (port 23977)
- **Backend**: `artifacts/api-server` — Express.js + Drizzle ORM + PostgreSQL (port 8080)
- **Database**: Shared `lib/db` workspace package with Drizzle schema (Replit PostgreSQL)

## Running

Two workflows must be running:
- `API Server` — Express backend on port 8080
- `Start application` — Vite dev server on port 23977

## Demo Credentials

- **Email:** `admin@example.com`
- **Password:** `password123`

## Key Features

1. Login / Register (with OTP email verification)
2. Dashboard dengan stats dan grafik (7d/30d/90d selector, pesan per-jam, top devices)
3. Device Management (WhatsApp) + Device Rotation (weighted random)
4. Send Message (Text, Button, List, Media, Poll, Template, Location, Sticker, React, Quoted)
5. Number Checker (cek nomor aktif WA) — POST /api/check-numbers
6. Bulk Messages (blast) dengan media support (gambar/video/audio/dokumen)
7. Laporan pengiriman per-nomor + export CSV + selective retry per-job
8. Drip Campaign (multi-step, berjeda hari/delayDays, enroll kontak)
9. Schedule & Blast
10. Auto Reply / Bot
11. CS Bot dengan AI Mode (OpenAI, Anthropic, Gemini, Groq, OpenRouter, DeepSeek, Mistral)
12. Contact Management dengan filter tag/label
13. Blacklist / DND (blokir nomor — menerima `phone` atau `phones`)
14. Link Shortener + Tracking Klik
15. Webhook configuration (dengan delivery status hook: message.delivered, message.read)
16. Plugin (OpenAI, Gemini, Claude, dll)
17. API Settings (endpoint: /api/api-keys)
18. Billing / Subscription
19. User Profile + 2FA TOTP
20. Admin: Dashboard Stats (/api/admin/stats)
21. Admin: Manajemen Paket (butuh field `slug`)
22. Admin: Notifikasi broadcast (/api/admin/notifications tanpa userIds = broadcast ke semua)
23. Admin: WA Center Bot
24. Live Chat + CS Bot per-device
25. Analytics & Laporan
26. Reseller + Sub-User Management
27. Anti-Banned per-device (/api/devices/:id/anti-banned)
28. Group Management (GET /api/groups, GET /api/groups/:groupId/members, POST /api/groups/send)
29. Message Retry otomatis (2m, 5m, 15m — max 3x)
30. Delivery Status tracking (deliveredAt, readAt via Baileys messages.update)

## DB Schema Key Tables

- `messages`: messageType, externalId, retryCount, retryAt, deliveredAt, readAt, failedReason
- `devices`: rotationEnabled, rotationWeight, rotationGroup (untuk device rotation pool)
- `bulk_jobs`: name, mediaUrl, mediaType
- `drip_campaigns`: campaign header (uses `delayDays` per step, NOT `dayOffset`)
- `drip_steps`: per-step message + delayDays
- `drip_enrollments`: contacts enrolled in a campaign

## Critical API Notes

- **Login rate limit**: 10/15min per IP — avoid parallel login calls; restart server to reset
- **Admin stats**: `GET /api/admin/stats`
- **Admin plans create**: requires `slug` field (unique)
- **Admin notification broadcast**: `POST /api/admin/notifications` — omit `userIds` for broadcast to all
- **Admin suspend/activate**: paths are `/admin/users/:id/suspend` and `/admin/users/:id/activate`
- **API Keys**: endpoint is `/api/api-keys` (with hyphen, NOT `/api/apikeys`)
- **Anti-Banned**: per-device at `/api/devices/:id/anti-banned` (NOT `/api/anti-banned/settings`)
- **Blacklist**: POST /api/blacklist accepts both `phone` (string) and `phones` (array)
- **Canned Responses**: field is `body` (NOT `content`), plus `shortcut` and `title`
- **Drip campaigns**: field is `delayDays` (NOT `dayOffset`)
- **Links shortener**: parameter is `customCode` (NOT `customSlug`)
- **Number checker**: POST /api/check-numbers with `{deviceId, phones[]}` (requires device connected)
- **Device rotation**: send `deviceId: "auto"` or `"rotate"` to pick from rotation pool
- **Register**: POST /auth/otp/send first, then POST /auth/register with `{name, email, password, otp}`
- **Reseller sub-user create**: requires `name`, `email`, AND `password`
- **Dashboard stats**: route is `/api/dashboard/stats` (NOT `/api/dashboard`)
- **Billing**: `/api/billing/subscription|plans|balance|transactions|usage`
- **2FA disable**: POST /api/2fa/disable with `{token: "<TOTP code>"}` in body
- **Delivery status webhook events**: `message.delivered` and `message.read`
- **Messages list**: response uses `.data` key, includes messageType/failedReason/retryCount/deliveredAt/readAt
- **Contacts list**: response uses `.data` key

## Environment Variables

- `DATABASE_URL` — PostgreSQL connection string (auto-set by Replit)
- `SESSION_SECRET` — Secret for sessions (set as Replit secret)
- `NODE_ENV` — development/production

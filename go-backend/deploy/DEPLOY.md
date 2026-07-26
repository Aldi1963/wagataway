# Deploy WaGataway ke VPS

Panduan deploy WaGataway ke VPS (Ubuntu 22.04 / 24.04 atau Debian 12) memakai
Docker + Caddy (HTTPS otomatis). Stack: app (single Go binary + frontend),
PostgreSQL, Redis, dan Caddy sebagai reverse proxy.

## Prasyarat

- VPS dengan minimal **1 vCPU / 1 GB RAM** (rekomendasi 2 GB untuk banyak device WA)
- Domain yang DNS **A record**-nya sudah diarahkan ke IP VPS
  (contoh: `app.domainmu.com → 1.2.3.4`)
- Akses root/sudo ke VPS

## Cara Cepat (otomatis)

Login ke VPS via SSH, lalu jalankan:

```bash
curl -fsSL https://raw.githubusercontent.com/Aldi1963/wagataway/main/go-backend/deploy/setup-vps.sh | sudo bash
```

Script akan:

1. Install Docker + Docker Compose
2. Setup firewall (UFW): buka port 22, 80, 443
3. Clone repo ke `/opt/wagataway`
4. Membuat `deploy/.env` dengan `JWT_SECRET` & password DB acak
5. Meminta kamu edit `.env` (isi `DOMAIN`, `TLS_EMAIL`, API key)
6. Build & jalankan seluruh stack

Setelah selesai, buka `https://domainmu.com` — Caddy otomatis menerbitkan
sertifikat SSL Let's Encrypt.

## Cara Manual (langkah per langkah)

### 1. Install Docker

```bash
curl -fsSL https://get.docker.com | sh
```

### 2. Clone repo

```bash
sudo git clone https://github.com/Aldi1963/wagataway.git /opt/wagataway
cd /opt/wagataway/go-backend
```

### 3. Siapkan environment

```bash
cp deploy/.env.production.example deploy/.env
nano deploy/.env
```

Yang **wajib** diisi:

| Variabel | Keterangan |
|----------|------------|
| `DOMAIN` | Domain aplikasi, mis. `app.domainmu.com` |
| `TLS_EMAIL` | Email untuk Let's Encrypt |
| `POSTGRES_PASSWORD` | Password DB — generate: `openssl rand -base64 24` |
| `JWT_SECRET` | Secret token — generate: `openssl rand -hex 32` |

Sisanya (SMTP, OpenAI/Anthropic, payment, Telegram) opsional.

### 4. Build & jalankan

```bash
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env up -d --build
```

### 5. Cek status

```bash
docker compose -f deploy/docker-compose.prod.yml ps
docker compose -f deploy/docker-compose.prod.yml logs -f app
```

## Operasional

Semua perintah dijalankan dari folder `go-backend`. Untuk singkatnya tersedia
target Makefile:

```bash
make prod-up        # build & start
make prod-down      # stop
make prod-logs      # tail logs app
make prod-restart   # restart app
make prod-update    # git pull + rebuild + restart
```

### Update ke versi terbaru

```bash
git pull
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env up -d --build
```

### Backup database

```bash
docker compose -f deploy/docker-compose.prod.yml exec postgres \
  pg_dump -U wagataway wagataway > backup-$(date +%F).sql
```

### Restore database

```bash
cat backup.sql | docker compose -f deploy/docker-compose.prod.yml exec -T postgres \
  psql -U wagataway wagataway
```

## Arsitektur di VPS

```
Internet ──► :443 Caddy (HTTPS/TLS otomatis)
                │
                └─► app:8080  (Go binary + React frontend + SSE)
                       ├─► postgres:5432  (internal, tidak diekspos)
                       └─► redis:6379     (internal, tidak diekspos)
```

Postgres & Redis **tidak** dibuka ke internet — hanya bisa diakses lewat
network internal Docker. Hanya port 80/443 (Caddy) dan 22 (SSH) yang terbuka.

## Troubleshooting

- **HTTPS gagal / sertifikat tidak terbit** — pastikan DNS A record domain
  sudah mengarah ke IP VPS, dan port 80/443 tidak diblok. Cek log:
  `docker compose -f deploy/docker-compose.prod.yml logs caddy`
- **App restart terus** — cek `logs app`; biasanya `DATABASE_URL` /
  `.env` belum benar.
- **Data WhatsApp hilang setelah restart** — jangan hapus volume
  `wa-sessions`; itu menyimpan sesi login WA.
- **Port 80 sudah dipakai** — matikan nginx/apache bawaan VPS:
  `sudo systemctl disable --now nginx apache2`

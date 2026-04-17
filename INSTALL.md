# Panduan Instalasi WA Gateway SaaS

Panduan ini mencakup dua metode instalasi: **VPS** (direkomendasikan) dan **cPanel** (dengan Node.js Selector).

---

## Daftar Isi

- [Persyaratan Sistem](#persyaratan-sistem)
- [**Auto Installer VPS (Sangat Direkomendasikan)**](#auto-installer-vps-sangat-direkomendasikan)
- [Instalasi Manual di VPS (Ubuntu/Debian)](#instalasi-manual-di-vps-ubuntudebian)
- [Instalasi di cPanel](#instalasi-di-cpanel)
- [Pengaturan Cron Job di cPanel](#pengaturan-cron-job-di-cpanel)
- [Konfigurasi Environment](#konfigurasi-environment)
- [Manajemen Sesi WhatsApp](#manajemen-sesi-whatsapp)
- [Troubleshooting](#troubleshooting)

---

## Persyaratan Sistem

| Komponen | Minimum | Direkomendasikan |
|----------|---------|-----------------|
| CPU | 1 vCPU | 2 vCPU |
| RAM | 1 GB | 2 GB |
| Storage | 10 GB | 20 GB |
| OS | Ubuntu 20.04 | Ubuntu 22.04 LTS |
| Node.js | v20.x | v22.x LTS |
| PostgreSQL | 14 | 16 |

> **Catatan cPanel:** Fitur ini hanya tersedia pada paket hosting yang menyertakan **Node.js Selector** (CloudLinux) dan akses **SSH/Terminal**. Shared hosting tanpa fitur tersebut tidak dapat menjalankan aplikasi ini.

---

## Auto Installer VPS (Sangat Direkomendasikan)

Jika Anda menggunakan VPS Linux (Ubuntu), gunakan script auto-installer untuk setup otomatis dalam satu perintah. Script ini akan menginstall Node.js, pnpm, PM2, PostgreSQL, Nginx, dan melakukan konfigurasi awal.

### Langkah 1: Clone Repository
```bash
sudo git clone https://github.com/username/wa-gateway.git /var/www/wagateway
cd /var/www/wagateway
```

### Langkah 2: Jalankan Script Installer
```bash
sudo bash scripts/vps-setup.sh
```
Ikuti instruksi di layar. Script akan membuat file `.env` otomatis dan memberikan informasi login & database di akhir proses.

---

## Instalasi Manual di VPS (Ubuntu/Debian)

### Langkah 1: Update Sistem & Install Dependencies

```bash
sudo apt update && sudo apt upgrade -y

# Install Node.js v22 via NodeSource
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs git nginx

# Install pnpm (package manager yang digunakan proyek ini)
npm install -g pnpm pm2

# Verifikasi
node --version   # v22.x.x
pnpm --version   # 9.x.x
pm2 --version
```

### Langkah 2: Install & Konfigurasi PostgreSQL

```bash
sudo apt install -y postgresql postgresql-contrib

# Start & enable PostgreSQL
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Buat database dan user
sudo -u postgres psql <<EOF
CREATE USER wagateway WITH PASSWORD 'password_anda_yang_kuat';
CREATE DATABASE wagateway OWNER wagateway;
GRANT ALL PRIVILEGES ON DATABASE wagateway TO wagateway;
EOF
```

### Langkah 3: Clone & Siapkan Proyek

```bash
# Clone repository ke /var/www/wagateway
cd /var/www
sudo git clone https://github.com/username/wa-gateway.git wagateway
sudo chown -R $USER:$USER /var/www/wagateway
cd /var/www/wagateway

# Install semua dependencies
pnpm install --frozen-lockfile
```

### Langkah 4: Konfigurasi Environment Variables

Aplikasi menggunakan satu file `.env` di root direktori untuk kemudahan manajemen.

```bash
# Copy file contoh ke .env
cp .env.example .env

# Edit file .env
nano .env
```

Isi `.env` dengan kredensial Anda:
```env
NODE_ENV=production
PORT=8080
DATABASE_URL=postgresql://wagateway:password_anda@localhost:5432/wagateway
SESSION_SECRET=string_random_anda_64_karakter
SESSIONS_DIR=./wa-sessions
```

> **Tips:** Generate SESSION_SECRET dengan perintah:
> ```bash
> node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
> ```

### Langkah 5: Sinkronisasi Schema Database

```bash
# Push schema database (jalankan sekali saat pertama install)
pnpm --filter @workspace/db run push
```

### Langkah 6: Build Aplikasi

```bash
# Build API server
pnpm --filter @workspace/api-server run build

# Build frontend (React SPA)
BASE_PATH=/ pnpm --filter @workspace/wa-gateway run build
```

> File hasil build:
> - **API Server:** `artifacts/api-server/dist/index.mjs`
> - **Frontend:** `artifacts/wa-gateway/dist/public/` (file statis)

### Langkah 7: Konfigurasi PM2 (Process Manager)

```bash
# Jalankan dengan PM2 menggunakan ecosystem config yang sudah tersedia
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup  # Ikuti instruksi perintah yang muncul untuk auto-start saat reboot
```

> **Note:** Direktori log akan dibuat otomatis di `logs/`

### Langkah 8: Konfigurasi Nginx

```bash
# Buat konfigurasi Nginx
sudo cat > /etc/nginx/sites-available/wagateway << 'EOF'
server {
    listen 80;
    server_name domain-anda.com www.domain-anda.com;

    # Lokasi file frontend hasil build
    root /var/www/wagateway/artifacts/wa-gateway/dist/public;
    index index.html;

    # Proxy semua request /api/ ke API server
    location /api/ {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;

        # Penting untuk SSE (QR Code streaming)
        proxy_buffering off;
        proxy_cache off;
    }

    # Semua route lainnya diarahkan ke index.html (SPA routing)
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache file statis
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff2?)$ {
        expires 30d;
        add_header Cache-Control "public, no-transform";
    }

    # Gzip compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;
}
EOF

# Aktifkan konfigurasi
sudo ln -s /etc/nginx/sites-available/wagateway /etc/nginx/sites-enabled/
sudo nginx -t  # Test konfigurasi
sudo systemctl reload nginx
```

### Langkah 9: SSL dengan Certbot (HTTPS)

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d domain-anda.com -d www.domain-anda.com
# Ikuti petunjuk yang muncul, masukkan email dan setujui terms
sudo systemctl reload nginx
```

### Verifikasi Instalasi VPS

```bash
# Cek status API server
pm2 status
pm2 logs wa-gateway-api --lines 20

# Test API
curl http://localhost:8080/api/auth/login \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"password123"}'

# Cek Nginx
sudo nginx -t
sudo systemctl status nginx
```

Buka browser dan akses `http://domain-anda.com` — login dengan:
- **Email:** `admin@example.com`
- **Password:** `password123`

> **Penting:** Segera ganti password setelah login pertama melalui menu **Profil**.

---

## Instalasi di cPanel

> **Prasyarat:** Pastikan paket hosting Anda mendukung:
> - Node.js Selector (CloudLinux/LiteSpeed)
> - Akses SSH/Terminal
> - PostgreSQL atau MySQL (via phpMyAdmin)

### Langkah 1: Akses Terminal SSH

Masuk ke server via SSH:

```bash
ssh username@domain-anda.com -p 22
```

Atau gunakan **Terminal** di cPanel → **Advanced** → **Terminal**.

### Langkah 2: Install Node.js via NVM (di cPanel)

cPanel biasanya tidak mengizinkan instalasi Node.js global. Gunakan NVM:

```bash
# Install NVM
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash

# Reload shell
source ~/.bashrc

# Install Node.js v22
nvm install 22
nvm use 22
nvm alias default 22

# Install pnpm
npm install -g pnpm pm2

# Verifikasi
node --version
pnpm --version
```

### Langkah 3: Upload Proyek

**Opsi A – Via Git (direkomendasikan):**
```bash
cd ~/  # Home directory cPanel
git clone https://github.com/username/wa-gateway.git wagateway
cd ~/wagateway
```

**Opsi B – Via File Manager cPanel:**
1. Buka **cPanel → File Manager**
2. Upload file `.zip` proyek ke direktori home
3. Extract di dalam File Manager
4. Rename folder menjadi `wagateway`

### Langkah 4: Siapkan PostgreSQL di cPanel

Di cPanel, PostgreSQL dikelola melalui **PostgreSQL Databases**:

1. Buka **cPanel → PostgreSQL Databases**
2. Buat database baru: `cpanelusername_wagateway`
3. Buat user baru: `cpanelusername_wagw` dengan password yang kuat
4. Tambahkan user ke database dengan hak akses **ALL PRIVILEGES**
5. Catat connection string:
   ```
   postgresql://cpanelusername_wagw:password@localhost:5432/cpanelusername_wagateway
   ```

> **Catatan:** Jika cPanel Anda tidak menyediakan PostgreSQL, gunakan layanan database eksternal seperti [Supabase](https://supabase.com) (gratis) atau [Neon](https://neon.tech) (gratis).

### Langkah 5: Konfigurasi Environment

```bash
cd ~/wagateway

# Buat file environment API server
cat > artifacts/api-server/.env << 'EOF'
NODE_ENV=production
PORT=8090
DATABASE_URL=postgresql://cpanelusername_wagw:password@localhost:5432/cpanelusername_wagateway
SESSION_SECRET=ganti_dengan_string_random_64_karakter
EOF

# Generate SESSION_SECRET
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
# Copy hasilnya ke SESSION_SECRET di atas
```

### Langkah 6: Install Dependencies & Build

```bash
cd ~/wagateway

# Install dependencies
pnpm install --frozen-lockfile

# Push schema database
pnpm --filter @workspace/db run push

# Build API server
pnpm --filter @workspace/api-server run build

# Build frontend
BASE_PATH=/ pnpm --filter @workspace/wa-gateway run build
```

### Langkah 7: Jalankan API Server dengan PM2

```bash
# Buat ecosystem file
cat > ~/wagateway/ecosystem.config.cjs << 'EOF'
module.exports = {
  apps: [
    {
      name: "wa-gateway-api",
      script: "artifacts/api-server/dist/index.mjs",
      cwd: "/home/cpanelusername/wagateway",
      instances: 1,
      env: {
        NODE_ENV: "production",
        PORT: 8090,
        DATABASE_URL: "postgresql://cpanelusername_wagw:password@localhost:5432/cpanelusername_wagateway",
        SESSION_SECRET: "string_secret_anda"
      }
    }
  ]
};
EOF

pm2 start ecosystem.config.cjs
pm2 save

# Setup auto-start (jalankan perintah yang tampil)
pm2 startup
```

### Langkah 8: Konfigurasi Node.js App di cPanel

1. Buka **cPanel → Software → Setup Node.js App**
2. Klik **Create Application**
3. Isi form:
   - **Node.js version:** 22.x (atau versi tertinggi)
   - **Application mode:** Production
   - **Application root:** `wagateway/artifacts/wa-gateway/dist/public`
   - **Application URL:** domain-anda.com _(atau subdomain)_
   - **Application startup file:** _(kosongkan, kita pakai PM2)_

### Langkah 9: Konfigurasi .htaccess (Reverse Proxy)

Buat file `.htaccess` di `public_html` (atau direktori root domain):

```bash
cat > ~/public_html/.htaccess << 'EOF'
# Aktifkan Rewrite Engine
RewriteEngine On

# Proxy /api/ ke API server (port 8090)
RewriteCond %{REQUEST_URI} ^/api/ [NC]
RewriteRule ^(.*)$ http://127.0.0.1:8090/$1 [P,L]

# Serve file statis frontend
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule ^ /index.html [L]
EOF
```

Salin hasil build frontend ke `public_html`:

```bash
cp -r ~/wagateway/artifacts/wa-gateway/dist/public/. ~/public_html/
```

> **Catatan:** Setiap kali build ulang frontend, ulangi perintah `cp` di atas.

### Verifikasi Instalasi cPanel

```bash
# Cek PM2 berjalan
pm2 status

# Test API
curl http://localhost:8090/api/auth/login \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"password123"}'
```

---

## Pengaturan Cron Job di cPanel

Cron job diperlukan di cPanel karena tidak seperti VPS, proses PM2 bisa mati saat server di-restart oleh provider. Cron job memastikan aplikasi selalu aktif kembali secara otomatis.

> **Catatan:** Fitur **Jadwal Pesan** (Scheduled Messages) sudah diproses secara internal oleh API server setiap menit — **tidak perlu cron job tambahan** untuk fitur ini.

### Daftar Cron Job yang Diperlukan

| Jadwal | Fungsi | Script |
|--------|--------|--------|
| `@reboot` | Start PM2 otomatis saat server reboot | `start-pm2.sh` |
| Setiap 5 menit | Cek kesehatan API & restart jika mati | `health-check.sh` |
| Setiap hari jam 02:00 | Backup database PostgreSQL | `backup-db.sh` |
| Setiap Minggu jam 03:00 | Backup sesi WhatsApp | `backup-sessions.sh` |
| Setiap bulan tanggal 1 jam 04:00 | Bersihkan log lama | `cleanup-logs.sh` |

---

### Langkah 1 — Siapkan Script Cron Job

Script cron job sudah tersedia di direktori `scripts/cron/`. Salin ke home directory dan beri izin eksekusi:

```bash
mkdir -p ~/cron-scripts

cp ~/wagateway/scripts/cron/start-pm2.sh       ~/cron-scripts/
cp ~/wagateway/scripts/cron/health-check.sh    ~/cron-scripts/
cp ~/wagateway/scripts/cron/backup-db.sh       ~/cron-scripts/
cp ~/wagateway/scripts/cron/backup-sessions.sh ~/cron-scripts/
cp ~/wagateway/scripts/cron/cleanup-logs.sh    ~/cron-scripts/

# Beri izin eksekusi pada semua script
chmod +x ~/cron-scripts/*.sh
```

**Edit konfigurasi di `backup-db.sh`** — sesuaikan nama database, user, dan password:

```bash
nano ~/cron-scripts/backup-db.sh
```

Ubah bagian berikut di dalam file:

```bash
DB_NAME="cpanelusername_wagateway"   # ← nama database Anda
DB_USER="cpanelusername_wagw"         # ← user database Anda
DB_PASS="password_database_anda"      # ← password database Anda
```

Jika menggunakan layanan database eksternal (Supabase/Neon), gunakan `DATABASE_URL` saja:

```bash
export DATABASE_URL="postgresql://user:pass@host:5432/dbname"
bash ~/cron-scripts/backup-db.sh
```

---

### Langkah 2 — Buka Cron Jobs di cPanel

1. Login ke **cPanel** (biasanya `https://namadomain.com:2083`)
2. Scroll ke bagian **Advanced**, klik **Cron Jobs**
3. Anda akan melihat dua bagian:
   - **Add New Cron Job** — untuk menambah cron baru
   - **Current Cron Jobs** — daftar cron yang sudah aktif

---

### Langkah 3 — Tambahkan Cron Job Satu per Satu

Ganti `cpanelusername` di setiap command dengan **username cPanel Anda** yang sebenarnya (cek dengan `echo $HOME` di SSH).

---

#### ► Cron 1: Auto-Start PM2 saat Reboot

Di bagian **Add New Cron Job**:

- **Common Settings:** pilih dropdown `@reboot`
- **Command:**
  ```
  /bin/bash /home/cpanelusername/cron-scripts/start-pm2.sh >> /home/cpanelusername/logs/cron-reboot.log 2>&1
  ```

Klik tombol **Add New Cron Job**.

---

#### ► Cron 2: Health Check Setiap 5 Menit

Isi kolom waktu secara manual:

| Field | Nilai |
|-------|-------|
| Minute | `*/5` |
| Hour | `*` |
| Day | `*` |
| Month | `*` |
| Weekday | `*` |

- **Command:**
  ```
  /bin/bash /home/cpanelusername/cron-scripts/health-check.sh
  ```

> Atau klik **Common Settings** → pilih **"Every 5 Minutes"**, lalu isi Command.

---

#### ► Cron 3: Backup Database Setiap Hari Jam 02:00

| Field | Nilai |
|-------|-------|
| Minute | `0` |
| Hour | `2` |
| Day | `*` |
| Month | `*` |
| Weekday | `*` |

- **Command:**
  ```
  /bin/bash /home/cpanelusername/cron-scripts/backup-db.sh
  ```

---

#### ► Cron 4: Backup Sesi WhatsApp Setiap Minggu Jam 03:00

| Field | Nilai |
|-------|-------|
| Minute | `0` |
| Hour | `3` |
| Day | `*` |
| Month | `*` |
| Weekday | `0` (0 = Minggu/Sunday) |

- **Command:**
  ```
  /bin/bash /home/cpanelusername/cron-scripts/backup-sessions.sh
  ```

---

#### ► Cron 5: Bersihkan Log Lama Setiap Tanggal 1

| Field | Nilai |
|-------|-------|
| Minute | `0` |
| Hour | `4` |
| Day | `1` |
| Month | `*` |
| Weekday | `*` |

- **Command:**
  ```
  /bin/bash /home/cpanelusername/cron-scripts/cleanup-logs.sh
  ```

---

### Langkah 4 — Verifikasi Cron Job Terpasang

Setelah semua ditambahkan, bagian **Current Cron Jobs** di cPanel akan menampilkan:

```
@reboot         /bin/bash /home/cpanelusername/cron-scripts/start-pm2.sh ...
*/5 * * * *     /bin/bash /home/cpanelusername/cron-scripts/health-check.sh
0 2 * * *       /bin/bash /home/cpanelusername/cron-scripts/backup-db.sh
0 3 * * 0       /bin/bash /home/cpanelusername/cron-scripts/backup-sessions.sh
0 4 1 * *       /bin/bash /home/cpanelusername/cron-scripts/cleanup-logs.sh
```

Verifikasi via SSH:

```bash
crontab -l
```

---

### Langkah 5 — Uji Script Secara Manual

Jalankan tiap script untuk memastikan tidak ada error sebelum mengandalkan cron:

```bash
# Test health check
bash ~/cron-scripts/health-check.sh
cat ~/logs/wa-gateway-health.log

# Test backup database
bash ~/cron-scripts/backup-db.sh
cat ~/logs/wa-gateway-backup.log
ls -lh ~/backups/database/

# Test backup sesi
bash ~/cron-scripts/backup-sessions.sh
ls -lh ~/backups/wa-sessions/

# Test startup
bash ~/cron-scripts/start-pm2.sh
cat ~/logs/wa-gateway-startup.log
```

---

### Monitoring Log Cron Job

Semua script menyimpan log di `~/logs/`. Pantau secara berkala:

```bash
# Log health check
tail -f ~/logs/wa-gateway-health.log

# Log backup
tail -f ~/logs/wa-gateway-backup.log

# Log startup (setelah reboot)
tail -f ~/logs/wa-gateway-startup.log

# Semua log sekaligus
tail -f ~/logs/*.log
```

---

### Restore Backup Database

Jika perlu memulihkan database dari file backup:

```bash
# Lihat daftar backup
ls -lh ~/backups/database/

# Restore dari file backup tertentu
gunzip -c ~/backups/database/db_backup_TANGGAL.sql.gz \
  | psql "postgresql://USER:PASS@localhost:5432/NAMA_DATABASE"
```

### Restore Backup Sesi WhatsApp

```bash
# Lihat daftar backup sesi
ls -lh ~/backups/wa-sessions/

# Stop PM2 sebelum restore agar tidak konflik
pm2 stop wa-gateway-api

# Extract backup ke direktori yang tepat
tar -xzf ~/backups/wa-sessions/wa_sessions_TANGGAL.tar.gz \
  -C ~/wagateway/artifacts/api-server/

# Start kembali
pm2 start wa-gateway-api
```

---

### Troubleshooting Cron Job

**Cron tidak berjalan?**
- Pastikan path script **absolut** — diawali `/home/username/...` bukan `~/...`
- Pastikan script punya izin eksekusi: `chmod +x ~/cron-scripts/*.sh`
- cPanel menggunakan environment terbatas — NVM tidak otomatis ter-load; script sudah menangani ini secara internal

**PM2 tidak ditemukan saat `@reboot`?**
```bash
# Cek lokasi NVM
echo $NVM_DIR
ls ~/.nvm/nvm.sh

# Edit script start-pm2.sh jika path berbeda
nano ~/cron-scripts/start-pm2.sh
```

**Backup database gagal?**
```bash
# Cek pg_dump tersedia
which pg_dump

# Jika tidak ada, gunakan DATABASE_URL di backup-db.sh
# Atau lakukan backup manual via phpPgAdmin di cPanel
```

**`@reboot` tidak didukung oleh hosting?**

Beberapa shared hosting memblokir `@reboot`. Gunakan cron setiap 1 menit sebagai alternatif (akan merestart PM2 jika mati dalam 1 menit):

| Field | Nilai |
|-------|-------|
| Minute | `*` |
| Hour | `*` |
| Day | `*` |
| Month | `*` |
| Weekday | `*` |

```
/bin/bash /home/cpanelusername/cron-scripts/health-check.sh
```

> Dengan ini, jika PM2 mati, akan dideteksi dan direstart dalam maksimal 1 menit.

---

## Konfigurasi Environment

### Variabel Environment Lengkap

**File: `artifacts/api-server/.env`**

```env
# ─── Wajib ───────────────────────────────────────────────────────────
NODE_ENV=production
PORT=8080
DATABASE_URL=postgresql://user:password@localhost:5432/wagateway
SESSION_SECRET=string_random_minimal_64_karakter

# ─── Opsional ────────────────────────────────────────────────────────
LOG_LEVEL=info
```

**File: `artifacts/wa-gateway/.env`**

```env
NODE_ENV=production
PORT=3000
BASE_PATH=/
```

> Variabel `BASE_PATH` diisi `/` jika aplikasi berada di root domain, atau `/app` jika di subdirektori.

### Mengganti Password Admin Default

Setelah instalasi, segera ganti password akun admin via UI atau langsung di database:

```bash
# Via psql — ganti "password_baru" dengan password yang diinginkan
psql "$DATABASE_URL" -c "
UPDATE users
SET password = encode(sha256(('password_baru' || 'salt_wa_gateway')::bytea), 'hex')
WHERE email = 'admin@example.com';
"
```

---

## Manajemen Sesi WhatsApp

Sesi WhatsApp (Baileys) disimpan di direktori:
```
artifacts/api-server/wa-sessions/<device_id>/
```

### Backup Sesi

```bash
# Backup sesi aktif
tar -czf wa-sessions-backup-$(date +%Y%m%d).tar.gz \
  artifacts/api-server/wa-sessions/

# Simpan ke lokasi aman
mv wa-sessions-backup-*.tar.gz ~/backups/
```

### Restore Sesi

```bash
tar -xzf wa-sessions-backup-YYYYMMDD.tar.gz -C artifacts/api-server/
pm2 restart wa-gateway-api
```

---

## Update Aplikasi

```bash
cd /var/www/wagateway  # atau ~/wagateway untuk cPanel

# Pull update terbaru
git pull origin main

# Install dependency baru (jika ada)
pnpm install --frozen-lockfile

# Jalankan migrasi database (jika ada perubahan schema)
pnpm --filter @workspace/db run push

# Build ulang
pnpm --filter @workspace/api-server run build
BASE_PATH=/ pnpm --filter @workspace/wa-gateway run build

# Restart API server
pm2 restart wa-gateway-api

# Untuk cPanel: salin ulang file frontend
# cp -r artifacts/wa-gateway/dist/public/. ~/public_html/
```

---

## Troubleshooting

### API server tidak bisa start

```bash
# Cek log error
pm2 logs wa-gateway-api --err --lines 50

# Cek koneksi database
psql "$DATABASE_URL" -c "SELECT 1;"

# Pastikan PORT tidak dipakai proses lain
sudo lsof -i :8080
```

### Database connection error

```bash
# Test koneksi langsung
psql "postgresql://user:password@localhost:5432/wagateway"

# Pastikan PostgreSQL running
sudo systemctl status postgresql

# Cek DATABASE_URL sudah benar di .env atau ecosystem.config.cjs
```

### Sesi WhatsApp hilang setelah restart

Sesi tersimpan di `artifacts/api-server/wa-sessions/`. Pastikan direktori ini tidak terhapus saat deploy. Tambahkan ke `.gitignore` tapi jangan hapus saat update:

```bash
# Pastikan tidak ada yang menghapus wa-sessions
ls -la artifacts/api-server/wa-sessions/
```

### Halaman frontend tidak termuat (404)

```bash
# VPS — pastikan konfigurasi Nginx sudah benar
sudo nginx -t
sudo systemctl reload nginx

# cPanel — pastikan .htaccess ada dan file frontend sudah disalin
ls ~/public_html/index.html
cat ~/public_html/.htaccess
```

### QR Code tidak muncul (SSE bermasalah)

Nginx perlu konfigurasi khusus untuk SSE (Server-Sent Events). Pastikan bagian `location /api/` memiliki:

```nginx
proxy_buffering off;
proxy_cache off;
proxy_read_timeout 300s;
```

---

## Catatan Penting

1. **Ganti password default** `admin@example.com / password123` segera setelah login pertama
2. **Backup rutin** untuk folder `wa-sessions/` dan database PostgreSQL
3. **HTTPS wajib** untuk produksi — gunakan Certbot (VPS) atau SSL cPanel
4. **Firewall** — buka hanya port 80 dan 443 untuk publik; port 8080 hanya untuk localhost
5. **cPanel shared hosting** dengan resource terbatas mungkin tidak stabil untuk banyak device WhatsApp aktif secara bersamaan; VPS lebih direkomendasikan untuk penggunaan skala besar

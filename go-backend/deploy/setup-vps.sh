#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────
# WaGataway — Provisioning VPS (Ubuntu/Debian)
# Menyiapkan VPS baru: install Docker, firewall, lalu deploy stack production.
#
# Jalankan sebagai root (atau user dengan sudo):
#   curl -fsSL https://raw.githubusercontent.com/Aldi1963/wagataway/main/go-backend/deploy/setup-vps.sh | bash
# atau clone repo dulu lalu:
#   sudo bash go-backend/deploy/setup-vps.sh
# ─────────────────────────────────────────────────────────────────────────
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/Aldi1963/wagataway.git}"
APP_DIR="${APP_DIR:-/opt/wagataway}"
BRANCH="${BRANCH:-main}"

log()  { printf '\033[1;32m▶ %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m! %s\033[0m\n' "$*"; }
die()  { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "Jalankan sebagai root (pakai sudo)."

# ── 1. Update sistem ──────────────────────────────────────────────────────
log "Update paket sistem..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq ca-certificates curl git ufw

# ── 2. Install Docker Engine + Compose plugin ────────────────────────────
if ! command -v docker >/dev/null 2>&1; then
  log "Install Docker..."
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc || \
    curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  . /etc/os-release
  DISTRO_ID="$ID"; [ "$DISTRO_ID" = "ubuntu" ] || DISTRO_ID="debian"
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
https://download.docker.com/linux/${DISTRO_ID} ${VERSION_CODENAME} stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable --now docker
else
  log "Docker sudah terpasang — skip."
fi

# ── 3. Firewall (UFW) ────────────────────────────────────────────────────
log "Konfigurasi firewall (izinkan SSH, HTTP, HTTPS)..."
ufw allow OpenSSH   >/dev/null 2>&1 || ufw allow 22/tcp   >/dev/null 2>&1 || true
ufw allow 80/tcp    >/dev/null 2>&1 || true
ufw allow 443/tcp   >/dev/null 2>&1 || true
ufw --force enable  >/dev/null 2>&1 || true

# ── 4. Clone / update repo ───────────────────────────────────────────────
if [ -d "$APP_DIR/.git" ]; then
  log "Update repo di $APP_DIR..."
  git -C "$APP_DIR" fetch --depth 1 origin "$BRANCH"
  git -C "$APP_DIR" checkout "$BRANCH"
  git -C "$APP_DIR" reset --hard "origin/$BRANCH"
else
  log "Clone repo ke $APP_DIR..."
  git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
fi

cd "$APP_DIR/go-backend"

# ── 5. Siapkan file .env ─────────────────────────────────────────────────
if [ ! -f deploy/.env ]; then
  cp deploy/.env.production.example deploy/.env
  # Generate secret otomatis
  JWT=$(openssl rand -hex 32)
  DBPASS=$(openssl rand -base64 24 | tr -d '/+=' | head -c 24)
  sed -i "s#^JWT_SECRET=.*#JWT_SECRET=${JWT}#" deploy/.env
  sed -i "s#^POSTGRES_PASSWORD=.*#POSTGRES_PASSWORD=${DBPASS}#" deploy/.env
  warn "File deploy/.env dibuat dengan JWT_SECRET & POSTGRES_PASSWORD acak."
  warn "EDIT deploy/.env sekarang: isi DOMAIN, TLS_EMAIL, dan API key sebelum lanjut."
  warn "  nano $APP_DIR/go-backend/deploy/.env"
  echo
  read -r -p "Sudah selesai edit deploy/.env? Lanjut deploy sekarang? [y/N] " ans
  [ "${ans:-N}" = "y" ] || [ "${ans:-N}" = "Y" ] || { log "Berhenti. Jalankan lagi script ini setelah edit .env."; exit 0; }
else
  log "deploy/.env sudah ada — pakai yang ada."
fi

# ── 6. Build & jalankan ──────────────────────────────────────────────────
log "Build & start stack production..."
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env up -d --build

log "Selesai! Cek status: docker compose -f $APP_DIR/go-backend/deploy/docker-compose.prod.yml ps"
DOMAIN_SET=$(grep -E '^DOMAIN=' deploy/.env | cut -d= -f2)
log "Aplikasi akan tersedia di: https://${DOMAIN_SET}"
log "Pastikan DNS domain sudah mengarah ke IP VPS ini agar HTTPS otomatis aktif."

#!/bin/bash
# ============================================================
# Auto-Start PM2 saat Server Reboot — WA Gateway
# Daftarkan ke cron dengan @reboot:
#   @reboot /bin/bash ~/wagateway/scripts/cron/start-pm2.sh
# ============================================================

LOG_FILE=~/logs/wa-gateway-startup.log

mkdir -p ~/logs

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Server reboot terdeteksi. Menunggu sistem stabil..." >> "$LOG_FILE"

# Tunggu 30 detik agar PostgreSQL dan jaringan siap
sleep 30

# ── Load NVM ───────────────────────────────────────────────
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

if ! command -v pm2 &> /dev/null; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR — PM2 tidak ditemukan. Install dengan: npm install -g pm2" >> "$LOG_FILE"
  exit 1
fi

# ── Cek apakah PM2 sudah berjalan ─────────────────────────
if pm2 list | grep -q "wa-gateway-api"; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] PM2 sudah berjalan, skip." >> "$LOG_FILE"
  exit 0
fi

# ── Start PM2 dari ecosystem config ───────────────────────
ECOSYSTEM_FILE="$HOME/wagateway/ecosystem.config.cjs"

if [ ! -f "$ECOSYSTEM_FILE" ]; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR — ecosystem.config.cjs tidak ditemukan di $ECOSYSTEM_FILE" >> "$LOG_FILE"
  exit 1
fi

pm2 start "$ECOSYSTEM_FILE" >> "$LOG_FILE" 2>&1
pm2 save >> "$LOG_FILE" 2>&1

echo "[$(date '+%Y-%m-%d %H:%M:%S')] PM2 berhasil distart." >> "$LOG_FILE"

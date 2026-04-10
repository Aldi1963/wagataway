#!/bin/bash
# ============================================================
# Health Check & Auto-Restart PM2 — WA Gateway
# Jalankan via cron setiap 5 menit:
#   */5 * * * * /bin/bash ~/wagateway/scripts/cron/health-check.sh
# ============================================================

APP_NAME="wa-gateway-api"
API_PORT=8090           # Sesuaikan dengan PORT di ecosystem.config.cjs
LOG_FILE=~/logs/wa-gateway-health.log
MAX_LOG_SIZE=1048576    # 1 MB — rotate jika lebih besar

# ── Buat direktori log jika belum ada ──────────────────────
mkdir -p ~/logs

# ── Rotate log jika terlalu besar ──────────────────────────
if [ -f "$LOG_FILE" ] && [ "$(stat -c%s "$LOG_FILE" 2>/dev/null || echo 0)" -gt "$MAX_LOG_SIZE" ]; then
  mv "$LOG_FILE" "${LOG_FILE}.old"
fi

TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

# ── Cek apakah API server merespons ────────────────────────
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  --max-time 10 \
  "http://127.0.0.1:${API_PORT}/api/auth/me" 2>/dev/null)

if [ "$HTTP_STATUS" = "401" ] || [ "$HTTP_STATUS" = "200" ]; then
  # 401 = server aktif tapi perlu auth — ini NORMAL
  echo "[$TIMESTAMP] OK — API server berjalan normal (HTTP $HTTP_STATUS)" >> "$LOG_FILE"
  exit 0
fi

# ── API tidak merespons — coba restart PM2 ─────────────────
echo "[$TIMESTAMP] WARNING — API server tidak merespons (HTTP $HTTP_STATUS). Mencoba restart..." >> "$LOG_FILE"

export NVM_DIR="$HOME/.nvm"
# shellcheck disable=SC1091
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

if command -v pm2 &> /dev/null; then
  pm2 restart "$APP_NAME" >> "$LOG_FILE" 2>&1
  sleep 5

  # Verifikasi setelah restart
  HTTP_STATUS_AFTER=$(curl -s -o /dev/null -w "%{http_code}" \
    --max-time 10 \
    "http://127.0.0.1:${API_PORT}/api/auth/me" 2>/dev/null)

  if [ "$HTTP_STATUS_AFTER" = "401" ] || [ "$HTTP_STATUS_AFTER" = "200" ]; then
    echo "[$TIMESTAMP] RECOVERED — API server berhasil direstart (HTTP $HTTP_STATUS_AFTER)" >> "$LOG_FILE"
  else
    echo "[$TIMESTAMP] ERROR — API server masih tidak merespons setelah restart (HTTP $HTTP_STATUS_AFTER)" >> "$LOG_FILE"
  fi
else
  echo "[$TIMESTAMP] ERROR — PM2 tidak ditemukan. Pastikan NVM dan PM2 sudah terinstall." >> "$LOG_FILE"
fi

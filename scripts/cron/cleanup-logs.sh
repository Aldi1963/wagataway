#!/bin/bash
# ============================================================
# Pembersihan Log Lama — WA Gateway
# Jalankan via cron setiap tanggal 1 jam 04:00:
#   0 4 1 * * /bin/bash ~/wagateway/scripts/cron/cleanup-logs.sh
# ============================================================

LOG_DIR=~/logs
PM2_LOG_DIR=~/.pm2/logs
KEEP_DAYS=30
LOG_FILE="${LOG_DIR}/cleanup.log"

mkdir -p "$LOG_DIR"

TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
echo "[$TIMESTAMP] Memulai pembersihan log..." >> "$LOG_FILE"

# ── Hapus log aplikasi lama ────────────────────────────────
if [ -d "$LOG_DIR" ]; then
  DELETED_APP=$(find "$LOG_DIR" -name "*.log.old" -mtime +"$KEEP_DAYS" -delete -print | wc -l)
  echo "[$TIMESTAMP] Log aplikasi lama dihapus: $DELETED_APP file" >> "$LOG_FILE"
fi

# ── Rotate log PM2 ────────────────────────────────────────
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

if command -v pm2 &> /dev/null; then
  pm2 flush wa-gateway-api >> "$LOG_FILE" 2>&1
  echo "[$TIMESTAMP] PM2 logs di-flush" >> "$LOG_FILE"
fi

# ── Hapus log PM2 lama ─────────────────────────────────────
if [ -d "$PM2_LOG_DIR" ]; then
  DELETED_PM2=$(find "$PM2_LOG_DIR" -name "*.log" -size +10M -delete -print | wc -l)
  echo "[$TIMESTAMP] Log PM2 besar dihapus: $DELETED_PM2 file" >> "$LOG_FILE"
fi

echo "[$TIMESTAMP] Pembersihan selesai." >> "$LOG_FILE"

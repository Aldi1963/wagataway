#!/bin/bash
# ============================================================
# Backup Sesi WhatsApp (Baileys) — WA Gateway
# Jalankan via cron setiap Minggu jam 03:00:
#   0 3 * * 0 /bin/bash ~/wagateway/scripts/cron/backup-sessions.sh
# ============================================================

APP_DIR=~/wagateway
SESSIONS_DIR="${APP_DIR}/artifacts/api-server/wa-sessions"
BACKUP_DIR=~/backups/wa-sessions
KEEP_WEEKS=4    # Simpan 4 backup terakhir (1 bulan)
LOG_FILE=~/logs/wa-gateway-backup.log

mkdir -p "$BACKUP_DIR"
mkdir -p ~/logs

TIMESTAMP=$(date '+%Y-%m-%d_%H-%M-%S')
BACKUP_FILE="${BACKUP_DIR}/wa_sessions_${TIMESTAMP}.tar.gz"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Memulai backup sesi WhatsApp..." >> "$LOG_FILE"

if [ ! -d "$SESSIONS_DIR" ]; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Direktori sesi tidak ditemukan: $SESSIONS_DIR" >> "$LOG_FILE"
  exit 0
fi

SESSION_COUNT=$(find "$SESSIONS_DIR" -mindepth 1 -maxdepth 1 -type d | wc -l)

if [ "$SESSION_COUNT" -eq 0 ]; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Tidak ada sesi aktif untuk di-backup." >> "$LOG_FILE"
  exit 0
fi

tar -czf "$BACKUP_FILE" -C "$(dirname "$SESSIONS_DIR")" "$(basename "$SESSIONS_DIR")" 2>/dev/null

if [ $? -eq 0 ]; then
  SIZE=$(du -sh "$BACKUP_FILE" | cut -f1)
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Backup sesi berhasil: $BACKUP_FILE ($SESSION_COUNT device, $SIZE)" >> "$LOG_FILE"
else
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR — Backup sesi gagal!" >> "$LOG_FILE"
  rm -f "$BACKUP_FILE"
  exit 1
fi

# ── Hapus backup lama (lebih dari KEEP_WEEKS minggu) ───────
KEEP_DAYS=$(( KEEP_WEEKS * 7 ))
DELETED=$(find "$BACKUP_DIR" -name "wa_sessions_*.tar.gz" -mtime +"$KEEP_DAYS" -delete -print | wc -l)
if [ "$DELETED" -gt 0 ]; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Menghapus $DELETED backup sesi lama" >> "$LOG_FILE"
fi

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Backup sesi selesai." >> "$LOG_FILE"

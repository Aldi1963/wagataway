#!/bin/bash
# ============================================================
# Backup Database PostgreSQL — WA Gateway
# Jalankan via cron setiap hari jam 02:00:
#   0 2 * * * /bin/bash ~/wagateway/scripts/cron/backup-db.sh
# ============================================================

# ── Konfigurasi — sesuaikan dengan setup Anda ──────────────
DB_NAME="cpanelusername_wagateway"     # Nama database PostgreSQL
DB_USER="cpanelusername_wagw"           # User PostgreSQL
DB_HOST="localhost"
DB_PORT="5432"
BACKUP_DIR=~/backups/database
KEEP_DAYS=7     # Hapus backup lebih dari 7 hari yang lalu
LOG_FILE=~/logs/wa-gateway-backup.log

# Atau gunakan DATABASE_URL langsung (isi salah satu):
# DATABASE_URL="postgresql://user:password@localhost:5432/database"

# ── Setup ──────────────────────────────────────────────────
mkdir -p "$BACKUP_DIR"
mkdir -p ~/logs

TIMESTAMP=$(date '+%Y-%m-%d_%H-%M-%S')
BACKUP_FILE="${BACKUP_DIR}/db_backup_${TIMESTAMP}.sql.gz"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Memulai backup database..." >> "$LOG_FILE"

# ── Jalankan pg_dump ───────────────────────────────────────
if [ -n "$DATABASE_URL" ]; then
  pg_dump "$DATABASE_URL" | gzip > "$BACKUP_FILE"
else
  PGPASSWORD="$DB_PASS" pg_dump \
    -h "$DB_HOST" \
    -p "$DB_PORT" \
    -U "$DB_USER" \
    -d "$DB_NAME" \
    --no-password \
    | gzip > "$BACKUP_FILE"
fi

if [ $? -eq 0 ]; then
  SIZE=$(du -sh "$BACKUP_FILE" | cut -f1)
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Backup berhasil: $BACKUP_FILE ($SIZE)" >> "$LOG_FILE"
else
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR — Backup gagal!" >> "$LOG_FILE"
  rm -f "$BACKUP_FILE"
  exit 1
fi

# ── Hapus backup lama ──────────────────────────────────────
DELETED=$(find "$BACKUP_DIR" -name "db_backup_*.sql.gz" -mtime +"$KEEP_DAYS" -delete -print | wc -l)
if [ "$DELETED" -gt 0 ]; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Menghapus $DELETED backup lama (>$KEEP_DAYS hari)" >> "$LOG_FILE"
fi

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Backup selesai." >> "$LOG_FILE"

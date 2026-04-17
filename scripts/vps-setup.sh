#!/bin/bash

# WA Gateway SaaS - VPS Auto Installer
# Optimized for Ubuntu 20.04/22.04/24.04

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}===============================================${NC}"
echo -e "${GREEN}   WA Gateway SaaS - VPS Auto Installer      ${NC}"
echo -e "${GREEN}===============================================${NC}"

# Check if running as root
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}Silakan jalankan script ini sebagai root (sudo bash script.sh)${NC}"
  exit 1
fi

# Get the directory of the script
REPO_URL="https://github.com/Aldi1963/wagataway.git"
APP_DIR="/home/wagateway/app"

echo -e "${YELLOW}[0/8] Preparing Project Directory...${NC}"
mkdir -p /home/wagateway
if [ ! -d "$APP_DIR" ]; then
    git clone $REPO_URL $APP_DIR
fi
cd $APP_DIR

LOG_FILE="$APP_DIR/install.log"

echo -e "${YELLOW}[1/8] Update system & dependencies...${NC}"
apt update && apt upgrade -y
apt install -y curl git nginx postgresql postgresql-contrib build-essential

# Install Node.js 22
if ! command -v node &> /dev/null || [[ $(node -v) != v22* ]]; then
    echo -e "${YELLOW}Installing Node.js 22...${NC}"
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
    apt install -y nodejs
fi

# Install pnpm & pm2
if ! command -v pnpm &> /dev/null; then
    echo -e "${YELLOW}Installing pnpm...${NC}"
    npm install -g pnpm
fi

if ! command -v pm2 &> /dev/null; then
    echo -e "${YELLOW}Installing PM2...${NC}"
    npm install -g pm2
fi

echo -e "${GREEN}✓ Dependencies installed.${NC}"

echo -e "${YELLOW}[2/8] Configuring PostgreSQL...${NC}"
# Default credentials
DB_NAME="wagateway"
DB_USER="wagateway"
DB_PASS=$(openssl rand -base64 12 | tr -d '/+')

# Check if database already exists
DB_EXISTS=$(sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'") || true

if [ "$DB_EXISTS" != "1" ]; then
    sudo -u postgres psql -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASS';"
    sudo -u postgres psql -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;"
    sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;"
    echo -e "${GREEN}✓ Database created.${NC}"
else
    echo -e "${YELLOW}! Database already exists. Skipping database creation.${NC}"
    echo -e "Silakan masukkan password database yang sudah ada jika diminta nanti."
fi

echo -e "${YELLOW}[3/8] Setting up Environment Variables...${NC}"
if [ ! -f ".env" ]; then
    cp .env.example .env
    
    # Generate random secret
    SECRET=$(node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")
    
    # Update .env with database credentials and secret
    sed -i "s|DATABASE_URL=.*|DATABASE_URL=postgresql://$DB_USER:$DB_PASS@localhost:5432/$DB_NAME|g" .env
    sed -i "s|SESSION_SECRET=.*|SESSION_SECRET=$SECRET|g" .env
    
    echo -e "${GREEN}✓ .env file created.${NC}"
else
    echo -e "${YELLOW}! .env already exists. Skipping.${NC}"
fi

echo -e "${YELLOW}[4/8] Installing project dependencies...${NC}"
pnpm install --frozen-lockfile

echo -e "${YELLOW}[5/8] Building project...${NC}"
# Build everything
pnpm run build

echo -e "${YELLOW}[6/8] Running database migrations...${NC}"
# Use the freshly created .env for the push command
# We need to export DATABASE_URL so drizzle can see it
export $(grep -v '^#' .env | xargs)
pnpm --filter @workspace/db run push

echo -e "${YELLOW}[7/8] Configuring PM2...${NC}"
mkdir -p logs
# Update ecosystem config path if needed
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup | tail -n 1 | bash # Automate pm2 startup command

echo -e "${YELLOW}[8/8] Configuring Nginx...${NC}"
DOMAIN_NAME="localhost"
read -p "Masukkan domain Anda (kosongkan jika belum ada): " USER_DOMAIN
if [ ! -z "$USER_DOMAIN" ]; then
    DOMAIN_NAME=$USER_DOMAIN
fi

cat > /etc/nginx/sites-available/wagateway << EOF
server {
    listen 80;
    server_name $DOMAIN_NAME;

    root $APP_DIR/artifacts/wa-gateway/dist/public;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        
        # SSE Support
        proxy_buffering off;
        proxy_cache off;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
EOF

if [ ! -f "/etc/nginx/sites-enabled/wagateway" ]; then
    ln -s /etc/nginx/sites-available/wagateway /etc/nginx/sites-enabled/
fi

# Remove default nginx site if exists
if [ -f "/etc/nginx/sites-enabled/default" ]; then
    rm /etc/nginx/sites-enabled/default
fi

nginx -t && systemctl reload nginx

# --- AUTOMATED SSL WITH CERTBOT ---
if [ "$DOMAIN_NAME" != "localhost" ]; then
    echo -e "${YELLOW}Konfigurasi SSL (HTTPS) untuk $DOMAIN_NAME...${NC}"
    read -p "Masukkan email untuk notifikasi SSL (penting): " USER_EMAIL
    
    if [ ! -z "$USER_EMAIL" ]; then
        apt install -y certbot python3-certbot-nginx
        
        # Check if domain points to this IP before trying certbot
        # This is a basic check. Certbot will do its own.
        echo -e "${YELLOW}Menghubungi Let's Encrypt...${NC}"
        certbot --nginx -d $DOMAIN_NAME --non-interactive --agree-tos -m $USER_EMAIL --redirect || {
            echo -e "${RED}Gagal memasang SSL. Pastikan domain $DOMAIN_NAME sudah diarahkan ke IP VPS ini.${NC}"
            echo -e "Anda bisa mencoba lagi nanti dengan perintah: sudo certbot --nginx -d $DOMAIN_NAME"
        }
    else
        echo -e "${YELLOW}Email kosong. Melewati instalasi SSL otomatis.${NC}"
    fi
fi

echo -e "${GREEN}===============================================${NC}"
echo -e "${GREEN}   INSTALASI SELESAI!                        ${NC}"
echo -e "${GREEN}===============================================${NC}"
echo -e "Akses web: ${YELLOW}http://$DOMAIN_NAME${NC}"
echo -e "Login Admin:"
echo -e "Email: ${YELLOW}admin@example.com${NC}"
echo -e "Password: ${YELLOW}password123${NC}"
echo -e ""
echo -e "${YELLOW}Informasi Database:${NC}"
echo -e "User: $DB_USER"
echo -e "Pass: $DB_PASS"
echo -e "DB: $DB_NAME"
echo -e ""
echo -e "${RED}PENTING: Segera ganti password admin setelah login!${NC}"
echo -e "Password DB anda disimpan di file ${YELLOW}$APP_DIR/.env${NC}"
echo -e "Folder aplikasi: ${YELLOW}$APP_DIR${NC}"
echo -e "==============================================="

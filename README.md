# 🚀 SaaS WhatsApp Gateway Pro — v1.5.0 Premium

Platform WhatsApp Gateway SaaS (Software as a Service) paling lengkap, cepat, dan aman untuk mengelola bisnis Anda melalui WhatsApp. Dibangun dengan desain **Zen Mode Premium** dan teknologi mutakhir untuk menangani ribuan pesan setiap harinya dengan kehandalan tinggi.

![Banner](https://images.unsplash.com/photo-1611746872915-64382b5c76da?auto=format&fit=crop&q=80&w=1200&h=400)

## ✨ Fitur Unggulan (Premium Edition)

### 🤖 AI Knowledge Base (CS Bot)
*   **Custom Training**: Latih bot Anda dengan ribuan data pengetahuan (file/teks).
*   **Prompt Engineering**: Atur kepribadian bot anda agar menjawab layaknya Customer Service profesional.
*   **Context Aware**: AI yang bisa membaca konteks percakapan untuk jawaban yang akurat.

### 📢 Blast Interaktif & Massal
*   **Interactive Buttons**: Kirim pesan dengan tombol Quick Reply, Link, atau Panggilan Telepon.
*   **Single Select Lists**: Menu list yang elegan untuk pilihan produk/layanan.
*   **Excel/CSV Support**: Import ribuan kontak langsung dari spreadsheet secara instan.
*   **Smart Personalization**: Gunakan placeholder `{nama}` atau variabel lain untuk kedekatan personal.

### 🛡️ Anti-Banned & Security
*   **Typing Simulation**: Simulasi status "Mengetik..." sebelum pesan terkirim.
*   **Random Delay**: Pengiriman pesan dengan jeda waktu acak yang bisa diatur.
*   **Rotation Device**: Rotasi otomatis antar banyak nomor WA untuk membagi beban pesan.
*   **Blacklist Management**: Hindari pengiriman ke nomor-nomor tertentu secara otomatis.

### 🎨 Zen Design Dashboard
*   **Premium UI**: Antarmuka modern dengan Glassmorphism, Dark Mode ready, dan Smooth Transitions.
*   **Mobile Responsive**: Kelola bisnis Anda dari HP maupun Desktop dengan kenyamanan yang sama.
*   **Live Statistic**: Widget real-time untuk memantau trafik pesan masuk dan keluar.

## 🛠️ Tech Stack

*   **Frontend**: React.js 18, Vite, TailwindCSS, Framer Motion, ShadcnUI.
*   **Backend**: Node.js, Express.js (TypeScript), Multer.
*   **Database**: PostgreSQL, Drizzle ORM (Type-safe & Fast).
*   **WA Library**: Baileys (Library WA paling stabil & support Multi-Device).

## 🚀 Instalasi Lokal

1.  **Clone Repository**:
    ```bash
    git clone https://github.com/Aldi1963/wagataway.git
    cd wagataway
    ```

2.  **Install Dependencies**:
    ```bash
    pnpm install
    ```

3.  **Konfigurasi Database**:
    Edit `.env` di folder `artifacts/api-server/`:
    ```env
    DATABASE_URL=postgresql://user:password@localhost:5432/dbname
    PORT=5000
    ```

4.  **Jalankan Aplikasi**:
    ```bash
    # Terminal 1: Backend
    cd artifacts/api-server && pnpm dev
    
    # Terminal 2: Frontend
    cd artifacts/wa-gateway && pnpm dev
    ```

## 🌐 Deployment VPS (aaPanel / Ubuntu)

### 1. Persiapan Environment
```bash
sudo apt update && sudo apt upgrade -y
curl -fsSL https://get.pnpm.io/install.sh | sh -
npm install -g pm2
```

### 2. Build & Start (Production)
```bash
# Build Frontend
cd artifacts/wa-gateway && pnpm build

# Build & Start Backend
cd artifacts/api-server
pnpm build
pm2 start dist/index.mjs --name "wa-saas-gateway"
pm2 save
```

### 3. Nginx Reverse Proxy
Arahkan domain Anda ke port `5000` melalui Nginx atau menu Website di aaPanel. Gunakan SSL dari Let's Encrypt untuk keamanan maksimal.

## 🖥️ Roadmap Update (v1.5.0+)
- [x] **Interactive Messaging support** (Buttons & Lists).
- [x] **Excel/CSV bulk import contact**.
- [x] **Advanced AI Knowledge Base system**.
- [ ] Integration with Webview for Custom App.
- [ ] Multi-Admin Agency support.

---
Developed with ❤️ by **Aldi1963** for better business connectivity.

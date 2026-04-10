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
*   **Database**: PostgreSQL, Drizzle ORM.
*   **WA Library**: Baileys (Multi-Device support).

## 🚀 Instalasi Lokal
1.  **Clone & Install**:
    ```bash
    git clone https://github.com/Aldi1963/wagataway.git
    cd wagataway && pnpm install
    ```
2.  **Config**: Edit `.env` di `artifacts/api-server/`.
3.  **Run**: `cd artifacts/api-server && pnpm dev` (Backend) & `cd artifacts/wa-gateway && pnpm dev` (Frontend).

## 🖥️ Deployment via aaPanel (Rekomendasi)

1.  **Akses aaPanel**: Masuk ke dashboard aaPanel Anda.
2.  **App Store**: Cari dan Install **"Node.js project manager"**.
3.  **Versi Node**: Gunakan Node.js v18 atau v20 di dalam Manager tersebut.
4.  **Tambah Proyek**:
    *   Klik **Website** → **Node.js project** → **Add Node.js Project**.
    *   **Project directory**: Arahkan ke folder `artifacts/api-server`.
    *   **Run command**: `pnpm build && pnpm start`.
    *   **Project port**: `5000`.
5.  **Setting Domain & SSL**:
    *   Klik **Website target** (Hubungkan domain Anda).
    *   Pasang SSL via menu **SSL** Let's Encrypt di aaPanel.
6.  **Environment**: Edit file `.env` di folder project melalui menu **Files** aaPanel.

## 🌐 Deployment VPS (Manual / Ubuntu)

### 1. Persiapan Environment
```bash
sudo apt update && sudo apt upgrade -y
curl -fsSL https://get.pnpm.io/install.sh | sh -
npm install -g pm2
```

### 2. Build & Start
```bash
# Build Frontend
cd artifacts/wa-gateway && pnpm build

# Build & Start Backend
cd artifacts/api-server
pnpm build
pm2 start dist/index.mjs --name "wa-saas"
pm2 save
```

### 3. Nginx Proxy
Arahkan domain ke port `5000`.

## 🖥️ Roadmap Update (v1.5.0+)
- [x] **Interactive Messaging support** (Buttons & Lists).
- [x] **Excel/CSV bulk import contact**.
- [x] **Advanced AI Knowledge Base system**.
- [ ] Integration with Webview for Custom App.
- [ ] Multi-Admin Agency support.

---
Developed with ❤️ by **Aldi1963**

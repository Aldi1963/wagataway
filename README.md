# 🚀 SaaS WhatsApp Gateway Pro — v1.6.0 Premium Edition

Platform WhatsApp Gateway SaaS (Software as a Service) paling lengkap, cepat, dan aman untuk mengelola bisnis Anda melalui WhatsApp. Dibangun dengan desain **Zen Mode Premium** dan teknologi mutakhir untuk menangani ribuan pesan setiap harinya dengan kehandalan tinggi.

![Banner](https://images.unsplash.com/photo-1611746872915-64382b5c76da?auto=format&fit=crop&q=80&w=1200&h=400)

## ✨ Fitur Unggulan (Premium Edition)

### 🤖 AI Knowledge Base & CS Bot
*   **AI Voice-to-Text (New!)**: Transkripsi otomatis pesan suara (voice notes) pelanggan secara real-time menggunakan OpenAI Whisper.
*   **AI Conversation Summary (New!)**: Rangkuman isi percakapan panjang secara otomatis untuk membantu agen memahami konteks masalah dengan cepat.
*   **Multi-Provider AI**: Integrasi OpenAI (GPT-4o) & Anthropic (Claude 3.5) untuk jawaban yang cerdas.
*   **Custom Training**: Latih bot Anda dengan website scraping, file PDF/Doc, atau FAQ manual.
*   **Automatic API Billing**: Penggunaan API Key admin secara otomatis untuk user dengan paket tertentu tanpa perlu input key mandiri.
*   **Human-in-the-loop**: Fitur unik di mana bot otomatis berhenti (*pause*) jika admin mengambil alih percakapan di Dashboard Live Chat.

### 💬 Live Chat & Omnichannel Inbox
*   **Real-time Dashboard**: Kelola semua percakapan dari semua perangkat dalam satu inbox terpusat.
*   **Media Transcription Display**: Hasil transkripsi pesan suara muncul langsung di bawah bubble chat audio.
*   **Agent Management**: Penugasan chat ke agen tertentu, labelisasi chat (Komplain, Sales, dll).
*   **Internal Notes**: Berkolaborasi dengan tim menggunakan catatan internal yang tidak dapat dilihat pelanggan.
*   **SLA Tracking**: Pantau waktu respons tim untuk menjaga kualitas layanan pelanggan.

### 🚀 Features & Capabilities
*   **AI Smart Agent**: Chatbot berbasis OpenAI yang mampu berinteraksi secara natural, memahami konteks produk, dan didukung fitur *Human-in-the-loop* (Admin bisa mengambil alih chat kapan saja).
*   **Omni-Device Management**: Hubungkan banyak nomor WhatsApp sekaligus dengan sistem rotasi cerdas (*Smart Load Balancing*) untuk keamanan akun.
*   **PWA Ready**: Dashboard progresif yang bisa diinstal di ponsel (Android/iOS) dengan performa loading instan berkat *lazy loading* dan *code splitting*.
*   **Sistem Keagenan (Reseller)**: Fitur manajemen reseller lengkap dengan limitasi kuota (perangkat, pesan, kontak) dan kontrol status akun (*real-time suspension*).
*   **Interactive Messaging**: Kirim pesan dengan Button, List Menu, Template Lokasi, dan Media Interaktif yang meningkatkan interaksi pelanggan.
*   **Commerce Flow**: Alur belanja otomatis di WhatsApp terintegrasi dengan RajaOngkir (disertai sistem *fail-safe* otomatis jika API eksternal sibuk).
*   **Advanced Analytics**: Visualisasi grafik interaktif, Heatmap jam sibuk, dan laporan performa agen per perangkat.
*   **Security First**: Password dienkripsi dengan argon2/scrypt, dukungan 2FA, dan Rate Limiting sistematis untuk perlindungan server.

## 🛠️ Tech Stack
*   **Frontend**: React.js 18, Vite, TailwindCSS, Framer Motion, ShadcnUI.
*   **Backend**: Node.js, Express.js (TypeScript), Baileys WA Socket.
*   **Database**: PostgreSQL, Drizzle ORM.
*   **Caching & Optimization**: Vite PWA, Service Workers, Manual Chunking.
*   **AI Engine**: OpenAI API (GPT-4o/o1), Whisper API for Audio.

---

## 🚀 Panduan Instalasi Rinci

### 📋 Prasyarat
- Node.js versi 20.x ke atas.
- PostgreSQL Database.
- PNPM (direkomendasikan) atau NPM.

### 💻 1. Instalasi Lokal (Development)
1.  **Clone Repositori**:
    ```bash
    git clone https://github.com/Aldi1963/wagataway.git
    cd wagataway
    ```
2.  **Install Dependensi**:
    ```bash
    pnpm install
    ```
3.  **Konfigurasi Database**:
    - Buat database PostgreSQL di lokal Anda.
    - Copy file `.env.example` (jika ada) atau buat file `.env` baru di `artifacts/api-server/`.
    - Isi `DATABASE_URL=postgresql://user:pass@localhost:5432/dbname`.
4.  **Push Schema ke Database**:
    ```bash
    pnpm --filter @workspace/db run push
    ```
5.  **Jalankan Project**:
    - **API Server**: `cd artifacts/api-server && npm run dev`
    - **Frontend**: `cd artifacts/wa-gateway && npm run dev`

---

### 🌐 2. Deployment ke Hosting (cPanel / VPS)

#### Step A: Persiapan File
1.  Compress folder `artifacts/` dan file di root ke dalam satu ZIP (kecuali `node_modules`).
2.  Upload ke File Manager cPanel (rekomendasi: di luar `public_html`, misal di folder `/home/user/wagateway`).
3.  Extract file tersebut.

#### Step B: Setup Node.js App di cPanel
1.  Buka menu **Setup Node.js App** -> **Create Application**.
2.  Pilih Versi Node.js (20+) dan mode **Production**.
3.  **Application root**: `wagateway`
4.  **Application URL**: domain-anda.com
5.  Klik **Create**, lalu **Stop App** sementara untuk konfigurasi.

#### Step C: Database & Env
1.  Buat database PostgreSQL di menu **PostgreSQL Databases** cPanel.
2.  Edit file `artifacts/api-server/.env` dan masukan `DATABASE_URL` PostgreSQL Anda.
3.  Masukan `SESSION_SECRET` dengan string acak panjang.

#### Step D: Build & Start
1.  Masuk ke **Terminal** cPanel.
2.  Jalankan perintah virtual environment Node.js (ada di halaman Setup Node.js App).
3.  Install pnpm & build project:
    ```bash
    npm install -g pnpm
    cd ~/wagateway
    pnpm install
    cd artifacts/wa-gateway && pnpm build
    cd ../api-server && pnpm build
    ```
4.  Jalankan API dengan PM2:
    ```bash
    pm2 start dist/index.mjs --name "wa-api"
    pm2 save
    ```

---

## 🖥️ Roadmap Progress
- [x] **Interactive Messaging support** (Buttons & Lists).
- [x] **Advanced AI Knowledge Base system**.
- [x] **Live Chat & Omnichannel Dashboard**.
- [x] **Automated Order Flow with RajaOngkir**.
- [x] **AI Human-in-the-loop handoff**.
- [x] **AI Voice-to-Text Transcription**.
- [x] **AI Conversation Summarization**.
- [x] **PWA & Mobile Ready Dashboard**.

---

Developed with ❤️ by **Aldi1963**

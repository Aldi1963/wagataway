# 🚀 SaaS WhatsApp Gateway Pro — v1.6.0 Premium Edition

Platform WhatsApp Gateway SaaS (Software as a Service) paling lengkap, cepat, dan aman untuk mengelola bisnis Anda melalui WhatsApp. Dibangun dengan desain **Zen Mode Premium** dan teknologi mutakhir untuk menangani ribuan pesan setiap harinya dengan kehandalan tinggi.

![Banner](https://images.unsplash.com/photo-1611746872915-64382b5c76da?auto=format&fit=crop&q=80&w=1200&h=400)

## ✨ Fitur Unggulan (Premium Edition)

### 🤖 AI Knowledge Base & CS Bot
*   **Multi-Provider AI**: Integrasi OpenAI (GPT-4o) & Anthropic (Claude 3.5) untuk jawaban yang cerdas.
*   **Custom Training**: Latih bot Anda dengan website scraping, file PDF/Doc, atau FAQ manual.
*   **Human-in-the-loop**: Fitur unik di mana bot otomatis berhenti (*pause*) jika admin mengambil alih percakapan di Dashboard Live Chat.
*   **Context Aware**: AI yang mampu memahami alur percakapan panjang untuk jawaban yang lebih akurat.

### 💬 Live Chat & Omnichannel Inbox
*   **Real-time Dashboard**: Kelola semua percakapan dari semua perangkat dalam satu inbox terpusat.
*   **Agent Management**: Penugasan chat ke agen tertentu, labelisasi chat (Komplain, Sales, dll).
*   **Internal Notes**: Berkolaborasi dengan tim menggunakan catatan internal yang tidak dapat dilihat pelanggan.
*   **SLA Tracking**: Pantau waktu respons tim untuk menjaga kualitas layanan pelanggan.

### 🛒 Commerce & Automated Order Flow
*   **WhatsApp Catalog**: Tampilkan list produk dengan gambar, detail, dan harga langsung di WA.
*   **End-to-End Ordering**: Alur pemesanan otomatis dari pemilihan produk hingga pengisian data pengiriman.
*   **Integrasi RajaOngkir**: Perhitungan ongkos kirim otomatis secara real-time berdasarkan alamat pelanggan.
*   **Varian Produk**: Mendukung pilihan varian seperti ukuran, warna, atau tipe produk.

### 📢 Blast Interaktif & Anti-Banned
*   **Interactive Messaging**: Kirim pesan dengan tombol (Quick Reply, Link, Call) dan Single Select Lists Menu.
*   **Smart Rotation**: Rotasi otomatis antar perangkat untuk membagi beban pesan dan meminimalisir risiko banned.
*   **Typing Simulation**: Simulasi status "Mengetik..." yang natural sebelum pesan terkirim.
*   **Excel/CSV Support**: Import ribuan kontak dan variabel personalisasi (seperti `{nama}`) secara instan.

### 🎨 Zen Design Dashboard
*   **Premium UI**: Antarmuka modern dengan Glassmorphism, Dark Mode ready, dan Smooth Transitions.
*   **Mobile Responsive**: Dashboard yang nyaman diakses melalui smartphone maupun Desktop.
*   **Live Statistic**: Visualisasi data real-time untuk memantau trafik pesan masuk, keluar, dan performa agen.

## 🛠️ Tech Stack
*   **Frontend**: React.js 18, Vite, TailwindCSS, Framer Motion, ShadcnUI.
*   **Backend**: Node.js, Express.js (TypeScript), Baileys WA Socket.
*   **Database**: PostgreSQL, Drizzle ORM.
*   **AI Engine**: OpenAI API, Anthropic API, PDF-Parse for knowledge extraction.
*   **Shipment**: RajaOngkir API Integration.

## 🚀 Instalasi Lokal
1.  **Clone & Install**:
    ```bash
    git clone https://github.com/Aldi1963/wagataway.git
    cd wagataway && pnpm install
    ```
2.  **Config**: Edit `.env` di direktori `artifacts/api-server/`.
3.  **Run Dev**: 
    - UI: `cd artifacts/wa-gateway && npm run dev`
    - API: `cd artifacts/api-server && npm run dev`

## 🖥️ Deployment (VPS / Ubuntu)
1.  **Build Frontend**: `cd artifacts/wa-gateway && pnpm build` (Hasil di `artifacts/wa-gateway/dist`).
2.  **Start API**: `cd artifacts/api-server && pnpm build && pm2 start dist/index.mjs --name "wa-saas"`

## 🖥️ Roadmap Progress
- [x] **Interactive Messaging support** (Buttons & Lists).
- [x] **Advanced AI Knowledge Base system**.
- [x] **Live Chat & Omnichannel Dashboard**.
- [x] **Automated Order Flow with RajaOngkir**.
- [x] **AI Human-in-the-loop handoff**.
- [ ] Multi-Admin Agency support.
- [ ] Integration with Mobile WebView Wrapper.

---
Developed with ❤️ by **Aldi1963**

# 🚀 SaaS WhatsApp Gateway Pro — v1.4.0

Platform WhatsApp Gateway SaaS (Software as a Service) paling lengkap, cepat, dan aman untuk mengelola bisnis Anda melalui WhatsApp. Dibangun dengan teknologi modern untuk menangani ribuan pesan setiap harinya.

![Banner](https://images.unsplash.com/photo-1611746872915-64382b5c76da?auto=format&fit=crop&q=80&w=1200&h=400)

## ✨ Fitur Utama

*   **⚡ Multi-Device Management**: Hubungkan banyak nomor WhatsApp dalam satu dashboard admin.
*   **🤖 AI-Powered CS Bot**: Integrasi robot cerdas (GPT-4/Gemini) untuk menjawab pertanyaan pelanggan 24/7.
*   **📢 Blast Pesan Massal**: Kirim ribuan pesan ke pelanggan tanpa hambatan dengan pengaturan jeda (delay) anti-banned.
*   **🛠️ Dashboard Branding**: Kustomisasi Logo, Favicon, dan Riwayat Update langsung dari panel admin.
*   **🔄 Auto Reply Cerdas**: Balasan otomatis berdasarkan kata kunci (Regex) dan jam kerja.
*   **📊 Analitik Real-time**: Pantau statistik pengiriman pesan, persentase keberhasilan, dan penggunaan server.
*   **🔗 API Restful**: Dokumentasi API lengkap untuk integrasi dengan web/apps eksternal.

## 🛠️ Tech Stack

*   **Frontend**: React.js, Vite, TailwindCSS, Lucide Icons, ShadcnUI.
*   **Backend**: Node.js, Express.js, Multer (File Uploads).
*   **Database**: PostgreSQL, Drizzle ORM.
*   **WA Library**: Baileys (High Performance).

## 🚀 Instalasi Lokal (Development)

1.  **Clone Repository**:
    ```bash
    git clone https://github.com/Aldi1963/wagataway.git
    cd wagataway
    ```

2.  **Install Dependencies**:
    ```bash
    pnpm install
    ```

3.  **Konfigurasi Environment**:
    Salin file `.env.example` menjadi `.env` di folder `artifacts/api-server` dan `artifacts/wa-gateway`, lalu sesuaikan `DATABASE_URL` Anda.

4.  **Jalankan Aplikasi**:
    *   **Terminal 1 (Backend)**:
        ```bash
        cd artifacts/api-server
        pnpm dev
        ```
    *   **Terminal 2 (Frontend)**:
        ```bash
        cd artifacts/wa-gateway
        pnpm dev
        ```

## 🔒 Keamanan & Sesi

Proyek ini sudah dilengkapi dengan perlindungan data. File sesi WhatsApp (`wa-sessions`) dan file environment (`.env`) secara otomatis diabaikan oleh Git untuk mencegah kebocoran data.

## 📄 Lisensi

Platform ini merupakan perangkat lunak komersial. Dilarang mendistribusikan ulang tanpa izin tertulis dari pemilik repo.

---
*Developed by Aldi1963*

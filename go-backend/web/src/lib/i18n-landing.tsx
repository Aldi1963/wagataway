// Kamus minimal untuk landing page statis (hanya namespace landing, id).
// Di-generate dari web/src/lib/i18n.tsx — jangan edit manual.
import { createContext, useContext, useState, type ReactNode } from "react";

export type Lang = "id";

const id = {
landing: {
navFeatures: "Fitur",
    navPricing: "Harga",
    navFaq: "FAQ",
    login: "Masuk",
    startFree: "Mulai Gratis",
    tryFree: "Coba Gratis",
    menu: "Menu",
    heroSubtitle: "Kirim pesan WhatsApp secara otomatis.",
    heroArtAlt: "Ilustrasi pengiriman pesan WhatsApp otomatis",
    heroSentToday: "terkirim hari ini",
    heroSentCount: "1.240 pesan",
    heroDelivered: "Terkirim",
    heroWebhookTitle: "Webhook diterima",
    tabSend: "Kirim Pesan",
    tabAutoReply: "Balas Otomatis",
    sendSingleDesc: "Kirim pesan ke 1 nomor tujuan.",
    sendBroadcastDesc: "Kirim pesan ke banyak nomor sekaligus.",
    sendVariableDesc: "Personalisasi isi pesan dengan variable seperti {nama}.",
    sendAttachmentDesc: "Kirim gambar, dokumen PDF/Excel, video, dan audio.",
    sendScheduledTitle: "Terjadwal",
    sendScheduledDesc: "Kirim pesan terjadwal sesuai waktu yang ditentukan.",
    sendRecurringTitle: "Pesan Berulang",
    sendRecurringDesc: "Jadwalkan pesan yang dikirim berulang terus-menerus.",
    sendCsvDesc: "Kirim pesan massal dari file CSV dengan preview.",
    sendFollowUpDesc: "Rangkaian pesan lanjutan otomatis (drip campaign) sesuai jeda waktu.",
    sendSimpleApiDesc: "API kirim pesan yang simpel, satu endpoint untuk semua.",
    replyKeywordDesc: "Membalas pesan berdasarkan keyword tertentu.",
    replyTemplateDesc: "Kirim balasan sesuai template yang tersimpan sekali klik.",
    replyHistoryTitle: "Riwayat Balasan",
    replyHistoryDesc: "Semua balasan otomatis tercatat dan bisa ditinjau.",
    replyNotifTitle: "Notifikasi Device",
    replyNotifDesc: "Dapat pemberitahuan saat device terputus.",
    replyWebhookDesc: "Balas pesan secara dinamis dari sistem Anda sendiri.",
    replyDefaultTitle: "Pesan Default",
    replyDefaultDesc: "Balas otomatis untuk pesan di luar keyword yang dikenal.",
    replyTemplateTitle: "Template Cepat",
    dashContactsTitle: "Simpan Kontak",
    dashContactsDesc: "Menyimpan kontak untuk digunakan di kemudian hari.",
    dashGroupingTitle: "Grouping Kontak",
    dashGroupingDesc: "Kelompokkan kontak untuk pengiriman yang tertarget.",
    dashTemplateTitle: "Template Pesan",
    dashTemplateDesc: "Simpan template pesan untuk dipakai kapan saja.",
    dashCalendarTitle: "Kalender Jadwal",
    dashCalendarDesc: "Lihat semua pesan terjadwal dalam tampilan kalender.",
    dashHistoryTitle: "Riwayat Pesan",
    dashHistoryDesc: "Riwayat pesan yang dikirim melalui layanan kami.",
    dashAnalyticsDesc: "Pantau performa drip campaign per langkah.",
    dashMultiDeviceDesc: "Satu akun bisa mengelola banyak device WhatsApp.",
    dashRealtimeTitle: "Status Real-time",
    dashRealtimeDesc: "Pantau status pengiriman pesan secara real-time.",
    dashLiveChatDesc: "Balas chat pelanggan langsung dari dashboard.",
    advantageKicker: "Kelebihan",
    advantageTitle: "Kenapa WaGataway?",
    advantageDesc: "Beberapa alasan untuk menggunakan WhatsApp API WaGataway.",
    advantage1Title: "Mudah Digunakan",
    advantage1Desc: "Dashboard maupun API-nya sangat mudah dipakai, bahkan untuk non-developer.",
    advantage2Title: "Respon API Cepat",
    advantage2Desc: "API mengeksekusi perintah dengan cepat dan efisien, rata-rata di bawah 100ms.",
    advantage3Title: "Stabil",
    advantage3Desc: "Layanan stabil dan tidak putus-putus, dengan notifikasi saat device terputus.",
    advantage4Title: "Support Responsif",
    advantage4Desc: "Bantuan cepat dan ramah kapan pun Anda butuh, lewat live chat kami.",
    demoKicker: "Demo",
    demoBadge: "Simulasi — tanpa login, tanpa kirim pesan beneran",
    demoTitle: "Coba simulasi pengiriman",
    demoDesc: "Rasakan alur API tanpa daftar dan tanpa mengirim pesan beneran.",
    demoPhoneLabel: "Nomor WhatsApp tujuan",
    demoMessageLabel: "Isi pesan",
    demoSendSim: "Kirim simulasi",
    demoSending: "Mengirim…",
    demoRequest: "Request",
    demoResponse: "Response",
    demoResponseHint: "// Tekan \"{action}\" untuk melihat response",
    devDocsTitle: "Dokumentasi Interaktif",
    devDocsDesc: "Coba setiap endpoint langsung dari halaman dokumentasi.",
    devRestApiDesc: "Endpoint REST lengkap untuk semua fitur.",
    devWebhookDesc: "Terima event pesan masuk dengan log dan retry otomatis.",
    devApiKeyDesc: "Buat dan kelola banyak API key per akun.",
    devSecurityTitle: "Keamanan",
    devSecurityDesc: "Key terisolasi per akun, bisa dinonaktifkan kapan saja.",
    devSpeedTitle: "Kecepatan",
    devSpeedDesc: "Rata-rata respon API di bawah 100ms.",
    integrationsTitle: "Integrasi",
    integrationsDesc: "Terhubung dengan tools favorit Anda.",
    integration1: "Toko Online",
    integration4: "Sistem Kasir",
    integration5: "Aplikasi Absensi",
    integration6: "Notifikasi OTP",
    testimonialKicker: "Testimoni",
    testimonialTitle: "Apa kata mereka?",
    testi1: "Notifikasi order otomatis ke pelanggan bikin toko saya kelihatan profesional. Pemasangannya gampang, cukup scan QR dari HP.",
    testiRole1: "Owner Online Shop",
    testi2: "Fitur broadcast + variable personalisasi juara banget. Satu dashboard bisa kelola 3 nomor sekaligus.",
    testi3: "API-nya simpel dan dokumentasinya jelas, ada fitur coba langsung. Integrasi ke sistem kami selesai dalam sehari.",
    testiRole4: "Admin Kursus Online",
    testi4: "Pengingat jadwal kelas otomatis terkirim ke semua peserta. Follow-up drip campaign-nya ngebantu banget buat nurturing.",
    testiRole5: "UMKM Kuliner",
    testi5: "Harganya ramah buat usaha kecil. Autoreply keyword bikin chat pelanggan tetap terlayani walau lagi sibuk masak.",
    testi6: "Pesan terjadwal untuk pengumuman ke grup karyawan, plus webhook buat integrasi ke sistem internal. Stabil sejauh ini.",
    pricingKicker: "Paket",
    pricingTitle: "Harga yang ramah UMKM",
    pricingDesc: "Mulai gratis. Upgrade kapan saja sesuai kebutuhan bisnis Anda.",
    monthly: "Bulanan",
    yearly: "Tahunan",
    perMonth: "per bulan",
    perYear: "per tahun",
    quotaPerMonth: "{count} pesan/bulan",
    unlimitedQuota: "Unlimited pesan/bulan",
    bestSeller: "PALING LARIS",
    choosePlan: "Pilih Paket",
    freeFeat1: "Kirim personal",
    freeFeat2: "Pesan terjadwal",
    freeFeat3: "Pesan berulang",
    freeFeat4: "Template pesan",
    liteFeat1: "Semua fitur Free",
    liteFeat2: "Kirim attachment",
    liteFeat3: "Broadcast & CSV",
    liteFeat4: "Notifikasi device",
    liteFeat5: "Live chat",
    liteFeat6: "Prioritas antrean",
    regFeat1: "Semua fitur Lite",
    regFeat2: "Drip campaign",
    regFeat3: "Kalender jadwal",
    regFeat4: "Analitik pengiriman",
    regFeat5: "Grup kontak",
    regFeat6: "2 device tambahan",
    proFeat1: "Semua fitur Regular",
    proFeat2: "Multi device random",
    proFeat3: "Webhook retry",
    proFeat4: "Template unlimited",
    proFeat5: "Support prioritas",
    masterFeat1: "Semua fitur Pro",
    masterFeat2: "Pesan tanpa batas",
    masterFeat3: "10 device",
    masterFeat4: "API limit tinggi",
    masterFeat5: "Dedicated support",
    pricingNote1: "Butuh pesan unlimited + attachment? Hubungi kami untuk paket",
    pricingNoteBold: "All Feature",
    pricingNote2: "khusus.",
    faqTitle: "Pertanyaan yang sering ditanyakan",
    faq1Q: "Apakah layanan ini resmi dari WhatsApp?",
    faq1A: "WaGataway adalah layanan unofficial — sama seperti Fonnte dan sejenisnya. Kami mengotomatisasi WhatsApp Web melalui nomor Anda sendiri.",
    faq2Q: "Apakah harus memakai WhatsApp Bisnis?",
    faq2A: "Tidak. Anda bisa memakai WhatsApp reguler maupun WhatsApp Bisnis.",
    faq3Q: "Apakah bisa dipakai gratis?",
    faq3A: "Ya! Paket Free memberikan 1.000 pesan/bulan tanpa batas waktu, cocok untuk development dan mencoba semua fitur dasar.",
    faq4Q: "Apakah pengiriman memakai nomor saya?",
    faq4A: "Ya, nomor pengirim adalah nomor WhatsApp Anda sendiri. Kami sangat menyarankan memakai nomor sekunder khusus untuk otomatisasi.",
    faq5Q: "Bisa kirim gambar, PDF, video, dan audio?",
    faq5A: "Bisa, lewat fitur attachment yang tersedia mulai paket Lite. Paket Free hanya mendukung pesan teks.",
    faq6Q: "Apakah ada risiko nomor di-banned?",
    faq6A: "Ya, risikonya selalu ada pada layanan unofficial. Hindari mengirim banyak pesan sekaligus ke nomor yang belum pernah berinteraksi. WaGataway tidak bertanggung jawab atas banned dari pihak WhatsApp.",
    faq7Q: "Berapa kecepatan pengiriman?",
    faq7A: "Sistem kami membatasi sekitar 10 pesan per detik agar aman — hingga 600 pesan per menit selama tidak terkena limit WhatsApp.",
    faq8Q: "Apakah data saya aman?",
    faq8A: "Data tersimpan di akun masing-masing, tidak diakses publik, dan hanya dipakai untuk keperluan layanan. Data tidak digunakan untuk kepentingan lain.",
    ctaTitle: "Siap mengotomatisasi WhatsApp bisnis Anda?",
    ctaDesc: "Daftar gratis hari ini — 1.000 pesan pertama tiap bulan, tanpa kartu kredit.",
    ctaTryNow: "Coba Gratis Sekarang",
    ctaReadDocs: "Baca Dokumentasi",
    footerAbout: "Tentang",
    footerContact: "Contact Us",
    footerDisclaimer: "WaGataway bukanlah sebuah layanan yang berjalan diatas official API whatsapp. WaGataway menggunakan whatsapp web untuk melakukan otomatisasi pengiriman dan membalas pesan whatsapp baik menggunakan API maupun webhook.",
    footerInfo: "Informasi",
    footerLocation: "Indonesia",
    footerMadeWith1: "Made with",
    footerMadeWith2: "in Indonesia by WaGataway",
    stickyTitle: "Siap otomatisasi WA bisnis?",
    docs: "Dokumentasi",
}
};

type Dict = typeof id;

function resolve(dict: Dict, key: string): string {
  const parts = key.split(".");
  let cur: unknown = dict;
  for (const p of parts) {
    if (cur && typeof cur === "object" && p in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[p];
    } else {
      return key;
    }
  }
  return typeof cur === "string" ? cur : key;
}

interface LangContextType {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string) => string;
}

const LangContext = createContext<LangContextType | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang] = useState<Lang>("id");
  const t = (key: string) => resolve(id, key);
  return <LangContext.Provider value={{ lang, setLang: () => {}, t }}>{children}</LangContext.Provider>;
}

export function useLang(): LangContextType {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error("useLang harus dipakai di dalam LanguageProvider");
  return ctx;
}

export function timeAgo(): string {
  return "";
}

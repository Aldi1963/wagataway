import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from "react";

export type Lang = "id" | "en";

// ── Kamus ────────────────────────────────────────────────────────────────────
// Kunci dipakai dengan format "namespace.kunci", mis. t("nav.dashboard").
// Tambahkan bahasa baru dengan menyalin struktur `id` dan menerjemahkannya.

const id = {
  common: {
    cancel: "Batal",
    close: "Tutup",
    retry: "Coba lagi",
    viewAll: "Lihat semua",
    delete: "Hapus",
    save: "Simpan",
  },
  header: {
    openMenu: "Buka menu",
    search: "Cari",
    notifications: "Notifikasi",
    markAllRead: "Tandai semua dibaca",
    noNotifications: "Tidak ada notifikasi",
    notifHint: "Pemberitahuan penting akan muncul di sini",
    profileMenu: "Menu profil",
    settings: "Setting",
    adminDashboard: "Dashboard Admin",
    logout: "Keluar",
    language: "Bahasa",
    plan: "Paket",
  },
  title: {
    dashboard: "Dashboard",
    send: "Kirim Pesan",
    bulk: "Blast Pesan",
    schedule: "Jadwal Pesan",
    history: "Riwayat Pesan",
    contacts: "Kontak",
    contactGroups: "Grup Kontak",
    blacklist: "Blacklist",
    automation: "Otomatisasi",
    autoReply: "Auto Reply",
    liveChat: "Live Chat",
    csBot: "CS Bot AI",
    drip: "Drip Campaign",
    files: "File Manager",
    links: "Link Shortener",
    analytics: "Analytics",
    antiBanned: "Anti-Banned",
    billing: "Langganan",
    affiliate: "Afiliasi",
    settings: "Setting",
    templates: "Templates",
    apiDocs: "API Developer",
    integrations: "Integrasi",
    apiPlayground: "Playground",
    webhookLogs: "Webhook Logs",
    notifications: "Notifikasi",
    admin: "Admin",
  },
  nav: {
    dashboard: "Dashboard",
    schedule: "Jadwal",
    automation: "Otomatisasi",
    liveChat: "Live Chat",
    contacts: "Kontak",
    billing: "Langganan",
    affiliate: "Afiliasi",
    messages: "Pesan",
    send: "Kirim Pesan",
    messageHistory: "Riwayat Pesan",
    fileManager: "File Manager",
    reports: "Laporan",
    report: "Laporan",
    links: "Links",
    developer: "Developer",
    apiDocs: "API Docs",
    integrations: "Integrasi",
    playground: "Playground",
    webhookLogs: "Webhook Logs",
    management: "Manajemen",
    overview: "Ringkasan",
    users: "Pengguna",
    packages: "Paket",
    vouchers: "Voucher",
    transactions: "Transaksi",
    system: "Sistem",
    activityLog: "Log Aktivitas",
    systemHealth: "Kesehatan Sistem",
    settings: "Pengaturan",
    communication: "Komunikasi",
    notifications: "Notifikasi",
    activeDevice: "Active Device",
    selectDevice: "Pilih Device",
    selectDeviceAria: "Pilih device aktif",
    logout: "Keluar",
    backToDashboard: "Kembali ke Dashboard",
    closeMenu: "Tutup menu",
    openSidebar: "Buka sidebar",
    closeSidebar: "Tutup sidebar",
  },
  dashboard: {
    totalDevices: "Total Perangkat",
    limit: "Limit",
    blastBulk: "Blast / Bulk",
    wait: "Wait",
    sent: "Sent",
    fail: "Fail",
    campaigns: "Kampanye",
    subscription: "Langganan",
    until: "s/d",
    messagesSent: "Pesan Terkirim",
    fromHistories: "Dari riwayat",
    whatsappAccounts: "Akun WhatsApp",
    addDevice: "Tambah Perangkat",
    noDevices: "Belum ada perangkat terhubung.",
    upgrade: "Upgrade",
    choosePlan: "Pilih Paket",
    renew: "Perpanjang",
    noSubscription: "Tidak ada langganan aktif",
    unlimited: "Unlimited",
    trial: "Trial",
    gracePeriod: "Masa Tenggang",
    expired: "Berakhir",
    quotaExhausted: "Kuota pesan paket {plan} habis",
    quotaExhaustedDetail:
      "Pengiriman pesan baru akan ditolak. Perpanjang atau upgrade paket untuk menambah kuota.",
    renewUpgrade: "Perpanjang / Upgrade",
    quotaAlmostOut: "Kuota pesan hampir habis",
    quotaUsed: "{pct}% terpakai",
    quotaHint: "{used} dari {limit} pesan bulan ini. Pertimbangkan upgrade paket.",
    loadFail: "Gagal memuat data",
    addDeviceFail: "Gagal menambah perangkat",
    deviceNameRequired: "Nama perangkat wajib diisi",
    updateSettingFail: "Gagal memperbarui pengaturan",
    disconnectFail: "Gagal memutuskan perangkat",
    deleteDeviceFail: "Gagal menghapus perangkat",
    editDeviceFail: "Gagal memperbarui perangkat",
    secretCopied: "Webhook secret disalin",
    copyFail: "Gagal menyalin",
    secretUpdated: "Webhook secret diperbarui",
    secretUpdateFail: "Gagal membuat secret baru",
    connectFail: "Gagal memulai koneksi",
    pairFail: "Gagal meminta kode pairing",
    colNumber: "Nomor",
    colWebhook: "Webhook URL",
    colRead: "Read",
    colRejectCall: "Tolak Panggilan",
    colOnline: "Online",
    colTyping: "Mengetik",
    colSent: "Terkirim",
    colStatus: "Status",
    colAction: "Aksi",
    disconnect: "Putuskan",
    connect: "Hubungkan",
    addDeviceTitle: "Tambah Perangkat",
    editDeviceTitle: "Ubah Perangkat",
    deviceName: "Nama perangkat",
    optional: "opsional",
    saving: "Menyimpan...",
    saveConnect: "Simpan & Hubungkan",
    webhookSecret: "Webhook Secret",
    exDeviceName: "cth: CS Bot",
    exWebhook: "cth: https://contoh.com/webhook",
    autoGenerated: "Otomatis dibuat",
    showSecret: "Tampilkan secret",
    hideSecret: "Sembunyikan secret",
    show: "Tampilkan",
    hide: "Sembunyikan",
    copySecret: "Salin secret",
    copy: "Salin",
    regenSecret: "Buat ulang secret",
    regen: "Buat ulang",
    webhookHint:
      "Setiap webhook dikirim dengan header X-Wagataway-Signature (HMAC-SHA256 dari body memakai secret ini) agar penerima bisa memverifikasi keasliannya.",
    connectDevice: "Hubungkan {name}",
    scanQr: "Scan QR",
    pairingCode: "Kode Pairing",
    preparingQr: "Menyiapkan kode QR...",
    qrAlt: "Kode QR WhatsApp",
    qrScanHint:
      "Pindai dengan WhatsApp di HP kamu. Kode diperbarui otomatis, menunggu hingga 60 detik.",
    waitingQr: "Menunggu kode QR dari WhatsApp...",
    yourWaNumber: "Nomor WhatsApp HP kamu",
    exPhone: "cth: 62812xxxxxxx",
    requestingCode: "Meminta kode...",
    requestPairCode: "Minta Kode Pairing",
    requestNewCode: "Minta Kode Baru",
    pairSteps:
      "Buka WhatsApp di HP → Perangkat Tertaut → Tautkan Perangkat → “Tautkan dengan nomor telepon”, lalu masukkan kode di atas. Kode berlaku 120 detik.",
    deleteDeviceTitle: "Hapus Perangkat",
    deleteDeviceConfirm: "Hapus perangkat {name}{phone}? Tindakan ini tidak dapat dibatalkan.",
    deleting: "Menghapus...",
  },
  notifications: {
    title: "Notifikasi",
    unread: "belum dibaca",
    allRead: "Semua sudah dibaca",
    markAllRead: "Tandai semua dibaca",
    markedRead: "Semua notifikasi ditandai dibaca",
    markReadFail: "Gagal menandai dibaca",
    deleted: "Notifikasi dihapus",
    deleteFail: "Gagal menghapus",
    loadFail: "Gagal memuat notifikasi",
    empty: "Belum ada notifikasi",
    emptyHint: "Pemberitahuan penting akan muncul di sini",
    deleteNotif: "Hapus notifikasi",
    justNow: "baru saja",
    minAgo: "menit lalu",
    hourAgo: "jam lalu",
    dayAgo: "hari lalu",
  },
};

type Dict = typeof id;

const en: Dict = {
  common: {
    cancel: "Cancel",
    close: "Close",
    retry: "Try again",
    viewAll: "View all",
    delete: "Delete",
    save: "Save",
  },
  header: {
    openMenu: "Open menu",
    search: "Search",
    notifications: "Notifications",
    markAllRead: "Mark all as read",
    noNotifications: "No notifications",
    notifHint: "Important updates will appear here",
    profileMenu: "Profile menu",
    settings: "Settings",
    adminDashboard: "Admin Dashboard",
    logout: "Log out",
    language: "Language",
    plan: "Plan",
  },
  title: {
    dashboard: "Dashboard",
    send: "Send Message",
    bulk: "Bulk Messages",
    schedule: "Scheduled Messages",
    history: "Message History",
    contacts: "Contacts",
    contactGroups: "Contact Groups",
    blacklist: "Blacklist",
    automation: "Automation",
    autoReply: "Auto Reply",
    liveChat: "Live Chat",
    csBot: "AI CS Bot",
    drip: "Drip Campaign",
    files: "File Manager",
    links: "Link Shortener",
    analytics: "Analytics",
    antiBanned: "Anti-Banned",
    billing: "Subscription",
    affiliate: "Affiliate",
    settings: "Settings",
    templates: "Templates",
    apiDocs: "Developer API",
    integrations: "Integrations",
    apiPlayground: "Playground",
    webhookLogs: "Webhook Logs",
    notifications: "Notifications",
    admin: "Admin",
  },
  nav: {
    dashboard: "Dashboard",
    schedule: "Schedule",
    automation: "Automation",
    liveChat: "Live Chat",
    contacts: "Contacts",
    billing: "Subscription",
    affiliate: "Affiliate",
    messages: "Messages",
    send: "Send Message",
    messageHistory: "Message History",
    fileManager: "File Manager",
    reports: "Reports",
    report: "Reports",
    links: "Links",
    developer: "Developer",
    apiDocs: "API Docs",
    integrations: "Integrations",
    playground: "Playground",
    webhookLogs: "Webhook Logs",
    management: "Management",
    overview: "Overview",
    users: "Users",
    packages: "Plans",
    vouchers: "Vouchers",
    transactions: "Transactions",
    system: "System",
    activityLog: "Activity Log",
    systemHealth: "System Health",
    settings: "Settings",
    communication: "Communication",
    notifications: "Notifications",
    activeDevice: "Active Device",
    selectDevice: "Select Device",
    selectDeviceAria: "Select active device",
    logout: "Log out",
    backToDashboard: "Back to Dashboard",
    closeMenu: "Close menu",
    openSidebar: "Open sidebar",
    closeSidebar: "Close sidebar",
  },
  dashboard: {
    totalDevices: "Total Devices",
    limit: "Limit",
    blastBulk: "Blast / Bulk",
    wait: "Wait",
    sent: "Sent",
    fail: "Fail",
    campaigns: "Campaigns",
    subscription: "Subscription",
    until: "until",
    messagesSent: "Messages Sent",
    fromHistories: "From histories",
    whatsappAccounts: "WhatsApp Accounts",
    addDevice: "Add Device",
    noDevices: "No devices connected.",
    upgrade: "Upgrade",
    choosePlan: "Choose Plan",
    renew: "Renew",
    noSubscription: "No active subscription",
    unlimited: "Unlimited",
    trial: "Trial",
    gracePeriod: "Grace Period",
    expired: "Expired",
    quotaExhausted: "Message quota for the {plan} plan is exhausted",
    quotaExhaustedDetail:
      "New messages will be rejected. Renew or upgrade your plan to increase the quota.",
    renewUpgrade: "Renew / Upgrade",
    quotaAlmostOut: "Message quota almost exhausted",
    quotaUsed: "{pct}% used",
    quotaHint: "{used} of {limit} messages this month. Consider upgrading your plan.",
    loadFail: "Failed to load data",
    addDeviceFail: "Failed to add device",
    deviceNameRequired: "Device name is required",
    updateSettingFail: "Failed to update settings",
    disconnectFail: "Failed to disconnect device",
    deleteDeviceFail: "Failed to delete device",
    editDeviceFail: "Failed to update device",
    secretCopied: "Webhook secret copied",
    copyFail: "Failed to copy",
    secretUpdated: "Webhook secret updated",
    secretUpdateFail: "Failed to generate a new secret",
    connectFail: "Failed to start connection",
    pairFail: "Failed to request pairing code",
    colNumber: "Number",
    colWebhook: "Webhook URL",
    colRead: "Read",
    colRejectCall: "Reject Call",
    colOnline: "Online",
    colTyping: "Typing",
    colSent: "Sent",
    colStatus: "Status",
    colAction: "Action",
    disconnect: "Disconnect",
    connect: "Connect",
    addDeviceTitle: "Add Device",
    editDeviceTitle: "Edit Device",
    deviceName: "Device name",
    optional: "optional",
    saving: "Saving...",
    saveConnect: "Save & Connect",
    webhookSecret: "Webhook Secret",
    exDeviceName: "e.g. CS Bot",
    exWebhook: "e.g. https://example.com/webhook",
    autoGenerated: "Auto-generated",
    showSecret: "Show secret",
    hideSecret: "Hide secret",
    show: "Show",
    hide: "Hide",
    copySecret: "Copy secret",
    copy: "Copy",
    regenSecret: "Regenerate secret",
    regen: "Regenerate",
    webhookHint:
      "Every webhook is sent with an X-Wagataway-Signature header (HMAC-SHA256 of the body using this secret) so the receiver can verify its authenticity.",
    connectDevice: "Connect {name}",
    scanQr: "Scan QR",
    pairingCode: "Pairing Code",
    preparingQr: "Preparing QR code...",
    qrAlt: "WhatsApp QR code",
    qrScanHint:
      "Scan with WhatsApp on your phone. The code refreshes automatically, waiting up to 60 seconds.",
    waitingQr: "Waiting for QR code from WhatsApp...",
    yourWaNumber: "Your phone's WhatsApp number",
    exPhone: "e.g. 62812xxxxxxx",
    requestingCode: "Requesting code...",
    requestPairCode: "Request Pairing Code",
    requestNewCode: "Request New Code",
    pairSteps:
      "Open WhatsApp on your phone → Linked Devices → Link a Device → “Link with phone number”, then enter the code above. The code is valid for 120 seconds.",
    deleteDeviceTitle: "Delete Device",
    deleteDeviceConfirm: "Delete device {name}{phone}? This action cannot be undone.",
    deleting: "Deleting...",
  },
  notifications: {
    title: "Notifications",
    unread: "unread",
    allRead: "All caught up",
    markAllRead: "Mark all as read",
    markedRead: "All notifications marked as read",
    markReadFail: "Failed to mark as read",
    deleted: "Notification deleted",
    deleteFail: "Failed to delete",
    loadFail: "Failed to load notifications",
    empty: "No notifications yet",
    emptyHint: "Important updates will appear here",
    deleteNotif: "Delete notification",
    justNow: "just now",
    minAgo: "min ago",
    hourAgo: "h ago",
    dayAgo: "d ago",
  },
};

const dicts: Record<Lang, Dict> = { id, en };
const STORAGE_KEY = "wagataway-lang";

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
  const [lang, setLangState] = useState<Lang>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === "en" || stored === "id" ? stored : "id";
  });

  useEffect(() => {
    document.documentElement.lang = lang;
    localStorage.setItem(STORAGE_KEY, lang);
  }, [lang ]);

  const setLang = (l: Lang) => setLangState(l);
  const t = (key: string) => resolve(dicts[lang], key);

  return (
    <LangContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LangContext.Provider>
  );
}

export function useLang(): LangContextType {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error("useLang harus dipakai di dalam LanguageProvider");
  return ctx;
}

/** "5 menit lalu" / "5 min ago" sesuai bahasa aktif. */
export function timeAgo(iso: string, lang: Lang): string {
  const d = lang === "id" ? dicts.id.notifications : dicts.en.notifications;
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return d.justNow;
  if (mins < 60) return `${mins} ${d.minAgo}`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} ${d.hourAgo}`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} ${d.dayAgo}`;
  return new Date(iso).toLocaleDateString(lang === "id" ? "id-ID" : "en-US");
}

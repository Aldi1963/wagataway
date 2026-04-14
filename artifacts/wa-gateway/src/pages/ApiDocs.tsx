import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api";
import { Copy, Check, BookOpen, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

function getDocBaseUrl(): string {
  return `${window.location.origin}/api`;
}

interface Param {
  name: string;
  type: string;
  required: boolean;
  description: string;
}

interface ApiEndpoint {
  id: string;
  title: string;
  methods: ("POST" | "GET" | "DELETE")[];
  endpoint: string;
  description?: string;
  params: Param[];
  jsonExample?: object;
  urlExample?: string;
  responseExample?: object;
  notes?: string[];
}

const endpoints: ApiEndpoint[] = [
  {
    id: "send-message",
    title: "Send Message",
    methods: ["POST", "GET"],
    endpoint: "/send-message",
    description: "Kirim pesan teks biasa ke nomor WhatsApp tujuan.",
    params: [
      { name: "api_key", type: "string", required: true, description: "API Key akun Anda" },
      { name: "sender", type: "string", required: true, description: "Nomor perangkat pengirim (kode negara tanpa +)" },
      { name: "number", type: "string", required: true, description: "Nomor tujuan, contoh: 62888xxxx|62888xxxx" },
      { name: "message", type: "string", required: true, description: "Pesan yang akan dikirim" },
    ],
    jsonExample: {
      api_key: "1234567890",
      sender: "62888xxxx",
      number: "62888xxxx",
      message: "Hello World",
    },
    urlExample: `/send-message?api_key=1234567890&sender=62888xxxx&number=62888xxxx&message=Hello+World`,
    responseExample: { status: true, message: "Message sent successfully", data: { id: "msg_abc123" } },
  },
  {
    id: "send-media",
    title: "Send Medias",
    methods: ["POST", "GET"],
    endpoint: "/send-media",
    description: "Kirim pesan berisi media (gambar, video, dokumen, atau audio) dengan URL.",
    params: [
      { name: "api_key", type: "string", required: true, description: "API Key akun Anda" },
      { name: "sender", type: "string", required: true, description: "Nomor perangkat pengirim" },
      { name: "number", type: "string", required: true, description: "Nomor tujuan" },
      { name: "url", type: "string", required: true, description: "URL file media yang akan dikirim" },
      { name: "caption", type: "string", required: false, description: "Keterangan media (opsional)" },
      { name: "type", type: "string", required: false, description: "Tipe media: image | video | document | audio (default: image)" },
    ],
    jsonExample: {
      api_key: "1234567890",
      sender: "62888xxxx",
      number: "62888xxxx",
      url: "https://example.com/image.jpg",
      caption: "Ini adalah gambar produk",
      type: "image",
    },
    urlExample: `/send-media?api_key=1234567890&sender=62888xxxx&number=62888xxxx&url=https%3A%2F%2Fexample.com%2Fimage.jpg&caption=Ini+gambar`,
    responseExample: { status: true, message: "Media sent successfully", data: { id: "msg_xyz456" } },
  },
  {
    id: "send-poll",
    title: "Send Poll Message",
    methods: ["POST"],
    endpoint: "/send-poll",
    description: "Kirim pesan polling interaktif dengan pilihan jawaban ke nomor tujuan.",
    params: [
      { name: "api_key", type: "string", required: true, description: "API Key akun Anda" },
      { name: "sender", type: "string", required: true, description: "Nomor perangkat pengirim" },
      { name: "number", type: "string", required: true, description: "Nomor tujuan" },
      { name: "question", type: "string", required: true, description: "Pertanyaan polling" },
      { name: "options", type: "array", required: true, description: "Daftar pilihan jawaban (maks. 12)" },
      { name: "multiple_answers", type: "boolean", required: false, description: "Izinkan jawaban ganda (default: false)" },
    ],
    jsonExample: {
      api_key: "1234567890",
      sender: "62888xxxx",
      number: "62888xxxx",
      question: "Produk favorit Anda?",
      options: ["Produk A", "Produk B", "Produk C"],
      multiple_answers: false,
    },
    responseExample: { status: true, message: "Poll sent successfully" },
  },
  {
    id: "send-sticker",
    title: "Send Sticker",
    methods: ["POST", "GET"],
    endpoint: "/send-sticker",
    description: "Kirim stiker WhatsApp dari URL gambar. Gambar akan otomatis dikonversi menjadi stiker.",
    params: [
      { name: "api_key", type: "string", required: true, description: "API Key akun Anda" },
      { name: "sender", type: "string", required: true, description: "Nomor perangkat pengirim" },
      { name: "number", type: "string", required: true, description: "Nomor tujuan" },
      { name: "url", type: "string", required: true, description: "URL gambar yang akan dijadikan stiker" },
    ],
    jsonExample: {
      api_key: "1234567890",
      sender: "62888xxxx",
      number: "62888xxxx",
      url: "https://example.com/sticker.png",
    },
    urlExample: `/send-sticker?api_key=1234567890&sender=62888xxxx&number=62888xxxx&url=https%3A%2F%2Fexample.com%2Fsticker.png`,
    responseExample: { status: true, message: "Sticker sent successfully" },
  },
  {
    id: "send-button",
    title: "Send Button",
    methods: ["POST"],
    endpoint: "/send-button",
    description: "Kirim pesan dengan tombol interaktif (maksimal 3 tombol).",
    params: [
      { name: "api_key", type: "string", required: true, description: "API Key akun Anda" },
      { name: "sender", type: "string", required: true, description: "Nomor perangkat pengirim" },
      { name: "number", type: "string", required: true, description: "Nomor tujuan" },
      { name: "message", type: "string", required: true, description: "Isi pesan utama" },
      { name: "footer", type: "string", required: false, description: "Teks footer pesan" },
      { name: "buttons", type: "array", required: true, description: "Daftar tombol, maks 3. Setiap tombol memiliki id dan text" },
    ],
    jsonExample: {
      api_key: "1234567890",
      sender: "62888xxxx",
      number: "62888xxxx",
      message: "Pilih layanan kami:",
      footer: "WA Gateway",
      buttons: [
        { id: "btn1", text: "Info Harga" },
        { id: "btn2", text: "Hubungi CS" },
        { id: "btn3", text: "Lihat Produk" },
      ],
    },
    responseExample: { status: true, message: "Button message sent successfully" },
  },
  {
    id: "send-list",
    title: "Send List Message",
    methods: ["POST"],
    endpoint: "/send-list",
    description: "Kirim pesan dengan menu daftar (list) interaktif yang berisi section dan baris pilihan.",
    params: [
      { name: "api_key", type: "string", required: true, description: "API Key akun Anda" },
      { name: "sender", type: "string", required: true, description: "Nomor perangkat pengirim" },
      { name: "number", type: "string", required: true, description: "Nomor tujuan" },
      { name: "message", type: "string", required: true, description: "Isi pesan utama" },
      { name: "footer", type: "string", required: false, description: "Teks footer" },
      { name: "button_text", type: "string", required: true, description: "Teks tombol untuk membuka list" },
      { name: "sections", type: "array", required: true, description: "Daftar section, setiap section berisi title dan rows" },
    ],
    jsonExample: {
      api_key: "1234567890",
      sender: "62888xxxx",
      number: "62888xxxx",
      message: "Pilih menu di bawah:",
      footer: "WA Gateway",
      button_text: "Lihat Menu",
      sections: [
        {
          title: "Layanan Utama",
          rows: [
            { id: "row1", title: "Info Produk", description: "Lihat katalog produk kami" },
            { id: "row2", title: "Cek Pesanan", description: "Cek status pesanan Anda" },
          ],
        },
      ],
    },
    responseExample: { status: true, message: "List message sent successfully" },
  },
  {
    id: "send-location",
    title: "Send Location",
    methods: ["POST", "GET"],
    endpoint: "/send-location",
    description: "Kirim pesan berisi lokasi GPS ke nomor tujuan.",
    params: [
      { name: "api_key", type: "string", required: true, description: "API Key akun Anda" },
      { name: "sender", type: "string", required: true, description: "Nomor perangkat pengirim" },
      { name: "number", type: "string", required: true, description: "Nomor tujuan" },
      { name: "latitude", type: "string", required: true, description: "Koordinat latitude lokasi" },
      { name: "longitude", type: "string", required: true, description: "Koordinat longitude lokasi" },
      { name: "name", type: "string", required: false, description: "Nama lokasi (opsional)" },
      { name: "address", type: "string", required: false, description: "Alamat lengkap lokasi (opsional)" },
    ],
    jsonExample: {
      api_key: "1234567890",
      sender: "62888xxxx",
      number: "62888xxxx",
      latitude: "-6.2088",
      longitude: "106.8456",
      name: "Monas",
      address: "Gambir, Jakarta Pusat",
    },
    urlExample: `/send-location?api_key=1234567890&sender=62888xxxx&number=62888xxxx&latitude=-6.2088&longitude=106.8456`,
    responseExample: { status: true, message: "Location sent successfully" },
  },
  {
    id: "send-vcard",
    title: "Send Vcard",
    methods: ["POST", "GET"],
    endpoint: "/send-vcard",
    description: "Kirim kartu kontak (vCard) ke nomor tujuan.",
    params: [
      { name: "api_key", type: "string", required: true, description: "API Key akun Anda" },
      { name: "sender", type: "string", required: true, description: "Nomor perangkat pengirim" },
      { name: "number", type: "string", required: true, description: "Nomor tujuan" },
      { name: "contact_name", type: "string", required: true, description: "Nama kontak yang akan dikirim" },
      { name: "contact_number", type: "string", required: true, description: "Nomor telepon kontak" },
      { name: "contact_email", type: "string", required: false, description: "Email kontak (opsional)" },
      { name: "contact_org", type: "string", required: false, description: "Nama organisasi/perusahaan (opsional)" },
    ],
    jsonExample: {
      api_key: "1234567890",
      sender: "62888xxxx",
      number: "62888xxxx",
      contact_name: "John Doe",
      contact_number: "6281234567890",
      contact_email: "john@example.com",
      contact_org: "PT. Contoh Perusahaan",
    },
    urlExample: `/send-vcard?api_key=1234567890&sender=62888xxxx&number=62888xxxx&contact_name=John+Doe&contact_number=6281234567890`,
    responseExample: { status: true, message: "VCard sent successfully" },
  },
  {
    id: "generate-qr",
    title: "Generate QR Code",
    methods: ["GET"],
    endpoint: "/device/qr",
    description: "Mengambil QR code untuk menghubungkan perangkat WhatsApp baru.",
    params: [
      { name: "api_key", type: "string", required: true, description: "API Key akun Anda" },
      { name: "sender", type: "string", required: true, description: "Nomor perangkat yang akan dihubungkan" },
    ],
    urlExample: `/device/qr?api_key=1234567890&sender=62888xxxx`,
    responseExample: {
      status: true,
      data: {
        qr_code: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg...",
        expires_at: "2026-04-05T10:00:00Z",
      },
    },
    notes: ["QR Code berlaku selama 60 detik", "Panggil endpoint ini lagi untuk mendapatkan QR baru"],
  },
  {
    id: "disconnect-device",
    title: "Disconnect Device",
    methods: ["POST", "GET"],
    endpoint: "/device/disconnect",
    description: "Memutus koneksi perangkat WhatsApp dari server.",
    params: [
      { name: "api_key", type: "string", required: true, description: "API Key akun Anda" },
      { name: "sender", type: "string", required: true, description: "Nomor perangkat yang akan diputus" },
    ],
    jsonExample: {
      api_key: "1234567890",
      sender: "62888xxxx",
    },
    urlExample: `/device/disconnect?api_key=1234567890&sender=62888xxxx`,
    responseExample: { status: true, message: "Device disconnected successfully" },
  },
  {
    id: "create-user",
    title: "Create User",
    methods: ["POST"],
    endpoint: "/user/create",
    description: "Membuat akun pengguna baru (endpoint admin).",
    params: [
      { name: "api_key", type: "string", required: true, description: "API Key admin" },
      { name: "name", type: "string", required: true, description: "Nama lengkap pengguna" },
      { name: "email", type: "string", required: true, description: "Alamat email pengguna" },
      { name: "password", type: "string", required: true, description: "Password pengguna (min 8 karakter)" },
      { name: "plan", type: "string", required: false, description: "Plan langganan: free | basic | pro (default: free)" },
    ],
    jsonExample: {
      api_key: "1234567890",
      name: "John Doe",
      email: "john@example.com",
      password: "password123",
      plan: "basic",
    },
    responseExample: { status: true, message: "User created", data: { id: 2, email: "john@example.com" } },
  },
  {
    id: "user-info",
    title: "User Info",
    methods: ["GET"],
    endpoint: "/user/info",
    description: "Mengambil informasi profil akun pengguna berdasarkan API key.",
    params: [
      { name: "api_key", type: "string", required: true, description: "API Key akun Anda" },
    ],
    urlExample: `/user/info?api_key=1234567890`,
    responseExample: {
      status: true,
      data: {
        id: 1,
        name: "Admin User",
        email: "admin@example.com",
        plan: "pro",
        quota: { used: 1500, limit: 10000 },
      },
    },
  },
  {
    id: "device-info",
    title: "Device Info",
    methods: ["GET"],
    endpoint: "/device/info",
    description: "Mengambil informasi status perangkat WhatsApp yang terhubung.",
    params: [
      { name: "api_key", type: "string", required: true, description: "API Key akun Anda" },
      { name: "sender", type: "string", required: true, description: "Nomor perangkat yang ingin dicek" },
    ],
    urlExample: `/device/info?api_key=1234567890&sender=62888xxxx`,
    responseExample: {
      status: true,
      data: {
        phone: "62888xxxx",
        name: "WhatsApp Bisnis",
        status: "connected",
        battery: 85,
        last_seen: "2026-04-05T08:00:00Z",
      },
    },
  },
  {
    id: "create-device",
    title: "Create Device",
    methods: ["POST"],
    endpoint: "/device/create",
    description: "Mendaftarkan perangkat WhatsApp baru ke akun Anda.",
    params: [
      { name: "api_key", type: "string", required: true, description: "API Key akun Anda" },
      { name: "name", type: "string", required: true, description: "Nama perangkat" },
      { name: "phone", type: "string", required: false, description: "Nomor telepon perangkat (opsional)" },
      { name: "webhook_url", type: "string", required: false, description: "URL webhook untuk notifikasi (opsional)" },
      { name: "auto_reconnect", type: "boolean", required: false, description: "Auto reconnect jika terputus (default: true)" },
    ],
    jsonExample: {
      api_key: "1234567890",
      name: "WhatsApp Bisnis",
      phone: "62888xxxx",
      webhook_url: "https://hooks.example.com/wa",
      auto_reconnect: true,
    },
    responseExample: { status: true, message: "Device created", data: { id: "dev_abc123", name: "WhatsApp Bisnis" } },
  },
  {
    id: "check-number",
    title: "Check Number",
    methods: ["POST", "GET"],
    endpoint: "/check-number",
    description: "Memeriksa apakah nomor telepon terdaftar di WhatsApp.",
    params: [
      { name: "api_key", type: "string", required: true, description: "API Key akun Anda" },
      { name: "sender", type: "string", required: true, description: "Nomor perangkat pengirim" },
      { name: "number", type: "string", required: true, description: "Nomor yang ingin dicek" },
    ],
    jsonExample: {
      api_key: "1234567890",
      sender: "62888xxxx",
      number: "628123456789",
    },
    urlExample: `/check-number?api_key=1234567890&sender=62888xxxx&number=628123456789`,
    responseExample: {
      status: true,
      data: {
        number: "628123456789",
        registered: true,
        wa_id: "628123456789@s.whatsapp.net",
      },
    },
  },
  {
    id: "check-numbers",
    title: "Batch Check Number",
    methods: ["POST"],
    endpoint: "/check-numbers",
    description: "Memeriksa banyak nomor sekaligus apakah terdaftar di WhatsApp.",
    params: [
      { name: "api_key", type: "string", required: true, description: "API Key akun Anda" },
      { name: "sender", type: "string", required: true, description: "Nomor perangkat pengirim" },
      { name: "phones", type: "array", required: true, description: "Daftar nomor yang ingin dicek, contoh: ['628xx', '628xx']" },
    ],
    jsonExample: {
      api_key: "1234567890",
      sender: "62888xxxx",
      phones: ["628123456789", "628998765432"],
    },
    responseExample: {
      status: true,
      data: [
        { number: "628123456789", exists: true, jid: "628123456789@s.whatsapp.net" },
        { number: "628998765432", exists: false },
      ],
      total: 2,
    },
  },
  {
    id: "list-groups",
    title: "List Groups",
    methods: ["GET"],
    endpoint: "/groups",
    description: "Mengambil daftar semua grup yang diikuti oleh perangkat pengirim.",
    params: [
      { name: "api_key", type: "string", required: true, description: "API Key akun Anda" },
      { name: "sender", type: "string", required: true, description: "Nomor perangkat pengirim" },
    ],
    urlExample: `/groups?api_key=1234567890&sender=62888xxxx`,
    responseExample: {
      status: true,
      data: [
        { id: "120363023849501234@g.us", subject: "Grup Alumni" },
        { id: "120363023849505678@g.us", subject: "Keluarga Besar" },
      ],
      total: 2,
    },
  },
  {
    id: "send-group",
    title: "Send to Group",
    methods: ["POST"],
    endpoint: "/send-group",
    description: "Mengirim pesan teks ke grup WhatsApp berdasarkan Group ID.",
    params: [
      { name: "api_key", type: "string", required: true, description: "API Key akun Anda" },
      { name: "sender", type: "string", required: true, description: "Nomor perangkat pengirim" },
      { name: "groupId", type: "string", required: true, description: "ID grup tujuan (contoh: 12345@g.us)" },
      { name: "message", type: "string", required: true, description: "Isi pesan" },
    ],
    jsonExample: {
      api_key: "1234567890",
      sender: "62888xxxx",
      groupId: "120363023849501234@g.us",
      message: "Halo semuanya!",
    },
    responseExample: { status: true, message: "Success", data: { id: "123", groupId: "120363023849501234@g.us", status: "sent" } },
  },
  {
    id: "commerce-products",
    title: "Bot Products",
    methods: ["GET"],
    endpoint: "/commerce/products",
    description: "Mengambil daftar produk katalog bot yang terdaftar pada perangkat.",
    params: [
      { name: "api_key", type: "string", required: true, description: "API Key akun Anda" },
      { name: "sender", type: "string", required: true, description: "Nomor perangkat pengirim" },
    ],
    urlExample: `/commerce/products?api_key=1234567890&sender=62888xxxx`,
    responseExample: {
      status: true,
      data: [
        { id: 1, name: "Kopi Gula Aren", price: 15000, stock: 50 },
      ],
      total: 1,
    },
    notes: ["Fitur ini hanya tersedia pada paket Enterprise."],
  },
  {
    id: "commerce-categories",
    title: "Bot Categories",
    methods: ["GET"],
    endpoint: "/commerce/categories",
    description: "Mengambil daftar kategori produk bot.",
    params: [
      { name: "api_key", type: "string", required: true, description: "API Key akun Anda" },
      { name: "sender", type: "string", required: true, description: "Nomor perangkat pengirim" },
    ],
    urlExample: `/commerce/categories?api_key=1234567890&sender=62888xxxx`,
    responseExample: {
      status: true,
      data: [
        { id: 1, name: "Minuman Dingin" },
      ],
      total: 1,
    },
  },
  {
    id: "example-webhook",
    title: "Example Webhook",
    methods: ["POST"],
    endpoint: "/webhook (incoming)",
    description: "Payload yang dikirim server ke URL webhook Anda ketika ada event terjadi (pesan masuk, status pesan, dll).",
    params: [
      { name: "event", type: "string", required: true, description: "Jenis event: message.received | device.connected | device.disconnected" },
      { name: "timestamp", type: "string", required: true, description: "Waktu event dalam format ISO 8601" },
      { name: "deviceId", type: "number", required: true, description: "ID internal perangkat yang memicu event" },
      { name: "data.device", type: "string", required: true, description: "Nama perangkat pengirim" },
      { name: "data.message", type: "string", required: true, description: "Isi teks pesan (null jika hanya media)" },
      { name: "data.from", type: "string", required: true, description: "Nomor WhatsApp pengirim (tanpa @s.whatsapp.net)" },
      { name: "data.name", type: "string", required: false, description: "Nama kontak pengirim (push name dari WA)" },
      { name: "data.participant", type: "string", required: false, description: "Nomor pengirim jika pesan dari grup, null untuk chat personal" },
      { name: "data.ppUrl", type: "string", required: false, description: "URL foto profil pengirim, null jika privat" },
      { name: "data.media", type: "object", required: false, description: "Objek media jika ada gambar/video/audio/dokumen, null jika hanya teks" },
      { name: "data.media.caption", type: "string", required: false, description: "Keterangan media (sama dengan message)" },
      { name: "data.media.fileName", type: "string", required: false, description: "Nama file media" },
      { name: "data.media.stream", type: "object", required: false, description: "Data file dalam format Buffer {type: 'Buffer', data: [...]}" },
      { name: "data.media.mimetype", type: "string", required: false, description: "Tipe MIME file, contoh: image/jpeg, audio/ogg, video/mp4" },
    ],
    jsonExample: {
      event: "message.received",
      timestamp: "2026-04-05T08:00:00.000Z",
      deviceId: 4,
      data: {
        device: "Toko Official",
        message: "Halo, saya ingin bertanya tentang produk",
        from: "628123456789",
        name: "John Doe",
        participant: null,
        ppUrl: "https://pps.whatsapp.net/v/t61.24694-24/photo.jpg",
        media: null,
      },
    },
    notes: [
      "Server mengirim POST request ke URL webhook Anda dengan Content-Type: application/json",
      "Pastikan endpoint Anda merespons dengan status HTTP 200",
      "Timeout pengiriman: 8 detik",
      "Header X-WA-Gateway-Secret dikirim jika Anda mengisi Secret saat daftar webhook",
      "Pesan dari grup: data.from = nomor grup, data.participant = nomor anggota pengirim",
      "Jika ada media, data.media.stream berisi raw buffer (Buffer.toJSON format)",
    ],
  },
];

const METHOD_COLOR: Record<string, string> = {
  GET: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400",
  POST: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400",
  DELETE: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400",
};

function MethodBadge({ method }: { method: string }) {
  return (
    <span className={cn("text-xs font-bold px-2 py-0.5 rounded-md", METHOD_COLOR[method])}>
      {method}
    </span>
  );
}

function CodeBlock({ code, language = "json" }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="rounded-xl overflow-hidden border border-border">
      <div className="flex items-center justify-between px-4 py-2 bg-zinc-900 border-b border-zinc-700">
        <span className="text-xs text-zinc-400 font-mono">{language}</span>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-zinc-400 hover:text-white hover:bg-zinc-700"
          onClick={handleCopy}
        >
          {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
        </Button>
      </div>
      <pre className="bg-zinc-900 text-zinc-100 p-4 overflow-x-auto text-xs leading-relaxed font-mono whitespace-pre-wrap break-all">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function EndpointContent({ ep, userApiKey }: { ep: ApiEndpoint; userApiKey: string }) {
  function fillApiKey(obj: object): object {
    return JSON.parse(JSON.stringify(obj, (_, v) =>
      v === "1234567890" ? userApiKey : v
    ));
  }

  return (
    <div className="space-y-6 pt-2 pb-4">
      {ep.description && (
        <p className="text-sm text-muted-foreground">{ep.description}</p>
      )}

      {/* Endpoint URL */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Endpoint</p>
        <div className="bg-muted/50 rounded-lg px-3 py-2.5 border border-border">
          <code className="text-sm text-primary font-mono break-all">
            {getDocBaseUrl()}{ep.endpoint.startsWith("/") ? ep.endpoint : `/${ep.endpoint}`}
          </code>
        </div>
      </div>

      {/* Parameters table */}
      {ep.params.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            {ep.id === "example-webhook" ? "Payload" : "Request Body (JSON / Query)"}
          </p>
          <div className="border border-border rounded-xl overflow-hidden overflow-x-auto">
            <table className="w-full text-sm min-w-[480px]">
              <thead>
                <tr className="bg-muted/50 border-b border-border">
                  <th className="text-left px-3 py-2.5 font-semibold text-xs text-muted-foreground uppercase tracking-wide w-28">Parameter</th>
                  <th className="text-left px-3 py-2.5 font-semibold text-xs text-muted-foreground uppercase tracking-wide w-16">Type</th>
                  <th className="text-left px-3 py-2.5 font-semibold text-xs text-muted-foreground uppercase tracking-wide w-16">Required</th>
                  <th className="text-left px-3 py-2.5 font-semibold text-xs text-muted-foreground uppercase tracking-wide">Description</th>
                </tr>
              </thead>
              <tbody>
                {ep.params.map((p, i) => (
                  <tr key={p.name} className={cn("border-b border-border last:border-0", i % 2 !== 0 && "bg-muted/20")}>
                    <td className="px-3 py-2.5">
                      <code className="text-xs font-mono font-semibold text-foreground">{p.name}</code>
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground text-xs">{p.type}</td>
                    <td className="px-3 py-2.5">
                      <span className={cn("text-xs font-medium", p.required ? "text-green-600 dark:text-green-400" : "text-muted-foreground")}>
                        {p.required ? "Yes" : "No"}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">{p.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* JSON Example */}
      {ep.jsonExample && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            {ep.id === "example-webhook" ? "Contoh Payload Webhook" : "Contoh JSON Request"}
          </p>
          <CodeBlock code={JSON.stringify(fillApiKey(ep.jsonExample), null, 4)} language="json" />
        </div>
      )}

      {/* URL Example */}
      {ep.urlExample && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Contoh URL Request</p>
          <CodeBlock code={(getDocBaseUrl() + ep.urlExample).replace("1234567890", userApiKey)} language="url" />
        </div>
      )}

      {/* Response Example */}
      {ep.responseExample && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Contoh Response</p>
          <CodeBlock code={JSON.stringify(ep.responseExample, null, 4)} language="json" />
        </div>
      )}

      {/* Notes */}
      {ep.notes && ep.notes.length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
          <p className="text-sm font-semibold text-amber-800 dark:text-amber-400 mb-2">Catatan</p>
          <ul className="space-y-1.5">
            {ep.notes.map((note, i) => (
              <li key={i} className="text-sm text-amber-700 dark:text-amber-300 flex items-start gap-2">
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0" />
                {note}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function ApiDocs() {
  const [search, setSearch] = useState("");
  const [openItem, setOpenItem] = useState<string>("send-message");

  const { data: apiKeys } = useQuery<any[]>({
    queryKey: ["api-keys"],
    queryFn: () => apiFetch("/api-keys").then((r) => r.json()),
  });

  const userApiKey = apiKeys?.[0]?.prefix ? `${apiKeys[0].prefix}...` : "YOUR_API_KEY";

  const filtered = endpoints.filter((ep) =>
    ep.title.toLowerCase().includes(search.toLowerCase()) ||
    ep.endpoint.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">
            Referensi lengkap endpoint API WA Gateway · Base URL:&nbsp;
            <code className="text-xs font-mono text-primary bg-primary/10 px-1.5 py-0.5 rounded">{getDocBaseUrl()}</code>
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs bg-muted rounded-lg px-3 py-2 border border-border self-start sm:self-auto">
          <span className="text-muted-foreground">API Key Anda:</span>
          <code className="font-mono font-semibold text-primary">{userApiKey}</code>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Cari endpoint..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Summary row */}
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span>{filtered.length} endpoint</span>
        <span>·</span>
        <button
          className="text-primary hover:underline"
          onClick={() => setOpenItem("")}
        >
          Tutup semua
        </button>
      </div>

      {/* Accordion list */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">
          Tidak ada endpoint yang cocok dengan pencarian "<strong>{search}</strong>"
        </div>
      ) : (
        <Accordion
          type="single"
          collapsible
          value={openItem}
          onValueChange={(v) => setOpenItem(v ?? "")}
          className="space-y-2"
        >
          {filtered.map((ep) => (
            <AccordionItem
              key={ep.id}
              value={ep.id}
              className="border border-border rounded-xl overflow-hidden px-0 data-[state=open]:shadow-sm"
            >
              <AccordionTrigger className="px-4 py-3.5 hover:no-underline hover:bg-muted/30 transition-colors [&[data-state=open]]:bg-muted/20 rounded-none">
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 text-left w-full mr-2">
                  {/* Method badges */}
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {ep.methods.map((m) => (
                      <MethodBadge key={m} method={m} />
                    ))}
                  </div>
                  {/* Title */}
                  <span className="font-semibold text-sm">{ep.title}</span>
                  {/* Endpoint path */}
                  <code className="text-xs text-muted-foreground font-mono hidden sm:inline">
                    {ep.endpoint.startsWith("/") ? ep.endpoint : `/${ep.endpoint}`}
                  </code>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-4 border-t border-border">
                <EndpointContent ep={ep} userApiKey={userApiKey} />
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import {
  Copy,
  RefreshCw,
  Eye,
  EyeOff,
  ChevronDown,
  ShieldCheck,
  AlertTriangle,
  Send,
  FlaskConical,
  Check,
} from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { toast } from "sonner";



function CurlBlock({ title, code }: { title: string; code: string }) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      toast.success("Contoh curl disalin");
    } catch {
      toast.error("Gagal menyalin");
    }
  };
  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-secondary/60 border-b border-border">
        <p className="text-xs font-semibold text-foreground">{title}</p>
        <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={copy}>
          <Copy className="w-3 h-3" /> Salin
        </Button>
      </div>
      <pre className="p-3 text-[11px] font-mono text-foreground overflow-x-auto whitespace-pre bg-card">
        {code}
      </pre>
    </div>
  );
}

/* ── Referensi endpoint ─────────────────────────────── */

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

interface Param {
  name: string;
  type: string;
  required: boolean;
  desc: string;
}

interface EndpointDoc {
  method: HttpMethod;
  path: string;
  title: string;
  curl: string;
  params?: Param[];
  note?: string;
  bodyExample?: string;
}

interface GroupDoc {
  title: string;
  desc: string;
  endpoints: EndpointDoc[];
}

const methodStyle: Record<HttpMethod, string> = {
  GET: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
  POST: "bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30",
  PUT: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
  PATCH: "bg-violet-500/15 text-violet-600 dark:text-violet-400 border-violet-500/30",
  DELETE: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30",
};

function buildGroups(baseUrl: string): GroupDoc[] {
  const curl = (method: string, path: string, body?: string) => {
    const lines = [
      `curl -X ${method} \\`,
      `  ${baseUrl}${path} \\`,
      `  -H "X-API-Key: YOUR_API_KEY" \\`,
      `  -H "Content-Type: application/json"`,
    ];
    if (body) lines.push(`  -d '${body}'`);
    return lines.join("\n");
  };

  const J = (o: object) => JSON.stringify(o, null, 4);

  return [
    {
      title: "Pesan",
      desc: "Kirim pesan teks, media, dan blast ke banyak nomor.",
      endpoints: [
        {
          method: "POST",
          path: "/api/messages/send",
          title: "Kirim satu pesan",
          params: [
            { name: "deviceId", type: "number", required: true, desc: "ID perangkat pengirim" },
            { name: "to", type: "string", required: true, desc: "Nomor tujuan, format 62812xxxxxxx" },
            { name: "type", type: "string", required: false, desc: "text | image | document | audio" },
            { name: "content", type: "string", required: true, desc: "Isi pesan teks" },
            { name: "mediaUrl", type: "string", required: false, desc: "URL media (untuk type selain text)" },
            { name: "caption", type: "string", required: false, desc: "Caption media" },
            { name: "replyTo", type: "string", required: false, desc: "WA message ID yang dibalas (balas pesan tertentu)" },
            { name: "idempotencyKey", type: "string", required: false, desc: "Kunci unik; request dengan key sama tidak dikirim ulang (anti dobel saat retry)" },
          ],
          bodyExample: J({ deviceId: 1, to: "6281234567890", type: "text", content: "Halo dari API WaGataway!" }),
          curl: curl("POST", "/api/messages/send", `{\n    "deviceId": 1,\n    "to": "6281234567890",\n    "type": "text",\n    "content": "Halo dari API WaGataway!"\n  }`),
        },
        {
          method: "POST",
          path: "/api/messages/send-bulk",
          title: "Kirim pesan ke banyak nomor sekaligus",
          params: [
            { name: "deviceId", type: "number", required: true, desc: "ID perangkat pengirim" },
            { name: "recipients", type: "string[]", required: true, desc: "Daftar nomor tujuan" },
            { name: "content", type: "string", required: true, desc: "Isi pesan" },
          ],
          bodyExample: J({ deviceId: 1, recipients: ["6281234567890", "6289876543210"], content: "Promo hari ini!" }),
          curl: curl("POST", "/api/messages/send-bulk", `{\n    "deviceId": 1,\n    "recipients": ["6281234567890", "6289876543210"],\n    "content": "Promo hari ini!"\n  }`),
          note: "Pengiriman berjalan antre; nomor yang masuk blacklist otomatis dilewati.",
        },
        {
          method: "POST",
          path: "/api/messages/send-poll",
          title: "Kirim polling/voting",
          params: [
            { name: "deviceId", type: "number", required: true, desc: "ID perangkat pengirim" },
            { name: "to", type: "string", required: true, desc: "Nomor tujuan" },
            { name: "question", type: "string", required: true, desc: "Pertanyaan polling" },
            { name: "options", type: "string[]", required: true, desc: "2-12 pilihan jawaban" },
            { name: "allowMultiple", type: "boolean", required: false, desc: "Boleh pilih lebih dari satu" },
          ],
          bodyExample: J({ deviceId: 1, to: "6281234567890", question: "Pilih jadwal meeting", options: ["Senin pagi", "Selasa siang", "Rabu sore"] }),
          curl: curl("POST", "/api/messages/send-poll", `{\n    "deviceId": 1,\n    "to": "6281234567890",\n    "question": "Pilih jadwal meeting",\n    "options": ["Senin pagi", "Selasa siang", "Rabu sore"]\n  }`),
        },
        {
          method: "POST",
          path: "/api/messages/send-interactive",
          title: "Kirim pesan dengan tombol (maks 3)",
          params: [
            { name: "deviceId", type: "number", required: true, desc: "ID perangkat pengirim" },
            { name: "to", type: "string", required: true, desc: "Nomor tujuan" },
            { name: "body", type: "string", required: true, desc: "Isi pesan" },
            { name: "buttons", type: "{id,title}[]", required: true, desc: "1-3 tombol quick reply" },
            { name: "footer", type: "string", required: false, desc: "Teks footer kecil" },
          ],
          bodyExample: J({ deviceId: 1, to: "6281234567890", body: "Mau pesan apa?", buttons: [{ id: "menu", title: "Lihat Menu" }, { id: "cs", title: "Hubungi CS" }] }),
          curl: curl("POST", "/api/messages/send-interactive", `{\n    "deviceId": 1,\n    "to": "6281234567890",\n    "body": "Mau pesan apa?",\n    "buttons": [{ "id": "menu", "title": "Lihat Menu" }, { "id": "cs", "title": "Hubungi CS" }]\n  }`),
        },
        {
          method: "POST",
          path: "/api/messages/send-sticker",
          title: "Kirim stiker (file webp)",
          params: [
            { name: "deviceId", type: "number", required: true, desc: "ID perangkat pengirim" },
            { name: "to", type: "string", required: true, desc: "Nomor tujuan" },
            { name: "mediaUrl", type: "string", required: true, desc: "URL file .webp" },
          ],
          bodyExample: J({ deviceId: 1, to: "6281234567890", mediaUrl: "https://contoh.com/stiker.webp" }),
          curl: curl("POST", "/api/messages/send-sticker", `{\n    "deviceId": 1,\n    "to": "6281234567890",\n    "mediaUrl": "https://contoh.com/stiker.webp"\n  }`),
        },
        {
          method: "POST",
          path: "/api/messages/send-voice-note",
          title: "Kirim voice note",
          params: [
            { name: "deviceId", type: "number", required: true, desc: "ID perangkat pengirim" },
            { name: "to", type: "string", required: true, desc: "Nomor tujuan" },
            { name: "mediaUrl", type: "string", required: true, desc: "URL file audio (idealnya ogg/opus)" },
          ],
          bodyExample: J({ deviceId: 1, to: "6281234567890", mediaUrl: "https://contoh.com/suara.ogg" }),
          curl: curl("POST", "/api/messages/send-voice-note", `{\n    "deviceId": 1,\n    "to": "6281234567890",\n    "mediaUrl": "https://contoh.com/suara.ogg"\n  }`),
        },
        {
          method: "POST",
          path: "/api/messages/send-location",
          title: "Kirim lokasi",
          params: [
            { name: "deviceId", type: "number", required: true, desc: "ID perangkat pengirim" },
            { name: "to", type: "string", required: true, desc: "Nomor tujuan" },
            { name: "latitude", type: "number", required: true, desc: "-90 sampai 90" },
            { name: "longitude", type: "number", required: true, desc: "-180 sampai 180" },
            { name: "name", type: "string", required: false, desc: "Nama tempat" },
            { name: "address", type: "string", required: false, desc: "Alamat" },
            { name: "live", type: "boolean", required: false, desc: "Live location" },
          ],
          bodyExample: J({ deviceId: 1, to: "6281234567890", latitude: -6.2088, longitude: 106.8456, name: "Monas", address: "Jakarta Pusat" }),
          curl: curl("POST", "/api/messages/send-location", `{\n    "deviceId": 1,\n    "to": "6281234567890",\n    "latitude": -6.2088,\n    "longitude": 106.8456,\n    "name": "Monas",\n    "address": "Jakarta Pusat"\n  }`),
        },
        {
          method: "GET",
          path: "/api/messages/:id/status",
          title: "Cek status satu pesan",
          curl: curl("GET", "/api/messages/1/status"),
          note: "Status: pending, sent, delivered, read, failed, revoked.",
        },
        {
          method: "DELETE",
          path: "/api/messages/:id",
          title: "Tarik pesan (hapus untuk semua orang)",
          curl: curl("DELETE", "/api/messages/1"),
          note: "Hanya untuk pesan milik sendiri yang masih dalam jendela waktu WhatsApp.",
        },
      ],
    },
    {
      title: "Perangkat",
      desc: "Kelola perangkat WhatsApp yang terhubung.",
      endpoints: [
        { method: "GET", path: "/api/devices", title: "Daftar semua perangkat", curl: curl("GET", "/api/devices") },
        {
          method: "POST",
          path: "/api/devices",
          title: "Tambah perangkat baru",
          params: [{ name: "name", type: "string", required: true, desc: "Nama perangkat" }],
          bodyExample: J({ name: "CS Toko" }),
          curl: curl("POST", "/api/devices", `{\n    "name": "CS Toko"\n  }`),
        },
        { method: "GET", path: "/api/devices/:id", title: "Detail satu perangkat", curl: curl("GET", "/api/devices/1") },
        {
          method: "PUT",
          path: "/api/devices/:id",
          title: "Ubah nama perangkat",
          bodyExample: J({ name: "CS Toko Baru" }),
          curl: curl("PUT", "/api/devices/1", `{\n    "name": "CS Toko Baru"\n  }`),
        },
        { method: "DELETE", path: "/api/devices/:id", title: "Hapus perangkat", curl: curl("DELETE", "/api/devices/1") },
        {
          method: "GET",
          path: "/api/devices/:id/qr",
          title: "Ambil string QR untuk pairing",
          curl: curl("GET", "/api/devices/1/qr"),
          note: "QR berubah tiap beberapa detik; pindai dengan WhatsApp > Perangkat Tertaut.",
        },
        {
          method: "POST",
          path: "/api/devices/:id/pair-code",
          title: "Minta kode pairing 8 karakter",
          params: [{ name: "phone", type: "string", required: true, desc: "Nomor HP perangkat, format 62812xxxxxxx" }],
          bodyExample: J({ phone: "6281234567890" }),
          curl: curl("POST", "/api/devices/1/pair-code", `{\n    "phone": "6281234567890"\n  }`),
          note: "Masukkan kode di WhatsApp > Perangkat Tertaut > Tautkan dengan nomor telepon.",
        },
        { method: "POST", path: "/api/devices/:id/connect", title: "Mulai koneksi perangkat", curl: curl("POST", "/api/devices/1/connect") },
        { method: "POST", path: "/api/devices/:id/disconnect", title: "Putuskan perangkat", curl: curl("POST", "/api/devices/1/disconnect") },
      ],
    },
    {
      title: "Kontak",
      desc: "Kelola buku kontak dan import massal.",
      endpoints: [
        { method: "GET", path: "/api/contacts", title: "Daftar kontak (mendukung ?limit=&search=)", curl: curl("GET", "/api/contacts?limit=20") },
        {
          method: "POST",
          path: "/api/contacts",
          title: "Tambah kontak",
          params: [
            { name: "name", type: "string", required: true, desc: "Nama kontak" },
            { name: "phone", type: "string", required: true, desc: "Nomor HP" },
            { name: "email", type: "string", required: false, desc: "Email" },
          ],
          bodyExample: J({ name: "Budi", phone: "6281234567890" }),
          curl: curl("POST", "/api/contacts", `{\n    "name": "Budi",\n    "phone": "6281234567890"\n  }`),
        },
        {
          method: "PUT",
          path: "/api/contacts/:id",
          title: "Ubah kontak",
          bodyExample: J({ name: "Budi Santoso" }),
          curl: curl("PUT", "/api/contacts/1", `{\n    "name": "Budi Santoso"\n  }`),
        },
        { method: "DELETE", path: "/api/contacts/:id", title: "Hapus kontak", curl: curl("DELETE", "/api/contacts/1") },
        {
          method: "POST",
          path: "/api/contacts/import",
          title: "Import banyak kontak sekaligus",
          params: [{ name: "contacts", type: "array", required: true, desc: "Array {name, phone, email?}" }],
          bodyExample: J({ contacts: [{ name: "Budi", phone: "6281234567890" }, { name: "Sari", phone: "6289876543210" }] }),
          curl: curl("POST", "/api/contacts/import", `{\n    "contacts": [\n      { "name": "Budi", "phone": "6281234567890" },\n      { "name": "Sari", "phone": "6289876543210" }\n    ]\n  }`),
        },
        {
          method: "POST",
          path: "/api/contacts/validate",
          title: "Validasi massal: cek nomor terdaftar di WA",
          params: [
            { name: "deviceId", type: "number", required: true, desc: "ID perangkat (harus connected)" },
            { name: "numbers", type: "string[]", required: true, desc: "Daftar nomor, maks 100 per request" },
          ],
          bodyExample: J({ deviceId: 1, numbers: ["6281234567890", "6280000000000"] }),
          curl: curl("POST", "/api/contacts/validate", `{\n    "deviceId": 1,\n    "numbers": ["6281234567890", "6280000000000"]\n  }`),
          note: "Cocok untuk membersihkan daftar blast sebelum dikirim. Response: array {number, registered, jid}.",
        },
      ],
    },
    {
      title: "Grup WhatsApp",
      desc: "Buat dan kelola grup WhatsApp lewat API.",
      endpoints: [
        {
          method: "GET",
          path: "/api/groups",
          title: "Daftar grup yang diikuti perangkat",
          params: [{ name: "deviceId", type: "number", required: true, desc: "ID perangkat (query param)" }],
          curl: curl("GET", "/api/groups?deviceId=1"),
        },
        {
          method: "POST",
          path: "/api/groups",
          title: "Buat grup baru",
          params: [
            { name: "deviceId", type: "number", required: true, desc: "ID perangkat (harus connected)" },
            { name: "name", type: "string", required: true, desc: "Nama grup (maks 25 karakter, batasan WA)" },
            { name: "participants", type: "string[]", required: false, desc: "Nomor peserta awal" },
          ],
          bodyExample: J({ deviceId: 1, name: "Tim CS Toko", participants: ["6281234567890"] }),
          curl: curl("POST", "/api/groups", `{\n    "deviceId": 1,\n    "name": "Tim CS Toko",\n    "participants": ["6281234567890"]\n  }`),
        },
        {
          method: "POST",
          path: "/api/groups/:jid/participants",
          title: "Tambah/kurangi peserta grup",
          params: [
            { name: "deviceId", type: "number", required: true, desc: "ID perangkat" },
            { name: "action", type: "string", required: true, desc: "add | remove" },
            { name: "participants", type: "string[]", required: true, desc: "Nomor peserta (maks 100)" },
          ],
          bodyExample: J({ deviceId: 1, action: "add", participants: ["6289876543210"] }),
          curl: curl("POST", "/api/groups/120363123456@g.us/participants", `{\n    "deviceId": 1,\n    "action": "add",\n    "participants": ["6289876543210"]\n  }`),
        },
        {
          method: "PATCH",
          path: "/api/groups/:jid",
          title: "Ubah nama/deskripsi grup",
          params: [
            { name: "deviceId", type: "number", required: true, desc: "ID perangkat" },
            { name: "name", type: "string", required: false, desc: "Nama baru (maks 25 karakter)" },
            { name: "topic", type: "string", required: false, desc: "Deskripsi grup baru" },
          ],
          bodyExample: J({ deviceId: 1, name: "Tim CS Toko (baru)" }),
          curl: curl("PATCH", "/api/groups/120363123456@g.us", `{\n    "deviceId": 1,\n    "name": "Tim CS Toko (baru)"\n  }`),
        },
      ],
    },
    {
      title: "Chat",
      desc: "Riwayat percakapan per kontak.",
      endpoints: [
        {
          method: "GET",
          path: "/api/chat/history",
          title: "Riwayat chat gabungan (inbox + pesan API)",
          params: [
            { name: "deviceId", type: "number", required: true, desc: "ID perangkat (query param)" },
            { name: "phone", type: "string", required: true, desc: "Nomor lawan bicara (query param)" },
            { name: "limit", type: "number", required: false, desc: "Maks entri, default 50, maks 200" },
            { name: "before", type: "string", required: false, desc: "Cursor paginasi, format ISO 8601" },
          ],
          curl: curl("GET", "/api/chat/history?deviceId=1&phone=6281234567890&limit=50"),
          note: "Response kronologis (terlama dulu). Setiap entri: {source: chat|api, direction: in|out, type, content, timestamp}.",
        },
      ],
    },
    {
      title: "Template",
      desc: "Template pesan siap pakai untuk balasan cepat.",
      endpoints: [
        { method: "GET", path: "/api/templates", title: "Daftar template", curl: curl("GET", "/api/templates") },
        {
          method: "POST",
          path: "/api/templates",
          title: "Buat template",
          params: [
            { name: "name", type: "string", required: true, desc: "Nama template" },
            { name: "content", type: "string", required: true, desc: "Isi template" },
          ],
          bodyExample: J({ name: "Salam pembuka", content: "Halo kak, ada yang bisa kami bantu?" }),
          curl: curl("POST", "/api/templates", `{\n    "name": "Salam pembuka",\n    "content": "Halo kak, ada yang bisa kami bantu?"\n  }`),
        },
        {
          method: "PUT",
          path: "/api/templates/:id",
          title: "Ubah template",
          bodyExample: J({ content: "Halo kak, ada yang bisa kami bantu? (baru)" }),
          curl: curl("PUT", "/api/templates/1", `{\n    "content": "Halo kak..."\n  }`),
        },
        { method: "DELETE", path: "/api/templates/:id", title: "Hapus template", curl: curl("DELETE", "/api/templates/1") },
      ],
    },
    {
      title: "Jadwal",
      desc: "Jadwalkan pesan untuk dikirim di waktu tertentu. Tersedia juga alias jamak /api/schedules dengan fungsi yang sama.",
      endpoints: [
        { method: "GET", path: "/api/schedule", title: "Daftar pesan terjadwal", curl: curl("GET", "/api/schedule") },
        { method: "GET", path: "/api/schedules", title: "Daftar pesan terjadwal (alias)", curl: curl("GET", "/api/schedules?status=pending") },
        {
          method: "POST",
          path: "/api/schedule",
          title: "Buat jadwal baru",
          params: [
            { name: "deviceId", type: "number", required: true, desc: "ID perangkat pengirim" },
            { name: "to", type: "string", required: true, desc: "Nomor tujuan" },
            { name: "content", type: "string", required: true, desc: "Isi pesan" },
            { name: "sendAt", type: "string", required: true, desc: "Waktu kirim, format ISO 8601" },
          ],
          bodyExample: J({ deviceId: 1, to: "6281234567890", content: "Jangan lupa meeting jam 9!", sendAt: "2026-10-01T09:00:00+07:00" }),
          curl: curl("POST", "/api/schedule", `{\n    "deviceId": 1,\n    "to": "6281234567890",\n    "content": "Jangan lupa meeting jam 9!",\n    "sendAt": "2026-10-01T09:00:00+07:00"\n  }`),
        },
        { method: "PATCH", path: "/api/schedule/:id/cancel", title: "Batalkan jadwal", curl: curl("PATCH", "/api/schedule/1/cancel") },
        {
          method: "PATCH",
          path: "/api/schedules/:id",
          title: "Pause / resume / cancel jadwal",
          params: [{ name: "action", type: "string", required: true, desc: "pause | resume | cancel" }],
          bodyExample: J({ action: "pause" }),
          curl: curl("PATCH", "/api/schedules/1", `{\n    "action": "pause"\n  }`),
          note: "Scheduler hanya mengeksekusi jadwal berstatus pending — pause/cancel benar-benar menghentikan pengiriman.",
        },
        { method: "DELETE", path: "/api/schedules/:id", title: "Hapus jadwal (alias)", curl: curl("DELETE", "/api/schedules/1") },
        { method: "DELETE", path: "/api/schedule/:id", title: "Hapus jadwal", curl: curl("DELETE", "/api/schedule/1") },
      ],
    },
    {
      title: "Drip Campaign",
      desc: "Rangkaian pesan otomatis bertahap.",
      endpoints: [
        { method: "GET", path: "/api/drip", title: "Daftar campaign", curl: curl("GET", "/api/drip") },
        {
          method: "POST",
          path: "/api/drip",
          title: "Buat campaign",
          params: [
            { name: "name", type: "string", required: true, desc: "Nama campaign" },
            { name: "deviceId", type: "number", required: true, desc: "ID perangkat pengirim" },
          ],
          bodyExample: J({ name: "Onboarding", deviceId: 1 }),
          curl: curl("POST", "/api/drip", `{\n    "name": "Onboarding",\n    "deviceId": 1\n  }`),
        },
        { method: "GET", path: "/api/drip/:id", title: "Detail campaign + step", curl: curl("GET", "/api/drip/1") },
        {
          method: "POST",
          path: "/api/drip/:id/enroll",
          title: "Daftarkan kontak ke campaign",
          params: [{ name: "contactIds", type: "number[]", required: true, desc: "ID kontak peserta" }],
          bodyExample: J({ contactIds: [1, 2, 3] }),
          curl: curl("POST", "/api/drip/1/enroll", `{\n    "contactIds": [1, 2, 3]\n  }`),
        },
        { method: "GET", path: "/api/drip/:id/analytics", title: "Analitik campaign", curl: curl("GET", "/api/drip/1/analytics") },
      ],
    },
    {
      title: "Webhook",
      desc: "Terima event real-time dan pantau pengiriman.",
      endpoints: [
        { method: "GET", path: "/api/webhooks", title: "Daftar webhook", curl: curl("GET", "/api/webhooks") },
        {
          method: "POST",
          path: "/api/webhooks",
          title: "Daftarkan webhook",
          params: [
            { name: "url", type: "string", required: true, desc: "URL endpoint penerima" },
            { name: "events", type: "string[]", required: true, desc: 'cth: ["message.received", "message.sent"]' },
            { name: "secret", type: "string", required: false, desc: "Secret untuk verifikasi signature" },
          ],
          bodyExample: J({ url: "https://toko.id/hook/wa", events: ["message.received", "message.sent"] }),
          curl: curl("POST", "/api/webhooks", `{\n    "url": "https://toko.id/hook/wa",\n    "events": ["message.received", "message.sent"]\n  }`),
        },
        {
          method: "PUT",
          path: "/api/webhooks/:id",
          title: "Ubah webhook",
          bodyExample: J({ isActive: false }),
          curl: curl("PUT", "/api/webhooks/1", `{\n    "isActive": false\n  }`),
        },
        { method: "DELETE", path: "/api/webhooks/:id", title: "Hapus webhook", curl: curl("DELETE", "/api/webhooks/1") },
        { method: "GET", path: "/api/webhooks/:id/deliveries", title: "Riwayat pengiriman webhook", curl: curl("GET", "/api/webhooks/1/deliveries") },
        {
          method: "POST",
          path: "/api/webhooks/:id/deliveries/:deliveryId/retry",
          title: "Kirim ulang delivery yang gagal",
          curl: curl("POST", "/api/webhooks/1/deliveries/5/retry"),
        },
      ],
    },
    {
      title: "Lainnya",
      desc: "Statistik, notifikasi, dan utilitas lain.",
      endpoints: [
        { method: "GET", path: "/api/stats/overview", title: "Ringkasan statistik dashboard", curl: curl("GET", "/api/stats/overview") },
        { method: "GET", path: "/api/notifications", title: "Daftar notifikasi", curl: curl("GET", "/api/notifications") },
        { method: "PUT", path: "/api/notifications/read-all", title: "Tandai semua dibaca", curl: curl("PUT", "/api/notifications/read-all") },
        { method: "GET", path: "/api/links", title: "Daftar short link", curl: curl("GET", "/api/links") },
        { method: "GET", path: "/api/blacklist", title: "Daftar blacklist", curl: curl("GET", "/api/blacklist") },
        { method: "GET", path: "/api/auto-reply", title: "Daftar auto reply", curl: curl("GET", "/api/auto-reply") },
      ],
    },
  ];
}

const errorCodes = [
  { code: "400", desc: "Permintaan tidak valid — periksa parameter body/query." },
  { code: "401", desc: "Tidak terautentikasi — API key salah, kedaluwarsa, atau tidak dikirim." },
  { code: "404", desc: "Resource tidak ditemukan atau bukan milik akun Anda." },
  { code: "422", desc: "Validasi gagal — lihat pesan error untuk detail field." },
  { code: "429", desc: "Terlalu banyak permintaan — tunggu sebentar lalu coba lagi." },
  { code: "500", desc: "Kesalahan server — hubungi dukungan bila berulang." },
];

/* ── Coba langsung ala Postman ──────────────────────── */

interface TryResp {
  status: number;
  ms: number;
  text: string;
}

function prettyJson(t: string): string {
  try {
    return JSON.stringify(JSON.parse(t), null, 2);
  } catch {
    return t;
  }
}

function TryIt({
  ep,
  baseUrl,
  apiKey,
  setApiKey,
}: {
  ep: EndpointDoc;
  baseUrl: string;
  apiKey: string;
  setApiKey: (v: string) => void;
}) {
  const pathParams = useMemo(
    () => [...new Set([...ep.path.matchAll(/:([A-Za-z0-9_]+)/g)].map((m) => m[1]))],
    [ep.path]
  );
  const hasBody = ["POST", "PUT", "PATCH"].includes(ep.method);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");
  const [body, setBody] = useState(ep.bodyExample ?? "");
  const [resp, setResp] = useState<TryResp | null>(null);
  const [sending, setSending] = useState(false);
  const [showKey, setShowKey] = useState(false);

  const send = async () => {
    if (!apiKey.trim()) {
      toast.error("Isi API key dulu di kolom atas");
      return;
    }
    let p = ep.path;
    for (const k of pathParams) {
      const v = (vals[k] || "").trim();
      if (!v) {
        toast.error(`Isi parameter path "${k}"`);
        return;
      }
      p = p.replace(":" + k, encodeURIComponent(v));
    }
    let json: string | undefined;
    if (hasBody && body.trim()) {
      try {
        JSON.parse(body);
        json = body;
      } catch {
        toast.error("Body bukan JSON yang valid");
        return;
      }
    }
    const q = query.trim().replace(/^\?/, "");
    const url = baseUrl + p + (q ? "?" + q : "");
    setSending(true);
    setResp(null);
    const t0 = performance.now();
    try {
      const r = await fetch(url, {
        method: ep.method,
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": apiKey.trim(),
        },
        body: hasBody ? json : undefined,
      });
      const text = await r.text();
      setResp({ status: r.status, ms: Math.round(performance.now() - t0), text });
    } catch (e) {
      setResp({
        status: 0,
        ms: 0,
        text: "Gagal terhubung: " + (e instanceof Error ? e.message : String(e)),
      });
    } finally {
      setSending(false);
    }
  };

  const statusColor =
    resp == null
      ? ""
      : resp.status === 0
        ? "bg-muted text-muted-foreground border-border"
        : resp.status < 300
          ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
          : resp.status < 500
            ? "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30"
            : "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30";

  return (
    <div className="space-y-3 rounded-lg border border-border bg-secondary/20 p-3">
      <div>
        <label className="text-xs">API Key</label>
        <div className="relative mt-1">
          <Input
            type={showKey ? "text" : "password"}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Tempel API key Anda di sini"
            className="pr-10 font-mono text-xs"
          />
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
            onClick={() => setShowKey((v) => !v)}
            aria-label={showKey ? "Sembunyikan key" : "Tampilkan key"}
          >
            {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      {pathParams.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2">
          {pathParams.map((k) => (
            <div key={k}>
              <label className="text-xs">
                <code className="font-mono">:{k}</code> <span className="text-destructive">*</span>
              </label>
              <Input
                className="mt-1 font-mono text-xs"
                placeholder={`cth: ${k === "id" || k === "deliveryId" ? "1" : "nilai"}`}
                value={vals[k] || ""}
                onChange={(e) => setVals((v) => ({ ...v, [k]: e.target.value }))}
              />
            </div>
          ))}
        </div>
      )}

      {ep.method === "GET" && (
        <div>
          <label className="text-xs">Query string (opsional)</label>
          <Input
            className="mt-1 font-mono text-xs"
            placeholder="limit=20&search=budi"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      )}

      {hasBody && (
        <div>
          <label className="text-xs">Body (JSON)</label>
          <textarea className="mt-1 font-mono text-xs min-h-[120px] flex w-full rounded-md border border-input bg-background px-3 py-2 ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            spellCheck={false}
          />
        </div>
      )}

      <Button onClick={send} disabled={sending} className="gap-2" size="sm">
        {sending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        {sending ? "Mengirim..." : "Kirim permintaan"}
      </Button>

      {resp && (
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 bg-secondary/60 border-b border-border">
            <span className="text-xs font-semibold">Respons</span>
            <Badge variant="outline" className={`font-mono ${statusColor}`}>
              {resp.status === 0 ? "ERR" : resp.status}
            </Badge>
            <span className="text-[11px] text-muted-foreground font-mono">{resp.ms} ms</span>
          </div>
          <pre className="p-3 text-[11px] font-mono overflow-x-auto whitespace-pre-wrap break-all bg-card max-h-72 overflow-y-auto">
            {prettyJson(resp.text)}
          </pre>
        </div>
      )}
    </div>
  );
}

function EndpointRow({
  ep,
  baseUrl,
  apiKey,
  setApiKey,
}: {
  ep: EndpointDoc;
  baseUrl: string;
  apiKey: string;
  setApiKey: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"curl" | "try">("curl");
  const [copied, setCopied] = useState(false);

  const copyEndpoint = async () => {
    const text = `${ep.method} ${baseUrl}${ep.path}\n\n${ep.curl}`;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback untuk browser tanpa akses clipboard API
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
      } catch {
        /* abaikan */
      }
      document.body.removeChild(ta);
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <div className="flex items-center">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex-1 min-w-0 flex items-center gap-3 px-3 py-2.5 text-left hover:bg-secondary/40 transition-colors"
        >
          <span
            className={`text-[10px] font-bold px-1.5 py-0.5 rounded border shrink-0 w-[52px] text-center ${methodStyle[ep.method]}`}
          >
            {ep.method}
          </span>
          <code className="text-xs font-mono text-foreground truncate flex-1">{ep.path}</code>
          <span className="text-xs text-muted-foreground hidden md:block truncate max-w-[220px]">{ep.title}</span>
          <ChevronDown className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
        <div className="pr-2 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 text-xs"
            onClick={copyEndpoint}
            title="Salin method, URL, dan contoh cURL"
          >
            {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
            {copied ? "Tersalin!" : "Salin"}
          </Button>
        </div>
      </div>
      {open && (
        <div className="px-3 pb-3 pt-1 space-y-3 border-t border-border bg-card">
          <p className="text-sm font-medium text-foreground pt-2">{ep.title}</p>
          {ep.note && (
            <p className="text-xs text-muted-foreground flex gap-1.5 items-start">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {ep.note}
            </p>
          )}
          {ep.params && ep.params.length > 0 && (
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-secondary/60 text-left">
                    <th className="px-3 py-1.5 font-semibold">Parameter</th>
                    <th className="px-3 py-1.5 font-semibold">Tipe</th>
                    <th className="px-3 py-1.5 font-semibold">Wajib</th>
                    <th className="px-3 py-1.5 font-semibold">Keterangan</th>
                  </tr>
                </thead>
                <tbody>
                  {ep.params.map((p) => (
                    <tr key={p.name} className="border-t border-border">
                      <td className="px-3 py-1.5 font-mono">{p.name}</td>
                      <td className="px-3 py-1.5 font-mono text-muted-foreground">{p.type}</td>
                      <td className="px-3 py-1.5">
                        {p.required ? (
                          <Badge variant="outline" className="text-[10px] border-destructive/40 text-destructive">Ya</Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-muted-foreground">{p.desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex gap-1 border-b border-border">
            {(["curl", "try"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-3 py-1.5 text-xs font-semibold border-b-2 -mb-px transition-colors ${
                  tab === t
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {t === "curl" ? "Contoh cURL" : "Coba langsung"}
              </button>
            ))}
          </div>
          {tab === "curl" ? (
            <CurlBlock title={`Contoh — ${ep.title}`} code={ep.curl} />
          ) : (
            <TryIt ep={ep} baseUrl={baseUrl} apiKey={apiKey} setApiKey={setApiKey} />
          )}
        </div>
      )}
    </div>
  );
}

/* ── Isi dokumentasi ────────────────────────────────── */

function DocsContent({ isPublic, embedded = false }: { isPublic: boolean; embedded?: boolean }) {
  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
  const groups = useMemo(() => buildGroups(baseUrl), [baseUrl]);
  const [tryKey, setTryKey] = useState(() => {
    try {
      return localStorage.getItem("wag_try_apikey") || "";
    } catch {
      return "";
    }
  });
  const [showTryKey, setShowTryKey] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem("wag_try_apikey", tryKey);
    } catch {
      /* abaikan */
    }
  }, [tryKey]);

  return (
    <div className="space-y-6">
      {!embedded && (
        <div>
          <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
            <FlaskConical className="w-5 h-5" /> Dokumentasi API
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Integrasikan WaGataway ke aplikasi Anda lewat REST API. Setiap endpoint bisa dicoba langsung dari halaman ini.
          </p>
        </div>
      )}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="w-4 h-4" /> Autentikasi
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            Semua endpoint memakai API key yang dikirim lewat header{" "}
            <code className="font-mono text-foreground bg-secondary px-1 rounded">X-API-Key</code>.
            {isPublic ? (
              <>
                {" "}Belum punya key? <Link href="/register" className="text-primary underline">Daftar gratis</Link>, lalu buat key di halaman ini setelah masuk.
              </>
            ) : (
              <> Buat key di halaman <Link href="/settings" className="text-primary underline">Setting</Link>.</>
            )}
          </p>
          <CurlBlock
            title="Contoh request terautentikasi"
            code={`curl -X GET \\\n  ${baseUrl}/api/devices \\\n  -H "X-API-Key: YOUR_API_KEY"`}
          />
          <div className="rounded-lg border border-border p-3 text-xs text-muted-foreground">
            Key terikat ke akun Anda — data yang bisa diakses hanya milik akun pemilik key. Key yang nonaktif atau kedaluwarsa akan ditolak (401).
          </div>
        </CardContent>
      </Card>

      <Card id="docs-try">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Send className="w-4 h-4" /> Coba langsung
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <label className="text-xs">API key untuk semua percobaan di halaman ini</label>
          <div className="relative">
            <Input
              type={showTryKey ? "text" : "password"}
              value={tryKey}
              onChange={(e) => setTryKey(e.target.value)}
              placeholder="Tempel API key Anda — tersimpan lokal di browser ini saja"
              className="pr-10 font-mono text-xs"
            />
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
              onClick={() => setShowTryKey((v) => !v)}
              aria-label={showTryKey ? "Sembunyikan" : "Tampilkan"}
            >
              {showTryKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Buka tab "Coba langsung" di endpoint mana pun, isi parameter, lalu tekan Kirim permintaan — respons tampil di bawahnya seperti Postman.
          </p>
        </CardContent>
      </Card>

      <div className="space-y-4">
        {groups.map((g) => (
          <Card key={g.title}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{g.title}</CardTitle>
              <p className="text-xs text-muted-foreground">{g.desc}</p>
            </CardHeader>
            <CardContent className="space-y-2">
              {g.endpoints.map((ep) => (
                <EndpointRow
                  key={`${ep.method}-${ep.path}`}
                  ep={ep}
                  baseUrl={baseUrl}
                  apiKey={tryKey}
                  setApiKey={setTryKey}
                />
              ))}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Kode error umum</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-xs">
              <tbody>
                {errorCodes.map((e) => (
                  <tr key={e.code} className="border-t border-border first:border-t-0">
                    <td className="px-3 py-2 font-mono font-bold w-16">{e.code}</td>
                    <td className="px-3 py-2 text-muted-foreground">{e.desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <p className="text-[11px] text-muted-foreground text-center pb-4 flex items-center justify-center gap-1">
        <Check className="w-3 h-3" /> Base URL API: <code className="font-mono">{baseUrl}/api</code>
      </p>
    </div>
  );
}

function PublicHeader() {
  return (
    <header className="border-b border-border bg-card/90 backdrop-blur sticky top-0 z-40">
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-base font-bold tracking-tight">WaGataway</span>
          <Badge variant="secondary" className="text-[10px]">Dokumentasi API</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/login">
            <Button variant="ghost" size="sm">Masuk</Button>
          </Link>
          <Link href="/register">
            <Button size="sm">Daftar</Button>
          </Link>
        </div>
      </div>
    </header>
  );
}

export default function ApiDocs({ embedded = false }: { embedded?: boolean }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-5 h-5 border-2 border-foreground border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (user) {
    if (embedded) {
      return <DocsContent isPublic={false} embedded />;
    }
    return (
      <DashboardLayout>
        <DocsContent isPublic={false} />
      </DashboardLayout>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <PublicHeader />
      <main className="max-w-5xl mx-auto px-4 py-6">
        <DocsContent isPublic={true} />
      </main>
    </div>
  );
}

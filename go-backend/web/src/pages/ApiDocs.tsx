import { useEffect, useState } from "react";
import {
  Plus,
  KeyRound,
  Copy,
  Trash2,
  X,
  RefreshCw,
  Eye,
  EyeOff,
  ChevronDown,
  ShieldCheck,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { apiGet, apiPost, apiDelete } from "@/lib/api";
import { toast } from "sonner";

interface ApiKey {
  id: number;
  name: string;
  keyPrefix: string;
  isActive: boolean;
  lastUsed: string | null;
  createdAt: string;
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative bg-card text-card-foreground border border-border rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-border sticky top-0 bg-card rounded-t-xl">
          <h3 className="font-semibold">{title}</h3>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose} aria-label="Tutup">
            <X className="w-4 h-4" />
          </Button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

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

function EndpointRow({ ep }: { ep: EndpointDoc }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-secondary/40 transition-colors"
      >
        <span
          className={`text-[10px] font-bold px-1.5 py-0.5 rounded border shrink-0 w-[52px] text-center ${methodStyle[ep.method]}`}
        >
          {ep.method}
        </span>
        <code className="text-xs font-mono text-foreground truncate flex-1">{ep.path}</code>
        <span className="text-xs text-muted-foreground hidden md:block truncate max-w-[220px]">
          {ep.title}
        </span>
        <ChevronDown
          className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="border-t border-border p-3 space-y-3 bg-secondary/20">
          <p className="text-xs text-muted-foreground md:hidden">{ep.title}</p>
          {ep.params && ep.params.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-muted-foreground border-b border-border">
                    <th className="py-1.5 pr-3 font-medium">Parameter</th>
                    <th className="py-1.5 pr-3 font-medium">Tipe</th>
                    <th className="py-1.5 pr-3 font-medium">Wajib</th>
                    <th className="py-1.5 font-medium">Keterangan</th>
                  </tr>
                </thead>
                <tbody>
                  {ep.params.map((p) => (
                    <tr key={p.name} className="border-b border-border/50 last:border-0">
                      <td className="py-1.5 pr-3 font-mono text-foreground">{p.name}</td>
                      <td className="py-1.5 pr-3 text-muted-foreground">{p.type}</td>
                      <td className="py-1.5 pr-3">
                        {p.required ? (
                          <Badge variant="default" className="text-[10px]">Ya</Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px]">Tidak</Badge>
                        )}
                      </td>
                      <td className="py-1.5 text-muted-foreground">{p.desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {ep.note && (
            <p className="text-xs text-muted-foreground flex gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>{ep.note}</span>
            </p>
          )}
          <CurlBlock title="Contoh curl" code={ep.curl} />
        </div>
      )}
    </div>
  );
}

function buildGroups(baseUrl: string): GroupDoc[] {
  const curl = (method: HttpMethod, path: string, body?: string) => {
    const lines = [
      `curl -X ${method} ${baseUrl}${path} \\`,
      `  -H "Authorization: Bearer <API_KEY>" \\`,
      `  -H "Content-Type: application/json"${body ? " \\" : ""}`,
    ];
    if (body) lines.push(`  -d '${body}'`);
    return lines.join("\n");
  };

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
          ],
          curl: curl(
            "POST",
            "/api/messages/send",
            `{\n    "deviceId": 1,\n    "to": "6281234567890",\n    "type": "text",\n    "content": "Halo dari API WaGataway!"\n  }`
          ),
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
          curl: curl(
            "POST",
            "/api/messages/send-bulk",
            `{\n    "deviceId": 1,\n    "recipients": ["6281234567890", "6289876543210"],\n    "content": "Promo hari ini!"\n  }`
          ),
          note: "Pengiriman berjalan antre; nomor yang masuk blacklist otomatis dilewati.",
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
          curl: curl("POST", "/api/devices", `{\n    "name": "CS Toko"\n  }`),
        },
        { method: "GET", path: "/api/devices/:id", title: "Detail satu perangkat", curl: curl("GET", "/api/devices/1") },
        {
          method: "PUT",
          path: "/api/devices/:id",
          title: "Ubah nama perangkat",
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
          curl: curl("POST", "/api/contacts", `{\n    "name": "Budi",\n    "phone": "6281234567890"\n  }`),
        },
        { method: "PUT", path: "/api/contacts/:id", title: "Ubah kontak", curl: curl("PUT", "/api/contacts/1", `{\n    "name": "Budi Santoso"\n  }`) },
        { method: "DELETE", path: "/api/contacts/:id", title: "Hapus kontak", curl: curl("DELETE", "/api/contacts/1") },
        {
          method: "POST",
          path: "/api/contacts/import",
          title: "Import banyak kontak sekaligus",
          params: [{ name: "contacts", type: "array", required: true, desc: "Array {name, phone, email?}" }],
          curl: curl(
            "POST",
            "/api/contacts/import",
            `{\n    "contacts": [\n      { "name": "Budi", "phone": "6281234567890" },\n      { "name": "Sari", "phone": "6289876543210" }\n    ]\n  }`
          ),
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
          curl: curl("POST", "/api/templates", `{\n    "name": "Salam pembuka",\n    "content": "Halo kak, ada yang bisa kami bantu?"\n  }`),
        },
        { method: "PUT", path: "/api/templates/:id", title: "Ubah template", curl: curl("PUT", "/api/templates/1", `{\n    "content": "Halo kak..."\n  }`) },
        { method: "DELETE", path: "/api/templates/:id", title: "Hapus template", curl: curl("DELETE", "/api/templates/1") },
      ],
    },
    {
      title: "Jadwal",
      desc: "Jadwalkan pesan untuk dikirim di waktu tertentu.",
      endpoints: [
        { method: "GET", path: "/api/schedule", title: "Daftar pesan terjadwal", curl: curl("GET", "/api/schedule") },
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
          curl: curl(
            "POST",
            "/api/schedule",
            `{\n    "deviceId": 1,\n    "to": "6281234567890",\n    "content": "Jangan lupa meeting jam 9!",\n    "sendAt": "2026-10-01T09:00:00+07:00"\n  }`
          ),
        },
        { method: "PATCH", path: "/api/schedule/:id/cancel", title: "Batalkan jadwal", curl: curl("PATCH", "/api/schedule/1/cancel") },
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
          curl: curl("POST", "/api/drip", `{\n    "name": "Onboarding",\n    "deviceId": 1\n  }`),
        },
        { method: "GET", path: "/api/drip/:id", title: "Detail campaign + step", curl: curl("GET", "/api/drip/1") },
        {
          method: "POST",
          path: "/api/drip/:id/enroll",
          title: "Daftarkan kontak ke campaign",
          params: [{ name: "contactIds", type: "number[]", required: true, desc: "ID kontak peserta" }],
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
            { name: "events", type: "string[]", required: true, desc: "cth: [\"message.received\", \"message.sent\"]" },
            { name: "secret", type: "string", required: false, desc: "Secret untuk verifikasi signature" },
          ],
          curl: curl(
            "POST",
            "/api/webhooks",
            `{\n    "url": "https://toko.id/hook/wa",\n    "events": ["message.received", "message.sent"]\n  }`
          ),
        },
        { method: "PUT", path: "/api/webhooks/:id", title: "Ubah webhook", curl: curl("PUT", "/api/webhooks/1", `{\n    "isActive": false\n  }`) },
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

export default function ApiDocs() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [newKeyName, setNewKeyName] = useState("");
  const [showNewKey, setShowNewKey] = useState(true);
  const [deleting, setDeleting] = useState<ApiKey | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    apiGet<{ apiKeys: ApiKey[] }>("/api-keys")
      .then((d) => setKeys(d.apiKeys || []))
      .catch((e) => setError(e.message || "Gagal memuat API key"))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const createKey = async () => {
    if (!name.trim()) {
      toast.error("Nama API key wajib diisi");
      return;
    }
    setSaving(true);
    try {
      const res = await apiPost<{ apiKey: ApiKey; key: string }>("/api-keys", {
        name: name.trim(),
      });
      setKeys((prev) => [res.apiKey, ...prev]);
      setNewKey(res.key);
      setNewKeyName(name.trim());
      setShowNewKey(true);
      setName("");
      setShowForm(false);
      toast.success("API key dibuat");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal membuat API key");
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await apiDelete(`/api-keys/${deleting.id}`);
      setKeys((prev) => prev.filter((k) => k.id !== deleting.id));
      toast.success("API key dihapus");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal menghapus");
    } finally {
      setDeleting(null);
    }
  };

  const copyNewKey = async () => {
    if (!newKey) return;
    try {
      await navigator.clipboard.writeText(newKey);
      toast.success("API key disalin");
    } catch {
      toast.error("Gagal menyalin");
    }
  };

  const baseUrl = typeof window !== "undefined" ? window.location.origin : "https://wa.clipku.com";
  const groups = buildGroups(baseUrl);

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2 className="text-lg font-semibold text-foreground">API Developer</h2>
        <p className="text-sm text-muted-foreground">
          Integrasikan WaGataway ke aplikasi Anda via REST API
        </p>
      </div>

      {/* API Keys */}
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-semibold">API Key</CardTitle>
          <Button size="sm" className="gap-1.5" onClick={() => setShowForm(true)}>
            <Plus className="w-3.5 h-3.5" /> Buat Key
          </Button>
        </CardHeader>
        <CardContent>
          {newKey && (
            <div className="mb-4 rounded-lg border border-amber-500/50 bg-amber-500/5 p-3 space-y-2">
              <p className="text-xs font-semibold text-foreground">
                Key "{newKeyName}" berhasil dibuat — salin sekarang, key penuh hanya ditampilkan sekali.
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs font-mono bg-background border border-border rounded px-2 py-1.5 break-all">
                  {showNewKey ? newKey : "•".repeat(32)}
                </code>
                <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => setShowNewKey((v) => !v)} aria-label="Tampilkan/sembunyikan">
                  {showNewKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </Button>
                <Button variant="outline" size="sm" className="gap-1 shrink-0" onClick={copyNewKey}>
                  <Copy className="w-3.5 h-3.5" /> Salin
                </Button>
              </div>
              <Button variant="ghost" size="sm" className="text-xs" onClick={() => setNewKey(null)}>
                Tutup peringatan ini
              </Button>
            </div>
          )}

          {loading ? (
            <div className="space-y-2">
              {[0, 1].map((i) => (
                <div key={i} className="h-12 rounded bg-secondary animate-pulse" />
              ))}
            </div>
          ) : error ? (
            <div className="text-center py-6 space-y-3">
              <p className="text-sm text-destructive">{error}</p>
              <Button size="sm" variant="outline" onClick={load} className="gap-1.5">
                <RefreshCw className="w-3.5 h-3.5" /> Coba lagi
              </Button>
            </div>
          ) : keys.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              Belum ada API key. Buat key pertama untuk mulai integrasi.
            </p>
          ) : (
            <div className="space-y-2">
              {keys.map((k) => (
                <div
                  key={k.id}
                  className="flex items-center justify-between gap-2 rounded-md border border-border p-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-md bg-secondary flex items-center justify-center shrink-0">
                      <KeyRound className="w-4 h-4 text-foreground" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-foreground truncate">{k.name}</p>
                        <Badge variant={k.isActive ? "default" : "outline"} className="text-[10px]">
                          {k.isActive ? "Aktif" : "Nonaktif"}
                        </Badge>
                      </div>
                      <p className="text-xs font-mono text-muted-foreground">
                        {k.keyPrefix}••••••••
                        {k.lastUsed ? ` · terakhir dipakai ${new Date(k.lastUsed).toLocaleString("id-ID")}` : " · belum dipakai"}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive shrink-0"
                    onClick={() => setDeleting(k)}
                    aria-label={`Hapus ${k.name}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Autentikasi */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <ShieldCheck className="w-4 h-4" /> Autentikasi
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Semua endpoint di bawah <code className="font-mono">/api</code> membutuhkan autentikasi.
            Pilih salah satu dari dua cara berikut:
          </p>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs font-semibold text-foreground mb-1">1. Header X-API-Key</p>
              <p className="text-xs text-muted-foreground">
                Disarankan untuk integrasi server. Buat key di kartu API Key di atas.
              </p>
            </div>
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs font-semibold text-foreground mb-1">2. Bearer Token (JWT)</p>
              <p className="text-xs text-muted-foreground">
                Token sesi dari <code className="font-mono">POST /api/auth/login</code>. Cocok untuk
                skrip sekali jalan.
              </p>
            </div>
          </div>
          <CurlBlock
            title="Contoh autentikasi"
            code={`# Dengan API key\ncurl ${baseUrl}/api/devices \\\\\n  -H "X-API-Key: wg_xxxxxxxxxxxxxxxx"\n\n# Dengan JWT\ncurl ${baseUrl}/api/devices \\\\\n  -H "Authorization: Bearer eyJhbGciOi..."`}
          />
        </CardContent>
      </Card>

      {/* Referensi endpoint */}
      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Referensi Endpoint</h3>
          <p className="text-xs text-muted-foreground">
            Klik endpoint untuk melihat parameter dan contoh curl.
          </p>
        </div>
        {groups.map((g) => (
          <div key={g.title} className="space-y-2">
            <div>
              <p className="text-sm font-semibold text-foreground">{g.title}</p>
              <p className="text-xs text-muted-foreground">{g.desc}</p>
            </div>
            <div className="space-y-2">
              {g.endpoints.map((ep) => (
                <EndpointRow key={`${ep.method}-${ep.path}`} ep={ep} />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Kode error */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Kode Error</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-1.5">
            {errorCodes.map((e) => (
              <div key={e.code} className="flex items-start gap-3 text-xs">
                <code className="font-mono font-bold text-foreground w-10 shrink-0">{e.code}</code>
                <p className="text-muted-foreground">{e.desc}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {showForm && (
        <Modal title="Buat API Key" onClose={() => setShowForm(false)}>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium">Nama key</label>
              <Input
                className="mt-1"
                placeholder="cth: Integrasi Toko Online"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowForm(false)} disabled={saving}>
                Batal
              </Button>
              <Button onClick={createKey} disabled={saving}>
                {saving ? "Membuat..." : "Buat Key"}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {deleting && (
        <Modal title="Hapus API Key" onClose={() => setDeleting(null)}>
          <p className="text-sm text-muted-foreground">
            Hapus API key <span className="font-semibold text-foreground">"{deleting.name}"</span>?
            Aplikasi yang memakai key ini akan kehilangan akses.
          </p>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setDeleting(null)}>
              Batal
            </Button>
            <Button variant="destructive" onClick={confirmDelete}>
              Hapus
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

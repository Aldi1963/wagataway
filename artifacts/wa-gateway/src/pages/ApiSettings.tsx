import { useQuery } from "@tanstack/react-query";
import {
  Key, Copy, Code, CheckCircle2, BookOpen, ExternalLink, ChevronRight, Globe,
  MessageSquare, ListChecks, Smartphone, User, Info,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { ApiKeySection } from "@/components/ApiKeySection";

/* ── Endpoint list ─────────────────────────────────────────────────────────── */
const ENDPOINT_GROUPS = [
  {
    label: "Pesan",
    icon: MessageSquare,
    color: "text-green-600",
    bg: "bg-green-50 dark:bg-green-950/30",
    items: [
      { method: "POST", path: "/send-message",  desc: "Kirim pesan teks" },
      { method: "POST", path: "/send-media",    desc: "Kirim gambar/video/dokumen" },
      { method: "POST", path: "/send-poll",     desc: "Kirim polling" },
      { method: "POST", path: "/send-button",   desc: "Kirim pesan tombol" },
      { method: "POST", path: "/send-list",     desc: "Kirim pesan list" },
      { method: "POST", path: "/send-sticker",  desc: "Kirim stiker" },
    ],
  },
  {
    label: "Pengiriman Lanjutan",
    icon: Globe,
    color: "text-blue-600",
    bg: "bg-blue-50 dark:bg-blue-950/30",
    items: [
      { method: "POST", path: "/send-location", desc: "Kirim lokasi GPS" },
      { method: "POST", path: "/send-vcard",    desc: "Kirim kartu kontak" },
      { method: "GET",  path: "/check-number",  desc: "Cek nomor WhatsApp" },
    ],
  },
  {
    label: "Perangkat",
    icon: Smartphone,
    color: "text-purple-600",
    bg: "bg-purple-50 dark:bg-purple-950/30",
    items: [
      { method: "POST", path: "/device/create",      desc: "Daftarkan perangkat baru" },
      { method: "GET",  path: "/device/info",         desc: "Info & status perangkat" },
      { method: "GET",  path: "/device/qr",           desc: "Ambil QR code" },
      { method: "POST", path: "/device/disconnect",   desc: "Putus koneksi perangkat" },
    ],
  },
  {
    label: "Akun & Webhook",
    icon: User,
    color: "text-orange-600",
    bg: "bg-orange-50 dark:bg-orange-950/30",
    items: [
      { method: "GET",  path: "/user/info",    desc: "Info akun pengguna" },
      { method: "POST", path: "/user/create",  desc: "Buat akun (admin)" },
      { method: "POST", path: "/webhook",      desc: "Payload webhook masuk" },
    ],
  },
];

const METHOD_COLOR: Record<string, string> = {
  GET:    "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400",
  POST:   "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400",
  DELETE: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400",
};

/* ── Main component ─────────────────────────────────────────────────────────── */
export default function ApiSettings() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const BASE_URL = typeof window !== "undefined" ? `${window.location.origin}/api` : "/api";

  const { data: apiKeys } = useQuery<{ key: string }[]>({
    queryKey: ["api-keys"],
    queryFn: () => apiFetch("/api-keys").then((r) => r.json()),
  });

  const firstKey = apiKeys?.[0]?.key ?? "YOUR_API_KEY";

  const codeExample = `curl -X POST "${BASE_URL}/send-message" \\
  -H "Content-Type: application/json" \\
  -d '{
    "api_key": "${firstKey}",
    "sender": "628111000001",
    "number": "628123456789",
    "message": "Halo dari WA Gateway!"
  }'`;

  const codeExampleGet = `${BASE_URL}/send-message?api_key=${firstKey}&sender=628111000001&number=628123456789&message=Halo`;

  function copyCode(text: string) {
    navigator.clipboard.writeText(text);
    toast({ title: "Contoh kode disalin!" });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => setLocation("/api-docs")}
        >
          <BookOpen className="w-4 h-4" />
          Dokumentasi Lengkap
          <ExternalLink className="w-3.5 h-3.5" />
        </Button>
      </div>

      {/* Base URL banner */}
      <div className="flex items-center gap-3 px-4 py-3 rounded-xl border"
        style={{ background: "hsl(145 63% 49% / 0.05)", borderColor: "hsl(145 63% 49% / 0.25)" }}>
        <Globe className="w-4 h-4 shrink-0" style={{ color: "hsl(145 63% 42%)" }} />
        <div className="flex-1 min-w-0">
          <span className="text-xs font-medium text-muted-foreground mr-2">Base URL</span>
          <code className="text-sm font-mono font-semibold break-all">{BASE_URL}</code>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          onClick={() => { navigator.clipboard.writeText(BASE_URL); toast({ title: "Base URL disalin!" }); }}
        >
          <Copy className="w-3.5 h-3.5" />
        </Button>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* ── Left: API Key + Code examples ──────────────────────── */}
        <div className="lg:col-span-2 space-y-5">

          {/* API Key card */}
          <Card className="border-border/60">
            <CardHeader className="pb-4 border-b border-border/50"
              style={{ background: "linear-gradient(135deg, hsl(145 63% 49% / 0.05) 0%, transparent 60%)" }}>
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center"
                  style={{ backgroundColor: "hsl(145 63% 49% / 0.12)" }}>
                  <Key className="w-4 h-4" style={{ color: "hsl(145 63% 42%)" }} />
                </div>
                <div>
                  <CardTitle className="text-sm">API Key</CardTitle>
                  <CardDescription className="text-xs mt-0.5">
                    Gunakan <code className="bg-muted px-1 rounded text-[11px]">api_key</code> ini di setiap request · Hanya 1 key per akun
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-5">
              <ApiKeySection variant="full" />
            </CardContent>
          </Card>

          {/* Code example card */}
          <Card className="border-border/60">
            <CardHeader className="pb-3 border-b border-border/50">
              <CardTitle className="text-sm flex items-center gap-2">
                <Code className="w-4 h-4 text-muted-foreground" />
                Contoh Penggunaan
              </CardTitle>
            </CardHeader>
            <CardContent className="p-5 space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">JSON / POST Body</p>
                  <Button variant="ghost" size="sm" className="h-6 gap-1 text-xs text-muted-foreground" onClick={() => copyCode(codeExample)}>
                    <Copy className="w-3 h-3" /> Salin
                  </Button>
                </div>
                <div className="rounded-xl overflow-hidden border border-border">
                  <div className="px-3 py-1.5 bg-zinc-900 border-b border-zinc-700">
                    <span className="text-xs text-zinc-400 font-mono">bash / curl</span>
                  </div>
                  <pre className="bg-zinc-900 text-zinc-100 p-4 overflow-x-auto text-xs leading-relaxed font-mono whitespace-pre-wrap break-all">
                    {codeExample}
                  </pre>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Query String / GET</p>
                  <Button variant="ghost" size="sm" className="h-6 gap-1 text-xs text-muted-foreground" onClick={() => copyCode(codeExampleGet)}>
                    <Copy className="w-3 h-3" /> Salin
                  </Button>
                </div>
                <div className="rounded-xl overflow-hidden border border-border">
                  <div className="px-3 py-1.5 bg-zinc-900 border-b border-zinc-700">
                    <span className="text-xs text-zinc-400 font-mono">url</span>
                  </div>
                  <pre className="bg-zinc-900 text-zinc-100 p-4 overflow-x-auto text-xs leading-relaxed font-mono whitespace-pre-wrap break-all">
                    {codeExampleGet}
                  </pre>
                </div>
              </div>

              <div className="flex items-start gap-2 p-3 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900">
                <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <p className="text-xs text-blue-700 dark:text-blue-400">
                  Semua endpoint mendukung <strong>POST (JSON body)</strong> maupun <strong>GET (query string)</strong>.
                  Sertakan <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">api_key</code> di setiap request.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── Right: Endpoint list ──────────────────────────────── */}
        <div className="space-y-4">
          <Card className="border-border/60 overflow-hidden">
            <CardHeader className="pb-3 border-b border-border/50"
              style={{ background: "linear-gradient(135deg, hsl(145 63% 49% / 0.05) 0%, transparent 60%)" }}>
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2">
                  <ListChecks className="w-4 h-4 text-muted-foreground" />
                  Endpoint Tersedia
                </CardTitle>
                <button
                  onClick={() => setLocation("/api-docs")}
                  className="text-xs flex items-center gap-0.5 hover:underline"
                  style={{ color: "hsl(145 63% 42%)" }}
                >
                  Lihat docs <ChevronRight className="w-3 h-3" />
                </button>
              </div>
            </CardHeader>

            <CardContent className="p-0">
              {ENDPOINT_GROUPS.map((group, gi) => (
                <div key={group.label}>
                  {gi > 0 && <Separator />}
                  <div className="px-4 py-2.5">
                    <div className="flex items-center gap-1.5 mb-2">
                      <div className={`w-5 h-5 rounded flex items-center justify-center ${group.bg}`}>
                        <group.icon className={`w-3 h-3 ${group.color}`} />
                      </div>
                      <span className="text-xs font-semibold text-muted-foreground">{group.label}</span>
                    </div>
                    <div className="space-y-1.5">
                      {group.items.map((ep) => (
                        <div key={ep.path} className="flex items-center gap-2">
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${METHOD_COLOR[ep.method]}`}>
                            {ep.method}
                          </span>
                          <div className="flex-1 min-w-0">
                            <code className="text-xs font-mono text-foreground/80 truncate block">{ep.path}</code>
                            <p className="text-[10px] text-muted-foreground truncate">{ep.desc}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}

              <Separator />
              <div className="px-4 py-3">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full gap-1.5 text-xs h-8"
                  onClick={() => setLocation("/api-docs")}
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  Buka Dokumentasi Lengkap
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Auth info card */}
          <Card className="border-border/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Key className="w-4 h-4 text-muted-foreground" />
                Cara Autentikasi
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-2 text-xs text-muted-foreground">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: "hsl(145 63% 45%)" }} />
                <span>Sertakan <code className="bg-muted px-1 rounded">api_key</code> di body JSON (POST) atau query string (GET)</span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: "hsl(145 63% 45%)" }} />
                <span>Parameter <code className="bg-muted px-1 rounded">sender</code> adalah nomor perangkat pengirim (format: 628xxx)</span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: "hsl(145 63% 45%)" }} />
                <span>Parameter <code className="bg-muted px-1 rounded">number</code> adalah nomor tujuan penerima</span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: "hsl(145 63% 45%)" }} />
                <span>Response selalu berformat JSON: <code className="bg-muted px-1 rounded">{"{ status, message, data }"}</code></span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

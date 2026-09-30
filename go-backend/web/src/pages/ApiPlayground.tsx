import { useState } from "react";
import { toast } from "sonner";
import { Play, FlaskConical, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";

interface Preset {
  label: string;
  method: "GET" | "POST";
  path: string;
  body: string;
}

const PRESETS: Preset[] = [
  {
    label: "Kirim Pesan",
    method: "POST",
    path: "/messages/send",
    body: '{\n  "device_id": 1,\n  "to": "62812xxxxxxx",\n  "message": "Halo dari playground!"\n}',
  },
  {
    label: "Cek Device",
    method: "GET",
    path: "/devices",
    body: "",
  },
  {
    label: "Daftar Kontak",
    method: "GET",
    path: "/contacts",
    body: "",
  },
  {
    label: "Status Device",
    method: "GET",
    path: "/devices/1/status",
    body: "",
  },
  {
    label: "Kirim Gambar",
    method: "POST",
    path: "/messages/send",
    body: '{\n  "device_id": 1,\n  "to": "62812xxxxxxx",\n  "message": "Lihat gambar ini",\n  "image_url": "https://example.com/gambar.jpg"\n}',
  },
];

const inputCls =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring";

export default function ApiPlayground() {
  const [method, setMethod] = useState<"GET" | "POST">("POST");
  const [path, setPath] = useState("/messages/send");
  const [body, setBody] = useState(PRESETS[0].body);
  const [apiKey, setApiKey] = useState(() => localStorage.getItem("wag_try_apikey") || "");
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<{ status: number; body: string } | null>(null);

  const applyPreset = (p: Preset) => {
    setMethod(p.method);
    setPath(p.path);
    setBody(p.body);
    setResponse(null);
  };

  const send = async () => {
    if (!path.trim()) { toast.error("Path endpoint wajib diisi"); return; }
    let parsed: unknown = undefined;
    if (method === "POST" && body.trim()) {
      try {
        parsed = JSON.parse(body);
      } catch {
        toast.error("Body bukan JSON valid");
        return;
      }
    }
    setLoading(true);
    setResponse(null);
    try {
      const res = await apiFetch(path.trim(), {
        method,
        headers: apiKey ? { "X-API-Key": apiKey } : {},
        body: parsed !== undefined ? JSON.stringify(parsed) : undefined,
      });
      const text = await res.text();
      let pretty = text;
      try { pretty = JSON.stringify(JSON.parse(text), null, 2); } catch { /* biarkan mentah */ }
      setResponse({ status: res.status, body: pretty });
      if (!res.ok) toast.error(`HTTP ${res.status}`);
      else toast.success("Berhasil");
    } catch (e: any) {
      toast.error(e.message || "Request gagal");
      setResponse({ status: 0, body: e.message || "Network error" });
    } finally {
      setLoading(false);
    }
  };

  const copyResponse = () => {
    if (!response) return;
    navigator.clipboard.writeText(response.body)
      .then(() => toast.success("Response disalin"))
      .catch(() => toast.error("Gagal menyalin"));
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-foreground">API Playground</h1>
        <p className="text-sm text-muted-foreground">Coba endpoint API langsung dari dashboard.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FlaskConical className="w-4 h-4" /> Request
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium">Preset</label>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {PRESETS.map((p) => (
                  <Button key={p.label} variant="outline" size="sm" onClick={() => applyPreset(p)}>
                    {p.label}
                  </Button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-[110px_1fr] gap-2">
              <select value={method} onChange={(e) => setMethod(e.target.value as "GET" | "POST")} className={inputCls}>
                <option value="GET">GET</option>
                <option value="POST">POST</option>
              </select>
              <Input value={path} onChange={(e) => setPath(e.target.value)} placeholder="/messages/send" className="font-mono" />
            </div>
            <div>
              <label className="text-sm font-medium">API Key <span className="text-muted-foreground font-normal">(opsional, X-API-Key)</span></label>
              <Input
                type="password"
                className="mt-1.5 font-mono"
                placeholder="wag_..."
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value);
                  localStorage.setItem("wag_try_apikey", e.target.value);
                }}
              />
            </div>
            {method === "POST" && (
              <div>
                <label className="text-sm font-medium">Body (JSON)</label>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={8}
                  spellCheck={false}
                  className={`${inputCls} mt-1.5 font-mono text-[13px] resize-y`}
                />
              </div>
            )}
            <Button onClick={send} disabled={loading} className="w-full gap-2">
              <Play className="w-4 h-4" /> {loading ? "Mengirim..." : "Kirim Request"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-base">
              <span>Response</span>
              {response && (
                <Button variant="ghost" size="sm" onClick={copyResponse} className="gap-1.5">
                  <Copy className="w-3.5 h-3.5" /> Salin
                </Button>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!response ? (
              <p className="text-sm text-muted-foreground">Belum ada request. Hasil akan tampil di sini.</p>
            ) : (
              <div className="space-y-2">
                <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                  response.status >= 200 && response.status < 300
                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                    : "bg-red-500/10 text-red-600 dark:text-red-400"
                }`}>
                  HTTP {response.status}
                </span>
                <pre className="max-h-[420px] overflow-auto rounded-lg bg-muted p-3 font-mono text-[12px] text-foreground whitespace-pre-wrap break-words">
                  {response.body}
                </pre>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

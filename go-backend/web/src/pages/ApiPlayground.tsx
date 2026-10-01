import { useState } from "react";
import { toast } from "sonner";
import { Play, FlaskConical, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dropdown } from "@/components/ui/dropdown";
import { apiFetch } from "@/lib/api";
import { useLang } from "@/lib/i18n";

interface Preset {
  label: string;
  method: "GET" | "POST";
  path: string;
  body: string;
}

const inputCls =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring";

export default function ApiPlayground({ embedded = false }: { embedded?: boolean }) {
  const { t } = useLang();
  const PRESETS: Preset[] = [
    {
      label: t("apiPlayground.presetSendMessage"),
      method: "POST",
      path: "/messages/send",
      body: '{\n  "deviceId": 1,\n  "to": "62812xxxxxxx",\n  "content": "Halo dari playground!"\n}',
    },
    {
      label: t("apiPlayground.presetCheckDevice"),
      method: "GET",
      path: "/devices",
      body: "",
    },
    {
      label: t("apiPlayground.presetContactList"),
      method: "GET",
      path: "/contacts",
      body: "",
    },
    {
      label: t("apiPlayground.presetDeviceStatus"),
      method: "GET",
      path: "/devices/1/status",
      body: "",
    },
    {
      label: t("apiPlayground.presetSendImage"),
      method: "POST",
      path: "/messages/send",
      body: '{\n  "deviceId": 1,\n  "to": "62812xxxxxxx",\n  "content": "Lihat gambar ini",\n  "mediaUrl": "https://example.com/gambar.jpg"\n}',
    },
  ];
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
    if (!path.trim()) { toast.error(t("apiPlayground.toastPathRequired")); return; }
    let parsed: unknown = undefined;
    if (method === "POST" && body.trim()) {
      try {
        parsed = JSON.parse(body);
      } catch {
        toast.error(t("apiPlayground.toastInvalidJsonBody"));
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
      if (!res.ok) toast.error(t("apiPlayground.toastHttpError").replace("{status}", String(res.status)));
      else toast.success(t("apiPlayground.toastSuccess"));
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
      .then(() => toast.success(t("apiPlayground.toastResponseCopied")))
      .catch(() => toast.error(t("apiPlayground.toastCopyFailed")));
  };

  return (
    <div className="space-y-4">
      {!embedded && (
        <div>
          <h1 className="text-xl font-bold text-foreground">API Playground</h1>
          <p className="text-sm text-muted-foreground">{t("apiPlayground.subtitle")}</p>
        </div>
      )}

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
              <Dropdown
                value={method}
                onChange={(v) => setMethod(v as "GET" | "POST")}
                ariaLabel={t("apiPlayground.httpMethodAria")}
                options={[
                  { value: "GET", label: "GET" },
                  { value: "POST", label: "POST" },
                ]}
              />
              <Input value={path} onChange={(e) => setPath(e.target.value)} placeholder="/messages/send" className="font-mono" />
            </div>
            <div>
              <label className="text-sm font-medium">API Key <span className="text-muted-foreground font-normal">({t("apiPlayground.optional")})</span></label>
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
              <Play className="w-4 h-4" /> {loading ? t("apiPlayground.sending") : t("apiPlayground.sendRequest")}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-base">
              <span>{t("apiPlayground.responseTitle")}</span>
              {response && (
                <Button variant="ghost" size="sm" onClick={copyResponse} className="gap-1.5">
                  <Copy className="w-3.5 h-3.5" /> {t("apiPlayground.copy")}
                </Button>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!response ? (
              <p className="text-sm text-muted-foreground">{t("apiPlayground.emptyState")}</p>
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

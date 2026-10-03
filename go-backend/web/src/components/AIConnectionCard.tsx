import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Bot, Eye, EyeOff, FlaskConical, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { apiGet, apiPut, apiDelete, apiPost } from "@/lib/api";
import { useLang } from "@/lib/i18n";

interface AIConnection {
  configured: boolean;
  provider?: string;
  model?: string;
  baseUrl?: string;
  keyHint?: string;
  isActive?: boolean;
}

interface TestResult {
  ok: boolean;
  message: string;
  latencyMs?: number;
}

const PROVIDERS = [
  { value: "openai", label: "OpenAI (ChatGPT)" },
  { value: "gemini", label: "Google Gemini" },
  { value: "anthropic", label: "Anthropic (Claude)" },
  { value: "custom", label: "Custom (OpenAI-compatible)" },
];

const CURATED_MODELS: Record<string, string[]> = {
  openai: ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini", "gpt-4.1"],
  gemini: ["gemini-2.0-flash", "gemini-2.5-flash", "gemini-1.5-flash"],
  anthropic: ["claude-3-5-haiku-20241022", "claude-sonnet-4-20250514"],
  custom: [],
};

const CUSTOM_MODEL = "__custom__";

const inputCls =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring";
const labelCls = "block text-xs font-medium text-muted-foreground mb-1";

export default function AIConnectionCard({ onChanged }: { onChanged?: () => void }) {
  const { t } = useLang();
  const [conn, setConn] = useState<AIConnection | null>(null);
  const [loading, setLoading] = useState(true);
  const [provider, setProvider] = useState("gemini");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [modelSel, setModelSel] = useState(CURATED_MODELS["gemini"][0]);
  const [customModel, setCustomModel] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const r = await apiGet<AIConnection>("/ai-connection");
      setConn(r);
      if (r.configured) {
        setProvider(r.provider || "gemini");
        const models = CURATED_MODELS[r.provider || "gemini"] || [];
        if (r.model && models.includes(r.model)) {
          setModelSel(r.model);
          setCustomModel("");
        } else {
          setModelSel(CUSTOM_MODEL);
          setCustomModel(r.model || "");
        }
        setBaseUrl(r.baseUrl || "");
      }
    } catch {
      /* biarkan kartu tampil kosong */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const effectiveModel = () =>
    modelSel === CUSTOM_MODEL ? customModel.trim() : modelSel;

  const save = async () => {
    const model = effectiveModel();
    if (!model) { toast.error(t("aiReply.connModel") + " wajib diisi"); return; }
    if (!conn?.configured && !apiKey.trim()) {
      toast.error(t("aiReply.connApiKey") + " wajib diisi");
      return;
    }
    setSaving(true);
    setTestResult(null);
    try {
      const r = await apiPut<{ connection: AIConnection }>("/ai-connection", {
        provider,
        apiKey: apiKey.trim(),
        model,
        baseUrl: provider === "custom" ? baseUrl.trim() : "",
      });
      setConn(r.connection);
      setApiKey("");
      toast.success(t("aiReply.connSaved"));
      onChanged?.();
    } catch (e: any) {
      toast.error(e.message || t("aiReply.saveError"));
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    const model = effectiveModel();
    setTesting(true);
    setTestResult(null);
    try {
      const r = await apiPost<TestResult>("/ai-connection/test", {
        provider,
        apiKey: apiKey.trim(),
        model,
        baseUrl: provider === "custom" ? baseUrl.trim() : "",
      });
      setTestResult(r);
      if (r.ok) toast.success(`${t("aiReply.connTestOk")} (${r.latencyMs}ms)`);
      else toast.error(r.message || t("aiReply.connTestFail"));
    } catch (e: any) {
      const res = { ok: false, message: e.message || t("aiReply.connTestFail") };
      setTestResult(res);
      toast.error(res.message);
    } finally {
      setTesting(false);
    }
  };

  const remove = async () => {
    if (!confirm(t("aiReply.connDelete") + "?")) return;
    try {
      await apiDelete("/ai-connection");
      setConn({ configured: false });
      setApiKey("");
      setTestResult(null);
      toast.success(t("aiReply.connDeleted"));
      onChanged?.();
    } catch (e: any) {
      toast.error(e.message || t("aiReply.deleteError"));
    }
  };

  const models = CURATED_MODELS[provider] || [];
  const providerLabel = PROVIDERS.find((p) => p.value === provider)?.label ?? provider;

  return (
    <Card>
      <CardContent className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
          <div className="flex items-center gap-2">
            <Bot className="w-5 h-5 text-primary" />
            <h2 className="text-base font-semibold">{t("aiReply.connTitle")}</h2>
          </div>
          {loading ? null : conn?.configured ? (
            <Badge variant="success">
              {providerLabel} • {conn.model}
            </Badge>
          ) : (
            <Badge variant="secondary">{t("aiReply.connNotConfigured")}</Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground mb-4">{t("aiReply.connSubtitle")}</p>

        {loading ? (
          <p className="text-sm text-muted-foreground">{t("aiReply.loading")}</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={labelCls}>{t("aiReply.connProvider")}</label>
              <select
                className={inputCls}
                value={provider}
                onChange={(e) => {
                  const p = e.target.value;
                  setProvider(p);
                  const ms = CURATED_MODELS[p] || [];
                  setModelSel(ms[0] ?? CUSTOM_MODEL);
                  setCustomModel("");
                  setTestResult(null);
                }}
              >
                {PROVIDERS.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>{t("aiReply.connModel")}</label>
              {models.length > 0 ? (
                <select
                  className={inputCls}
                  value={modelSel}
                  onChange={(e) => { setModelSel(e.target.value); setTestResult(null); }}
                >
                  {models.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                  <option value={CUSTOM_MODEL}>{t("aiReply.connCustomModel")}</option>
                </select>
              ) : (
                <Input
                  className={inputCls}
                  value={modelSel === CUSTOM_MODEL ? customModel : modelSel}
                  onChange={(e) => { setModelSel(CUSTOM_MODEL); setCustomModel(e.target.value); }}
                  placeholder="nama-model"
                />
              )}
              {models.length > 0 && modelSel === CUSTOM_MODEL && (
                <Input
                  className={`${inputCls} mt-2`}
                  value={customModel}
                  onChange={(e) => setCustomModel(e.target.value)}
                  placeholder="nama-model"
                />
              )}
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}>{t("aiReply.connApiKey")}</label>
              <div className="relative">
                <Input
                  type={showKey ? "text" : "password"}
                  className={`${inputCls} pr-11`}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={conn?.configured && conn.keyHint ? `${conn.keyHint} (${t("aiReply.connKeySaved")})` : t("aiReply.connApiKeyPlaceholder")}
                  autoComplete="off"
                />
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowKey((v) => !v)}
                  aria-label={showKey ? t("aiReply.connHideKey") : t("aiReply.connShowKey")}
                >
                  {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">{t("aiReply.connApiKeyHint")}</p>
            </div>
            {provider === "custom" && (
              <div className="sm:col-span-2">
                <label className={labelCls}>{t("aiReply.connBaseUrl")}</label>
                <Input
                  className={inputCls}
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder={t("aiReply.connBaseUrlPlaceholder")}
                  inputMode="url"
                />
                <p className="text-[11px] text-muted-foreground mt-1">{t("aiReply.connBaseUrlHint")}</p>
              </div>
            )}
          </div>
        )}

        {!loading && (
          <div className="flex flex-wrap items-center gap-2 mt-4">
            <Button size="sm" onClick={save} disabled={saving}>
              {saving ? t("aiReply.saving") : t("aiReply.connSave")}
            </Button>
            <Button size="sm" variant="tint" onClick={test} disabled={testing} className="gap-1.5">
              <FlaskConical className="w-4 h-4" />
              {testing ? t("aiReply.connTesting") : t("aiReply.connTest")}
            </Button>
            {conn?.configured && (
              <Button size="sm" variant="ghost" onClick={remove} className="gap-1.5 text-destructive">
                <Trash2 className="w-4 h-4" /> {t("aiReply.connDelete")}
              </Button>
            )}
            {testResult && (
              <span className={`text-xs ${testResult.ok ? "text-green-600" : "text-destructive"}`}>
                {testResult.ok
                  ? `${t("aiReply.connTestOk")}${testResult.latencyMs != null ? ` • ${testResult.latencyMs}ms` : ""}`
                  : `${t("aiReply.connTestFail")}: ${testResult.message}`}
              </span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

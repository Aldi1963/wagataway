import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Sparkles, Key, Brain, Save, Loader2, Eye, EyeOff, Info,
  CheckCircle, AlertCircle, RefreshCw, LogIn, User, Building2,
  Mail, Lock, Hash, ChevronRight, ShieldCheck,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

interface AiSettings {
  openaiApiKey: string;
  openaiDefaultModel: string;
  aiEnabled: boolean;
  loginMethod: "apikey" | "account";
  accountEmail: string;
  accountPassword: string;
  accountPasswordSet: boolean;
  accountType: "personal" | "business";
  orgId: string;
}

const MODELS = [
  { group: "GPT-5 (Terbaru)", items: [
    { value: "gpt-5-nano",  label: "GPT-5 Nano — Tercepat & terhemat" },
    { value: "gpt-5-mini",  label: "GPT-5 Mini — Seimbang ★ Rekomendasi" },
    { value: "gpt-5",       label: "GPT-5 — Cerdas & akurat" },
    { value: "gpt-5.2",     label: "GPT-5.2 — Terpintar" },
  ]},
  { group: "GPT-4o", items: [
    { value: "gpt-4o-mini", label: "GPT-4o Mini — Cepat & hemat" },
    { value: "gpt-4o",      label: "GPT-4o — Pintar & multimodal" },
    { value: "gpt-4o-2024-11-20", label: "GPT-4o (Nov 2024) — Versi terbaru" },
  ]},
  { group: "GPT-4", items: [
    { value: "gpt-4-turbo", label: "GPT-4 Turbo — Konteks panjang" },
    { value: "gpt-4",       label: "GPT-4 — Klasik andalan" },
  ]},
  { group: "GPT-3.5", items: [
    { value: "gpt-3.5-turbo", label: "GPT-3.5 Turbo — Sangat hemat" },
  ]},
  { group: "Reasoning (o-series)", items: [
    { value: "o4-mini", label: "o4 Mini — Reasoning cepat" },
    { value: "o3-mini", label: "o3 Mini — Reasoning hemat" },
    { value: "o1-mini", label: "o1 Mini — Reasoning mendalam" },
    { value: "o1",      label: "o1 — Reasoning penuh" },
  ]},
];

const AI_GREEN = "hsl(145 63% 49%)";
const AI_GREEN_BG = "hsl(145 63% 49% / 0.12)";

export default function AdminAiSettings() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [showKey, setShowKey] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [loginResult, setLoginResult] = useState<{ ok: boolean; message: string } | null>(null);

  const { data, isLoading } = useQuery<AiSettings>({
    queryKey: ["admin-ai-settings"],
    queryFn: () => apiFetch("/admin/ai-settings").then((r) => r.json()),
  });

  const [form, setForm] = useState<AiSettings>({
    openaiApiKey: "",
    openaiDefaultModel: "gpt-5-mini",
    aiEnabled: false,
    loginMethod: "apikey",
    accountEmail: "",
    accountPassword: "",
    accountPasswordSet: false,
    accountType: "personal",
    orgId: "",
  });

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  const save = useMutation({
    mutationFn: (body: AiSettings) =>
      apiFetch("/admin/ai-settings", { method: "PUT", body: JSON.stringify(body) }).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-ai-settings"] });
      toast({ title: "Pengaturan AI disimpan" });
    },
    onError: () => toast({ title: "Gagal menyimpan", variant: "destructive" }),
  });

  // Login account mutation — simpan kredensial akun OpenAI
  const loginAccount = useMutation({
    mutationFn: () =>
      apiFetch("/admin/ai-settings", {
        method: "PUT",
        body: JSON.stringify({
          loginMethod: "account",
          accountEmail: form.accountEmail,
          accountPassword: form.accountPassword,
          accountType: form.accountType,
          orgId: form.orgId,
        }),
      }).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-ai-settings"] });
      setLoginResult({
        ok: true,
        message: `Berhasil login sebagai ${form.accountEmail} (${form.accountType === "business" ? "Akun Bisnis" : "Akun Pribadi"})`,
      });
      toast({ title: "Login OpenAI berhasil!" });
    },
    onError: () => {
      setLoginResult({ ok: false, message: "Gagal menyimpan kredensial. Coba lagi." });
      toast({ title: "Gagal login OpenAI", variant: "destructive" });
    },
  });

  async function testConnection() {
    setTestLoading(true);
    setTestResult(null);
    try {
      const r = await apiFetch("/admin/ai-settings/test", { method: "POST" });
      const json = await r.json();
      setTestResult({ ok: json.ok, message: json.message });
    } catch {
      setTestResult({ ok: false, message: "Tidak bisa terhubung ke server" });
    } finally {
      setTestLoading(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const currentData = data ?? form;
  const isAccountMode = form.loginMethod === "account";

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-2xl mx-auto">

      {/* ── Metode Login ────────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm flex items-center gap-2">
            <LogIn className="h-4 w-4" style={{ color: AI_GREEN }} />
            Metode Autentikasi OpenAI
          </CardTitle>
          <CardDescription className="text-xs">
            Pilih cara menghubungkan platform ke OpenAI
          </CardDescription>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="grid grid-cols-2 gap-3">
            {/* API Key option */}
            <button
              type="button"
              className={`relative flex flex-col items-start gap-2 rounded-xl border-2 p-4 text-left transition-all ${
                !isAccountMode
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/40"
              }`}
              onClick={() => setForm((f) => ({ ...f, loginMethod: "apikey" }))}
            >
              {!isAccountMode && (
                <div className="absolute top-2 right-2 w-4 h-4 rounded-full flex items-center justify-center" style={{ backgroundColor: AI_GREEN }}>
                  <ChevronRight className="w-2.5 h-2.5 text-white" />
                </div>
              )}
              <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: AI_GREEN_BG }}>
                <Key className="w-4 h-4" style={{ color: AI_GREEN }} />
              </div>
              <div>
                <p className="font-semibold text-sm">API Key</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Paste API key dari platform.openai.com
                </p>
              </div>
            </button>

            {/* Login Account option */}
            <button
              type="button"
              className={`relative flex flex-col items-start gap-2 rounded-xl border-2 p-4 text-left transition-all ${
                isAccountMode
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/40"
              }`}
              onClick={() => setForm((f) => ({ ...f, loginMethod: "account" }))}
            >
              {isAccountMode && (
                <div className="absolute top-2 right-2 w-4 h-4 rounded-full flex items-center justify-center" style={{ backgroundColor: AI_GREEN }}>
                  <ChevronRight className="w-2.5 h-2.5 text-white" />
                </div>
              )}
              <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: AI_GREEN_BG }}>
                <LogIn className="w-4 h-4" style={{ color: AI_GREEN }} />
              </div>
              <div>
                <p className="font-semibold text-sm">Login Akun</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Login dengan email & password OpenAI
                </p>
              </div>
            </button>
          </div>
        </CardContent>
      </Card>

      {/* ── API Key Mode ───────────────────────────────────────────────────────── */}
      {!isAccountMode && (
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <Key className="h-4 w-4" style={{ color: AI_GREEN }} />
              OpenAI API Key
            </CardTitle>
            <CardDescription className="text-xs">
              API key ini digunakan semua pengguna yang memiliki fitur AI CS Bot aktif
            </CardDescription>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-4">
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription className="text-xs">
                API key disimpan secara terenkripsi. Dapatkan API key di{" "}
                <strong>platform.openai.com/api-keys</strong>
              </AlertDescription>
            </Alert>

            <div className="space-y-1.5">
              <Label className="text-xs">API Key</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    type={showKey ? "text" : "password"}
                    placeholder="sk-proj-..."
                    value={form.openaiApiKey}
                    onChange={(e) => setForm((f) => ({ ...f, openaiApiKey: e.target.value }))}
                    className="pr-10 font-mono text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={testConnection}
                  disabled={testLoading || !currentData.openaiApiKey}
                  className="shrink-0"
                >
                  {testLoading
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                    : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
                  Test
                </Button>
              </div>
              {currentData.openaiApiKey ? (
                <div className="flex items-center gap-1.5 text-xs">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                  <span className="text-green-600">API key tersimpan</span>
                  <span className="text-muted-foreground">(···{currentData.openaiApiKey.slice(-4)})</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40" />
                  Belum ada API key
                </div>
              )}
            </div>

            {testResult && (
              <div className={`flex items-start gap-2 rounded-lg p-3 text-xs ${
                testResult.ok
                  ? "bg-green-50 text-green-700 dark:bg-green-950"
                  : "bg-red-50 text-red-700 dark:bg-red-950"
              }`}>
                {testResult.ok
                  ? <CheckCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  : <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />}
                {testResult.message}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Login Akun Mode ─────────────────────────────────────────────────────── */}
      {isAccountMode && (
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <LogIn className="h-4 w-4" style={{ color: AI_GREEN }} />
              Login Akun OpenAI
            </CardTitle>
            <CardDescription className="text-xs">
              Masukkan kredensial akun OpenAI Anda
            </CardDescription>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-4">

            {/* Account type selector */}
            <div className="space-y-2">
              <Label className="text-xs">Tipe Akun</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  className={`flex items-center gap-2.5 rounded-lg border-2 px-3 py-2.5 text-sm transition-all ${
                    form.accountType === "personal"
                      ? "border-primary bg-primary/5 font-medium"
                      : "border-border hover:border-primary/40"
                  }`}
                  onClick={() => setForm((f) => ({ ...f, accountType: "personal" }))}
                >
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                    form.accountType === "personal" ? "bg-primary/10" : "bg-muted"
                  }`}>
                    <User className={`w-3.5 h-3.5 ${form.accountType === "personal" ? "text-primary" : "text-muted-foreground"}`} />
                  </div>
                  <span>Pribadi</span>
                  {form.accountType === "personal" && (
                    <Badge className="ml-auto text-[10px] h-4 px-1.5 py-0">Dipilih</Badge>
                  )}
                </button>

                <button
                  type="button"
                  className={`flex items-center gap-2.5 rounded-lg border-2 px-3 py-2.5 text-sm transition-all ${
                    form.accountType === "business"
                      ? "border-primary bg-primary/5 font-medium"
                      : "border-border hover:border-primary/40"
                  }`}
                  onClick={() => setForm((f) => ({ ...f, accountType: "business" }))}
                >
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                    form.accountType === "business" ? "bg-primary/10" : "bg-muted"
                  }`}>
                    <Building2 className={`w-3.5 h-3.5 ${form.accountType === "business" ? "text-primary" : "text-muted-foreground"}`} />
                  </div>
                  <span>Bisnis</span>
                  {form.accountType === "business" && (
                    <Badge className="ml-auto text-[10px] h-4 px-1.5 py-0">Dipilih</Badge>
                  )}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                {form.accountType === "personal"
                  ? "Akun perorangan di platform.openai.com"
                  : "Akun organisasi/bisnis dengan Organization ID tersendiri"}
              </p>
            </div>

            <Separator />

            {/* Email */}
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5" /> Email OpenAI
              </Label>
              <Input
                type="email"
                placeholder="email@perusahaan.com"
                value={form.accountEmail}
                onChange={(e) => setForm((f) => ({ ...f, accountEmail: e.target.value }))}
                className="text-sm"
              />
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1.5">
                <Lock className="h-3.5 w-3.5" /> Password
              </Label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  placeholder={form.accountPasswordSet ? "••••••••  (tersimpan)" : "Password akun OpenAI"}
                  value={form.accountPassword}
                  onChange={(e) => setForm((f) => ({ ...f, accountPassword: e.target.value }))}
                  className="pr-10 text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {form.accountPasswordSet && (
                <div className="flex items-center gap-1.5 text-xs text-green-600">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Password tersimpan terenkripsi
                </div>
              )}
            </div>

            {/* Organization ID — business only */}
            {form.accountType === "business" && (
              <div className="space-y-1.5">
                <Label className="text-xs flex items-center gap-1.5">
                  <Hash className="h-3.5 w-3.5" /> Organization ID
                  <Badge variant="outline" className="text-[10px] h-4 px-1.5">Bisnis</Badge>
                </Label>
                <Input
                  type="text"
                  placeholder="org-xxxxxxxxxxxxxxxxxxxx"
                  value={form.orgId}
                  onChange={(e) => setForm((f) => ({ ...f, orgId: e.target.value }))}
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Temukan di: platform.openai.com → Settings → Organization → Organization ID
                </p>
              </div>
            )}

            {/* ── Tombol Login OpenAI ──────────────────────────────────────── */}
            <Button
              className="w-full gap-2 text-white"
              style={{ backgroundColor: AI_GREEN }}
              disabled={loginAccount.isPending || !form.accountEmail || !form.accountPassword}
              onClick={() => {
                setLoginResult(null);
                loginAccount.mutate();
              }}
            >
              {loginAccount.isPending
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <LogIn className="h-4 w-4" />}
              Login ke OpenAI
              {form.accountType === "business"
                ? <Badge className="ml-auto bg-white/20 text-white text-[10px]">Bisnis</Badge>
                : <Badge className="ml-auto bg-white/20 text-white text-[10px]">Pribadi</Badge>}
            </Button>

            {/* Hasil login */}
            {loginResult && (
              <div className={`flex items-start gap-2 rounded-lg p-3 text-xs ${
                loginResult.ok
                  ? "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300"
                  : "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300"
              }`}>
                {loginResult.ok
                  ? <CheckCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  : <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />}
                {loginResult.message}
              </div>
            )}

            <Separator />

            {/* API Key still required */}
            <div className="rounded-lg border border-amber-200 bg-amber-50/60 dark:bg-amber-950/20 dark:border-amber-800/50 p-3 space-y-2">
              <p className="text-xs font-semibold flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
                <Key className="h-3.5 w-3.5" />
                API Key Tetap Diperlukan
              </p>
              <p className="text-xs text-amber-700/80 dark:text-amber-400/80">
                OpenAI tidak menyediakan login langsung via API. API Key diperlukan untuk memanggil AI.
                Masukkan API key di bawah — info akun di atas tersimpan sebagai referensi profil.
              </p>
            </div>

            {/* API Key field inside account mode */}
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1.5">
                <Key className="h-3.5 w-3.5" /> API Key
              </Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    type={showKey ? "text" : "password"}
                    placeholder="sk-proj-..."
                    value={form.openaiApiKey}
                    onChange={(e) => setForm((f) => ({ ...f, openaiApiKey: e.target.value }))}
                    className="pr-10 font-mono text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={testConnection}
                  disabled={testLoading || !currentData.openaiApiKey}
                  className="shrink-0"
                >
                  {testLoading
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                    : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
                  Test
                </Button>
              </div>
              {currentData.openaiApiKey ? (
                <div className="flex items-center gap-1.5 text-xs">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                  <span className="text-green-600">API key tersimpan</span>
                  <span className="text-muted-foreground">(···{currentData.openaiApiKey.slice(-4)})</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40" />
                  Belum ada API key
                </div>
              )}
            </div>

            {testResult && (
              <div className={`flex items-start gap-2 rounded-lg p-3 text-xs ${
                testResult.ok
                  ? "bg-green-50 text-green-700 dark:bg-green-950"
                  : "bg-red-50 text-red-700 dark:bg-red-950"
              }`}>
                {testResult.ok
                  ? <CheckCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  : <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />}
                {testResult.message}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Status koneksi (jika login akun tersimpan) ─────────────────────────── */}
      {isAccountMode && currentData.accountEmail && (
        <Card className="border-emerald-300/50 bg-emerald-50/40 dark:bg-emerald-950/20">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center shrink-0">
              {currentData.accountType === "business"
                ? <Building2 className="w-5 h-5 text-emerald-600" />
                : <User className="w-5 h-5 text-emerald-600" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300 truncate">
                {currentData.accountEmail}
              </p>
              <p className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                {currentData.accountType === "business"
                  ? <><Building2 className="w-3 h-3" /> Akun Bisnis / Organisasi</>
                  : <><User className="w-3 h-3" /> Akun Pribadi</>}
                {currentData.accountType === "business" && currentData.orgId && (
                  <span className="text-muted-foreground">· Org: {currentData.orgId.slice(0, 12)}...</span>
                )}
              </p>
            </div>
            <Badge className="bg-emerald-500 hover:bg-emerald-500 text-white shrink-0">Terhubung</Badge>
          </CardContent>
        </Card>
      )}

      {/* Default Model */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm flex items-center gap-2">
            <Brain className="h-4 w-4" style={{ color: AI_GREEN }} />
            Model Default
          </CardTitle>
          <CardDescription className="text-xs">
            Model yang digunakan jika pengguna tidak memilih model secara spesifik
          </CardDescription>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-4">
          <Select
            value={form.openaiDefaultModel}
            onValueChange={(v) => setForm((f) => ({ ...f, openaiDefaultModel: v }))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MODELS.map((g) => (
                <SelectGroup key={g.group}>
                  <SelectLabel>{g.group}</SelectLabel>
                  {g.items.map((m) => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>

          <Separator />

          <div className="rounded-lg bg-muted/50 p-3 space-y-1.5 text-xs">
            <p className="font-medium">Perkiraan Biaya per 1.000 Pesan:</p>
            <div className="grid grid-cols-2 gap-2 text-muted-foreground">
              <div>GPT-3.5 Turbo: <strong className="text-foreground">~$0.003</strong></div>
              <div>GPT-4o Mini: <strong className="text-foreground">~$0.01</strong></div>
              <div>GPT-5 Nano: <strong className="text-foreground">~$0.01</strong></div>
              <div>GPT-5 Mini: <strong className="text-foreground">~$0.05</strong></div>
              <div>GPT-4o: <strong className="text-foreground">~$0.08</strong></div>
              <div>GPT-4 Turbo: <strong className="text-foreground">~$0.15</strong></div>
              <div>GPT-5: <strong className="text-foreground">~$0.20</strong></div>
              <div>o4-mini: <strong className="text-foreground">~$0.25</strong></div>
              <div>GPT-5.2: <strong className="text-foreground">~$0.50</strong></div>
              <div>o1 / o1-mini: <strong className="text-foreground">~$1.00</strong></div>
            </div>
            <p className="text-muted-foreground pt-1">Perkiraan kasar berdasarkan rata-rata 100 token per interaksi.</p>
          </div>
        </CardContent>
      </Card>

      {/* Cara Kerja */}
      <Card>
        <CardContent className="pt-4 pb-4 px-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Cara Kerja</p>
          <ul className="space-y-2">
            {[
              "Admin menghubungkan OpenAI via API Key atau info Login Akun (Pribadi/Bisnis)",
              "Untuk akun Bisnis, masukkan Organization ID untuk billing terpisah per organisasi",
              "API Key tetap wajib — digunakan platform untuk memanggil layanan AI secara langsung",
              "Fitur AI CS Bot hanya tersedia untuk pengguna dengan paket yang mengaktifkan fitur ini",
              "Pantau penggunaan dan biaya di dashboard OpenAI (platform.openai.com/usage)",
            ].map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                <span
                  className="shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold mt-0.5"
                  style={{ backgroundColor: AI_GREEN_BG, color: AI_GREEN }}
                >
                  {i + 1}
                </span>
                {item}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Button
        onClick={() => save.mutate(form)}
        disabled={save.isPending}
        style={{ backgroundColor: AI_GREEN }}
        className="text-white w-full"
      >
        {save.isPending
          ? <Loader2 className="h-4 w-4 animate-spin mr-2" />
          : <Save className="h-4 w-4 mr-2" />}
        Simpan Pengaturan AI
      </Button>
    </div>
  );
}

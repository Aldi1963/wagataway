import React, { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";

import {
  Globe, Mail, ShieldCheck, CreditCard, Sparkles, Server,
  Loader2, Save, Eye, EyeOff, RefreshCw, Brain, Key, Info,
  CheckCircle2, XCircle, CheckCircle, AlertCircle, PackageCheck,
  Terminal, Wifi, Zap, ChevronDown, Check, Users2, Smartphone,
  Clock, Gift, Trash2, DatabaseBackup, AlertTriangle,
  LogIn, User, Building2, Mail as MailIcon, Lock, Hash, ShieldCheck as ShieldCheckIcon, ChevronRight,
  Send, Bell, Plus,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ServerSettings {
  appName: string; baseUrl: string; maxDevicesPerUser: number;
  maxMessagesPerDay: number; smtpHost: string; smtpPort: number;
  smtpUser: string; smtpFrom: string; smtpPassword: string; smtpConfigured: boolean;
  maintenanceMode: boolean; registrationOpen: boolean; version: string; uptimeSeconds: number;
  totalUsers: number; totalDevices: number; nodeVersion: string; environment: string;
}

interface AiSettings {
  openaiApiKey: string; openaiDefaultModel: string; aiEnabled: boolean;
  loginMethod: "apikey" | "account";
  accountEmail: string; accountPassword: string; accountPasswordSet: boolean;
  accountType: "personal" | "business"; orgId: string;
  aiProvider: string; aiBaseUrl: string;
}

type Gateway = "none" | "pakasir" | "midtrans" | "tokopay" | "tripay";
interface GatewayConfig {
  activeGateway: Gateway;
  pakasir: { merchantId: string; apiKey: string; mode: "sandbox" | "production" };
  midtrans: { serverKey: string; clientKey: string; mode: "sandbox" | "production" };
  tokopay: { merchantId: string; secret: string; mode: "sandbox" | "production" };
  tripay: { apiKey: string; privateKey: string; merchantCode: string; mode: "sandbox" | "production" };
}
interface UpdateInfo {
  currentVersion: string; latestVersion: string; upToDate: boolean;
  releaseNotes: string; checkedAt: string;
  changelog: { version: string; date: string; notes: string }[];
}

// ─── Section definitions ──────────────────────────────────────────────────────

const SECTIONS = [
  { id: "umum",      icon: Globe,        label: "Umum",              desc: "Nama, URL, batas penggunaan" },
  { id: "email",     icon: Mail,         label: "Email & SMTP",      desc: "Konfigurasi pengiriman email" },
  { id: "akses",     icon: ShieldCheck,  label: "Akses & Mode",      desc: "Maintenance, registrasi" },
  { id: "auth",      icon: Key,          label: "Autentikasi",       desc: "Google OAuth, Sign in with Google" },
  { id: "pembayaran",icon: CreditCard,   label: "Pembayaran",        desc: "Payment gateway" },
  { id: "ai",        icon: Sparkles,     label: "Kecerdasan Buatan", desc: "OpenAI & model AI" },
  { id: "cleanup",   icon: Trash2,       label: "Auto-Cleanup Data", desc: "Hapus data lama secara otomatis" },
  { id: "telegram",  icon: Send,         label: "Notifikasi Telegram", desc: "Alert otomatis via bot Telegram" },
  { id: "sistem",    icon: Server,       label: "Sistem",            desc: "Versi, update, restart" },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

// ─── Shared helpers ───────────────────────────────────────────────────────────

function PasswordInput({ value, onChange, placeholder, className }: {
  value: string; onChange: (v: string) => void; placeholder?: string; className?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className={cn("relative", className)}>
      <Input type={show ? "text" : "password"} value={value} onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder} className="pr-9" />
      <button type="button" onClick={() => setShow((s) => !s)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );
}

function SectionHeader({ title, desc, icon: Icon }: { title: string; desc: string; icon?: React.ComponentType<any> }) {
  return (
    <div className="mb-6">
      <div className="flex items-center gap-3 mb-1">
        {Icon && (
          <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: "hsl(145 63% 49% / 0.12)" }}>
            <Icon className="w-4 h-4" style={{ color: "hsl(145 63% 42%)" } as React.CSSProperties} />
          </div>
        )}
        <h2 className="text-lg font-bold text-foreground tracking-tight">{title}</h2>
      </div>
      <p className="text-sm text-muted-foreground leading-relaxed pl-0">{desc}</p>
      <div className="mt-4 h-px bg-gradient-to-r from-border via-border/50 to-transparent" />
    </div>
  );
}

function formatUptime(secs: number) {
  const d = Math.floor(secs / 86400), h = Math.floor((secs % 86400) / 3600), m = Math.floor((secs % 3600) / 60);
  if (d > 0) return `${d}h ${h}j ${m}m`;
  if (h > 0) return `${h}j ${m}m`;
  return `${m}m`;
}

// ─── Section: Umum ────────────────────────────────────────────────────────────

function UmumSection() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<ServerSettings>({
    queryKey: ["admin-server-settings"],
    queryFn: () => apiFetch("/admin/server-settings").then((r) => r.json()),
  });
  const { register, handleSubmit, reset } = useForm<Partial<ServerSettings>>();
  useEffect(() => {
    if (data) reset({ appName: data.appName, baseUrl: data.baseUrl, maxDevicesPerUser: data.maxDevicesPerUser, maxMessagesPerDay: data.maxMessagesPerDay });
  }, [data, reset]);

  const save = useMutation({
    mutationFn: (body: any) => apiFetch("/admin/server-settings", { method: "PUT", body: JSON.stringify(body) }).then((r) => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-server-settings"] }); toast({ title: "Pengaturan umum disimpan" }); },
    onError: () => toast({ title: "Gagal menyimpan", variant: "destructive" }),
  });

  if (isLoading) return (
    <div className="flex flex-col items-center justify-center py-20 gap-3">
      <Loader2 className="w-6 h-6 animate-spin text-primary" />
      <p className="text-sm text-muted-foreground">Memuat pengaturan…</p>
    </div>
  );

  const stats = [
    { label: "Versi", value: data?.version ?? "-", icon: Zap, color: "text-primary", bg: "bg-primary/10" },
    { label: "Uptime", value: formatUptime(data?.uptimeSeconds ?? 0), icon: Terminal, color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-950/30" },
    { label: "Pengguna", value: String(data?.totalUsers ?? 0), icon: Users2, color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-950/30" },
    { label: "Perangkat", value: String(data?.totalDevices ?? 0), icon: Smartphone, color: "text-purple-600", bg: "bg-purple-50 dark:bg-purple-950/30" },
  ];

  return (
    <div className="space-y-6">
      <SectionHeader title="Pengaturan Umum" desc="Konfigurasi dasar aplikasi dan batasan penggunaan" icon={Globe} />

      {/* Stats strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {stats.map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="flex items-center gap-3 rounded-xl border border-border/60 bg-card px-4 py-3">
            <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0", bg)}>
              <Icon className={cn("w-4 h-4", color)} />
            </div>
            <div className="min-w-0">
              <p className="text-base font-bold leading-tight truncate">{value}</p>
              <p className="text-[11px] text-muted-foreground leading-tight">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Environment pill */}
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/60 px-2.5 py-1 rounded-full">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
          Node {data?.nodeVersion}
        </span>
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/60 px-2.5 py-1 rounded-full capitalize">
          {data?.environment ?? "development"}
        </span>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit((d) => save.mutate(d))} className="space-y-5">
        {/* App identity */}
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">Identitas Aplikasi</p>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Nama Aplikasi</Label>
              <Input
                {...register("appName")}
                placeholder="WA Gateway"
                className="bg-muted/30 border-border/60 focus-visible:border-primary focus-visible:bg-background transition-colors"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Base URL API</Label>
              <Input
                {...register("baseUrl")}
                placeholder="https://api.example.com"
                className="bg-muted/30 border-border/60 focus-visible:border-primary focus-visible:bg-background transition-colors font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">Digunakan untuk callback webhook dan tautan notifikasi email</p>
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-dashed border-border/60" />

        {/* Limits */}
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">Batas Penggunaan</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Device / Pengguna</Label>
              <div className="relative">
                <Smartphone className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  type="number"
                  {...register("maxDevicesPerUser", { valueAsNumber: true })}
                  className="pl-8 bg-muted/30 border-border/60 focus-visible:border-primary focus-visible:bg-background transition-colors"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Pesan / Hari</Label>
              <div className="relative">
                <Zap className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  type="number"
                  {...register("maxMessagesPerDay", { valueAsNumber: true })}
                  className="pl-8 bg-muted/30 border-border/60 focus-visible:border-primary focus-visible:bg-background transition-colors"
                />
              </div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Nilai 0 atau -1 berarti tidak terbatas (unlimited)</p>
        </div>

        {/* Save */}
        <Button type="submit" disabled={save.isPending} className="gap-2 rounded-xl px-5">
          {save.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Simpan Perubahan
        </Button>
      </form>

      {/* Trial settings card */}
      <TrialSettingsCard />
    </div>
  );
}

// ─── Trial Settings Card ──────────────────────────────────────────────────────

interface TrialSettings {
  trialEnabled: boolean;
  trialPlanSlug: string;
  trialPlanName: string;
  trialDurationDays: number;
}

const PLAN_OPTIONS_TRIAL = [
  { slug: "basic", name: "Basic" },
  { slug: "pro", name: "Pro" },
  { slug: "enterprise", name: "Enterprise" },
];

function TrialSettingsCard() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [enabled, setEnabled] = useState(true);
  const [planSlug, setPlanSlug] = useState("basic");
  const [days, setDays] = useState("7");

  const { data, isLoading } = useQuery<TrialSettings>({
    queryKey: ["admin-trial-settings"],
    queryFn: () => apiFetch("/admin/trial-settings").then((r) => r.json()),
  });

  useEffect(() => {
    if (data) {
      setEnabled(data.trialEnabled);
      setPlanSlug(data.trialPlanSlug);
      setDays(String(data.trialDurationDays));
    }
  }, [data]);

  const save = useMutation({
    mutationFn: () => apiFetch("/admin/trial-settings", {
      method: "PUT",
      body: JSON.stringify({
        trialEnabled: enabled,
        trialPlanSlug: planSlug,
        trialPlanName: PLAN_OPTIONS_TRIAL.find((p) => p.slug === planSlug)?.name ?? planSlug,
        trialDurationDays: Math.max(1, Number(days) || 7),
      }),
    }).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-trial-settings"] });
      toast({ title: "Pengaturan trial disimpan" });
    },
    onError: () => toast({ title: "Gagal menyimpan", variant: "destructive" }),
  });

  return (
    <Card className="border-border/60">
      <CardHeader className="pb-3 pt-4 px-5">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: "hsl(145 63% 49% / 0.12)" }}>
            <Gift className="w-4 h-4" style={{ color: "hsl(145 63% 42%)" }} />
          </div>
          <div className="flex-1 min-w-0">
            <CardTitle className="text-sm">Pengaturan Trial Akun</CardTitle>
            <CardDescription className="text-xs mt-0.5">Konfigurasi trial gratis yang diberikan saat pengguna baru mendaftar</CardDescription>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </div>
      </CardHeader>

      {isLoading ? (
        <CardContent className="px-5 pb-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Memuat…
          </div>
        </CardContent>
      ) : (
        <CardContent className="px-5 pb-5 space-y-4">
          <div className={cn("space-y-4 transition-opacity", !enabled && "opacity-40 pointer-events-none")}>
            {/* Duration */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-muted-foreground" /> Durasi Trial
              </Label>
              <div className="flex items-center gap-3">
                <Input
                  type="number"
                  min="1"
                  max="365"
                  value={days}
                  onChange={(e) => setDays(e.target.value)}
                  className="w-28 bg-muted/30 border-border/60 focus-visible:border-primary focus-visible:bg-background transition-colors"
                />
                <span className="text-sm text-muted-foreground">hari</span>
                <div className="flex gap-1.5 flex-wrap">
                  {[3, 7, 14, 30].map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setDays(String(d))}
                      className={cn(
                        "text-xs px-2.5 py-1 rounded-lg border transition-colors",
                        days === String(d)
                          ? "border-primary bg-primary/10 text-primary font-medium"
                          : "border-border/60 text-muted-foreground hover:border-primary/50"
                      )}
                    >
                      {d}h
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Berapa hari pengguna baru mendapat akses trial setelah registrasi</p>
            </div>

            {/* Plan */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Paket Trial</Label>
              <Select value={planSlug} onValueChange={setPlanSlug}>
                <SelectTrigger className="bg-muted/30 border-border/60 focus:border-primary transition-colors">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PLAN_OPTIONS_TRIAL.map((p) => (
                    <SelectItem key={p.slug} value={p.slug}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Paket yang aktif selama periode trial — pengguna kembali ke Free setelah trial berakhir</p>
            </div>

            {/* Preview badge */}
            <div className="rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-800/30 px-4 py-3 flex items-center gap-3">
              <Gift className="w-4 h-4 text-amber-600 shrink-0" />
              <div className="text-xs text-amber-800 dark:text-amber-300">
                <span className="font-semibold">Preview:</span>{" "}
                {enabled
                  ? `Pengguna baru mendapat trial paket ${PLAN_OPTIONS_TRIAL.find((p) => p.slug === planSlug)?.name} selama ${days || "7"} hari`
                  : "Trial dinonaktifkan — pengguna baru langsung masuk ke paket Free"}
              </div>
            </div>
          </div>

          <Button onClick={() => save.mutate()} disabled={save.isPending} className="gap-2 rounded-xl px-5 w-full sm:w-auto">
            {save.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Simpan Pengaturan Trial
          </Button>
        </CardContent>
      )}
    </Card>
  );
}

// ─── Section: Email ───────────────────────────────────────────────────────────

function EmailSection() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [smtpPassword, setSmtpPassword] = useState("");
  const [testEmail, setTestEmail] = useState("");
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string; detail?: string } | null>(null);
  const [testing, setTesting] = useState(false);

  const { data, isLoading } = useQuery<ServerSettings>({
    queryKey: ["admin-server-settings"],
    queryFn: () => apiFetch("/admin/server-settings").then((r) => r.json()),
  });
  const { register, handleSubmit, reset } = useForm<Partial<ServerSettings>>();
  useEffect(() => {
    if (data) {
      reset({ smtpHost: data.smtpHost, smtpPort: data.smtpPort, smtpUser: data.smtpUser, smtpFrom: data.smtpFrom });
      setSmtpPassword(data.smtpPassword ?? "");
    }
  }, [data, reset]);

  const save = useMutation({
    mutationFn: (body: any) => apiFetch("/admin/server-settings", {
      method: "PUT",
      body: JSON.stringify({ ...data, ...body, smtpPassword }),
    }).then((r) => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-server-settings"] }); toast({ title: "Pengaturan SMTP disimpan" }); },
    onError: () => toast({ title: "Gagal menyimpan", variant: "destructive" }),
  });

  async function handleTest() {
    if (!testEmail) { toast({ title: "Masukkan alamat email tujuan", variant: "destructive" }); return; }
    setTesting(true);
    setTestResult(null);
    try {
      const r = await apiFetch("/admin/smtp/test", {
        method: "POST",
        body: JSON.stringify({ testEmail }),
      });
      const d = await r.json();
      setTestResult(d);
      if (d.ok) toast({ title: "Email tes berhasil dikirim!" });
      else toast({ title: d.message, variant: "destructive" });
    } catch {
      setTestResult({ ok: false, message: "Gagal menghubungi server" });
    } finally {
      setTesting(false);
    }
  }

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>;

  const isConfigured = data?.smtpConfigured;

  return (
    <div className="space-y-5">
      <SectionHeader title="Email & SMTP" desc="Konfigurasi server email untuk notifikasi dan reset password" icon={Mail} />

      {/* Status banner */}
      <div className={`flex items-center gap-3 p-3 rounded-xl border text-sm ${isConfigured
        ? "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800 text-green-800 dark:text-green-300"
        : "bg-muted/60 border-border/60 text-muted-foreground"}`}>
        {isConfigured ? <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" /> : <XCircle className="w-4 h-4 shrink-0" />}
        <span>SMTP: <strong>{isConfigured ? "Terkonfigurasi — siap mengirim email" : "Belum dikonfigurasi"}</strong></span>
        {isConfigured && <Badge className="ml-auto bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 text-xs">Siap</Badge>}
      </div>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription className="text-xs">
          Gunakan <strong>App Password</strong> jika memakai Gmail dengan 2FA.{" "}
          <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener noreferrer"
            className="underline text-blue-600">Buat App Password Gmail →</a>
        </AlertDescription>
      </Alert>

      {/* SMTP Config form */}
      <form onSubmit={handleSubmit((d) => save.mutate(d))}>
        <Card><CardContent className="p-4 space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 space-y-1.5">
              <Label>SMTP Host</Label>
              <Input {...register("smtpHost")} placeholder="smtp.gmail.com"
                className="bg-muted/30 border-border/60 focus-visible:border-primary focus-visible:bg-background transition-colors" />
            </div>
            <div className="space-y-1.5">
              <Label>Port</Label>
              <Input type="number" {...register("smtpPort", { valueAsNumber: true })} placeholder="587"
                className="bg-muted/30 border-border/60 focus-visible:border-primary focus-visible:bg-background transition-colors" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Username / Email</Label>
              <Input {...register("smtpUser")} placeholder="user@gmail.com"
                className="bg-muted/30 border-border/60 focus-visible:border-primary focus-visible:bg-background transition-colors" />
            </div>
            <div className="space-y-1.5">
              <Label>From Email</Label>
              <Input {...register("smtpFrom")} placeholder="noreply@yourdomain.com"
                className="bg-muted/30 border-border/60 focus-visible:border-primary focus-visible:bg-background transition-colors" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Password SMTP</Label>
            <PasswordInput
              value={smtpPassword}
              onChange={setSmtpPassword}
              placeholder={data?.smtpConfigured ? "••••••••••• (tersimpan, kosongkan jika tidak ingin diubah)" : "Password atau App Password"}
            />
            <p className="text-[11px] text-muted-foreground">Password disimpan terenkripsi. Kosongkan jika tidak ingin mengubah yang sudah tersimpan.</p>
          </div>
        </CardContent></Card>
        <div className="mt-4">
          <Button type="submit" disabled={save.isPending} className="gap-2">
            {save.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Simpan Konfigurasi SMTP
          </Button>
        </div>
      </form>

      {/* Test Email section */}
      <Card>
        <CardHeader className="pb-3 pt-4 px-5">
          <CardTitle className="text-sm flex items-center gap-2">
            <Wifi className="w-4 h-4 text-primary" /> Tes Koneksi & Kirim Email
          </CardTitle>
          <CardDescription className="text-xs">Verifikasi bahwa konfigurasi SMTP berfungsi dengan mengirim email percobaan</CardDescription>
        </CardHeader>
        <CardContent className="px-5 pb-5 space-y-3">
          <div className="flex gap-2">
            <Input
              type="email"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              placeholder="email-tujuan@example.com"
              className="flex-1 bg-muted/30 border-border/60 focus-visible:border-primary focus-visible:bg-background transition-colors"
            />
            <Button
              onClick={handleTest}
              disabled={testing || !testEmail || !isConfigured}
              className="gap-2 shrink-0"
              variant={isConfigured ? "default" : "secondary"}
            >
              {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wifi className="w-4 h-4" />}
              {testing ? "Mengirim…" : "Kirim Tes"}
            </Button>
          </div>

          {!isConfigured && (
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Info className="w-3 h-3" /> Simpan konfigurasi SMTP terlebih dahulu sebelum mengirim tes
            </p>
          )}

          {testResult && (
            <div className={`flex items-start gap-3 p-3 rounded-xl border text-sm ${testResult.ok
              ? "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800 text-green-800 dark:text-green-300"
              : "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800 text-red-800 dark:text-red-300"}`}>
              {testResult.ok
                ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-green-600" />
                : <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />}
              <div>
                <p className="font-medium">{testResult.message}</p>
                {testResult.detail && testResult.detail !== testResult.message && (
                  <p className="text-xs mt-1 opacity-80 font-mono">{testResult.detail}</p>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Section: Akses ───────────────────────────────────────────────────────────

function AksesSection() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<ServerSettings>({
    queryKey: ["admin-server-settings"],
    queryFn: () => apiFetch("/admin/server-settings").then((r) => r.json()),
  });
  const [maintenance, setMaintenance] = useState(false);
  const [regOpen, setRegOpen] = useState(true);

  useEffect(() => {
    if (data) { setMaintenance(data.maintenanceMode); setRegOpen(data.registrationOpen); }
  }, [data]);

  const save = useMutation({
    mutationFn: () => apiFetch("/admin/server-settings", {
      method: "PUT",
      body: JSON.stringify({ ...data, maintenanceMode: maintenance, registrationOpen: regOpen }),
    }).then((r) => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-server-settings"] }); toast({ title: "Pengaturan akses disimpan" }); },
    onError: () => toast({ title: "Gagal menyimpan", variant: "destructive" }),
  });

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-5">
      <SectionHeader title="Akses & Mode" desc="Kontrol maintenance dan pendaftaran pengguna baru" icon={ShieldCheck} />
      <Card><CardContent className="p-5 space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-semibold text-sm">Mode Maintenance</p>
            <p className="text-xs text-muted-foreground mt-0.5">Saat aktif, semua pengguna (kecuali admin) tidak bisa mengakses aplikasi dan menerima pesan "Dalam pemeliharaan"</p>
          </div>
          <Switch checked={maintenance} onCheckedChange={setMaintenance} />
        </div>
        {maintenance && (
          <div className="flex items-center gap-2 text-xs bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400 rounded-lg px-3 py-2 border border-amber-200 dark:border-amber-800">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            Mode maintenance <strong>aktif</strong> — pengguna tidak bisa login
          </div>
        )}
        <Separator />
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-semibold text-sm">Registrasi Terbuka</p>
            <p className="text-xs text-muted-foreground mt-0.5">Izinkan pengguna baru mendaftar secara mandiri. Nonaktifkan untuk menutup pendaftaran (invite-only)</p>
          </div>
          <Switch checked={regOpen} onCheckedChange={setRegOpen} />
        </div>
        {!regOpen && (
          <div className="flex items-center gap-2 text-xs bg-blue-50 dark:bg-blue-950/20 text-blue-700 dark:text-blue-400 rounded-lg px-3 py-2 border border-blue-200 dark:border-blue-800">
            <Info className="w-3.5 h-3.5 shrink-0" />
            Registrasi ditutup — hanya admin yang bisa membuat akun baru
          </div>
        )}
      </CardContent></Card>
      <Button onClick={() => save.mutate()} disabled={save.isPending} className="gap-2">
        {save.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        Simpan Pengaturan Akses
      </Button>
    </div>
  );
}

// ─── Section: Pembayaran ──────────────────────────────────────────────────────

// Gateway logos
const LogoPakasir = ({ size = 24 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 28 28" fill="none">
    <rect width="28" height="28" rx="6" fill="#1a56db" /><rect x="5" y="9" width="18" height="11" rx="2" fill="white" fillOpacity="0.15" stroke="white" strokeWidth="1.2" />
    <rect x="5" y="12" width="18" height="3" fill="#f59e0b" /><rect x="7" y="16" width="5" height="1.5" rx="0.75" fill="white" fillOpacity="0.7" /><rect x="14" y="16" width="3" height="1.5" rx="0.75" fill="white" fillOpacity="0.5" />
  </svg>
);
const LogoMidtrans = ({ size = 24 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 28 28" fill="none">
    <rect width="28" height="28" rx="6" fill="#003d79" />
    <path d="M5 18.5L10.5 9.5L14 15L17.5 9.5L23 18.5" stroke="#00b5e2" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none" /><circle cx="14" cy="15" r="1.5" fill="#00b5e2" />
  </svg>
);
const LogoTokopay = ({ size = 24 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 28 28" fill="none">
    <rect width="28" height="28" rx="6" fill="#00AA5B" />
    <path d="M14 6C9.58 6 6 9.58 6 14s3.58 8 8 8 8-3.58 8-8-3.58-8-8-8Z" fill="white" fillOpacity="0.2" />
    <path d="M10 14l3 3 5-6" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const LogoTripay = ({ size = 24 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 28 28" fill="none">
    <rect width="28" height="28" rx="6" fill="#f97316" />
    <path d="M8 20V12l6-6 6 6v8" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    <rect x="11" y="15" width="6" height="5" rx="1" fill="white" fillOpacity="0.3" stroke="white" strokeWidth="1.2" />
  </svg>
);

const GW_LOGOS: Record<Gateway, React.FC<{ size?: number }>> = {
  none: ({ size = 24 }) => <svg width={size} height={size} viewBox="0 0 28 28" fill="none"><rect width="28" height="28" rx="6" fill="#f3f4f6" /><circle cx="14" cy="14" r="6" fill="#d1d5db" /></svg>,
  pakasir: LogoPakasir, midtrans: LogoMidtrans, tokopay: LogoTokopay, tripay: LogoTripay,
};
const GW_META: Record<Gateway, { label: string; desc: string; color: string }> = {
  none: { label: "Tidak Ada / Demo", desc: "Simulasi pembayaran tanpa gateway nyata", color: "text-muted-foreground" },
  pakasir: { label: "Pakasir", desc: "Payment gateway lokal Indonesia — QRIS, VA", color: "text-blue-700" },
  midtrans: { label: "Midtrans", desc: "Platform terpopuler Indonesia (Gojek Group)", color: "text-[#003d79]" },
  tokopay: { label: "Tokopay", desc: "Solusi QRIS & virtual account", color: "text-[#00AA5B]" },
  tripay: { label: "Tripay", desc: "Multi-channel — VA, QRIS, Minimarket, e-Wallet", color: "text-orange-600" },
};

function GatewayDropdown({ value, onChange }: { value: Gateway; onChange: (g: Gateway) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const fn = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, []);
  const Logo = GW_LOGOS[value];
  const meta = GW_META[value];
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-input bg-background hover:bg-muted/40 transition-colors focus:outline-none">
        <Logo size={32} />
        <div className="flex-1 text-left min-w-0">
          <p className={`font-semibold text-sm leading-tight ${meta.color}`}>{meta.label}</p>
          <p className="text-xs text-muted-foreground truncate">{meta.desc}</p>
        </div>
        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 z-50 rounded-xl border border-border bg-popover shadow-lg overflow-hidden">
          {(["none", "pakasir", "midtrans", "tokopay", "tripay"] as Gateway[]).map((gw, i, arr) => {
            const L = GW_LOGOS[gw]; const m = GW_META[gw];
            return (
              <button key={gw} type="button" onClick={() => { onChange(gw); setOpen(false); }}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/60 focus:outline-none ${value === gw ? "bg-muted/30" : ""} ${i < arr.length - 1 ? "border-b border-border/50" : ""}`}>
                <L size={28} />
                <div className="flex-1 min-w-0">
                  <p className={`font-semibold text-sm ${m.color}`}>{m.label}</p>
                  <p className="text-xs text-muted-foreground">{m.desc}</p>
                </div>
                {value === gw && <Check className="w-4 h-4 text-primary shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ModeToggle({ label, mode, onChange }: { label: string; mode: "sandbox" | "production"; onChange: (m: "sandbox" | "production") => void }) {
  return (
    <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-muted/60 border border-border">
      <div>
        <p className="text-sm font-medium">{label} Mode</p>
        <p className="text-xs text-muted-foreground">{mode === "sandbox" ? "Sandbox — tidak ada transaksi nyata" : "Production — transaksi nyata"}</p>
      </div>
      <div className="flex items-center gap-2">
        <span className={`text-xs ${mode === "sandbox" ? "font-medium" : "text-muted-foreground"}`}>Sandbox</span>
        <Switch checked={mode === "production"} onCheckedChange={(v) => onChange(v ? "production" : "sandbox")} />
        <span className={`text-xs ${mode === "production" ? "font-medium" : "text-muted-foreground"}`}>Production</span>
      </div>
    </div>
  );
}

function PembayaranSection() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: config, isLoading } = useQuery<GatewayConfig>({
    queryKey: ["admin-payment-gateway"],
    queryFn: () => apiFetch("/admin/payment-gateway").then((r) => r.json()),
  });
  const [activeGw, setActiveGw] = useState<Gateway>("none");
  const [pakasir, setPakasir] = useState<{ merchantId: string; apiKey: string; mode: "sandbox" | "production" }>({ merchantId: "", apiKey: "", mode: "sandbox" });
  const [midtrans, setMidtrans] = useState<{ serverKey: string; clientKey: string; mode: "sandbox" | "production" }>({ serverKey: "", clientKey: "", mode: "sandbox" });
  const [tokopay, setTokopay] = useState<{ merchantId: string; secret: string; mode: "sandbox" | "production" }>({ merchantId: "", secret: "", mode: "sandbox" });
  const [tripay, setTripay] = useState<{ apiKey: string; privateKey: string; merchantCode: string; mode: "sandbox" | "production" }>({ apiKey: "", privateKey: "", merchantCode: "", mode: "sandbox" });
  const [init, setInit] = useState(false);
  const [testResult, setTestResult] = useState<{ gw: Gateway; ok: boolean; msg: string } | null>(null);

  if (config && !init) {
    setActiveGw(config.activeGateway); setPakasir(config.pakasir as any);
    setMidtrans(config.midtrans as any); setTokopay(config.tokopay as any); setTripay(config.tripay as any);
    setInit(true);
  }

  const save = useMutation({
    mutationFn: () => apiFetch("/admin/payment-gateway", { method: "PUT", body: JSON.stringify({ activeGateway: activeGw, pakasir, midtrans, tokopay, tripay }) }).then((r) => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-payment-gateway"] }); toast({ title: "Payment gateway disimpan" }); },
    onError: () => toast({ title: "Gagal menyimpan", variant: "destructive" }),
  });
  const testConn = useMutation({
    mutationFn: (gw: Gateway) => apiFetch("/admin/payment-gateway/test", { method: "POST", body: JSON.stringify({ gateway: gw }) }).then((r) => r.json()),
    onSuccess: (data, gw) => setTestResult({ gw, ok: data.success, msg: data.message }),
    onError: (_e, gw) => setTestResult({ gw, ok: false, msg: "Koneksi gagal" }),
  });

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-5">
      <SectionHeader title="Payment Gateway" desc="Pilih dan konfigurasi gateway pembayaran untuk pengguna" icon={CreditCard} />

      <Card><CardContent className="p-4 space-y-3">
        <Label className="text-sm font-semibold">Gateway Aktif</Label>
        <GatewayDropdown value={activeGw} onChange={setActiveGw} />
        {activeGw !== "none" && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
            <CheckCircle2 className="w-3.5 h-3.5 text-primary shrink-0" />
            <span className={`font-semibold ${GW_META[activeGw].color}`}>{GW_META[activeGw].label}</span> aktif — isi kredensial di bawah
          </div>
        )}
      </CardContent></Card>

      <Card><CardHeader className="pb-2 pt-4 px-4"><CardTitle className="text-sm">Kredensial Gateway</CardTitle></CardHeader>
        <CardContent className="px-4 pb-4">
          <Tabs defaultValue="pakasir">
            <TabsList className="w-full grid grid-cols-4">
              {(["pakasir", "midtrans", "tokopay", "tripay"] as const).map((gw) => {
                const L = GW_LOGOS[gw];
                return (
                  <TabsTrigger key={gw} value={gw} className="relative gap-1.5 py-2">
                    <L size={16} />
                    <span className="hidden sm:inline text-xs">{GW_META[gw].label}</span>
                    {activeGw === gw && <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-primary" />}
                  </TabsTrigger>
                );
              })}
            </TabsList>

            <TabsContent value="pakasir" className="mt-4 space-y-3">
              <div className="space-y-1.5"><Label>Slug Proyek</Label>
                <Input placeholder="namabisnis" value={pakasir.merchantId} onChange={(e) => setPakasir((s) => ({ ...s, merchantId: e.target.value }))} />
              </div>
              <div className="space-y-1.5"><Label>API Key</Label>
                <PasswordInput placeholder="API Key dari Pakasir" value={pakasir.apiKey} onChange={(v) => setPakasir((s) => ({ ...s, apiKey: v }))} />
              </div>
              <TestConnectionBtn gw="pakasir" result={testResult} onTest={() => testConn.mutate("pakasir")} loading={testConn.isPending} />
            </TabsContent>

            <TabsContent value="midtrans" className="mt-4 space-y-3">
              <ModeToggle label="Midtrans" mode={midtrans.mode} onChange={(m) => setMidtrans((s) => ({ ...s, mode: m }))} />
              <div className="space-y-1.5"><Label>Server Key</Label>
                <PasswordInput placeholder="SB-Mid-server-xxxx" value={midtrans.serverKey} onChange={(v) => setMidtrans((s) => ({ ...s, serverKey: v }))} />
              </div>
              <div className="space-y-1.5"><Label>Client Key</Label>
                <Input placeholder="SB-Mid-client-xxxx" value={midtrans.clientKey} onChange={(e) => setMidtrans((s) => ({ ...s, clientKey: e.target.value }))} />
              </div>
              <TestConnectionBtn gw="midtrans" result={testResult} onTest={() => testConn.mutate("midtrans")} loading={testConn.isPending} />
            </TabsContent>

            <TabsContent value="tokopay" className="mt-4 space-y-3">
              <ModeToggle label="Tokopay" mode={tokopay.mode} onChange={(m) => setTokopay((s) => ({ ...s, mode: m }))} />
              <div className="space-y-1.5"><Label>Merchant ID</Label>
                <Input placeholder="ID merchant Tokopay" value={tokopay.merchantId} onChange={(e) => setTokopay((s) => ({ ...s, merchantId: e.target.value }))} />
              </div>
              <div className="space-y-1.5"><Label>Secret / API Key</Label>
                <PasswordInput placeholder="secret key Tokopay" value={tokopay.secret} onChange={(v) => setTokopay((s) => ({ ...s, secret: v }))} />
              </div>
              <TestConnectionBtn gw="tokopay" result={testResult} onTest={() => testConn.mutate("tokopay")} loading={testConn.isPending} />
            </TabsContent>

            <TabsContent value="tripay" className="mt-4 space-y-3">
              <ModeToggle label="Tripay" mode={tripay.mode} onChange={(m) => setTripay((s) => ({ ...s, mode: m }))} />
              <div className="space-y-1.5"><Label>API Key</Label>
                <PasswordInput placeholder="DEV-xxxx / T-xxxx" value={tripay.apiKey} onChange={(v) => setTripay((s) => ({ ...s, apiKey: v }))} />
              </div>
              <div className="space-y-1.5"><Label>Private Key</Label>
                <PasswordInput placeholder="private key Tripay" value={tripay.privateKey} onChange={(v) => setTripay((s) => ({ ...s, privateKey: v }))} />
              </div>
              <div className="space-y-1.5"><Label>Merchant Code</Label>
                <Input placeholder="T00000" value={tripay.merchantCode} onChange={(e) => setTripay((s) => ({ ...s, merchantCode: e.target.value }))} />
              </div>
              <TestConnectionBtn gw="tripay" result={testResult} onTest={() => testConn.mutate("tripay")} loading={testConn.isPending} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Card className="bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800">
        <CardContent className="p-4 flex gap-3">
          <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
          <div className="text-xs space-y-1 min-w-0">
            <p className="font-semibold text-amber-800 dark:text-amber-300">Konfigurasi Webhook</p>
            <p className="text-amber-700 dark:text-amber-400">Daftarkan URL callback berikut di dashboard gateway Anda:</p>
            <code className="block bg-white dark:bg-black/30 rounded px-2 py-1.5 font-mono break-all select-all text-foreground border border-amber-200 dark:border-amber-700">
              {window.location.origin}/api/billing/webhook
            </code>
          </div>
        </CardContent>
      </Card>

      <Button onClick={() => save.mutate()} disabled={save.isPending} className="gap-2">
        {save.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        Simpan Konfigurasi Payment
      </Button>
    </div>
  );
}

function TestConnectionBtn({ gw, result, onTest, loading }: { gw: Gateway; result: { gw: Gateway; ok: boolean; msg: string } | null; onTest: () => void; loading: boolean }) {
  const r = result?.gw === gw ? result : null;
  return (
    <div className="flex items-center gap-3 pt-1">
      <Button variant="outline" size="sm" onClick={onTest} disabled={loading} className="gap-2">
        {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wifi className="w-3.5 h-3.5" />}
        Test Koneksi
      </Button>
      {r && (
        <span className={`flex items-center gap-1.5 text-sm font-medium ${r.ok ? "text-primary" : "text-destructive"}`}>
          {r.ok ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
          {r.msg}
        </span>
      )}
    </div>
  );
}

// ─── Section: AI ──────────────────────────────────────────────────────────────

const AI_PROVIDERS = [
  {
    id: "openai",
    name: "OpenAI",
    badge: "Berbayar",
    badgeColor: "text-slate-500 border-slate-300",
    baseUrl: "https://api.openai.com/v1",
    keyPlaceholder: "sk-proj-...",
    keyUrl: "https://platform.openai.com/api-keys",
    desc: "GPT-4o, GPT-5, o1 — Model premium OpenAI",
    defaultModel: "gpt-4o-mini",
    models: [
      { group: "GPT-5 (Terbaru)", items: [
        { value: "gpt-5-nano",  label: "GPT-5 Nano — Tercepat & terhemat" },
        { value: "gpt-5-mini",  label: "GPT-5 Mini — Seimbang" },
        { value: "gpt-5",       label: "GPT-5 — Cerdas & akurat" },
      ]},
      { group: "GPT-4o", items: [
        { value: "gpt-4o-mini", label: "GPT-4o Mini — Cepat & hemat ★" },
        { value: "gpt-4o",      label: "GPT-4o — Pintar & multimodal" },
      ]},
      { group: "GPT-3.5", items: [
        { value: "gpt-3.5-turbo", label: "GPT-3.5 Turbo — Paling hemat" },
      ]},
      { group: "Reasoning", items: [
        { value: "o4-mini", label: "o4 Mini — Reasoning cepat" },
        { value: "o1-mini", label: "o1 Mini — Reasoning mendalam" },
      ]},
    ],
  },
  {
    id: "groq",
    name: "Groq",
    badge: "GRATIS ✦",
    badgeColor: "text-emerald-600 border-emerald-400 bg-emerald-50 dark:bg-emerald-950/30",
    baseUrl: "https://api.groq.com/openai/v1",
    keyPlaceholder: "gsk_...",
    keyUrl: "https://console.groq.com/keys",
    desc: "Llama & Mixtral — Sangat cepat, tier gratis tersedia",
    defaultModel: "llama-3.3-70b-versatile",
    models: [
      { group: "Llama 3.3 (Gratis)", items: [
        { value: "llama-3.3-70b-versatile",  label: "Llama 3.3 70B — Paling cerdas ★ Rekomendasi" },
        { value: "llama-3.1-8b-instant",     label: "Llama 3.1 8B — Tercepat & ringan" },
      ]},
      { group: "Llama 3.2 (Gratis)", items: [
        { value: "llama-3.2-90b-vision-preview", label: "Llama 3.2 90B Vision — Multimodal" },
        { value: "llama-3.2-11b-vision-preview", label: "Llama 3.2 11B Vision — Ringan multimodal" },
        { value: "llama-3.2-3b-preview",         label: "Llama 3.2 3B — Ultra ringan" },
        { value: "llama-3.2-1b-preview",         label: "Llama 3.2 1B — Terkecil" },
      ]},
      { group: "Mixtral (Gratis)", items: [
        { value: "mixtral-8x7b-32768", label: "Mixtral 8x7B — Konteks panjang 32K" },
      ]},
      { group: "Gemma (Gratis)", items: [
        { value: "gemma2-9b-it", label: "Gemma 2 9B — Google, ringan & cepat" },
      ]},
    ],
  },
  {
    id: "gemini",
    name: "Google Gemini",
    badge: "GRATIS ✦",
    badgeColor: "text-blue-600 border-blue-400 bg-blue-50 dark:bg-blue-950/30",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai/",
    keyPlaceholder: "AIzaSy...",
    keyUrl: "https://aistudio.google.com/app/apikey",
    desc: "Gemini 2.0 Flash — Gratis 1.500 req/hari via AI Studio",
    defaultModel: "gemini-2.0-flash",
    models: [
      { group: "Gemini 2.0 (Gratis)", items: [
        { value: "gemini-2.0-flash",         label: "Gemini 2.0 Flash — Tercepat ★ Rekomendasi" },
        { value: "gemini-2.0-flash-lite",    label: "Gemini 2.0 Flash Lite — Paling ringan" },
      ]},
      { group: "Gemini 1.5 (Gratis)", items: [
        { value: "gemini-1.5-flash",    label: "Gemini 1.5 Flash — Cepat & handal" },
        { value: "gemini-1.5-flash-8b", label: "Gemini 1.5 Flash 8B — Ultra ringan" },
        { value: "gemini-1.5-pro",      label: "Gemini 1.5 Pro — Paling cerdas" },
      ]},
    ],
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    badge: "Ada Gratis",
    badgeColor: "text-purple-600 border-purple-400 bg-purple-50 dark:bg-purple-950/30",
    baseUrl: "https://openrouter.ai/api/v1",
    keyPlaceholder: "sk-or-v1-...",
    keyUrl: "https://openrouter.ai/keys",
    desc: "100+ model — Beberapa gratis, akses semua provider",
    defaultModel: "meta-llama/llama-3.3-70b-instruct:free",
    models: [
      { group: "Model Gratis", items: [
        { value: "meta-llama/llama-3.3-70b-instruct:free",    label: "Llama 3.3 70B — Gratis ★" },
        { value: "meta-llama/llama-3.2-3b-instruct:free",     label: "Llama 3.2 3B — Gratis, ringan" },
        { value: "google/gemini-2.0-flash-exp:free",          label: "Gemini 2.0 Flash — Gratis" },
        { value: "mistralai/mistral-7b-instruct:free",        label: "Mistral 7B — Gratis" },
        { value: "qwen/qwen-2.5-72b-instruct:free",           label: "Qwen 2.5 72B — Gratis" },
      ]},
      { group: "Model Berbayar", items: [
        { value: "openai/gpt-4o-mini",   label: "GPT-4o Mini — via OpenRouter" },
        { value: "anthropic/claude-3-haiku", label: "Claude 3 Haiku — Hemat" },
      ]},
    ],
  },
  {
    id: "custom",
    name: "Custom",
    badge: "Kustom",
    badgeColor: "text-orange-600 border-orange-400",
    baseUrl: "",
    keyPlaceholder: "API key...",
    keyUrl: "",
    desc: "URL & model kustom — Ollama, LM Studio, dll",
    defaultModel: "llama3",
    models: [
      { group: "Custom Model", items: [
        { value: "llama3",   label: "Llama 3 (Ollama default)" },
        { value: "mistral",  label: "Mistral (Ollama)" },
        { value: "phi3",     label: "Phi-3 (Ollama)" },
        { value: "gemma2",   label: "Gemma 2 (Ollama)" },
      ]},
    ],
  },
];

const AI_MODELS = AI_PROVIDERS[0].models;

const AI_GREEN = "hsl(145 63% 49%)";
const AI_GREEN_BG = "hsl(145 63% 49% / 0.12)";

function AiSection() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [connectStep, setConnectStep] = useState<"idle" | "waiting" | "paste">("idle");
  const pasteRef = useRef<HTMLInputElement>(null);
  const popupRef = useRef<Window | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { data, isLoading } = useQuery<AiSettings>({
    queryKey: ["admin-ai-settings"],
    queryFn: () => apiFetch("/admin/ai-settings").then((r) => r.json()),
  });

  const [form, setForm] = useState<AiSettings>({
    openaiApiKey: "", openaiDefaultModel: "gpt-4o-mini", aiEnabled: false,
    loginMethod: "apikey", accountEmail: "", accountPassword: "",
    accountPasswordSet: false, accountType: "personal", orgId: "",
    aiProvider: "openai", aiBaseUrl: "",
  });
  useEffect(() => { if (data) setForm(data); }, [data]);

  const save = useMutation({
    mutationFn: (body: AiSettings) => apiFetch("/admin/ai-settings", { method: "PUT", body: JSON.stringify(body) }).then((r) => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-ai-settings"] }); toast({ title: "Pengaturan AI disimpan" }); },
    onError: () => toast({ title: "Gagal menyimpan", variant: "destructive" }),
  });

  async function testConn() {
    setTestLoading(true); setTestResult(null);
    try {
      const r = await apiFetch("/admin/ai-settings/test", { method: "POST" });
      const json = await r.json();
      setTestResult({ ok: json.ok, message: json.message });
    } catch { setTestResult({ ok: false, message: "Tidak bisa terhubung ke server" }); }
    finally { setTestLoading(false); }
  }

  const currentProvider = AI_PROVIDERS.find((p) => p.id === form.aiProvider) || AI_PROVIDERS[0];
  const activeModels = currentProvider.models;

  function openConnectPopup() {
    if (pollRef.current) clearInterval(pollRef.current);
    const w = 500, h = 700;
    const left = window.screenX + (window.outerWidth - w) / 2;
    const top = window.screenY + (window.outerHeight - h) / 2;
    const keyUrl = currentProvider.keyUrl || "https://platform.openai.com/api-keys";
    const popup = window.open(
      keyUrl,
      "ai_connect",
      `width=${w},height=${h},left=${left},top=${top},toolbar=no,menubar=no,scrollbars=yes`
    );
    popupRef.current = popup;
    setConnectStep("waiting");

    pollRef.current = setInterval(() => {
      if (!popupRef.current || popupRef.current.closed) {
        clearInterval(pollRef.current!);
        pollRef.current = null;
        setConnectStep("paste");
        setTimeout(() => pasteRef.current?.focus(), 100);
      }
    }, 500);
  }

  function cancelConnect() {
    if (pollRef.current) clearInterval(pollRef.current);
    if (popupRef.current && !popupRef.current.closed) popupRef.current.close();
    setConnectStep("idle");
  }

  function isValidKey(val: string): boolean {
    if (val.length < 10) return false;
    const provider = form.aiProvider;
    if (provider === "groq") return val.startsWith("gsk_");
    if (provider === "gemini") return val.startsWith("AIza");
    if (provider === "openrouter") return val.startsWith("sk-or-");
    if (provider === "custom") return val.length > 5;
    return val.startsWith("sk-");
  }

  function handleKeyPaste(val: string) {
    setForm((f) => ({ ...f, openaiApiKey: val }));
    if (isValidKey(val)) {
      setTimeout(() => {
        save.mutate({ ...form, openaiApiKey: val });
        setConnectStep("idle");
        setTestResult(null);
      }, 400);
    }
  }

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>;

  const isConnected = !!form.openaiApiKey;

  return (
    <div className="space-y-5">
      <SectionHeader title="Kecerdasan Buatan (AI)" desc="Pilih provider AI dan konfigurasi API key untuk fitur CS Bot AI" icon={Sparkles} />

      {/* ── Pilih Provider AI ─────────────────────────────────────────── */}
      <Card>
        <CardContent className="p-4">
          <Label className="text-sm font-semibold flex items-center gap-1.5 mb-3"><Sparkles className="w-3.5 h-3.5" />Pilih Provider AI</Label>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {AI_PROVIDERS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setForm((f) => ({
                    ...f,
                    aiProvider: p.id,
                    aiBaseUrl: p.id === "custom" ? f.aiBaseUrl : p.baseUrl,
                    openaiDefaultModel: p.defaultModel,
                  }));
                  setConnectStep("idle");
                }}
                className={[
                  "text-left rounded-xl border-2 p-3 transition-all",
                  form.aiProvider === p.id
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/40 hover:bg-muted/40",
                ].join(" ")}>
                <div className="flex items-start justify-between gap-1 mb-1">
                  <span className="font-semibold text-sm">{p.name}</span>
                  <span className={`text-[10px] font-bold border rounded-full px-1.5 py-0.5 shrink-0 ${p.badgeColor}`}>{p.badge}</span>
                </div>
                <p className="text-[11px] text-muted-foreground leading-tight">{p.desc}</p>
              </button>
            ))}
          </div>
          {/* Custom base URL input */}
          {form.aiProvider === "custom" && (
            <div className="mt-3 space-y-1">
              <Label className="text-xs text-muted-foreground">Base URL (mis. http://localhost:11434/v1)</Label>
              <Input
                placeholder="https://your-ai-endpoint.com/v1"
                value={form.aiBaseUrl}
                onChange={(e) => setForm((f) => ({ ...f, aiBaseUrl: e.target.value }))}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Hubungkan Akun AI (OAuth-style flow) ────────────────────────── */}
      <Card className={isConnected ? "border-emerald-300/60" : ""}>
        <CardContent className="p-5 space-y-4">

          {/* Header status */}
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0"
              style={{ backgroundColor: isConnected ? "hsl(145 63% 49% / 0.15)" : "hsl(215 20% 65% / 0.12)" }}>
              {isConnected
                ? <CheckCircle className="w-5 h-5" style={{ color: AI_GREEN }} />
                : <LogIn className="w-5 h-5 text-muted-foreground" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm">
                {isConnected ? `${currentProvider.name} Terhubung` : `Hubungkan ${currentProvider.name}`}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {isConnected
                  ? `API key aktif ···${form.openaiApiKey.slice(-4)}`
                  : `Dapatkan API key di ${currentProvider.keyUrl ? new URL(currentProvider.keyUrl).hostname : "portal provider"}`}
              </p>
            </div>
            {isConnected && (
              <Badge className="shrink-0 bg-emerald-500 hover:bg-emerald-500 text-white text-xs">Aktif</Badge>
            )}
          </div>

          {/* Step: idle — tombol connect */}
          {connectStep === "idle" && (
            <button
              type="button"
              onClick={openConnectPopup}
              className="w-full flex items-center justify-center gap-2.5 rounded-xl py-3 px-4 font-semibold text-sm text-white transition-all active:scale-[0.98]"
              style={{ backgroundColor: AI_GREEN }}
            >
              <LogIn className="w-4 h-4" />
              {isConnected ? `Ganti API Key ${currentProvider.name}` : `Dapatkan API Key ${currentProvider.name}`}
            </button>
          )}

          {/* Step: waiting — popup terbuka */}
          {connectStep === "waiting" && (
            <div className="space-y-3">
              <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3">
                <div className="flex items-center gap-2.5">
                  <Loader2 className="w-4 h-4 animate-spin text-primary shrink-0" />
                  <p className="text-sm font-semibold text-primary">Menunggu Anda login di OpenAI…</p>
                </div>
                <ol className="space-y-1.5 pl-1">
                  {[
                    "Login dengan akun OpenAI / ChatGPT Anda",
                    "Klik \"+ Create new secret key\"",
                    "Salin API key yang muncul",
                    "Tutup tab/popup OpenAI",
                  ].map((step, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                      <span className="w-4 h-4 rounded-full bg-primary/10 text-primary text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                      {step}
                    </li>
                  ))}
                </ol>
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" className="flex-1 gap-1.5 text-xs"
                  onClick={() => { popupRef.current?.focus(); }}>
                  <ChevronRight className="w-3.5 h-3.5" />Buka Ulang Tab OpenAI
                </Button>
                <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={cancelConnect}>
                  Batal
                </Button>
              </div>
            </div>
          )}

          {/* Step: paste — tempel API key */}
          {connectStep === "paste" && (
            <div className="space-y-3">
              <div className="rounded-xl border-2 border-primary bg-primary/5 p-4 space-y-2">
                <p className="text-sm font-semibold flex items-center gap-1.5">
                  <CheckCircle className="w-4 h-4 text-primary shrink-0" />
                  Bagus! Sekarang tempel API key Anda
                </p>
                <p className="text-xs text-muted-foreground">Salin key dari halaman {currentProvider.name}, lalu tempel di sini. Key akan otomatis tersimpan.</p>
                <div className="relative mt-1">
                  <Input
                    ref={pasteRef}
                    type="text"
                    placeholder={currentProvider.keyPlaceholder}
                    value={form.openaiApiKey}
                    onChange={(e) => {
                      const v = e.target.value;
                      setForm((f) => ({ ...f, openaiApiKey: v }));
                      if (isValidKey(v)) {
                        setTimeout(() => { save.mutate({ ...form, openaiApiKey: v }); }, 400);
                      }
                    }}
                    onPaste={(e) => {
                      e.preventDefault();
                      const v = e.clipboardData.getData("text").trim();
                      handleKeyPaste(v);
                    }}
                    className="font-mono text-sm pr-10 border-primary ring-1 ring-primary/30 focus-visible:ring-primary"
                    autoComplete="off"
                  />
                  {save.isPending && (
                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-primary" />
                  )}
                </div>
                {form.openaiApiKey && !isValidKey(form.openaiApiKey) && (
                  <p className="text-xs text-amber-600 flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5 shrink-0" />Format key tidak valid untuk {currentProvider.name}. Placeholder: {currentProvider.keyPlaceholder}</p>
                )}
              </div>
              <Button variant="ghost" size="sm" className="text-xs text-muted-foreground w-full" onClick={cancelConnect}>
                Batal
              </Button>
            </div>
          )}

          {/* Quick test jika sudah konek */}
          {connectStep === "idle" && isConnected && (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="flex-1 gap-1.5 text-xs" onClick={testConn} disabled={testLoading}>
                {testLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wifi className="w-3.5 h-3.5" />}
                Tes Koneksi
              </Button>
              <Button variant="ghost" size="sm" className="text-xs gap-1.5 text-muted-foreground"
                onClick={() => { setForm((f) => ({ ...f, openaiApiKey: "" })); setTestResult(null); }}>
                <XCircle className="w-3.5 h-3.5" /> Hapus
              </Button>
            </div>
          )}

          {testResult && (
            <div className={`flex items-center gap-2 rounded-lg p-3 text-xs ${testResult.ok ? "bg-green-50 text-green-700 dark:bg-green-950" : "bg-red-50 text-red-700 dark:bg-red-950"}`}>
              {testResult.ok ? <CheckCircle className="h-3.5 w-3.5 shrink-0" /> : <AlertCircle className="h-3.5 w-3.5 shrink-0" />}
              {testResult.message}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Organization ID (Opsional, OpenAI only) ────────────────────── */}
      {form.aiProvider === "openai" && <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: AI_GREEN_BG }}>
              <Building2 className="w-4 h-4" style={{ color: AI_GREEN }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">Organisasi <span className="text-muted-foreground font-normal">(Opsional)</span></p>
              <p className="text-xs text-muted-foreground">Untuk akun OpenAI Bisnis / Tim</p>
            </div>
            {form.orgId && (
              <Badge variant="outline" className="shrink-0 text-xs border-primary/40 text-primary">Terkonfigurasi</Badge>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <Hash className="w-3 h-3" />Organization ID
            </Label>
            <Input
              type="text"
              placeholder="org-xxxxxxxxxxxxxxxxxxxx"
              value={form.orgId}
              onChange={(e) => setForm((f) => ({ ...f, orgId: e.target.value }))}
              className="font-mono text-sm bg-muted/30 border-border/60 focus-visible:border-primary focus-visible:bg-background transition-colors"
            />
            <p className="text-[11px] text-muted-foreground">
              Temukan di: <a href="https://platform.openai.com/settings/organization" target="_blank" rel="noopener noreferrer"
                className="text-primary underline">platform.openai.com → Settings → Organization</a>
            </p>
          </div>

          {form.orgId && (
            <div className="rounded-lg bg-blue-50/60 dark:bg-blue-950/20 border border-blue-200/60 dark:border-blue-800/30 px-3 py-2 text-xs text-blue-700 dark:text-blue-400 flex items-center gap-2">
              <Info className="w-3.5 h-3.5 shrink-0" />
              Semua request AI akan dikirim dengan header <code className="font-mono bg-blue-100/60 dark:bg-blue-900/30 px-1 rounded">OpenAI-Organization: {form.orgId.slice(0, 14)}…</code>
            </div>
          )}
        </CardContent>
      </Card>}

      {/* ── Model Default ─────────────────────────────────────────────── */}
      <Card><CardContent className="p-4 space-y-4">
        {/* Model Default */}
        <div className="space-y-1.5">
          <Label className="text-sm font-semibold flex items-center gap-1.5"><Brain className="w-3.5 h-3.5" />Model Default</Label>
          <Select value={form.openaiDefaultModel} onValueChange={(v) => setForm((f) => ({ ...f, openaiDefaultModel: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {activeModels.map((g) => (
                <SelectGroup key={g.group}>
                  <SelectLabel>{g.group}</SelectLabel>
                  {g.items.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
        </div>
        {form.aiProvider === "openai" && (
          <div className="rounded-lg bg-muted/50 p-3 text-xs space-y-1">
            <p className="font-medium">Perkiraan biaya per 1.000 pesan:</p>
            <div className="grid grid-cols-2 gap-1 text-muted-foreground">
              <span>GPT-3.5 Turbo: <strong className="text-foreground">~$0.003</strong></span>
              <span>GPT-4o Mini: <strong className="text-foreground">~$0.01</strong></span>
              <span>GPT-5 Nano: <strong className="text-foreground">~$0.01</strong></span>
              <span>GPT-4o: <strong className="text-foreground">~$0.08</strong></span>
              <span>GPT-5: <strong className="text-foreground">~$0.20</strong></span>
              <span>o1-mini: <strong className="text-foreground">~$1.00</strong></span>
            </div>
          </div>
        )}
        {(form.aiProvider === "groq" || form.aiProvider === "gemini") && (
          <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200/60 dark:border-emerald-800/30 p-3 text-xs space-y-1">
            <p className="font-semibold text-emerald-700 dark:text-emerald-400">Tier Gratis {currentProvider.name}:</p>
            {form.aiProvider === "groq" && (
              <div className="text-emerald-700/80 dark:text-emerald-400/80 space-y-0.5">
                <p>• 14.400 request/hari — Llama 3.3 70B</p>
                <p>• 7.000 token/menit per model</p>
                <p>• Daftar gratis di <strong>console.groq.com</strong></p>
              </div>
            )}
            {form.aiProvider === "gemini" && (
              <div className="text-emerald-700/80 dark:text-emerald-400/80 space-y-0.5">
                <p>• 1.500 request/hari — Gemini 2.0 Flash</p>
                <p>• 1.000.000 token per menit</p>
                <p>• Daftar gratis di <strong>aistudio.google.com</strong></p>
              </div>
            )}
          </div>
        )}
        {form.aiProvider === "openrouter" && (
          <div className="rounded-lg bg-purple-50 dark:bg-purple-950/20 border border-purple-200/60 dark:border-purple-800/30 p-3 text-xs">
            <p className="font-semibold text-purple-700 dark:text-purple-400 mb-1">Model Gratis OpenRouter:</p>
            <p className="text-purple-700/80 dark:text-purple-400/80">Pilih model dengan ":free" suffix — Llama 3.3 70B, Gemini Flash, Mistral 7B. Credit awal tersedia untuk model berbayar.</p>
          </div>
        )}
      </CardContent></Card>

      <Button onClick={() => save.mutate(form)} disabled={save.isPending} className="gap-2">
        {save.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        Simpan Pengaturan AI
      </Button>
    </div>
  );
}

// ─── Section: Autentikasi (Google OAuth) ──────────────────────────────────────

interface GoogleOAuthSettings {
  googleClientId: string;
  googleClientSecret: string;
  configured: boolean;
}

function GoogleAuthSection() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [gClientId, setGClientId] = useState("");
  const [gClientSecret, setGClientSecret] = useState("");

  const { data } = useQuery<GoogleOAuthSettings>({
    queryKey: ["admin-google-oauth"],
    queryFn: () => apiFetch("/admin/google-oauth").then((r) => r.json()),
  });

  useEffect(() => {
    if (!data) return;
    setGClientId(data.googleClientId ?? "");
    setGClientSecret("");
  }, [data]);

  const save = useMutation({
    mutationFn: (body: any) =>
      apiFetch("/admin/google-oauth", { method: "PUT", body: JSON.stringify(body) }).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-google-oauth"] });
      toast({ title: "Pengaturan Google OAuth disimpan" });
    },
    onError: () => toast({ title: "Gagal menyimpan Google OAuth", variant: "destructive" }),
  });

  const isConfigured = data?.configured ?? false;
  const googleAuthorizedOrigin = window.location.origin;
  const googleLoginEndpoint = `${window.location.origin}/api/auth/google`;

  return (
    <div className="space-y-5">
      <SectionHeader title="Autentikasi" desc="Konfigurasi metode login dan provider OAuth untuk pengguna" icon={Key} />

      {/* Status banner */}
      <div className={`flex items-center gap-3 p-3 rounded-xl border text-sm ${isConfigured
        ? "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800 text-green-800 dark:text-green-300"
        : "bg-muted/60 border-border/60 text-muted-foreground"}`}>
        {isConfigured
          ? <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
          : <XCircle className="w-4 h-4 shrink-0" />}
        <span>Google OAuth: <strong>{isConfigured ? "Aktif — user dapat login dengan Google" : "Belum dikonfigurasi"}</strong></span>
        {isConfigured && (
          <Badge className="ml-auto bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800 text-xs">
            Aktif
          </Badge>
        )}
      </div>

      {/* Google OAuth card */}
      <Card>
        <CardHeader className="pb-3 pt-4 px-5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white dark:bg-zinc-900 border border-border shadow-sm flex items-center justify-center shrink-0">
              <svg viewBox="0 0 24 24" className="w-5 h-5">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
            </div>
            <div>
              <CardTitle className="text-sm font-semibold">Sign in with Google</CardTitle>
              <CardDescription className="text-xs">Aktifkan tombol login Google di halaman masuk</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-5 pb-5 space-y-4">
          {/* Setup guide */}
          <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 text-xs text-blue-700 dark:text-blue-400 space-y-1.5">
            <p className="font-semibold flex items-center gap-1.5"><Info className="w-3 h-3" />Cara mendapatkan Client ID & Secret:</p>
            <ol className="list-decimal list-inside space-y-0.5 text-blue-600 dark:text-blue-400">
              <li>Buka <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded font-mono">console.cloud.google.com</code></li>
              <li>Buat project → API & Services → Credentials</li>
              <li>Create OAuth 2.0 Client ID → Application type: <strong>Web</strong></li>
              <li>Tambahkan origin di bawah ke <strong>Authorized JavaScript origins</strong></li>
            </ol>
            <div className="mt-3 space-y-2">
              <div>
                <p className="font-semibold text-blue-800 dark:text-blue-300">Authorized JavaScript origin</p>
                <code className="mt-1 block rounded-lg bg-white/80 dark:bg-black/20 border border-blue-200 dark:border-blue-800 px-3 py-2 font-mono text-[11px] text-foreground break-all">
                  {googleAuthorizedOrigin}
                </code>
              </div>
              <div>
                <p className="font-semibold text-blue-800 dark:text-blue-300">Callback/Webhook aplikasi</p>
                <code className="mt-1 block rounded-lg bg-white/80 dark:bg-black/20 border border-blue-200 dark:border-blue-800 px-3 py-2 font-mono text-[11px] text-foreground break-all">
                  {googleLoginEndpoint}
                </code>
                <p className="mt-1 text-[11px] text-blue-600 dark:text-blue-400">
                  Mode aplikasi ini memakai ID token dari tombol Google. Endpoint ini dipakai frontend untuk verifikasi ke server, bukan redirect URI wajib di Google Console.
                </p>
              </div>
            </div>
          </div>

          <Separator />

          <div className="space-y-1.5">
            <Label className="text-sm font-medium flex items-center gap-1.5">
              <Key className="w-3.5 h-3.5 text-muted-foreground" />
              Google Client ID
            </Label>
            <Input
              value={gClientId}
              onChange={(e) => setGClientId(e.target.value)}
              placeholder="xxxxxxxxxx.apps.googleusercontent.com"
              className="font-mono text-sm bg-muted/30 border-border/60 focus-visible:border-primary focus-visible:bg-background transition-colors"
            />
            <p className="text-[11px] text-muted-foreground">Berakhir dengan <code className="bg-muted px-1 rounded">.apps.googleusercontent.com</code></p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm font-medium flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-muted-foreground" />
              Google Client Secret
            </Label>
            <PasswordInput
              value={gClientSecret}
              onChange={setGClientSecret}
              placeholder={isConfigured ? "••••••••••• (tersimpan, kosongkan jika tidak ingin diubah)" : "GOCSPX-..."}
              className="text-sm"
            />
            <p className="text-[11px] text-muted-foreground">Kosongkan jika tidak ingin mengubah secret yang sudah tersimpan</p>
          </div>

          <Button
            onClick={() => save.mutate({ googleClientId: gClientId, googleClientSecret: gClientSecret })}
            disabled={save.isPending || !gClientId}
            className="gap-2"
          >
            {save.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Simpan Google OAuth
          </Button>

          {isConfigured && (
            <Button
              variant="outline"
              size="sm"
              className="gap-2 text-destructive border-destructive/30 hover:bg-destructive/5"
              onClick={() => save.mutate({ googleClientId: "", googleClientSecret: "" })}
              disabled={save.isPending}
            >
              <XCircle className="w-3.5 h-3.5" />
              Nonaktifkan Google Login
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Section: Sistem ──────────────────────────────────────────────────────────

function SistemSection() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [restarting, setRestarting] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [showChangelogForm, setShowChangelogForm] = useState(false);
  const [newVer, setNewVer] = useState({ version: "", notes: "" });

  const { data, isLoading, refetch, isFetching } = useQuery<UpdateInfo>({
    queryKey: ["admin-update"],
    queryFn: () => apiFetch("/admin/update").then((r) => r.json()),
  });

  const addChangelog = useMutation({
    mutationFn: () => apiFetch("/admin/changelog", {
      method: "POST",
      body: JSON.stringify(newVer),
    }).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-update"] });
      setShowChangelogForm(false);
      setNewVer({ version: "", notes: "" });
      toast({ title: "Riwayat update berhasil ditambahkan" });
    },
    onError: () => toast({ title: "Gagal menambahkan update", variant: "destructive" }),
  });
  const { data: srvData } = useQuery<ServerSettings>({
    queryKey: ["admin-server-settings"],
    queryFn: () => apiFetch("/admin/server-settings").then((r) => r.json()),
  });

  const restart = useMutation({
    mutationFn: () => apiFetch("/admin/restart", { method: "POST" }).then((r) => r.json()),
    onMutate: () => { setRestarting(true); setLog(["Mengirim sinyal restart..."]); },
    onSuccess: () => {
      const msgs = ["Mengirim sinyal restart...", "Menutup koneksi aktif...", "Menyimpan state sementara...", "Memulai ulang layanan...", "Server berhasil direstart ✓"];
      let i = 1;
      const iv = setInterval(() => {
        setLog(msgs.slice(0, i + 1)); i++;
        if (i >= msgs.length) { clearInterval(iv); setRestarting(false); toast({ title: "Server berhasil direstart" }); }
      }, 700);
    },
    onError: () => { setRestarting(false); toast({ title: "Gagal restart server", variant: "destructive" }); },
  });

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-5">
      <SectionHeader title="Sistem" desc="Info versi, pembaruan, dan manajemen layanan server" icon={Server} />

      {/* Version card */}
      <Card><CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={`w-11 h-11 rounded-full flex items-center justify-center ${data?.upToDate ? "bg-green-100 dark:bg-green-900/30" : "bg-amber-100 dark:bg-amber-900/30"}`}>
              {data?.upToDate ? <CheckCircle2 className="w-5 h-5 text-green-600" /> : <AlertCircle className="w-5 h-5 text-amber-600" />}
            </div>
            <div>
              <p className="font-semibold">{data?.upToDate ? "Sistem Sudah Terbaru" : "Pembaruan Tersedia"}</p>
              <p className="text-sm text-muted-foreground mt-0.5">
                Versi: <span className="font-mono font-medium">{data?.currentVersion}</span>
                {!data?.upToDate && <> → <span className="font-mono font-medium text-green-600">{data?.latestVersion}</span></>}
              </p>
              <p className="text-xs text-muted-foreground">Node {srvData?.nodeVersion} · {srvData?.environment}</p>
            </div>
          </div>
          <Button variant="outline" size="sm" className="gap-2 shrink-0" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Cek Ulang
          </Button>
        </div>
      </CardContent></Card>

      {/* Changelog */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4 pr-3 flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-sm flex items-center gap-2">
            <PackageCheck className="w-4 h-4 text-primary" />Riwayat Versi
          </CardTitle>
          <Button variant="ghost" size="sm" className="h-7 text-[11px] gap-1.5" onClick={() => setShowChangelogForm(!showChangelogForm)}>
            {showChangelogForm ? "Batal" : <><Plus className="w-3 h-3" /> Tambah Info</>}
          </Button>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-3">
          {showChangelogForm && (
            <div className="mb-6 p-4 rounded-xl border border-primary/20 bg-primary/5 space-y-4">
              <p className="text-xs font-bold text-primary flex items-center gap-2 uppercase tracking-wider">
                <Plus className="w-3 h-3" /> Tambah Riwayat Update
              </p>
              <div className="grid gap-3">
                <div className="space-y-1.5">
                  <Label className="text-[11px]">Nomor Versi</Label>
                  <Input 
                    value={newVer.version} 
                    onChange={(e) => setNewVer({ ...newVer, version: e.target.value })} 
                    placeholder="Contoh: 1.5.0" 
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px]">Catatan Update (Gunakan comma-separated untuk banyak poin)</Label>
                  <Textarea 
                    value={newVer.notes} 
                    onChange={(e) => setNewVer({ ...newVer, notes: e.target.value })} 
                    placeholder="Apa yang baru di update ini?" 
                    className="text-sm min-h-[80px] resize-none"
                  />
                </div>
                <Button 
                  size="sm" 
                  className="gap-2 w-full mt-1" 
                  onClick={() => addChangelog.mutate()}
                  disabled={addChangelog.isPending || !newVer.version || !newVer.notes}
                >
                  {addChangelog.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Posting Update
                </Button>
              </div>
            </div>
          )}

          {data?.changelog.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4 italic">Belum ada riwayat update.</p>
          ) : (
            data?.changelog.map((c, idx) => (
              <div key={`${c.version}-${idx}`} className="flex items-start gap-3 pb-3 border-b border-border last:border-0 last:pb-0">
                <Badge variant="outline" className="font-mono mt-0.5 shrink-0 bg-muted/30">{c.version}</Badge>
                <div className="min-w-0 flex-1">
                  <p className="text-sm leading-relaxed text-foreground/90">{c.notes}</p>
                  <p className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
                    <Clock className="w-2.5 h-2.5" />
                    {new Date(c.date).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}
                  </p>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Restart */}
      <Card><CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="text-sm flex items-center gap-2"><Terminal className="w-4 h-4 text-primary" />Restart Layanan</CardTitle>
        <CardDescription className="text-xs">Restart server memutus koneksi aktif sementara. Gunakan hanya saat diperlukan.</CardDescription>
      </CardHeader>
        <CardContent className="px-4 pb-4 space-y-4">
          {log.length > 0 && (
            <div className="bg-zinc-900 rounded-lg p-4 font-mono text-xs text-green-400 space-y-1">
              {log.map((line, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-zinc-500">$</span><span>{line}</span>
                  {i === log.length - 1 && restarting && <Loader2 className="w-3 h-3 animate-spin ml-1" />}
                </div>
              ))}
            </div>
          )}
          <Button onClick={() => restart.mutate()} disabled={restarting} variant="destructive" className="gap-2">
            {restarting ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Restart Server
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Cleanup Section ──────────────────────────────────────────────────────────

function CleanupSection() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [cleanupDays, setCleanupDays] = useState(90);
  const [cleanupEnabled, setCleanupEnabled] = useState(false);
  const [preview, setPreview] = useState<{ messages: number; inbox: number; affectedUsers: number; cutoffDate: string } | null>(null);
  const [lastRun, setLastRun] = useState<{ deletedMessages: number; deletedInbox: number; total: number } | null>(null);

  useQuery({
    queryKey: ["admin-cleanup-settings"],
    queryFn: () => apiFetch("/admin/cleanup/settings").then((r) => r.json()),
    onSuccess: (d: any) => { setCleanupDays(d.cleanupDays); setCleanupEnabled(d.cleanupEnabled); },
  } as any);

  const saveSettings = useMutation({
    mutationFn: () => apiFetch("/admin/cleanup/settings", { method: "PUT", body: JSON.stringify({ cleanupDays, cleanupEnabled }) }).then((r) => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-cleanup-settings"] }); toast({ title: "Pengaturan cleanup disimpan" }); },
    onError: () => toast({ title: "Gagal menyimpan", variant: "destructive" }),
  });

  const previewMut = useMutation({
    mutationFn: () => apiFetch(`/admin/cleanup/preview?days=${cleanupDays}`).then((r) => r.json()),
    onSuccess: (d: any) => setPreview(d),
  });

  const runCleanup = useMutation({
    mutationFn: () => apiFetch("/admin/cleanup/run", { method: "POST", body: JSON.stringify({ days: cleanupDays }) }).then((r) => r.json()),
    onSuccess: (d: any) => {
      setLastRun(d);
      setPreview(null);
      toast({ title: `Cleanup selesai: ${d.total} record dihapus dari semua pengguna` });
    },
    onError: () => toast({ title: "Cleanup gagal", variant: "destructive" }),
  });

  return (
    <div className="space-y-5">
      <SectionHeader title="Auto-Cleanup Data" desc="Atur pembersihan otomatis data lama untuk seluruh pengguna" icon={Trash2} />

      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm flex items-center gap-2">
            <DatabaseBackup className="w-4 h-4 text-primary" /> Kebijakan Penyimpanan Data Global
          </CardTitle>
          <CardDescription className="text-xs">Pengaturan ini berlaku untuk semua pengguna di platform</CardDescription>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-4">
          <div className="flex items-center justify-between p-3 border rounded-lg">
            <div>
              <p className="text-sm font-medium">Aktifkan Auto-Cleanup</p>
              <p className="text-xs text-muted-foreground">Hapus otomatis data lama setiap hari (dijadwalkan)</p>
            </div>
            <Switch checked={cleanupEnabled} onCheckedChange={setCleanupEnabled} />
          </div>

          <div className="space-y-2">
            <Label className="text-sm">Retensi Data (hari)</Label>
            <p className="text-xs text-muted-foreground">Data pesan & inbox yang lebih lama dari ini akan dihapus</p>
            <div className="flex items-center gap-3">
              <Input
                type="number" min={7} max={365} value={cleanupDays}
                onChange={(e) => { setCleanupDays(parseInt(e.target.value) || 90); setPreview(null); }}
                className="w-28"
              />
              <span className="text-sm text-muted-foreground">hari</span>
              <div className="flex gap-1.5">
                {[30, 60, 90, 180, 365].map((d) => (
                  <button
                    key={d}
                    onClick={() => { setCleanupDays(d); setPreview(null); }}
                    className={cn(
                      "px-2.5 py-1 rounded-md text-xs font-medium border transition-colors",
                      cleanupDays === d
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border text-muted-foreground hover:bg-muted"
                    )}
                  >
                    {d}h
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <Button className="gap-2" onClick={() => saveSettings.mutate()} disabled={saveSettings.isPending}>
              {saveSettings.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Simpan Pengaturan
            </Button>
            <Button variant="outline" onClick={() => previewMut.mutate()} disabled={previewMut.isPending}>
              {previewMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Preview"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Preview result */}
      {preview && (
        <div className="rounded-xl border border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-950/30 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-orange-500 shrink-0" />
            <p className="text-sm font-semibold text-orange-700 dark:text-orange-400">Preview Cleanup ({cleanupDays} hari)</p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Pesan", value: preview.messages },
              { label: "Inbox", value: preview.inbox },
              { label: "User Terdampak", value: preview.affectedUsers },
            ].map((s) => (
              <div key={s.label} className="bg-white dark:bg-orange-950/50 rounded-lg p-3 text-center border border-orange-100 dark:border-orange-800">
                <p className="text-xl font-bold text-orange-600">{s.value.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">Cutoff: {new Date(preview.cutoffDate).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}</p>
          <Button
            variant="destructive" className="gap-2 w-full"
            onClick={() => runCleanup.mutate()} disabled={runCleanup.isPending}
          >
            {runCleanup.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            Jalankan Cleanup Sekarang (Semua User)
          </Button>
        </div>
      )}

      {/* Last run result */}
      {lastRun && (
        <div className="rounded-xl border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/30 p-4">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 className="w-4 h-4 text-green-500" />
            <p className="text-sm font-semibold text-green-700 dark:text-green-400">Cleanup Berhasil</p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Pesan Dihapus", value: lastRun.deletedMessages },
              { label: "Inbox Dihapus", value: lastRun.deletedInbox },
              { label: "Total", value: lastRun.total },
            ].map((s) => (
              <div key={s.label} className="bg-white dark:bg-green-950/50 rounded-lg p-3 text-center border border-green-100 dark:border-green-800">
                <p className="text-xl font-bold text-green-600">{s.value.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-xl border border-border/60 bg-muted/30 p-4 space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Catatan Penting</p>
        <ul className="text-xs text-muted-foreground space-y-1.5 list-disc pl-4">
          <li>Cleanup menghapus data permanen — <strong>tidak bisa dibatalkan</strong></li>
          <li>Selalu lakukan preview sebelum menjalankan cleanup</li>
          <li>Auto-cleanup berjalan setiap hari jika diaktifkan</li>
          <li>Pengaturan ini berlaku global untuk semua pengguna platform</li>
        </ul>
      </div>
    </div>
  );
}

// ─── Telegram Notification Section ──────────────────────────────────────────
function TelegramSection() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [botToken, setBotToken] = useState("");
  const [chatId, setChatId] = useState("");
  const [testing, setTesting] = useState(false);
  const [showToken, setShowToken] = useState(false);

  const { isLoading } = useQuery({
    queryKey: ["admin-telegram-settings"],
    queryFn: () => apiFetch("/admin/settings?keys=telegram_bot_token,telegram_chat_id").then((r) => r.json()),
    onSuccess: (d: any) => {
      if (d.telegram_bot_token) setBotToken(d.telegram_bot_token);
      if (d.telegram_chat_id) setChatId(d.telegram_chat_id);
    },
  } as any);

  const saveMut = useMutation({
    mutationFn: () =>
      apiFetch("/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telegram_bot_token: botToken, telegram_chat_id: chatId }),
      }).then((r) => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-telegram-settings"] }); toast({ title: "Pengaturan Telegram disimpan" }); },
    onError: () => toast({ title: "Gagal menyimpan", variant: "destructive" }),
  });

  async function testNotification() {
    setTesting(true);
    try {
      const r = await apiFetch("/admin/telegram/test", { method: "POST" });
      const d = await r.json();
      if (r.ok) toast({ title: "✅ Notifikasi terkirim!", description: "Cek bot Telegram kamu" });
      else toast({ title: "Gagal", description: d.message, variant: "destructive" });
    } catch {
      toast({ title: "Gagal mengirim test", variant: "destructive" });
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="space-y-5">
      <SectionHeader title="Notifikasi Telegram" desc="Kirim alert otomatis ke bot Telegram saat device disconnect atau blast selesai" icon={Send} />

      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm flex items-center gap-2">
            <Send className="w-4 h-4" style={{ color: "hsl(145 63% 49%)" }} />
            Konfigurasi Bot Telegram
          </CardTitle>
          <CardDescription className="text-xs">
            Buat bot di @BotFather Telegram, dapatkan token, lalu cari Chat ID grup/channel kamu
          </CardDescription>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-4">
          <div className="space-y-1.5">
            <Label>Bot Token</Label>
            <div className="flex gap-2">
              <Input
                type={showToken ? "text" : "password"}
                placeholder="1234567890:ABCdef..."
                value={botToken}
                onChange={(e) => setBotToken(e.target.value)}
              />
              <Button variant="ghost" size="icon" onClick={() => setShowToken((s) => !s)}>
                {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Buat bot baru: chat ke <strong>@BotFather</strong> → /newbot → salin token
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>Chat ID</Label>
            <Input
              placeholder="-1001234567890 atau 123456789"
              value={chatId}
              onChange={(e) => setChatId(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Chat ID personal atau grup. Untuk grup: tambah bot ke grup, ketik pesan, buka{" "}
              <code className="bg-muted px-1 rounded">api.telegram.org/bot{"{TOKEN}"}/getUpdates</code>
            </p>
          </div>

          <div className="flex gap-2">
            <Button
              onClick={() => saveMut.mutate()}
              disabled={saveMut.isPending}
              style={{ backgroundColor: "hsl(145 63% 49%)" }}
              className="text-white"
            >
              {saveMut.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
              Simpan
            </Button>
            <Button variant="outline" onClick={testNotification} disabled={testing || !botToken || !chatId}>
              {testing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Bell className="w-4 h-4 mr-2" />}
              Test Notifikasi
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm">Alert yang Dikirim Otomatis</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="space-y-3">
            {[
              { icon: "⚠️", label: "Device Terputus", desc: "Saat WhatsApp device disconnect / logout" },
              { icon: "✅", label: "Blast Selesai", desc: "Laporan total terkirim/gagal setelah blast" },
            ].map((a) => (
              <div key={a.label} className="flex items-start gap-3 rounded-lg bg-muted/50 p-3">
                <span className="text-lg">{a.icon}</span>
                <div>
                  <p className="text-sm font-medium">{a.label}</p>
                  <p className="text-xs text-muted-foreground">{a.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Main AdminSettings page ──────────────────────────────────────────────────

export default function AdminSettings() {
  const hash = typeof window !== "undefined" ? window.location.hash.replace("#", "") : "";
  const initialSection = (SECTIONS.find((s) => s.id === hash)?.id ?? "umum") as SectionId;
  const [active, setActive] = useState<SectionId>(initialSection);

  function selectSection(id: SectionId) {
    setActive(id);
    window.history.replaceState(null, "", `#${id}`);
  }

  const sectionContent: Record<SectionId, React.ReactNode> = {
    umum: <UmumSection />,
    email: <EmailSection />,
    akses: <AksesSection />,
    auth: <GoogleAuthSection />,
    pembayaran: <PembayaranSection />,
    ai: <AiSection />,
    cleanup: <CleanupSection />,
    telegram: <TelegramSection />,
    sistem: <SistemSection />,
  };

  const activeSection = SECTIONS.find((s) => s.id === active)!;

  return (
    <div className="w-full mx-auto">
      {/* ── Dropdown navigation ────────────────────────────────────────── */}
      <div className="relative mb-4">
        <Select value={active} onValueChange={(v) => selectSection(v as SectionId)}>
          <SelectTrigger
            className="w-full h-12 px-4 rounded-2xl border border-border/70 bg-card shadow-sm text-sm font-medium"
          >
            <div className="flex items-center gap-3">
              {(() => {
                const Icon = activeSection.icon;
                return (
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                    style={{ backgroundColor: "hsl(145 63% 49% / 0.12)" }}>
                    <Icon className="w-3.5 h-3.5" style={{ color: "hsl(145 63% 42%)" }} />
                  </div>
                );
              })()}
              <div className="text-left min-w-0">
                <span className="font-semibold">{activeSection.label}</span>
                <span className="text-muted-foreground text-xs ml-2 hidden sm:inline">{activeSection.desc}</span>
              </div>
            </div>
          </SelectTrigger>
          <SelectContent className="rounded-2xl border-border/70 shadow-lg max-h-[13.5rem] overflow-y-auto">
            {SECTIONS.map(({ id, icon: Icon, label, desc }) => (
              <SelectItem
                key={id}
                value={id}
                className="rounded-xl py-3 px-3 cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "w-7 h-7 rounded-lg flex items-center justify-center shrink-0",
                    active === id ? "" : "bg-muted"
                  )}
                    style={active === id ? { backgroundColor: "hsl(145 63% 49% / 0.12)" } : {}}>
                    <Icon className="w-3.5 h-3.5"
                      style={active === id ? { color: "hsl(145 63% 42%)" } : {}} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium leading-tight">{label}</p>
                    <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">{desc}</p>
                  </div>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* ── Section content ────────────────────────────────────────────── */}
      <div className="bg-card border border-border/60 rounded-2xl p-5 md:p-6 shadow-sm">
        {sectionContent[active]}
      </div>
    </div>
  );
}

import React, { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Save, Loader2, CheckCircle2, XCircle,
  Eye, EyeOff, Zap, AlertCircle, Wifi, ChevronDown, Check, RefreshCw, Clock3,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

type Gateway = "none" | "pakasir" | "midtrans" | "xendit" | "tokopay" | "tripay";

interface GatewayConfig {
  activeGateway: Gateway;
  pakasir:  { merchantId: string; apiKey: string; mode: "sandbox" | "production" };
  midtrans: { serverKey: string; clientKey: string; mode: "sandbox" | "production" };
  xendit:   { secretKey: string; mode: "sandbox" | "production" };
  tokopay:  { merchantId: string; secret: string; mode: "sandbox" | "production" };
  tripay:   { apiKey: string; privateKey: string; merchantCode: string; mode: "sandbox" | "production" };
}

interface PaymentWebhookLog {
  id: number;
  gateway: string;
  orderId: string | null;
  userId: number | null;
  eventStatus: string | null;
  processingStatus: string;
  httpStatus: number | null;
  amount: string | null;
  project: string | null;
  message: string | null;
  createdAt: string;
}

// ── Brand SVG Logos ──────────────────────────────────────────────────────────

function LogoDemo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none">
      <rect width="28" height="28" rx="6" fill="#f3f4f6" />
      <path d="M7 14a7 7 0 1 1 14 0A7 7 0 0 1 7 14Z" fill="#d1d5db" />
      <path d="M11 14l2 2 4-4" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LogoPakasir({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none">
      <rect width="28" height="28" rx="6" fill="#1a56db" />
      <rect x="5" y="9" width="18" height="11" rx="2" fill="white" fillOpacity="0.15" stroke="white" strokeWidth="1.2" />
      <rect x="5" y="12" width="18" height="3" fill="#f59e0b" />
      <rect x="7" y="16" width="5" height="1.5" rx="0.75" fill="white" fillOpacity="0.7" />
      <rect x="14" y="16" width="3" height="1.5" rx="0.75" fill="white" fillOpacity="0.5" />
    </svg>
  );
}

function LogoMidtrans({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none">
      <rect width="28" height="28" rx="6" fill="#003d79" />
      <path d="M5 18.5L10.5 9.5L14 15L17.5 9.5L23 18.5" stroke="#00b5e2" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <circle cx="14" cy="15" r="1.5" fill="#00b5e2" />
    </svg>
  );
}

function LogoXendit({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none">
      <rect width="28" height="28" rx="6" fill="#0052CC" />
      <path d="M7 8h4.5l2.5 4 2.5-4H21L15.5 14 21 20h-4.5L14 16l-2.5 4H7l5.5-6L7 8Z" fill="white" />
    </svg>
  );
}

function LogoTokopay({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none">
      <rect width="28" height="28" rx="6" fill="#00AA5B" />
      <path d="M14 6C9.58 6 6 9.58 6 14s3.58 8 8 8 8-3.58 8-8-3.58-8-8-8Z" fill="white" fillOpacity="0.2" />
      <path d="M10 14l3 3 5-6" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14 8v2M14 18v2M8 14H6M22 14h-2" stroke="white" strokeWidth="1.2" strokeLinecap="round" strokeOpacity="0.5" />
    </svg>
  );
}

function LogoTripay({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none">
      <rect width="28" height="28" rx="6" fill="#f97316" />
      <path d="M8 20V12l6-6 6 6v8" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <rect x="11" y="15" width="6" height="5" rx="1" fill="white" fillOpacity="0.3" stroke="white" strokeWidth="1.2" />
      <path d="M11 12h6" stroke="white" strokeWidth="1.2" strokeLinecap="round" strokeOpacity="0.6" />
    </svg>
  );
}

const GATEWAY_LOGOS: Record<Gateway, (props: { size?: number }) => React.ReactElement> = {
  none:     LogoDemo,
  pakasir:  LogoPakasir,
  midtrans: LogoMidtrans,
  xendit:   LogoXendit,
  tokopay:  LogoTokopay,
  tripay:   LogoTripay,
};

const GATEWAY_META: Record<Gateway, { label: string; desc: string; color: string }> = {
  none:     { label: "Tidak Ada / Demo",  desc: "Simulasi pembayaran tanpa gateway nyata",                   color: "text-muted-foreground" },
  pakasir:  { label: "Pakasir",           desc: "Payment gateway lokal Indonesia — QRIS, VA, dll.",           color: "text-blue-700" },
  midtrans: { label: "Midtrans",          desc: "Platform terpopuler Indonesia (Gojek Group)",               color: "text-[#003d79]" },
  xendit:   { label: "Xendit",            desc: "Gateway regional Asia Tenggara — Invoice, VA, QRIS, e-Wallet", color: "text-[#0052CC]" },
  tokopay:  { label: "Tokopay",           desc: "Solusi pembayaran QRIS & virtual account ringan",           color: "text-[#00AA5B]" },
  tripay:   { label: "Tripay",            desc: "Gateway multi-channel — VA, QRIS, Minimarket, e-Wallet",   color: "text-orange-600" },
};

// ── Sub-components ────────────────────────────────────────────────────────────

const WEBHOOK_STATUS_STYLES: Record<string, string> = {
  paid: "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800",
  received: "bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800",
  ignored: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800",
  failed: "bg-red-100 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800",
};

function webhookStatusClass(status: string): string {
  return WEBHOOK_STATUS_STYLES[status] ?? "bg-muted text-muted-foreground border-border";
}

function formatWebhookAmount(amount: string | null): string {
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) return "-";
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
}

function formatWebhookTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function PasswordInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input type={show ? "text" : "password"} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="pr-9" />
      <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );
}

function ModeToggle({ label, mode, onChange }: { label: string; mode: "sandbox" | "production"; onChange: (m: "sandbox" | "production") => void }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 p-3 rounded-xl bg-muted/60 border border-border">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{label} Mode</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {mode === "sandbox" ? "Sandbox — uji coba, tidak ada transaksi nyata" : "Production — transaksi nyata dengan uang sungguhan"}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className={`text-xs ${mode === "sandbox" ? "font-medium text-foreground" : "text-muted-foreground"}`}>Sandbox</span>
        <Switch checked={mode === "production"} onCheckedChange={(v) => onChange(v ? "production" : "sandbox")} />
        <span className={`text-xs ${mode === "production" ? "font-medium text-foreground" : "text-muted-foreground"}`}>Production</span>
      </div>
    </div>
  );
}

function TestButton({ gw, result, onTest, loading }: {
  gw: Gateway;
  result: { gw: Gateway; ok: boolean; msg: string } | null;
  onTest: () => void;
  loading: boolean;
}) {
  const r = result?.gw === gw ? result : null;
  return (
    <div className="flex flex-wrap items-center gap-3 pt-1">
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

// ── Custom Gateway Dropdown ───────────────────────────────────────────────────

function GatewayDropdown({ value, onChange }: { value: Gateway; onChange: (g: Gateway) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const ActiveLogo = GATEWAY_LOGOS[value];
  const activeMeta = GATEWAY_META[value];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-input bg-background hover:bg-muted/40 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ActiveLogo size={32} />
        <div className="flex-1 text-left min-w-0">
          <p className={`font-semibold text-sm leading-tight ${activeMeta.color}`}>{activeMeta.label}</p>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{activeMeta.desc}</p>
        </div>
        <ChevronDown className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 z-50 rounded-xl border border-border bg-popover shadow-lg overflow-hidden">
          {(["none", "pakasir", "midtrans", "xendit", "tokopay", "tripay"] as Gateway[]).map((gw, i, arr) => {
            const Logo = GATEWAY_LOGOS[gw];
            const meta = GATEWAY_META[gw];
            const isSelected = value === gw;
            return (
              <button
                key={gw}
                type="button"
                onClick={() => { onChange(gw); setOpen(false); }}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/60 focus:outline-none ${
                  isSelected ? "bg-muted/30" : ""
                } ${i < arr.length - 1 ? "border-b border-border/50" : ""}`}
              >
                <Logo size={28} />
                <div className="flex-1 min-w-0">
                  <p className={`font-semibold text-sm leading-tight ${meta.color}`}>{meta.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{meta.desc}</p>
                </div>
                {isSelected && <Check className="w-4 h-4 text-primary shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AdminPaymentGateway() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: config, isLoading } = useQuery<GatewayConfig>({
    queryKey: ["admin-payment-gateway"],
    queryFn: () => apiFetch("/admin/payment-gateway").then((r) => r.json()),
  });

  const {
    data: webhookLogs = [],
    isLoading: webhookLogsLoading,
    isFetching: webhookLogsFetching,
  } = useQuery<PaymentWebhookLog[]>({
    queryKey: ["admin-payment-gateway-webhook-logs"],
    queryFn: () => apiFetch("/admin/payment-gateway/webhook-logs?limit=20").then((r) => r.json()),
    refetchInterval: 15000,
  });

  const [activeGw, setActiveGw] = useState<Gateway>("none");
  const [pakasir,  setPakasir]  = useState<GatewayConfig["pakasir"]>({ merchantId: "", apiKey: "", mode: "sandbox" });
  const [midtrans, setMidtrans] = useState<GatewayConfig["midtrans"]>({ serverKey: "", clientKey: "", mode: "sandbox" });
  const [xendit,   setXendit]   = useState<GatewayConfig["xendit"]>({ secretKey: "", mode: "sandbox" });
  const [tokopay,  setTokopay]  = useState<GatewayConfig["tokopay"]>({ merchantId: "", secret: "", mode: "sandbox" });
  const [tripay,   setTripay]   = useState<GatewayConfig["tripay"]>({ apiKey: "", privateKey: "", merchantCode: "", mode: "sandbox" });
  const [initialized, setInitialized] = useState(false);
  const [testResult, setTestResult] = useState<{ gw: Gateway; ok: boolean; msg: string } | null>(null);

  if (config && !initialized) {
    setActiveGw(config.activeGateway);
    setPakasir(config.pakasir as any);
    setMidtrans(config.midtrans as any);
    if (config.xendit) setXendit(config.xendit as any);
    setTokopay(config.tokopay as any);
    setTripay(config.tripay as any);
    setInitialized(true);
  }

  const save = useMutation({
    mutationFn: () => apiFetch("/admin/payment-gateway", {
      method: "PUT",
      body: JSON.stringify({ activeGateway: activeGw, pakasir, midtrans, xendit, tokopay, tripay }),
    }).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-payment-gateway"] });
      toast({ title: "Konfigurasi payment gateway disimpan ✓" });
    },
    onError: () => toast({ title: "Gagal menyimpan konfigurasi", variant: "destructive" }),
  });

  const testConnection = useMutation({
    mutationFn: (gw: Gateway) =>
      apiFetch("/admin/payment-gateway/test", { method: "POST", body: JSON.stringify({ gateway: gw }) }).then((r) => r.json()),
    onSuccess: (data, gw) => setTestResult({ gw, ok: data.success, msg: data.message }),
    onError: (_e, gw) => setTestResult({ gw, ok: false, msg: "Koneksi gagal" }),
  });

  if (isLoading) {
    return <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-5">
      {/* ── Gateway Selector ──────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Zap className="w-4 h-4 text-primary" />
            Gateway Aktif
          </CardTitle>
          <CardDescription>Hanya satu gateway yang aktif pada satu waktu</CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-0 space-y-3">
          <GatewayDropdown value={activeGw} onChange={setActiveGw} />

          {activeGw !== "none" && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-primary shrink-0" />
              Gateway <span className={`font-semibold ${GATEWAY_META[activeGw].color}`}>{GATEWAY_META[activeGw].label}</span> dipilih — pastikan kredensial sudah diisi di tab di bawah
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Credential Config Tabs ────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Konfigurasi Kredensial</CardTitle>
          <CardDescription>Masukkan API key untuk setiap gateway yang ingin digunakan</CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <Tabs defaultValue="pakasir">
            <TabsList className="w-full grid grid-cols-5">
              {(["pakasir", "midtrans", "xendit", "tokopay", "tripay"] as const).map((gw) => {
                const Logo = GATEWAY_LOGOS[gw];
                return (
                  <TabsTrigger key={gw} value={gw} className="relative gap-1.5 py-2">
                    <Logo size={16} />
                    <span className="hidden sm:inline text-xs">{GATEWAY_META[gw].label}</span>
                    {activeGw === gw && (
                      <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-primary" />
                    )}
                  </TabsTrigger>
                );
              })}
            </TabsList>

            {/* Pakasir */}
            <TabsContent value="pakasir" className="mt-4 space-y-4">
              <div className="flex items-center gap-3 pb-1">
                <LogoPakasir size={32} />
                <div>
                  <p className="font-semibold text-blue-700">Pakasir</p>
                  <p className="text-xs text-muted-foreground">Payment gateway lokal Indonesia — QRIS & Virtual Account</p>
                </div>
              </div>
              <div className="rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 px-4 py-3 text-xs text-blue-800 dark:text-blue-300 space-y-1">
                <p className="font-semibold">Cara mendapatkan kredensial:</p>
                <ol className="list-decimal list-inside space-y-0.5 text-blue-700 dark:text-blue-400">
                  <li>Daftar/login di <span className="font-mono">pakasir.com</span></li>
                  <li>Buat <strong>Proyek</strong> baru untuk aplikasi ini</li>
                  <li>Salin <strong>Slug</strong> dan <strong>API Key</strong> dari halaman detail proyek</li>
                  <li>Isi Webhook URL: <span className="font-mono break-all">{window.location.origin}/api/billing/webhook</span></li>
                </ol>
              </div>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Slug Proyek</Label>
                  <Input placeholder="contoh: namabisnis" value={pakasir.merchantId} onChange={(e) => setPakasir((s) => ({ ...s, merchantId: e.target.value }))} />
                  <p className="text-xs text-muted-foreground">Slug yang tertera di halaman detail Proyek Pakasir</p>
                </div>
                <div className="space-y-1.5">
                  <Label>API Key</Label>
                  <PasswordInput placeholder="API Key dari halaman detail Proyek" value={pakasir.apiKey} onChange={(v) => setPakasir((s) => ({ ...s, apiKey: v }))} />
                </div>
              </div>
              <TestButton gw="pakasir" result={testResult} onTest={() => testConnection.mutate("pakasir")} loading={testConnection.isPending} />
            </TabsContent>

            {/* Midtrans */}
            <TabsContent value="midtrans" className="mt-4 space-y-4">
              <div className="flex items-center gap-3 pb-1">
                <LogoMidtrans size={32} />
                <div>
                  <p className="font-semibold text-[#003d79]">Midtrans</p>
                  <p className="text-xs text-muted-foreground">Platform pembayaran terpopuler Indonesia (Gojek Group)</p>
                </div>
              </div>
              <ModeToggle label="Midtrans" mode={midtrans.mode} onChange={(m) => setMidtrans((s) => ({ ...s, mode: m }))} />
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Server Key</Label>
                  <PasswordInput placeholder="SB-Mid-server-xxxx" value={midtrans.serverKey} onChange={(v) => setMidtrans((s) => ({ ...s, serverKey: v }))} />
                  <p className="text-xs text-muted-foreground">Digunakan di server — jangan ekspos ke frontend</p>
                </div>
                <div className="space-y-1.5">
                  <Label>Client Key</Label>
                  <Input placeholder="SB-Mid-client-xxxx" value={midtrans.clientKey} onChange={(e) => setMidtrans((s) => ({ ...s, clientKey: e.target.value }))} />
                  <p className="text-xs text-muted-foreground">Digunakan di frontend untuk Snap.js</p>
                </div>
              </div>
              <TestButton gw="midtrans" result={testResult} onTest={() => testConnection.mutate("midtrans")} loading={testConnection.isPending} />
            </TabsContent>

            {/* Xendit */}
            <TabsContent value="xendit" className="mt-4 space-y-4">
              <div className="flex items-center gap-3 pb-1">
                <LogoXendit size={32} />
                <div>
                  <p className="font-semibold text-[#0052CC]">Xendit</p>
                  <p className="text-xs text-muted-foreground">Gateway regional Asia Tenggara — Invoice, VA, QRIS, e-Wallet</p>
                </div>
              </div>
              <ModeToggle label="Xendit" mode={xendit.mode} onChange={(m) => setXendit((s) => ({ ...s, mode: m }))} />
              <div className="rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 px-4 py-3 text-xs text-blue-800 dark:text-blue-300 space-y-1">
                <p className="font-semibold">Cara mendapatkan Secret Key:</p>
                <ol className="list-decimal list-inside space-y-0.5 text-blue-700 dark:text-blue-400">
                  <li>Daftar/login di <span className="font-mono">dashboard.xendit.co</span></li>
                  <li>Buka <strong>Settings → API Keys</strong></li>
                  <li>Generate <strong>Secret Key</strong> (prefix: <span className="font-mono">xnd_production_</span> atau <span className="font-mono">xnd_development_</span>)</li>
                  <li>Daftarkan Webhook URL di Settings → Webhooks: <span className="font-mono break-all">{window.location.origin}/api/billing/webhook</span></li>
                </ol>
              </div>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Secret Key</Label>
                  <PasswordInput placeholder="xnd_production_xxxx atau xnd_development_xxxx" value={xendit.secretKey} onChange={(v) => setXendit((s) => ({ ...s, secretKey: v }))} />
                  <p className="text-xs text-muted-foreground">Secret key dari dashboard Xendit — jangan ekspos ke frontend</p>
                </div>
              </div>
              <TestButton gw="xendit" result={testResult} onTest={() => testConnection.mutate("xendit")} loading={testConnection.isPending} />
            </TabsContent>

            {/* Tokopay */}
            <TabsContent value="tokopay" className="mt-4 space-y-4">
              <div className="flex items-center gap-3 pb-1">
                <LogoTokopay size={32} />
                <div>
                  <p className="font-semibold text-[#00AA5B]">Tokopay</p>
                  <p className="text-xs text-muted-foreground">Solusi pembayaran QRIS & virtual account</p>
                </div>
              </div>
              <ModeToggle label="Tokopay" mode={tokopay.mode} onChange={(m) => setTokopay((s) => ({ ...s, mode: m }))} />
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Merchant ID</Label>
                  <Input placeholder="ID merchant dari dashboard Tokopay" value={tokopay.merchantId} onChange={(e) => setTokopay((s) => ({ ...s, merchantId: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>Secret / API Key</Label>
                  <PasswordInput placeholder="secret key dari dashboard Tokopay" value={tokopay.secret} onChange={(v) => setTokopay((s) => ({ ...s, secret: v }))} />
                </div>
              </div>
              <TestButton gw="tokopay" result={testResult} onTest={() => testConnection.mutate("tokopay")} loading={testConnection.isPending} />
            </TabsContent>

            {/* Tripay */}
            <TabsContent value="tripay" className="mt-4 space-y-4">
              <div className="flex items-center gap-3 pb-1">
                <LogoTripay size={32} />
                <div>
                  <p className="font-semibold text-orange-600">Tripay</p>
                  <p className="text-xs text-muted-foreground">Gateway multi-channel — VA, QRIS, Minimarket, e-Wallet</p>
                </div>
              </div>
              <ModeToggle label="Tripay" mode={tripay.mode} onChange={(m) => setTripay((s) => ({ ...s, mode: m }))} />
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>API Key</Label>
                  <PasswordInput placeholder="DEV-xxxx (sandbox) / T-xxxx (production)" value={tripay.apiKey} onChange={(v) => setTripay((s) => ({ ...s, apiKey: v }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>Private Key</Label>
                  <PasswordInput placeholder="private key dari dashboard Tripay" value={tripay.privateKey} onChange={(v) => setTripay((s) => ({ ...s, privateKey: v }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>Merchant Code</Label>
                  <Input placeholder="T00000 (kode merchant Tripay)" value={tripay.merchantCode} onChange={(e) => setTripay((s) => ({ ...s, merchantCode: e.target.value }))} />
                </div>
              </div>
              <TestButton gw="tripay" result={testResult} onTest={() => testConnection.mutate("tripay")} loading={testConnection.isPending} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Webhook info */}
      <Card className="bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800">
        <CardContent className="p-4">
          <div className="flex gap-3">
            <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
            <div className="text-sm space-y-2 min-w-0">
              <p className="font-semibold text-amber-800 dark:text-amber-300">Konfigurasi Webhook di Dashboard Gateway</p>
              <p className="text-amber-700 dark:text-amber-400 text-xs leading-relaxed">
                Daftarkan URL callback berikut di dashboard masing-masing gateway agar status pembayaran ter-update otomatis:
              </p>
              <code className="block bg-white dark:bg-black/30 rounded-lg px-3 py-2 text-xs font-mono border border-amber-200 dark:border-amber-700 break-all select-all text-foreground">
                {window.location.origin}/api/billing/webhook
              </code>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Webhook logs */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Clock3 className="w-4 h-4 text-primary" />
                Log Webhook Payment
              </CardTitle>
              <CardDescription>Audit callback terbaru dari gateway, auto-refresh setiap 15 detik</CardDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => qc.invalidateQueries({ queryKey: ["admin-payment-gateway-webhook-logs"] })}
              className="gap-2"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${webhookLogsFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          {webhookLogsLoading ? (
            <div className="flex items-center justify-center rounded-xl border border-dashed py-8 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : webhookLogs.length === 0 ? (
            <div className="rounded-xl border border-dashed px-4 py-8 text-center">
              <p className="text-sm font-medium">Belum ada webhook masuk</p>
              <p className="text-xs text-muted-foreground mt-1">Saat Pakasir mengirim callback, detailnya akan muncul di sini.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {webhookLogs.map((log) => (
                <div key={log.id} className="rounded-xl border border-border bg-muted/20 px-4 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase ${webhookStatusClass(log.processingStatus)}`}>
                          {log.processingStatus}
                        </span>
                        {log.httpStatus && (
                          <span className="text-[11px] text-muted-foreground">HTTP {log.httpStatus}</span>
                        )}
                        <span className="text-[11px] text-muted-foreground">{formatWebhookTime(log.createdAt)}</span>
                      </div>
                      <p className="mt-2 font-mono text-xs break-all">{log.orderId ?? "order_id kosong"}</p>
                      <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{log.message ?? "Tidak ada pesan detail"}</p>
                    </div>
                    <div className="text-right text-xs text-muted-foreground shrink-0 space-y-1">
                      <p className="font-semibold text-foreground">{formatWebhookAmount(log.amount)}</p>
                      <p>{log.gateway || "unknown"}{log.project ? ` / ${log.project}` : ""}</p>
                      {log.eventStatus && <p>Status gateway: {log.eventStatus}</p>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Save */}
      <div className="pb-4">
        <Button onClick={() => save.mutate()} disabled={save.isPending} className="gap-2">
          {save.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Simpan Konfigurasi
        </Button>
      </div>
    </div>
  );
}

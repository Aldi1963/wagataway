import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CreditCard, CheckCircle2, Zap, Star, Crown, Loader2, Receipt,
  ExternalLink, Clock, XCircle, RefreshCw, Copy, CheckCheck, Ticket, Gift, AlertCircle,
  Wallet, Plus, Lock, History, ArrowUpCircle, RefreshCcw, ToggleLeft, ToggleRight,
  ChevronRight, Shield, Sparkles, TrendingUp, Calendar, BadgeCheck,
  Rocket, Briefcase, Gem, Flame, Heart, Printer, FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { format } from "date-fns";
import { id as localeId } from "date-fns/locale";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

interface CheckoutData {
  requiresPayment: boolean; orderId?: string; paymentUrl?: string; qrUrl?: string;
  amount?: number; amountFormatted?: string; expiredAt?: string; gateway?: string;
  plan?: string; type?: "plan" | "topup";
}
const GATEWAY_NAMES: Record<string, string> = { pakasir: "Pakasir", midtrans: "Midtrans", tokopay: "Tokopay", tripay: "Tripay", none: "Demo" };
const TOPUP_PRESETS = [25000, 50000, 100000, 200000, 500000];

const PLAN_STYLE: Record<string, { icon: any; gradient: string; badge: string; accent: string; textAccent: string }> = {
  free:       { icon: Zap,    gradient: "from-zinc-400 to-zinc-500",          badge: "", accent: "border-zinc-200 dark:border-zinc-700", textAccent: "text-zinc-600 dark:text-zinc-400" },
  basic:      { icon: Star,   gradient: "from-blue-400 to-blue-600",          badge: "Populer", accent: "border-blue-400 dark:border-blue-500 ring-1 ring-blue-400 dark:ring-blue-500", textAccent: "text-blue-600 dark:text-blue-400" },
  pro:        { icon: Crown,  gradient: "from-emerald-400 to-emerald-600",    badge: "Terbaik", accent: "border-emerald-500 dark:border-emerald-500 ring-1 ring-emerald-500", textAccent: "text-emerald-600 dark:text-emerald-400" },
  enterprise: { icon: Shield, gradient: "from-violet-400 to-violet-600",      badge: "Enterprise", accent: "border-violet-400 dark:border-violet-500 ring-1 ring-violet-500", textAccent: "text-violet-600 dark:text-violet-400" },
};

const COLOR_MAP: Record<string, { gradient: string; accent: string; textAccent: string }> = {
  zinc:    { gradient: "from-zinc-400 to-zinc-500",       accent: "border-zinc-200 dark:border-zinc-700",         textAccent: "text-zinc-600 dark:text-zinc-400" },
  blue:    { gradient: "from-blue-400 to-blue-600",       accent: "border-blue-400 dark:border-blue-500 ring-1 ring-blue-400 dark:ring-blue-500", textAccent: "text-blue-600 dark:text-blue-400" },
  emerald: { gradient: "from-emerald-400 to-emerald-600", accent: "border-emerald-500 dark:border-emerald-500 ring-1 ring-emerald-500", textAccent: "text-emerald-600 dark:text-emerald-400" },
  violet:  { gradient: "from-violet-400 to-violet-600",   accent: "border-violet-400 dark:border-violet-500 ring-1 ring-violet-500", textAccent: "text-violet-600 dark:text-violet-400" },
  orange:  { gradient: "from-orange-400 to-orange-600",   accent: "border-orange-400 dark:border-orange-500 ring-1 ring-orange-400", textAccent: "text-orange-600 dark:text-orange-400" },
  rose:    { gradient: "from-rose-400 to-rose-600",       accent: "border-rose-400 dark:border-rose-500 ring-1 ring-rose-400",    textAccent: "text-rose-600 dark:text-rose-400" },
  amber:   { gradient: "from-amber-400 to-amber-600",     accent: "border-amber-400 dark:border-amber-500 ring-1 ring-amber-400",  textAccent: "text-amber-600 dark:text-amber-400" },
  cyan:    { gradient: "from-cyan-400 to-cyan-600",       accent: "border-cyan-400 dark:border-cyan-500 ring-1 ring-cyan-400",    textAccent: "text-cyan-600 dark:text-cyan-400" },
};

const ICON_MAP: Record<string, any> = {
  zap: Zap, star: Star, crown: Crown, shield: Shield, sparkles: Sparkles,
  rocket: Rocket, briefcase: Briefcase, diamond: Gem, flame: Flame, heart: Heart,
};

function resolvePlanStyle(plan: any) {
  const base = PLAN_STYLE[plan.id] ?? PLAN_STYLE.free!;
  const colorOverride = plan.planColor ? COLOR_MAP[plan.planColor] : null;
  const iconOverride = plan.planIcon ? ICON_MAP[plan.planIcon] : null;
  return {
    icon: iconOverride ?? base.icon,
    gradient: colorOverride?.gradient ?? base.gradient,
    badge: base.badge,
    accent: colorOverride?.accent ?? base.accent,
    textAccent: colorOverride?.textAccent ?? base.textAccent,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtRp(n: number) { return `Rp ${n.toLocaleString("id-ID")}`; }
function fmtDate(d: string) { return format(new Date(d), "d MMMM yyyy", { locale: localeId }); }

// ── Main Component ────────────────────────────────────────────────────────────

export default function Billing() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { user } = useAuth();

  const [checkoutData, setCheckoutData] = useState<CheckoutData | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<"pending" | "paid" | "expired" | "failed" | null>(null);
  const [copied, setCopied] = useState(false);
  const [topupOpen, setTopupOpen] = useState(false);
  const [topupAmount, setTopupAmount] = useState<number>(50000);
  const [topupCustom, setTopupCustom] = useState("");
  const [voucherCode, setVoucherCode] = useState("");
  const [voucherPreview, setVoucherPreview] = useState<{ ok: boolean; planName: string; durationDays: number; type: string; description?: string } | null>(null);
  const [voucherValidating, setVoucherValidating] = useState(false);
  const [blockedPlan, setBlockedPlan] = useState<{ code: string; message: string; currentPlanName: string; expiresAt: string } | null>(null);
  const [historyTab, setHistoryTab] = useState<"wallet" | "plan">("wallet");
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">("monthly");
  const [invoiceTarget, setInvoiceTarget] = useState<any>(null);

  const { data: plans, isLoading: plansLoading } = useQuery({ queryKey: ["billing-plans"], queryFn: () => apiFetch("/billing/plans").then((r) => r.json()) });
  const { data: subscription, isLoading: subLoading } = useQuery({ queryKey: ["billing-subscription"], queryFn: () => apiFetch("/billing/subscription").then((r) => r.json()) });
  const { data: transactions, isLoading: txLoading } = useQuery({ queryKey: ["billing-transactions"], queryFn: () => apiFetch("/billing/transactions").then((r) => r.json()) });
  const { data: balanceData, isLoading: balanceLoading } = useQuery({ queryKey: ["billing-balance"], queryFn: () => apiFetch("/billing/balance").then((r) => r.json()), refetchInterval: 30000 });
  const { data: walletTxs, isLoading: walletLoading } = useQuery({ queryKey: ["billing-wallet-transactions"], queryFn: () => apiFetch("/billing/wallet-transactions").then((r) => r.json()) });

  // Poll payment status
  useEffect(() => {
    if (!checkoutData?.orderId || paymentStatus === "paid" || paymentStatus === "expired") return;
    const interval = setInterval(async () => {
      try {
        const r = await apiFetch(`/billing/payment-status/${checkoutData.orderId}`);
        const d = await r.json();
        if (d.status !== "pending") {
          setPaymentStatus(d.status);
          clearInterval(interval);
          if (d.status === "paid") {
            if (checkoutData.type === "topup") {
              qc.invalidateQueries({ queryKey: ["billing-balance"] });
              qc.invalidateQueries({ queryKey: ["billing-wallet-transactions"] });
              toast({ title: "Top-up saldo berhasil!" });
            } else {
              qc.invalidateQueries({ queryKey: ["billing-subscription"] });
              qc.invalidateQueries({ queryKey: ["billing-transactions"] });
              toast({ title: "Pembayaran berhasil! Paket Anda telah diaktifkan." });
            }
          }
        }
      } catch {}
    }, 5000);
    return () => clearInterval(interval);
  }, [checkoutData?.orderId, paymentStatus]);

  const subscribe = useMutation({
    mutationFn: (plan: string) => apiFetch("/billing/subscribe", { method: "POST", body: JSON.stringify({ plan }) }).then(async (r) => { const d = await r.json(); if (!r.ok) throw Object.assign(new Error(d.message), d); return d; }),
    onSuccess: (d) => {
      setBlockedPlan(null);
      if (!d.requiresPayment) { qc.invalidateQueries({ queryKey: ["billing-subscription"] }); qc.invalidateQueries({ queryKey: ["billing-transactions"] }); toast({ title: "Paket berhasil diaktifkan!" }); }
      else { setCheckoutData({ ...d, type: "plan" }); setPaymentStatus("pending"); }
    },
    onError: (e: any) => {
      if (e.code === "PLAN_ALREADY_ACTIVE") setBlockedPlan({ code: e.code, message: e.message, currentPlanName: e.currentPlanName, expiresAt: e.expiresAt });
      else toast({ title: e.message ?? "Gagal memproses pembayaran", variant: "destructive" });
    },
  });

  const topupMutation = useMutation({
    mutationFn: (amount: number) => apiFetch("/billing/topup", { method: "POST", body: JSON.stringify({ amount }) }).then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.message); return d; }),
    onSuccess: (d) => { setTopupOpen(false); setCheckoutData({ ...d, type: "topup" }); setPaymentStatus("pending"); qc.invalidateQueries({ queryKey: ["billing-wallet-transactions"] }); },
    onError: (e: any) => toast({ title: e.message ?? "Gagal top-up", variant: "destructive" }),
  });

  const autoRenewMutation = useMutation({
    mutationFn: (autoRenew: boolean) => apiFetch("/billing/auto-renew", { method: "PUT", body: JSON.stringify({ autoRenew }) }).then((r) => r.json()),
    onSuccess: (d) => { qc.invalidateQueries({ queryKey: ["billing-balance"] }); toast({ title: d.autoRenew ? "Auto-renewal diaktifkan" : "Auto-renewal dinonaktifkan" }); },
  });

  const cancelMutation = useMutation({
    mutationFn: () => apiFetch("/billing/cancel", { method: "POST" }).then(async (r) => { if (!r.ok) { const d = await r.json(); throw new Error(d.message); } return r.json(); }),
    onSuccess: (d) => { qc.invalidateQueries({ queryKey: ["billing-subscription"] }); toast({ title: "Langganan dibatalkan", description: d.message }); },
    onError: (e: any) => toast({ title: e.message ?? "Gagal membatalkan langganan", variant: "destructive" }),
  });

  const resumeMutation = useMutation({
    mutationFn: () => apiFetch("/billing/resume", { method: "POST" }).then(async (r) => { if (!r.ok) { const d = await r.json(); throw new Error(d.message); } return r.json(); }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["billing-subscription"] }); toast({ title: "Pembatalan berhasil dibatalkan", description: "Langganan kamu tetap aktif" }); },
    onError: (e: any) => toast({ title: e.message ?? "Gagal", variant: "destructive" }),
  });

  const simulatePay = useMutation({
    mutationFn: (orderId: string) => apiFetch(`/billing/simulate-pay/${orderId}`, { method: "POST" }).then((r) => r.json()),
    onSuccess: () => {
      setPaymentStatus("paid");
      if (checkoutData?.type === "topup") { qc.invalidateQueries({ queryKey: ["billing-balance"] }); qc.invalidateQueries({ queryKey: ["billing-wallet-transactions"] }); toast({ title: "Top-up saldo berhasil disimulasikan!" }); }
      else { qc.invalidateQueries({ queryKey: ["billing-subscription"] }); qc.invalidateQueries({ queryKey: ["billing-transactions"] }); toast({ title: "Pembayaran berhasil disimulasikan!" }); }
    },
  });

  async function validateVoucher(code: string) {
    const c = code.toUpperCase().trim();
    if (!c) { setVoucherPreview(null); return; }
    setVoucherValidating(true);
    try { const r = await apiFetch(`/billing/voucher/validate?code=${encodeURIComponent(c)}`); setVoucherPreview(await r.json()); }
    catch { setVoucherPreview(null); }
    finally { setVoucherValidating(false); }
  }

  const redeemVoucher = useMutation({
    mutationFn: () => apiFetch("/billing/voucher/redeem", { method: "POST", body: JSON.stringify({ code: voucherCode.toUpperCase().trim() }) }).then(async (r) => { if (!r.ok) { const d = await r.json(); throw new Error(d.message); } return r.json(); }),
    onSuccess: (d) => { qc.invalidateQueries({ queryKey: ["billing-subscription"] }); qc.invalidateQueries({ queryKey: ["billing-transactions"] }); toast({ title: d.message ?? "Voucher berhasil diredeem!" }); setVoucherCode(""); setVoucherPreview(null); },
    onError: (e: any) => toast({ title: e.message ?? "Gagal meredeem voucher", variant: "destructive" }),
  });

  function copyUrl() { if (!checkoutData?.paymentUrl) return; navigator.clipboard.writeText(checkoutData.paymentUrl); setCopied(true); setTimeout(() => setCopied(false), 2000); }
  function handleTopup() {
    const amount = topupCustom ? parseInt(topupCustom.replace(/\D/g, ""), 10) : topupAmount;
    if (!amount || amount < 10000) { toast({ title: "Minimal top-up Rp 10.000", variant: "destructive" }); return; }
    topupMutation.mutate(amount);
  }

  const currentPlan = user?.plan ?? subscription?.plan ?? "free";
  const isDemo = !checkoutData?.gateway || checkoutData.gateway === "none";
  const isTrial = subscription?.status === "trial";
  const balance: number = balanceData?.balance ?? 0;
  const autoRenew: boolean = balanceData?.autoRenew ?? false;
  const hasActivePaidPlan = subscription && subscription.status === "active" && subscription.planId !== "free" && subscription.currentPeriodEnd && new Date(subscription.currentPeriodEnd) > new Date();

  return (
    <div className="space-y-8 pb-8">

      {/* ── Page Header ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-end">
        <Button size="sm" variant="outline" className="gap-2" onClick={() => { qc.invalidateQueries({ queryKey: ["billing-subscription"] }); qc.invalidateQueries({ queryKey: ["billing-balance"] }); }}>
          <RefreshCw size={13} /> Refresh
        </Button>
      </div>

      {/* ── Hero Stats Row ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

        {/* Current Plan */}
        <div className={cn("relative rounded-2xl border p-5 overflow-hidden bg-card transition-all",
          isTrial ? "border-amber-400/60" : subscription?.status === "active" ? "border-emerald-400/50" : "border-border"
        )}>
          <div className="absolute top-0 right-0 w-32 h-32 opacity-5 -translate-y-4 translate-x-4">
            {isTrial ? <Gift size={128} /> : <CreditCard size={128} />}
          </div>
          <div className="relative">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">Paket Saat Ini</p>
            {subLoading ? <Skeleton className="h-8 w-40" /> : (
              <>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xl font-bold capitalize">{subscription?.planName ?? subscription?.planId ?? "Free"}</span>
                  {isTrial && <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-700 text-[10px]">Trial</Badge>}
                  {subscription?.status === "active" && !isTrial && <BadgeCheck size={18} className="text-emerald-500" />}
                </div>
                {subscription?.currentPeriodEnd && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Calendar size={11} />
                    {isTrial ? "Trial hingga" : "Aktif hingga"} {fmtDate(subscription.currentPeriodEnd)}
                  </p>
                )}
              </>
            )}
          </div>
        </div>

        {/* Wallet Balance */}
        <div className="relative rounded-2xl border border-emerald-400/50 bg-gradient-to-br from-emerald-500/10 to-teal-500/5 p-5 overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 opacity-5 -translate-y-4 translate-x-4">
            <Wallet size={128} />
          </div>
          <div className="relative">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">Saldo Wallet</p>
            {balanceLoading ? <Skeleton className="h-8 w-40" /> : (
              <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">{fmtRp(balance)}</p>
            )}
            <div className="flex items-center gap-3 mt-2">
              <Button size="sm" onClick={() => setTopupOpen(true)} className="h-7 px-3 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white">
                <Plus size={12} /> Top-up
              </Button>
              <button onClick={() => autoRenewMutation.mutate(!autoRenew)} disabled={autoRenewMutation.isPending}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
                {autoRenew ? <ToggleRight size={16} className="text-emerald-500" /> : <ToggleLeft size={16} />}
                Auto-renew {autoRenew ? "aktif" : "mati"}
              </button>
            </div>
          </div>
        </div>

        {/* Quick Action / Voucher */}
        <div className="relative rounded-2xl border border-violet-400/40 bg-gradient-to-br from-violet-500/8 to-indigo-500/5 p-5 overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 opacity-5 -translate-y-4 translate-x-4">
            <Ticket size={128} />
          </div>
          <div className="relative">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">Redeem Voucher</p>
            <div className="flex gap-2">
              <input
                className="flex h-9 flex-1 min-w-0 rounded-xl border border-input bg-background px-3 text-sm font-mono uppercase tracking-wider placeholder:normal-case placeholder:font-sans placeholder:tracking-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="WAG-XXXX-XXXX"
                value={voucherCode}
                onChange={(e) => { const v = e.target.value.toUpperCase(); setVoucherCode(v); validateVoucher(v); }}
              />
              <Button size="sm" className="h-9 px-3 shrink-0" disabled={!voucherCode.trim() || !voucherPreview?.ok || redeemVoucher.isPending} onClick={() => redeemVoucher.mutate()}>
                {redeemVoucher.isPending ? <Loader2 size={14} className="animate-spin" /> : "Redeem"}
              </Button>
            </div>
            {voucherValidating && <p className="text-[11px] text-muted-foreground mt-1.5 flex items-center gap-1"><Loader2 size={11} className="animate-spin" /> Memvalidasi...</p>}
            {!voucherValidating && voucherPreview && (
              <div className={cn("mt-1.5 rounded-lg px-2.5 py-1.5 text-xs flex items-center gap-1.5", voucherPreview.ok ? "bg-emerald-100 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400" : "bg-destructive/10 text-destructive")}>
                {voucherPreview.ok ? <Gift size={11} /> : <XCircle size={11} />}
                {voucherPreview.ok ? <>Paket <strong>{voucherPreview.planName}</strong> · {voucherPreview.durationDays} hari</> : <span>{(voucherPreview as any).message ?? "Kode tidak valid"}</span>}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Alerts ──────────────────────────────────────────────────────────── */}
      {isTrial && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-300/60 bg-amber-50/80 dark:bg-amber-950/20 dark:border-amber-800/60 px-4 py-3.5">
          <AlertCircle size={16} className="text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">Trial Gratis Aktif</p>
            <p className="text-xs text-amber-700/80 dark:text-amber-400/80 mt-0.5">
              Trial berakhir {subscription?.currentPeriodEnd ? fmtDate(subscription.currentPeriodEnd) : "—"}. Upgrade sekarang agar tidak kembali ke paket Free.
            </p>
          </div>
          <Button size="sm" className="h-7 text-xs bg-amber-600 hover:bg-amber-700 text-white shrink-0" onClick={() => document.getElementById("plan-section")?.scrollIntoView({ behavior: "smooth" })}>
            Upgrade <ChevronRight size={12} />
          </Button>
        </div>
      )}
      {autoRenew && (
        <div className="flex items-center gap-3 rounded-2xl border border-emerald-300/40 bg-emerald-50/50 dark:bg-emerald-950/20 dark:border-emerald-800/40 px-4 py-3">
          <RefreshCcw size={14} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
          <p className="text-xs text-emerald-700 dark:text-emerald-400">Paket akan diperbarui otomatis menggunakan saldo wallet saat kadaluarsa.</p>
        </div>
      )}
      {blockedPlan && (
        <div className="flex items-start gap-3 rounded-2xl border border-destructive/40 bg-destructive/5 px-4 py-3.5">
          <Lock size={15} className="text-destructive shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-destructive">Tidak bisa ganti paket</p>
            <p className="text-xs text-muted-foreground mt-0.5">{blockedPlan.message}</p>
          </div>
          <button onClick={() => setBlockedPlan(null)} className="text-muted-foreground hover:text-foreground"><XCircle size={15} /></button>
        </div>
      )}

      {/* ── Plans Grid ──────────────────────────────────────────────────────── */}
      <div id="plan-section">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-5">
          <div>
            <h2 className="text-lg font-bold">Pilih Paket</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Semua paket termasuk akses dashboard penuh</p>
          </div>
          <div className="flex items-center gap-1 bg-muted rounded-xl p-1">
            <button
              className={cn("px-3 py-1.5 rounded-lg text-xs font-medium transition-all", billingCycle === "monthly" ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground")}
              onClick={() => setBillingCycle("monthly")}
            >Bulanan</button>
            <button
              className={cn("px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5", billingCycle === "yearly" ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground")}
              onClick={() => setBillingCycle("yearly")}
            >
              Tahunan
              {(plans ?? []).some((p: any) => (p.yearlyDiscountPercent ?? 0) > 0) && (
                <span className="bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 px-1.5 py-0.5 rounded-full text-[10px] font-bold">Hemat</span>
              )}
            </button>
          </div>
        </div>
        {plansLoading ? (
          <div className="grid md:grid-cols-3 gap-4">{[0,1,2].map((i) => <Skeleton key={i} className="h-80 rounded-2xl" />)}</div>
        ) : (
          <div className="grid md:grid-cols-3 gap-4">
            {(plans ?? []).map((plan: any) => {
              const style = resolvePlanStyle(plan);
              const Icon = style.icon;
              const isCurrentPlan = plan.id === currentPlan;
              const isDifferentPaidBlocked = hasActivePaidPlan && !isCurrentPlan && plan.price > 0 && subscription.planId !== plan.id;
              const hasYearly = billingCycle === "yearly" && (plan.priceUsdYearly ?? 0) > 0;
              const basePrice = hasYearly ? (plan.priceIdrYearly ?? plan.priceUsdYearly * 15000) : (plan.price === 0 ? 0 : (plan.priceIdr ?? plan.price * 15000));
              const price = basePrice;
              const discountPct = hasYearly ? (plan.yearlyDiscountPercent ?? 0) : 0;

              return (
                <div key={plan.id}
                  className={cn("relative rounded-2xl border bg-card p-5 flex flex-col transition-all hover:shadow-md", isCurrentPlan ? style.accent : "border-border")}>

                  {/* Popular badge */}
                  {style.badge && (
                    <div className={cn("absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full text-[11px] font-bold text-white shadow-sm", `bg-gradient-to-r ${style.gradient}`)}>
                      {style.badge}
                    </div>
                  )}

                  {/* Plan icon + current badge */}
                  <div className="flex items-center justify-between mb-4">
                    <div className={cn("w-11 h-11 rounded-xl flex items-center justify-center bg-gradient-to-br text-white shadow-sm", style.gradient)}>
                      <Icon size={20} />
                    </div>
                    {isCurrentPlan && (
                      <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-700 px-2 py-0.5 rounded-full">
                        <BadgeCheck size={11} /> Aktif
                      </span>
                    )}
                  </div>

                  {/* Name + Price */}
                  <h3 className="font-bold text-lg capitalize mb-0.5">{plan.name ?? plan.id}</h3>
                  <div className="flex items-baseline gap-1 mb-0.5">
                    <span className={cn("text-3xl font-extrabold", style.textAccent)}>
                      {price === 0 ? "Gratis" : fmtRp(price)}
                    </span>
                    {price > 0 && <span className="text-muted-foreground text-sm">{hasYearly ? "/thn" : "/bln"}</span>}
                    {discountPct > 0 && (
                      <span className="ml-1 text-[11px] bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 px-1.5 py-0.5 rounded-full font-bold">
                        Hemat {discountPct}%
                      </span>
                    )}
                  </div>
                  {hasYearly && price > 0 && (
                    <p className="text-xs text-muted-foreground mb-1">≈ {fmtRp(Math.round(price / 12))}/bln</p>
                  )}
                  <p className="text-xs text-muted-foreground mb-4 leading-relaxed">{plan.description}</p>

                  {/* Features */}
                  <ul className="space-y-2 mb-5 flex-1">
                    {(plan.features ?? []).map((feat: string, i: number) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <CheckCircle2 size={14} className={cn("flex-shrink-0 mt-0.5", style.textAccent)} />
                        <span className="text-sm leading-snug">{feat}</span>
                      </li>
                    ))}
                  </ul>

                  {/* Action */}
                  {plan.price === 0 ? (
                    /* ── Free plan: no subscribe button ── */
                    isCurrentPlan ? (
                      <div className="flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-muted-foreground/30 py-2.5 text-xs text-muted-foreground">
                        <BadgeCheck size={13} className="text-emerald-500" /> Paket Gratis Aktif
                      </div>
                    ) : hasActivePaidPlan ? (
                      <div className="flex items-start gap-2 rounded-xl bg-muted/50 px-3 py-2.5">
                        <ArrowUpCircle size={13} className="shrink-0 mt-0.5 text-muted-foreground" />
                        <p className="text-[11px] text-muted-foreground leading-snug">
                          Otomatis turun ke paket ini setelah langganan <strong>{subscription?.planName ?? "berbayar"}</strong> berakhir
                        </p>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-muted-foreground/30 py-2.5 text-xs text-muted-foreground">
                        <Zap size={13} /> Paket Dasar — Selalu Gratis
                      </div>
                    )
                  ) : isDifferentPaidBlocked ? (
                    /* ── Paid plan blocked (user on another paid plan) ── */
                    <div className="space-y-2">
                      <Button className="w-full gap-2 rounded-xl" variant="outline" disabled>
                        <Lock size={14} /> Paket Lain Aktif
                      </Button>
                      <p className="text-center text-[11px] text-muted-foreground">Tunggu paket <strong>{subscription.planName}</strong> habis</p>
                    </div>
                  ) : isCurrentPlan ? (
                    /* ── Current paid plan: renew / cancel ── */
                    <div className="space-y-2">
                      {subscription?.cancelAtPeriodEnd ? (
                        <>
                          <div className="flex items-center gap-1.5 text-[11px] text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg px-2.5 py-1.5">
                            <Clock size={11} /> Berakhir pada {subscription.currentPeriodEnd ? fmtDate(subscription.currentPeriodEnd) : "akhir periode"}
                          </div>
                          <Button className="w-full rounded-xl gap-2" variant="outline" onClick={() => resumeMutation.mutate()} disabled={resumeMutation.isPending}>
                            {resumeMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                            Lanjutkan Langganan
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button className={cn("w-full rounded-xl font-semibold gap-2", `bg-gradient-to-r ${style.gradient} text-white border-0 hover:opacity-90 shadow-sm`)}
                            disabled={subscribe.isPending}
                            onClick={() => { setBlockedPlan(null); subscribe.mutate(plan.id); }}>
                            {subscribe.isPending ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                            Perpanjang Paket
                          </Button>
                          <Button className="w-full rounded-xl gap-2 text-destructive hover:text-destructive" variant="ghost" size="sm"
                            onClick={() => cancelMutation.mutate()} disabled={cancelMutation.isPending}>
                            {cancelMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <XCircle size={12} />}
                            Batalkan Langganan
                          </Button>
                        </>
                      )}
                      {subscription?.currentPeriodEnd && (
                        <p className="text-center text-[11px] text-muted-foreground">
                          Aktif hingga <span className="font-semibold">{fmtDate(subscription.currentPeriodEnd)}</span>
                        </p>
                      )}
                    </div>
                  ) : (
                    /* ── Other paid plan: subscribe ── */
                    <Button className={cn("w-full rounded-xl font-semibold gap-2", `bg-gradient-to-r ${style.gradient} text-white border-0 hover:opacity-90 shadow-sm`)}
                      disabled={subscribe.isPending}
                      onClick={() => { setBlockedPlan(null); subscribe.mutate(plan.id); }}>
                      {subscribe.isPending ? <Loader2 size={14} className="animate-spin" /> : <TrendingUp size={14} />}
                      Langganan Sekarang
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Transaction History ──────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">Riwayat Transaksi</h2>
          <div className="flex gap-1 bg-muted rounded-lg p-1">
            <button onClick={() => setHistoryTab("wallet")}
              className={cn("px-3 py-1.5 rounded-md text-xs font-medium transition-all", historyTab === "wallet" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground")}>
              Wallet
            </button>
            <button onClick={() => setHistoryTab("plan")}
              className={cn("px-3 py-1.5 rounded-md text-xs font-medium transition-all", historyTab === "plan" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground")}>
              Paket
            </button>
          </div>
        </div>

        {/* Wallet History */}
        {historyTab === "wallet" && (
          <div className="rounded-2xl border border-border bg-card overflow-hidden">
            {walletLoading ? (
              <div className="p-4 space-y-3">{[0,1,2].map((i) => <Skeleton key={i} className="h-14" />)}</div>
            ) : !walletTxs?.length ? (
              <div className="py-12 flex flex-col items-center gap-2 text-muted-foreground">
                <Wallet size={32} className="opacity-20" />
                <p className="text-sm">Belum ada transaksi wallet</p>
              </div>
            ) : (
              <div className="divide-y divide-border/60">
                {walletTxs.map((tx: any, idx: number) => (
                  <div key={tx.id} className={cn("flex items-center gap-4 px-5 py-4 hover:bg-muted/30 transition-colors", idx === 0 && "rounded-t-2xl", idx === walletTxs.length - 1 && "rounded-b-2xl")}>
                    <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center text-white flex-shrink-0", tx.type === "topup" ? "bg-gradient-to-br from-emerald-400 to-emerald-600" : "bg-gradient-to-br from-blue-400 to-blue-600")}>
                      {tx.type === "topup" ? <ArrowUpCircle size={16} /> : <RefreshCcw size={16} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold">{tx.type === "topup" ? "Top-up Saldo" : tx.type === "auto_renew" ? "Auto-Renewal" : "Manual Renewal"}</p>
                      <p className="text-xs text-muted-foreground truncate">{tx.description ?? "—"} · {tx.createdAt ? format(new Date(tx.createdAt), "dd MMM yyyy, HH:mm") : "—"}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={cn("text-sm font-bold", tx.type === "topup" ? "text-emerald-600 dark:text-emerald-400" : "text-foreground")}>
                        {tx.type === "topup" ? "+" : "−"}{fmtRp(Number(tx.amount))}
                      </p>
                      <span className={cn("inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded-full", tx.status === "paid" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-muted text-muted-foreground")}>
                        {tx.status === "paid" ? "Berhasil" : tx.status === "pending" ? "Menunggu" : tx.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Plan History */}
        {historyTab === "plan" && (
          <div className="rounded-2xl border border-border bg-card overflow-hidden">
            {txLoading ? (
              <div className="p-4 space-y-3">{[0,1,2].map((i) => <Skeleton key={i} className="h-14" />)}</div>
            ) : !transactions?.length ? (
              <div className="py-12 flex flex-col items-center gap-2 text-muted-foreground">
                <Receipt size={32} className="opacity-20" />
                <p className="text-sm">Belum ada transaksi paket</p>
              </div>
            ) : (
              <div className="divide-y divide-border/60">
                {transactions.map((tx: any, idx: number) => (
                  <div key={tx.id} className={cn("flex items-center gap-4 px-5 py-4 hover:bg-muted/30 transition-colors", idx === 0 && "rounded-t-2xl", idx === transactions.length - 1 && "rounded-b-2xl")}>
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white flex-shrink-0 bg-gradient-to-br from-violet-400 to-violet-600">
                      <CreditCard size={16} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold capitalize">Paket {tx.plan?.split("|")[0] ?? tx.plan}</p>
                      <p className="text-xs text-muted-foreground">{tx.createdAt ? format(new Date(tx.createdAt), "dd MMM yyyy, HH:mm") : "—"}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold">
                        {tx.currency === "IDR" ? fmtRp(Number(tx.amount)) : `$${Number(tx.amount).toLocaleString("en-US")}`}
                      </p>
                      <span className={cn("inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded-full", tx.status === "paid" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-muted text-muted-foreground")}>
                        {tx.status === "paid" ? "Lunas" : tx.status === "pending" ? "Menunggu" : tx.status}
                      </span>
                    </div>
                    <button
                      onClick={() => setInvoiceTarget(tx)}
                      className="ml-1 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors flex-shrink-0"
                      title="Lihat Invoice"
                    >
                      <FileText size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Top-up Dialog ─────────────────────────────────────────────────── */}
      <Dialog open={topupOpen} onOpenChange={setTopupOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center">
                <Wallet size={16} className="text-white" />
              </div>
              Top-up Saldo Wallet
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground mb-2.5">Pilih nominal top-up</p>
              <div className="grid grid-cols-3 gap-2">
                {TOPUP_PRESETS.map((preset) => (
                  <button key={preset}
                    className={cn("rounded-xl border px-3 py-2.5 text-sm font-semibold transition-all", topupAmount === preset && !topupCustom ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400 shadow-sm" : "border-border hover:border-emerald-400/50 hover:bg-muted/40")}
                    onClick={() => { setTopupAmount(preset); setTopupCustom(""); }}>
                    {(preset / 1000).toLocaleString("id-ID")}rb
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground font-medium">Jumlah lain (Rp)</label>
              <input className="flex h-10 w-full rounded-xl border border-input bg-muted/30 px-3 py-2 text-sm mt-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" placeholder="Cth: 75000"
                value={topupCustom} onChange={(e) => { const v = e.target.value.replace(/\D/g, ""); setTopupCustom(v); if (v) setTopupAmount(0); }} />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Total top-up</span>
              <span className="font-extrabold text-xl text-emerald-600 dark:text-emerald-400">
                {fmtRp(topupCustom ? parseInt(topupCustom || "0", 10) : topupAmount)}
              </span>
            </div>
            <Button className="w-full gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-semibold hover:opacity-90"
              disabled={topupMutation.isPending || (topupCustom ? parseInt(topupCustom, 10) < 10000 : topupAmount < 10000)}
              onClick={handleTopup}>
              {topupMutation.isPending ? <Loader2 size={15} className="animate-spin" /> : <ArrowUpCircle size={15} />}
              Lanjut Bayar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Payment Dialog ─────────────────────────────────────────────────── */}
      <Dialog open={!!checkoutData} onOpenChange={(o) => { if (!o) { setCheckoutData(null); setPaymentStatus(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className={cn("w-8 h-8 rounded-xl flex items-center justify-center", checkoutData?.type === "topup" ? "bg-gradient-to-br from-emerald-400 to-emerald-600" : "bg-gradient-to-br from-blue-400 to-violet-600")}>
                {checkoutData?.type === "topup" ? <Wallet size={16} className="text-white" /> : <CreditCard size={16} className="text-white" />}
              </div>
              {paymentStatus === "paid" ? (checkoutData?.type === "topup" ? "Top-up Berhasil!" : "Pembayaran Berhasil!")
                : paymentStatus === "expired" ? "Pembayaran Kadaluarsa"
                : checkoutData?.type === "topup" ? "Selesaikan Top-up Saldo" : "Selesaikan Pembayaran"}
            </DialogTitle>
          </DialogHeader>

          {paymentStatus === "paid" && (
            <div className="flex flex-col items-center gap-4 py-4">
              <div className="w-20 h-20 rounded-full bg-emerald-100 dark:bg-emerald-900/20 flex items-center justify-center">
                <CheckCircle2 size={40} className="text-emerald-500" />
              </div>
              <div className="text-center">
                <p className="font-bold text-lg">{checkoutData?.type === "topup" ? "Saldo berhasil ditambahkan!" : "Paket berhasil diaktifkan!"}</p>
                <p className="text-sm text-muted-foreground mt-1">Terima kasih atas pembayaran Anda</p>
              </div>
              <Button className="w-full rounded-xl" onClick={() => { setCheckoutData(null); setPaymentStatus(null); }}>Tutup</Button>
            </div>
          )}

          {paymentStatus === "expired" && (
            <div className="flex flex-col items-center gap-4 py-4">
              <div className="w-20 h-20 rounded-full bg-destructive/10 flex items-center justify-center">
                <XCircle size={40} className="text-destructive" />
              </div>
              <div className="text-center">
                <p className="font-bold text-lg">Waktu pembayaran habis</p>
                <p className="text-sm text-muted-foreground mt-1">Silakan coba lagi untuk membuat invoice baru</p>
              </div>
              <Button className="w-full rounded-xl" variant="outline" onClick={() => { setCheckoutData(null); setPaymentStatus(null); }}>Tutup</Button>
            </div>
          )}

          {paymentStatus === "pending" && checkoutData && (
            <div className="space-y-4">
              <div className="rounded-2xl bg-muted/40 border border-border p-4 space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Gateway</span>
                  <Badge variant="secondary">{GATEWAY_NAMES[checkoutData.gateway ?? "none"]}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Total Pembayaran</span>
                  <span className="font-extrabold text-xl">{checkoutData.amountFormatted}</span>
                </div>
              </div>

              {checkoutData.expiredAt && (
                <div className="flex items-center gap-2 text-sm text-amber-600 bg-amber-50 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-800/40 rounded-xl px-3 py-2.5">
                  <Clock size={14} className="shrink-0" />
                  Berlaku hingga {format(new Date(checkoutData.expiredAt), "dd MMM yyyy, HH:mm")}
                </div>
              )}

              {checkoutData.qrUrl && (
                <div className="flex flex-col items-center gap-2">
                  <img src={checkoutData.qrUrl} alt="QR Code" className="w-48 h-48 rounded-2xl border shadow-sm" />
                  <p className="text-xs text-muted-foreground">Scan QR Code dengan aplikasi e-wallet Anda</p>
                </div>
              )}

              {checkoutData.paymentUrl && (
                <div className="space-y-2">
                  {isDemo ? (
                    <div className="rounded-xl bg-muted/50 border border-border p-3 text-sm">
                      <p className="font-semibold mb-1">Mode Demo</p>
                      <p className="text-muted-foreground text-xs">Gateway belum dikonfigurasi. Gunakan tombol "Simulasi Bayar" untuk menguji alur pembayaran.</p>
                    </div>
                  ) : (
                    <>
                      <Button className="w-full gap-2 rounded-xl" onClick={() => window.open(checkoutData.paymentUrl, "_blank")}>
                        <ExternalLink size={15} /> Buka Halaman Pembayaran
                      </Button>
                      <button onClick={copyUrl} className="w-full flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors py-1">
                        {copied ? <CheckCheck size={13} className="text-emerald-500" /> : <Copy size={13} />}
                        {copied ? "URL disalin!" : "Salin URL pembayaran"}
                      </button>
                    </>
                  )}
                </div>
              )}

              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <RefreshCw size={12} className="animate-spin" />
                Mengecek status pembayaran otomatis...
              </div>

              {isDemo && (
                <Button variant="outline" className="w-full gap-2 rounded-xl" disabled={simulatePay.isPending} onClick={() => simulatePay.mutate(checkoutData.orderId!)}>
                  {simulatePay.isPending ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} className="text-emerald-500" />}
                  Simulasi Bayar (Demo)
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
      {/* ── Invoice Dialog ─────────────────────────────────────────────────── */}
      <Dialog open={!!invoiceTarget} onOpenChange={(o) => !o && setInvoiceTarget(null)}>
        <DialogContent className="max-w-lg print:shadow-none">
          <DialogHeader className="print:hidden">
            <DialogTitle className="flex items-center gap-2">
              <FileText size={16} /> Invoice Pembayaran
            </DialogTitle>
          </DialogHeader>

          {invoiceTarget && (
            <div id="invoice-content" className="space-y-4">
              {/* Invoice Header */}
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-xl font-bold text-primary">WAGateway</p>
                  <p className="text-xs text-muted-foreground">WhatsApp Gateway SaaS</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-base">INVOICE</p>
                  <p className="text-xs text-muted-foreground font-mono">
                    INV-{String(invoiceTarget.id).padStart(6, "0")}
                  </p>
                </div>
              </div>

              <Separator />

              {/* Bill To + Date */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase text-muted-foreground mb-1">Tagihan Kepada</p>
                  <p className="text-sm font-semibold">{user?.name ?? "—"}</p>
                  <p className="text-xs text-muted-foreground">{user?.email ?? "—"}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-semibold uppercase text-muted-foreground mb-1">Tanggal</p>
                  <p className="text-sm font-semibold">
                    {invoiceTarget.createdAt ? format(new Date(invoiceTarget.createdAt), "dd MMMM yyyy", { locale: localeId }) : "—"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {invoiceTarget.createdAt ? format(new Date(invoiceTarget.createdAt), "HH:mm") : ""}
                  </p>
                </div>
              </div>

              {/* Items Table */}
              <div className="rounded-xl border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50">
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Deskripsi</th>
                      <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground">Jumlah</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-t border-border/60">
                      <td className="px-4 py-3">
                        <p className="font-medium capitalize">Paket {invoiceTarget.plan?.split("|")[0] ?? invoiceTarget.plan}</p>
                        <p className="text-xs text-muted-foreground">{invoiceTarget.description ?? "Langganan Paket WhatsApp Gateway"}</p>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold">
                        {invoiceTarget.currency === "IDR"
                          ? fmtRp(Number(invoiceTarget.amount))
                          : `$${Number(invoiceTarget.amount).toLocaleString("en-US")}`}
                      </td>
                    </tr>
                  </tbody>
                  <tfoot>
                    <tr className="bg-muted/30 border-t border-border">
                      <td className="px-4 py-2.5 text-sm font-bold">Total</td>
                      <td className="px-4 py-2.5 text-right font-bold text-base">
                        {invoiceTarget.currency === "IDR"
                          ? fmtRp(Number(invoiceTarget.amount))
                          : `$${Number(invoiceTarget.amount).toLocaleString("en-US")}`}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Status + Note */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Status:</span>
                  <span className={cn(
                    "inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-full",
                    invoiceTarget.status === "paid"
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                      : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                  )}>
                    {invoiceTarget.status === "paid" ? "✓ Lunas" : "⏳ Menunggu Pembayaran"}
                  </span>
                </div>
                <p className="text-[10px] text-muted-foreground">{invoiceTarget.currency}</p>
              </div>

              <p className="text-[10px] text-muted-foreground text-center border-t border-border pt-3">
                Invoice ini diterbitkan otomatis oleh sistem. Simpan sebagai bukti pembayaran Anda.
              </p>

              {/* Actions */}
              <div className="flex gap-2 print:hidden">
                <Button variant="outline" className="flex-1 gap-2"
                  onClick={() => window.print()}>
                  <Printer size={14} /> Cetak Invoice
                </Button>
                <Button variant="outline" className="flex-1 gap-2"
                  onClick={() => {
                    const el = document.getElementById("invoice-content");
                    if (!el) return;
                    const w = window.open("", "_blank");
                    if (!w) return;
                    w.document.write(`<html><head><title>Invoice INV-${String(invoiceTarget.id).padStart(6, "0")}</title><style>body{font-family:sans-serif;padding:32px;max-width:640px;margin:auto}table{width:100%;border-collapse:collapse}th,td{padding:10px 16px;text-align:left}th{background:#f4f4f5;font-size:11px;text-transform:uppercase;letter-spacing:.05em}td:last-child,th:last-child{text-align:right}hr{border:none;border-top:1px solid #e4e4e7;margin:16px 0}</style></head><body>${el.innerHTML}</body></html>`);
                    w.document.close();
                    w.print();
                  }}>
                  <FileText size={14} /> Buka & Cetak
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

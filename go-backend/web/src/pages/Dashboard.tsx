import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  Smartphone,
  Megaphone,
  Star,
  MessageSquare,
  Plus,
  Trash2,
  WifiOff,
  X,
  RefreshCw,
  Pencil,
  Eye,
  EyeOff,
  Copy,
  AlertTriangle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { apiGet, apiPost, apiPut, apiDelete } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import OnboardingWizard, { isOnboardingDone } from "@/components/OnboardingWizard";
import GraceBanner from "@/components/GraceBanner";

const NAVY = "#243370";

interface Device {
  id: number;
  name: string;
  phone: string;
  status: "connected" | "connecting" | "disconnected";
  webhookUrl: string;
  webhookSecret: string;
  autoOnline: boolean;
  readReceipts: boolean;
  rejectCall: boolean;
  typingIndicator: boolean;
  sentCount: number;
}

interface Plan {
  slug: string;
  name: string;
  maxDevices: number;
}

interface BillingSubscription {
  endDate: string;
  // Fitur 7: penanda trial otomatis 7 hari.
  isTrial?: boolean;
  // BONUS: status langganan terpusat (active | grace | expired) dari endpoint.
  subState?: string;
  Plan?: { name: string; price: number };
}

// Info kuota pesan bulanan (Fitur 3) dari GET /api/quota.
interface QuotaInfo {
  planName: string;
  quota: number;
  usedThisMonth: number;
  remaining: number;
  limit: number;
  isUnlimited: boolean;
  percentUsed: number;
  warning: boolean;
  isTrial: boolean;
  quotaExceeded: boolean;
  // Status langganan terpusat (Fitur 5): active | grace | expired.
  subState?: string;
  graceDaysLeft?: number;
  graceUsedToday?: number;
  graceDailyLimit?: number;
}

type ToggleField = "readReceipts" | "rejectCall" | "autoOnline" | "typingIndicator";

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-hidden
      />
      <div className="relative bg-card text-card-foreground rounded-xl border border-border shadow-lg w-full max-w-md max-h-[90vh] overflow-y-auto p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold">{title}</h3>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={onClose}
            aria-label="Tutup"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Toggle({
  checked,
  onToggle,
  disabled,
  label,
  title,
}: {
  checked: boolean;
  onToggle: (v: boolean) => void;
  disabled?: boolean;
  label: string;
  title?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={title}
      disabled={disabled}
      onClick={() => onToggle(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
        checked
          ? "bg-primary border-primary"
          : "bg-gray-300 border-gray-300 dark:bg-muted dark:border-muted"
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-4" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "connected")
    return (
      <Badge className="bg-primary text-primary-foreground hover:bg-primary whitespace-nowrap">
        Terhubung
      </Badge>
    );
  if (status === "connecting")
    return (
      <Badge className="bg-amber-500/15 text-amber-700 hover:bg-amber-500/15 border border-amber-500/30 whitespace-nowrap">
        Menghubungkan
      </Badge>
    );
  return <Badge variant="secondary" className="whitespace-nowrap">Terputus</Badge>;
}

function StatCard({
  label,
  icon: Icon,
  tile,
  loading,
  children,
  className,
}: {
  label: string;
  icon: typeof Smartphone;
  tile: string;
  loading: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("min-w-0", className)}>
      <CardContent className="p-5">
        <div className="flex items-center gap-4">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0"
            style={{ backgroundColor: tile }}
          >
            <Icon className="w-7 h-7 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              {label}
            </p>
            {loading ? (
              <div className="mt-1 space-y-1.5">
                <div className="h-8 w-20 rounded bg-muted animate-pulse" />
                <div className="h-3 w-24 rounded bg-muted animate-pulse" />
              </div>
            ) : (
              children
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [subscription, setSubscription] = useState<BillingSubscription | null>(null);
  const [quota, setQuota] = useState<QuotaInfo | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [deviceLimit, setDeviceLimit] = useState<number | null>(null);
  const [bulkStats, setBulkStats] = useState({ jobs: 0, wait: 0, sent: 0, failed: 0 });
  const [messagesTotal, setMessagesTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);

  const [toggling, setToggling] = useState<Record<string, boolean>>({});
  const [busyId, setBusyId] = useState<number | null>(null);

  const [qrDevice, setQrDevice] = useState<Device | null>(null);
  const [qrCode, setQrCode] = useState("");
  const [qrLoading, setQrLoading] = useState(false);
  const [qrError, setQrError] = useState<string | null>(null);

  const [deleting, setDeleting] = useState<Device | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);

  const [showAdd, setShowAdd] = useState(false);
  const [addName, setAddName] = useState("");
  const [addWebhook, setAddWebhook] = useState("");
  const [savingAdd, setSavingAdd] = useState(false);

  const [editing, setEditing] = useState<Device | null>(null);
  const [editName, setEditName] = useState("");
  const [editWebhook, setEditWebhook] = useState("");
  const [editSecret, setEditSecret] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [regenBusy, setRegenBusy] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);

  // Tab dialog hubungkan: "qr" (scan) atau "pair" (kode pairing 8 digit)
  const [connectTab, setConnectTab] = useState<"qr" | "pair">("qr");
  const [pairPhone, setPairPhone] = useState("");
  const [pairCode, setPairCode] = useState("");
  const [pairLoading, setPairLoading] = useState(false);
  const [pairError, setPairError] = useState<string | null>(null);

  const loadDevices = () => {
    return apiGet<{ devices: Device[] }>("/devices")
      .then((res) => setDevices(res.devices || []))
      .catch(() => setDevices([]));
  };

  const load = () => {
    setLoading(true);
    setError(null);
    Promise.all([
      loadDevices(),
      apiGet<{ plans: Plan[] }>("/public/plans")
        .then((res) => res.plans || [])
        .catch(() => [] as Plan[]),
      apiGet<{ jobs: number; wait: number; sent: number; failed: number }>("/messages/bulk-stats")
        .then((res) => {
          setBulkStats({
            jobs: res.jobs || 0,
            wait: res.wait || 0,
            sent: res.sent || 0,
            failed: res.failed || 0,
          });
        })
        .catch(() => {}),
      apiGet<{ total: number }>("/messages")
        .then((res) => (typeof res.total === "number" ? res.total : null))
        .catch(() => null),
      apiGet<{ subscription: BillingSubscription | null }>("/billing/subscription")
        .then((res) => res.subscription)
        .catch(() => null),
      apiGet<QuotaInfo>("/quota")
        .then((res) => setQuota(res))
        .catch(() => setQuota(null)),
    ])
      .then(([, plans, , msgTotal, sub]) => {
        const planKey = (user?.plan || "").toLowerCase();
        const match = plans.find(
          (p) =>
            p.slug.toLowerCase() === planKey || p.name.toLowerCase() === planKey
        );
        setDeviceLimit(match ? match.maxDevices : null);
        setMessagesTotal(msgTotal);
        setSubscription(sub);
      })
      .catch((e) => setError(e.message || "Gagal memuat data"))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  useEffect(() => {
    if (loading || isOnboardingDone()) return;
    if (devices.length === 0) setShowOnboarding(true);
  }, [loading, devices]);

  // Polling status saat dialog QR terbuka
  useEffect(() => {
    if (!qrDevice) return;
    const startedAt = Date.now();
    const iv = setInterval(async () => {
      if (Date.now() - startedAt > 60000) {
        clearInterval(iv);
        toast.error("Waktu tunggu habis, silakan coba hubungkan lagi");
        setQrDevice(null);
        return;
      }
      try {
        const s = await apiGet<{ status: string }>(
          `/devices/${qrDevice.id}/status`
        );
        if (s.status === "connected") {
          clearInterval(iv);
          toast.success("Perangkat terhubung");
          setQrDevice(null);
          loadDevices();
        } else {
          const q = await apiGet<{ qr: string }>(
            `/devices/${qrDevice.id}/qr`
          ).catch(() => null);
          if (q && q.qr) setQrCode((prev) => (q.qr !== prev ? q.qr : prev));
        }
      } catch {
        /* abaikan, coba lagi di tick berikutnya */
      }
    }, 3000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qrDevice]);

  const handleToggle = async (d: Device, field: ToggleField, value: boolean) => {
    const key = `${d.id}:${field}`;
    if (toggling[key]) return;
    const prev = devices;
    setDevices(devices.map((x) => (x.id === d.id ? { ...x, [field]: value } : x)));
    setToggling((t) => ({ ...t, [key]: true }));
    try {
      await apiPut(`/devices/${d.id}`, { [field]: value });
    } catch {
      setDevices(prev);
      toast.error("Gagal memperbarui pengaturan");
    } finally {
      setToggling((t) => {
        const n = { ...t };
        delete n[key];
        return n;
      });
    }
  };

  const handleConnect = async (d: Device) => {
    setQrDevice(d);
    setQrCode("");
    setQrError(null);
    setQrLoading(true);
    setConnectTab("qr");
    setPairPhone(d.phone || "");
    setPairCode("");
    setPairError(null);
    try {
      await apiPost(`/devices/${d.id}/connect`);
      await new Promise((r) => setTimeout(r, 1500));
      const q = await apiGet<{ qr: string }>(`/devices/${d.id}/qr`).catch(
        () => null
      );
      if (q && q.qr) setQrCode(q.qr);
    } catch (e) {
      setQrError(e instanceof Error ? e.message : "Gagal memulai koneksi");
    } finally {
      setQrLoading(false);
    }
  };

  const requestPairCode = async () => {
    if (!qrDevice || !pairPhone.trim() || pairLoading) return;
    setPairLoading(true);
    setPairError(null);
    setPairCode("");
    try {
      const res = await apiPost<{ code: string; expiresIn: number }>(
        `/devices/${qrDevice.id}/pair-code`,
        { phone: pairPhone.trim() }
      );
      setPairCode(res.code || "");
      if (!res.code) setPairError("Kode tidak diterima dari server");
    } catch (e) {
      setPairError(e instanceof Error ? e.message : "Gagal meminta kode pairing");
    } finally {
      setPairLoading(false);
    }
  };

  const openEdit = (d: Device) => {
    setEditing(d);
    setEditName(d.name || "");
    setEditWebhook(d.webhookUrl || "");
    setEditSecret(d.webhookSecret || "");
    setShowSecret(false);
  };

  const handleCopySecret = async () => {
    if (!editSecret) {
      toast.error("Belum ada secret");
      return;
    }
    try {
      await navigator.clipboard.writeText(editSecret);
      toast.success("Webhook secret disalin");
    } catch {
      toast.error("Gagal menyalin");
    }
  };

  const handleRegenerateSecret = async () => {
    if (!editing || regenBusy) return;
    if (
      !window.confirm(
        "Buat ulang webhook secret? Secret lama langsung tidak berlaku dan penerima webhook harus memakai secret baru."
      )
    )
      return;
    setRegenBusy(true);
    try {
      const res = await apiPost<{ webhookSecret?: string }>(
        `/devices/${editing.id}/webhook-secret/regenerate`,
        {}
      );
      const s = res.webhookSecret || "";
      setEditSecret(s);
      setShowSecret(true);
      setEditing({ ...editing, webhookSecret: s });
      toast.success("Webhook secret diperbarui");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal membuat secret baru");
    } finally {
      setRegenBusy(false);
    }
  };

  const handleEditSave = async () => {
    if (!editing || savingEdit) return;
    const name = editName.trim();
    if (!name) {
      toast.error("Nama perangkat wajib diisi");
      return;
    }
    setSavingEdit(true);
    try {
      await apiPut(`/devices/${editing.id}`, {
        name,
        webhookUrl: editWebhook.trim(),
      });
      toast.success("Perangkat diperbarui");
      setEditing(null);
      loadDevices();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal memperbarui perangkat");
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDisconnect = async (d: Device) => {
    setBusyId(d.id);
    try {
      await apiPost(`/devices/${d.id}/disconnect`);
      toast.success("Perangkat diputuskan");
      loadDevices();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal memutuskan perangkat");
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setDeletingBusy(true);
    try {
      await apiDelete(`/devices/${deleting.id}`);
      toast.success("Perangkat dihapus");
      setDeleting(null);
      loadDevices();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal menghapus perangkat");
    } finally {
      setDeletingBusy(false);
    }
  };

  const handleAdd = async () => {
    const name = addName.trim();
    if (!name) {
      toast.error("Nama perangkat wajib diisi");
      return;
    }
    setSavingAdd(true);
    try {
      const created = await apiPost<{ device?: Device; id?: number }>(
        "/devices",
        { name, webhookUrl: addWebhook.trim() }
      );
      const res = await apiGet<{ devices: Device[] }>("/devices");
      const list = res.devices || [];
      setDevices(list);
      toast.success("Perangkat ditambahkan");
      setShowAdd(false);
      setAddName("");
      setAddWebhook("");
      const id = created.device?.id ?? created.id;
      const dev = id
        ? list.find((d) => d.id === id)
        : list.filter((d) => d.name === name).pop();
      if (dev) handleConnect(dev);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal menambah perangkat");
    } finally {
      setSavingAdd(false);
    }
  };

  const planName = user?.plan
    ? user.plan.charAt(0).toUpperCase() + user.plan.slice(1)
    : "-";
  const subPlanName = subscription?.Plan?.name || planName;
  const canRenew = !!subscription?.Plan && subscription.Plan.price > 0;
  // Fitur 7: user dalam masa trial otomatis 7 hari.
  const isTrialSub = !!subscription?.isTrial;
  // BONUS: status grace/expired di kartu (selaras dengan banner GraceBanner).
  const subState = subscription?.subState || "active";
  const isGraceSub = subState === "grace";
  const isExpiredSub = subState === "expired";
  const subEndLabel = subscription
    ? `Berakhir ${new Date(subscription.endDate).toLocaleDateString("id-ID", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })}`
    : "Tidak ada langganan aktif";

  return (
    <div className="space-y-6">
      {/* Banner grace period / expired langganan (Fitur 5) */}
      {!loading && <GraceBanner />}
      {/* Banner peringatan kuota pesan (Fitur 3): >=80% atau habis */}
      {!loading && quota?.quotaExceeded && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-destructive">
                Kuota pesan paket {quota.planName} habis ({quota.usedThisMonth.toLocaleString("id-ID")}/{quota.limit.toLocaleString("id-ID")})
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Pengiriman pesan baru akan ditolak. Perpanjang atau upgrade paket untuk menambah kuota.
              </p>
              <Button
                size="sm"
                variant="tint"
                onClick={() => navigate("/billing?perpanjang=1")}
              >
                Perpanjang / Upgrade
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
      {!loading && quota && !quota.quotaExceeded && quota.warning && (
        <Card className="border-amber-500/50 bg-amber-500/5">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-amber-700 dark:text-amber-500">
                Kuota pesan hampir habis ({quota.percentUsed}% terpakai)
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {quota.usedThisMonth.toLocaleString("id-ID")} dari {quota.limit.toLocaleString("id-ID")} pesan bulan ini. Pertimbangkan upgrade paket.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empat kartu statistik */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label="Total Devices" icon={Smartphone} tile={NAVY} loading={loading}>
          <p className="text-3xl font-bold text-foreground tracking-tight">
            {devices.length}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Limit: {deviceLimit !== null ? deviceLimit : "-"}
          </p>
        </StatCard>

        <StatCard label="Blast / Bulk" icon={Megaphone} tile="#1e2a5c" loading={loading}>
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            <span className="inline-flex items-center rounded-full bg-amber-500/15 text-amber-700 text-[11px] font-semibold px-2 py-0.5">
              {bulkStats.wait} Wait
            </span>
            <span
              className="inline-flex items-center rounded-full text-[11px] font-semibold px-2 py-0.5"
              style={{ backgroundColor: `${NAVY}1a`, color: NAVY }}
            >
              {bulkStats.sent} Sent
            </span>
            <span className="inline-flex items-center rounded-full bg-red-500/15 text-red-700 text-[11px] font-semibold px-2 py-0.5">
              {bulkStats.failed} Fail
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1.5">
            {bulkStats.jobs} Campaigns
          </p>
        </StatCard>

        {/* Kartu Subscription lebih lebar dari 3 kartu lain di HP (kotak merah user) */}
        <StatCard label="Subscription" icon={Star} tile="#2e4186" loading={loading} className="-mx-2 md:mx-0">
          <p className="text-3xl font-bold text-foreground tracking-tight">
            {subPlanName}
            {/* Fitur 7: label Trial */}
            {isTrialSub && (
              <span className="ml-2 align-middle inline-flex items-center rounded-full bg-[#243370]/10 text-[#243370] dark:text-blue-400 text-[11px] font-semibold px-2 py-0.5">
                Trial
              </span>
            )}
            {/* BONUS: badge status grace/expired di kartu, selaras banner */}
            {isGraceSub && (
              <span className="ml-2 align-middle inline-flex items-center rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-500 text-[11px] font-semibold px-2 py-0.5">
                Masa Tenggang
              </span>
            )}
            {isExpiredSub && (
              <span className="ml-2 align-middle inline-flex items-center rounded-full bg-red-500/15 text-red-600 dark:text-red-400 text-[11px] font-semibold px-2 py-0.5">
                Berakhir
              </span>
            )}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {subEndLabel}
            {quota?.isUnlimited && (
              <>
                {" "}· <span className="font-semibold text-foreground">Unlimited</span>
              </>
            )}
          </p>
          {/* Kuota pesan bulanan (Fitur 3) — teks pendek selebar kartu lain */}
          {quota && !quota.isUnlimited && (
            <p
              className={cn(
                "text-[11px] text-muted-foreground mt-1",
                quota.warning && "text-amber-600 font-semibold"
              )}
            >
              {quota.usedThisMonth.toLocaleString("id-ID")}/
              {quota.limit.toLocaleString("id-ID")} pesan ({quota.percentUsed}%)
            </p>
          )}
          {/* Fitur 7: ajakan upgrade untuk user trial; perpanjang untuk berbayar;
              BONUS: tombol Pilih Paket bila belum ada langganan aktif */}
          {isTrialSub ? (
            <Button
              size="sm"
              variant="tint"
              onClick={() => navigate("/billing")}
            >
              Upgrade sekarang
            </Button>
          ) : !subscription ? (
            <Button
              size="sm"
              variant="tint"
              onClick={() => navigate("/billing")}
            >
              Pilih Paket
            </Button>
          ) : (
            canRenew && (
              <Button
                size="sm"
                variant="tint"
                onClick={() => navigate("/billing?perpanjang=1")}
              >
                Perpanjang
              </Button>
            )
          )}
        </StatCard>

        <StatCard label="Messages Sent" icon={MessageSquare} tile="#1a2a5e" loading={loading}>
          <p className="text-3xl font-bold text-foreground tracking-tight">
            {messagesTotal !== null ? messagesTotal.toLocaleString("id-ID") : "-"}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">From histories</p>
        </StatCard>
      </div>

      {/* Error */}
      {error && !loading && (
        <Card className="border-destructive/50">
          <CardContent className="p-5 flex items-center justify-between">
            <p className="text-sm text-destructive">{error}</p>
            <Button variant="outline" size="sm" onClick={load} className="gap-1.5">
              <RefreshCw className="w-3.5 h-3.5" /> Coba lagi
            </Button>
          </CardContent>
        </Card>
      )}

      {/* WhatsApp Accounts */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold">
              WhatsApp Accounts
            </CardTitle>
            <Button size="sm" className="gap-1.5 shrink-0" onClick={() => setShowAdd(true)}>
              <Plus className="w-4 h-4" /> Add Device
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-10 rounded bg-muted animate-pulse" />
              ))}
            </div>
          ) : devices.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-sm text-muted-foreground">
                Belum ada perangkat terhubung.
              </p>
              <Button
                size="sm"
                className="mt-3 gap-1.5"
                onClick={() => setShowAdd(true)}
              >
                <Plus className="w-4 h-4" /> Tambah Perangkat
              </Button>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[920px]">
                  <thead>
                    <tr className="border-b border-border text-left">
                      <th className="py-2 pr-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        Number
                      </th>
                      <th className="py-2 pr-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        Webhook URL
                      </th>
                      <th className="py-2 pr-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        Read
                      </th>
                      <th className="py-2 pr-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        Reject Call
                      </th>
                      <th className="py-2 pr-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        Online
                      </th>
                      <th className="py-2 pr-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        Typing
                      </th>
                      <th className="py-2 pr-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        Sent
                      </th>
                      <th className="py-2 pr-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        Status
                      </th>
                      <th className="py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground text-right">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {devices.map((d) => (
                      <tr
                        key={d.id}
                        className="border-b border-border last:border-0"
                      >
                        <td className="py-3 pr-4 font-mono text-[13px] text-foreground whitespace-nowrap">
                          {d.phone || "-"}
                        </td>
                        <td className="py-3 pr-4">
                          {d.webhookUrl ? (
                            <button
                              type="button"
                              onClick={() => openEdit(d)}
                              title={d.webhookUrl}
                              className="inline-flex max-w-[140px] items-center rounded-full bg-muted px-2.5 py-1 text-[11px] font-mono text-muted-foreground cursor-pointer hover:bg-muted/80"
                            >
                              <span className="truncate">
                                {d.webhookUrl.replace(/^https?:\/\//, "https://").slice(0, 18)}...
                              </span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => openEdit(d)}
                              className="inline-flex items-center rounded-full bg-muted px-2.5 py-1 text-[11px] text-muted-foreground cursor-pointer hover:bg-muted/80"
                            >
                              <span className="truncate">https://...</span>
                            </button>
                          )}
                        </td>
                        <td className="py-3 pr-4">
                          <Toggle
                            checked={!!d.readReceipts}
                            label={`Read receipts ${d.name}`}
                            title="Centang biru otomatis terkirim saat pesan dibaca"
                            disabled={!!toggling[`${d.id}:readReceipts`]}
                            onToggle={(v) => handleToggle(d, "readReceipts", v)}
                          />
                        </td>
                        <td className="py-3 pr-4">
                          <Toggle
                            checked={!!d.rejectCall}
                            label={`Reject call ${d.name}`}
                            title="Tolak panggilan WhatsApp masuk secara otomatis"
                            disabled={!!toggling[`${d.id}:rejectCall`]}
                            onToggle={(v) => handleToggle(d, "rejectCall", v)}
                          />
                        </td>
                        <td className="py-3 pr-4">
                          <Toggle
                            checked={!!d.autoOnline}
                            label={`Auto online ${d.name}`}
                            title="Tampilkan status online"
                            disabled={!!toggling[`${d.id}:autoOnline`]}
                            onToggle={(v) => handleToggle(d, "autoOnline", v)}
                          />
                        </td>
                        <td className="py-3 pr-4">
                          <Toggle
                            checked={!!d.typingIndicator}
                            label={`Typing indicator ${d.name}`}
                            title="Tampilkan 'mengetik...' sebelum pesan terkirim"
                            disabled={!!toggling[`${d.id}:typingIndicator`]}
                            onToggle={(v) => handleToggle(d, "typingIndicator", v)}
                          />
                        </td>
                        <td className="py-3 pr-4 text-foreground font-medium">
                          {(d.sentCount ?? 0).toLocaleString("id-ID")}
                        </td>
                        <td className="py-3 pr-4">
                          <StatusBadge status={d.status} />
                        </td>
                        <td className="py-3 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1">
                            {d.status === "connected" ? (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                disabled={busyId === d.id}
                                onClick={() => handleDisconnect(d)}
                                aria-label="Putuskan"
                                title="Putuskan"
                              >
                                <WifiOff className="w-4 h-4" />
                              </Button>
                            ) : (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => handleConnect(d)}
                                aria-label="Hubungkan"
                                title="Hubungkan"
                              >
                                <Smartphone className="w-4 h-4" />
                              </Button>
                            )}
                            <span className="mx-0.5 h-5 w-px bg-border" aria-hidden="true" />
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => openEdit(d)}
                              aria-label="Ubah"
                              title="Ubah"
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={() => setDeleting(d)}
                              aria-label="Hapus"
                              title="Hapus"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Onboarding wizard — hanya untuk user tanpa perangkat */}
      {showOnboarding && (
        <OnboardingWizard
          onDone={() => {
            setShowOnboarding(false);
            load();
          }}
        />
      )}

      {/* Dialog tambah perangkat */}
      {showAdd && (
        <Modal title="Tambah Perangkat" onClose={() => setShowAdd(false)}>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-medium text-foreground">
                Nama perangkat
              </label>
              <Input
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                placeholder="cth: CS Bot"
                maxLength={60}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAdd();
                }}
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-foreground">
                Webhook URL <span className="text-muted-foreground">(opsional)</span>
              </label>
              <Input
                value={addWebhook}
                onChange={(e) => setAddWebhook(e.target.value)}
                placeholder="cth: https://contoh.com/webhook"
                maxLength={500}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAdd();
                }}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAdd(false)}
                disabled={savingAdd}
              >
                Batal
              </Button>
              <Button size="sm" onClick={handleAdd} disabled={savingAdd}>
                {savingAdd ? "Menyimpan..." : "Simpan & Hubungkan"}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Dialog ubah perangkat */}
      {editing && (
        <Modal title="Ubah Perangkat" onClose={() => setEditing(null)}>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-medium text-foreground">
                Nama perangkat
              </label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="cth: CS Bot"
                maxLength={60}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleEditSave();
                }}
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-foreground">
                Webhook URL
              </label>
              <Input
                value={editWebhook}
                onChange={(e) => setEditWebhook(e.target.value)}
                placeholder="cth: https://contoh.com/webhook"
                maxLength={500}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleEditSave();
                }}
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-foreground">
                Webhook Secret{" "}
                <span className="text-muted-foreground">(HMAC-SHA256)</span>
              </label>
              <div className="flex gap-2">
                <Input
                  type={showSecret ? "text" : "password"}
                  value={editSecret}
                  readOnly
                  placeholder="Otomatis dibuat"
                  className="font-mono text-xs"
                />
                <Button
                  variant="outline"
                  size="icon"
                  className="shrink-0"
                  onClick={() => setShowSecret(!showSecret)}
                  aria-label={showSecret ? "Sembunyikan secret" : "Tampilkan secret"}
                  title={showSecret ? "Sembunyikan" : "Tampilkan"}
                >
                  {showSecret ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="shrink-0"
                  onClick={handleCopySecret}
                  aria-label="Salin secret"
                  title="Salin"
                >
                  <Copy className="w-4 h-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="shrink-0"
                  onClick={handleRegenerateSecret}
                  disabled={regenBusy}
                  aria-label="Buat ulang secret"
                  title="Buat ulang"
                >
                  <RefreshCw
                    className={cn("w-4 h-4", regenBusy && "animate-spin")}
                  />
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Setiap webhook dikirim dengan header{" "}
                <span className="font-mono">X-Wagataway-Signature</span>{" "}
                (HMAC-SHA256 dari body memakai secret ini) agar penerima bisa
                memverifikasi keasliannya.
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditing(null)}
                disabled={savingEdit}
              >
                Batal
              </Button>
              <Button size="sm" onClick={handleEditSave} disabled={savingEdit}>
                {savingEdit ? "Menyimpan..." : "Simpan"}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Dialog hubungkan: Scan QR / Kode Pairing */}
      {qrDevice && (
        <Modal title={`Hubungkan ${qrDevice.name}`} onClose={() => setQrDevice(null)}>
          <div className="flex gap-2 mb-4">
            <Button
              size="sm"
              variant={connectTab === "qr" ? "default" : "outline"}
              className="flex-1"
              onClick={() => setConnectTab("qr")}
            >
              Scan QR
            </Button>
            <Button
              size="sm"
              variant={connectTab === "pair" ? "default" : "outline"}
              className="flex-1"
              onClick={() => setConnectTab("pair")}
            >
              Kode Pairing
            </Button>
          </div>

          {connectTab === "qr" ? (
            <div className="flex flex-col items-center space-y-3">
              {qrLoading && (
                <p className="text-sm text-muted-foreground">Menyiapkan kode QR...</p>
              )}
              {!qrLoading && qrError && (
                <>
                  <p className="text-sm text-destructive text-center">{qrError}</p>
                  <Button size="sm" variant="outline" onClick={() => handleConnect(qrDevice)}>
                    Coba lagi
                  </Button>
                </>
              )}
              {!qrLoading && !qrError && qrCode && (
                <>
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=8&data=${encodeURIComponent(
                      qrCode
                    )}`}
                    alt="Kode QR WhatsApp"
                    className="w-60 h-60 rounded-lg border border-border"
                  />
                  <p className="text-xs text-muted-foreground text-center">
                    Pindai dengan WhatsApp di HP kamu.
                    <br />
                    Kode diperbarui otomatis, menunggu hingga 60 detik.
                  </p>
                </>
              )}
              {!qrLoading && !qrError && !qrCode && (
                <p className="text-sm text-muted-foreground">
                  Menunggu kode QR dari WhatsApp...
                </p>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center space-y-3">
              {!pairCode ? (
                <>
                  <div className="w-full space-y-2">
                    <label className="text-xs font-medium text-foreground">
                      Nomor WhatsApp HP kamu
                    </label>
                    <Input
                      value={pairPhone}
                      onChange={(e) => setPairPhone(e.target.value)}
                      placeholder="cth: 62812xxxxxxx"
                      inputMode="tel"
                      maxLength={20}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") requestPairCode();
                      }}
                    />
                  </div>
                  {pairError && (
                    <p className="text-sm text-destructive text-center">{pairError}</p>
                  )}
                  <Button
                    size="sm"
                    className="w-full"
                    onClick={requestPairCode}
                    disabled={pairLoading || !pairPhone.trim()}
                  >
                    {pairLoading ? "Meminta kode..." : "Minta Kode Pairing"}
                  </Button>
                </>
              ) : (
                <>
                  <p className="font-mono text-4xl font-bold tracking-[0.3em] text-foreground">
                    {pairCode}
                  </p>
                  <p className="text-xs text-muted-foreground text-center">
                    Buka WhatsApp di HP → Perangkat Tertaut → Tautkan Perangkat
                    → “Tautkan dengan nomor telepon”, lalu masukkan kode di atas.
                    <br />
                    Kode berlaku 120 detik.
                  </p>
                  {pairError && (
                    <p className="text-sm text-destructive text-center">{pairError}</p>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={requestPairCode}
                    disabled={pairLoading}
                  >
                    {pairLoading ? "Meminta kode..." : "Minta Kode Baru"}
                  </Button>
                </>
              )}
            </div>
          )}
        </Modal>
      )}

      {/* Dialog konfirmasi hapus */}
      {deleting && (
        <Modal title="Hapus Perangkat" onClose={() => setDeleting(null)}>
          <p className="text-sm text-muted-foreground">
            Hapus perangkat{" "}
            <span className="font-semibold text-foreground">{deleting.name}</span>
            {deleting.phone ? (
              <span className="font-mono"> ({deleting.phone})</span>
            ) : null}
            ? Tindakan ini tidak dapat dibatalkan.
          </p>
          <div className="flex justify-end gap-2 mt-5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDeleting(null)}
              disabled={deletingBusy}
            >
              Batal
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDelete}
              disabled={deletingBusy}
            >
              {deletingBusy ? "Menghapus..." : "Hapus"}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

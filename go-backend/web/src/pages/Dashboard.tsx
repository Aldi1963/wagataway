import { useEffect, useState, type ReactNode } from "react";
import { Link } from "wouter";
import { toast } from "sonner";
import {
  Smartphone,
  Megaphone,
  Star,
  MessageSquare,
  Plus,
  QrCode,
  Trash2,
  WifiOff,
  X,
  RefreshCw,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { apiGet, apiPost, apiPut, apiDelete } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import OnboardingWizard, { isOnboardingDone } from "@/components/OnboardingWizard";

const NAVY = "#243370";

interface Device {
  id: number;
  name: string;
  phone: string;
  status: "connected" | "connecting" | "disconnected";
  webhookUrl: string;
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

interface Campaign {
  id: number;
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
}: {
  checked: boolean;
  onToggle: (v: boolean) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onToggle(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
        checked ? "bg-primary" : "bg-muted"
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
}: {
  label: string;
  icon: typeof Smartphone;
  tile: string;
  loading: boolean;
  children: ReactNode;
}) {
  return (
    <Card>
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

const MAX_TABLE_ROWS = 5;

export default function Dashboard() {
  const { user } = useAuth();
  const [devices, setDevices] = useState<Device[]>([]);
  const [deviceLimit, setDeviceLimit] = useState<number | null>(null);
  const [campaignCount, setCampaignCount] = useState(0);
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
      apiGet<{ campaigns: Campaign[] }>("/drip")
        .then((res) => (res.campaigns || []).length)
        .catch(() => 0),
      apiGet<{ total: number }>("/messages")
        .then((res) => (typeof res.total === "number" ? res.total : null))
        .catch(() => null),
    ])
      .then(([, plans, campCount, msgTotal]) => {
        const planKey = (user?.plan || "").toLowerCase();
        const match = plans.find(
          (p) =>
            p.slug.toLowerCase() === planKey || p.name.toLowerCase() === planKey
        );
        setDeviceLimit(match ? match.maxDevices : null);
        setCampaignCount(campCount);
        setMessagesTotal(msgTotal);
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

  const planName = user?.plan
    ? user.plan.charAt(0).toUpperCase() + user.plan.slice(1)
    : "-";
  const visibleDevices = devices.slice(0, MAX_TABLE_ROWS);

  return (
    <div className="space-y-6">
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
              0 Wait
            </span>
            <span
              className="inline-flex items-center rounded-full text-[11px] font-semibold px-2 py-0.5"
              style={{ backgroundColor: `${NAVY}1a`, color: NAVY }}
            >
              0 Sent
            </span>
            <span className="inline-flex items-center rounded-full bg-red-500/15 text-red-700 text-[11px] font-semibold px-2 py-0.5">
              0 Fail
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1.5">
            {campaignCount} Campaigns
          </p>
        </StatCard>

        <StatCard label="Subscription" icon={Star} tile="#2e4186" loading={loading}>
          <p className="text-3xl font-bold text-foreground tracking-tight">
            {planName}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">Exp: -</p>
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
            <Link href="/devices">
              <Button size="sm" className="gap-1.5">
                <Plus className="w-4 h-4" /> Add Device
              </Button>
            </Link>
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
              <Link href="/devices">
                <Button size="sm" className="mt-3 gap-1.5">
                  <Plus className="w-4 h-4" /> Tambah Perangkat
                </Button>
              </Link>
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
                    {visibleDevices.map((d) => (
                      <tr
                        key={d.id}
                        className="border-b border-border last:border-0"
                      >
                        <td className="py-3 pr-4 font-mono text-[13px] text-foreground whitespace-nowrap">
                          {d.phone || "-"}
                        </td>
                        <td
                          className="py-3 pr-4 text-xs text-muted-foreground max-w-[160px] truncate"
                          title={d.webhookUrl || ""}
                        >
                          {d.webhookUrl || "-"}
                        </td>
                        <td className="py-3 pr-4">
                          <Toggle
                            checked={!!d.readReceipts}
                            label={`Read receipts ${d.name}`}
                            disabled={!!toggling[`${d.id}:readReceipts`]}
                            onToggle={(v) => handleToggle(d, "readReceipts", v)}
                          />
                        </td>
                        <td className="py-3 pr-4">
                          <Toggle
                            checked={!!d.rejectCall}
                            label={`Reject call ${d.name}`}
                            disabled={!!toggling[`${d.id}:rejectCall`]}
                            onToggle={(v) => handleToggle(d, "rejectCall", v)}
                          />
                        </td>
                        <td className="py-3 pr-4">
                          <Toggle
                            checked={!!d.autoOnline}
                            label={`Auto online ${d.name}`}
                            disabled={!!toggling[`${d.id}:autoOnline`]}
                            onToggle={(v) => handleToggle(d, "autoOnline", v)}
                          />
                        </td>
                        <td className="py-3 pr-4">
                          <Toggle
                            checked={!!d.typingIndicator}
                            label={`Typing indicator ${d.name}`}
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
                              title="Hubungkan (QR)"
                            >
                              <QrCode className="w-4 h-4" />
                            </Button>
                          )}
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
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {devices.length > MAX_TABLE_ROWS && (
                <div className="mt-3 text-center">
                  <Link
                    href="/devices"
                    className="text-sm text-primary hover:underline font-medium"
                  >
                    Lihat semua ({devices.length})
                  </Link>
                </div>
              )}
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

      {/* Dialog QR */}
      {qrDevice && (
        <Modal title={`Hubungkan ${qrDevice.name}`} onClose={() => setQrDevice(null)}>
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

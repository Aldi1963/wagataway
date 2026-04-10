import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  MessageSquare,
  Smartphone,
  Users,
  CheckCircle2,
  TrendingUp,
  Clock,
  XCircle,
  Zap,
  Infinity,
  ArrowRight,
  Bell,
  BellOff,
  Megaphone,
  AlertTriangle,
  Info,
  Wifi,
  ExternalLink,
  Globe,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiFetch } from "@/lib/api";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  Legend,
} from "recharts";
import { format, formatDistanceToNow } from "date-fns";
import { id as localeId } from "date-fns/locale";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { useSiteConfig } from "@/hooks/use-site-config";

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, sub, color }: {
  icon: any; label: string; value: string | number; sub?: string; color: string;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold mt-1">{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
          </div>
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${color}`}>
            <Icon className="w-6 h-6 text-white" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Usage bar ─────────────────────────────────────────────────────────────────

interface UsageStat { used: number; limit: number; unlimited: boolean; percentage: number; }
interface UsageData {
  planId: string; planName: string;
  usage: { devices: UsageStat; messagesPerDay: UsageStat; contacts: UsageStat; };
}

function UsageBar({ label, stat, color }: { label: string; stat: UsageStat; color: string }) {
  const pct = stat.unlimited ? 0 : stat.percentage;
  const isWarning = !stat.unlimited && stat.percentage >= 80;
  const isFull = !stat.unlimited && stat.percentage >= 100;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground font-medium">{label}</span>
        <span className={`font-semibold ${isFull ? "text-destructive" : isWarning ? "text-yellow-600 dark:text-yellow-400" : "text-foreground"}`}>
          {stat.unlimited
            ? <span className="flex items-center gap-1"><Infinity className="h-3 w-3" /> Tak terbatas</span>
            : `${stat.used.toLocaleString("id-ID")} / ${stat.limit.toLocaleString("id-ID")}`}
        </span>
      </div>
      {!stat.unlimited && (
        <Progress
          value={pct}
          className={`h-1.5 ${isFull ? "[&>div]:bg-destructive" : isWarning ? "[&>div]:bg-yellow-500" : `[&>div]:${color}`}`}
        />
      )}
    </div>
  );
}

// ── Notification type config ──────────────────────────────────────────────────

const notifTypeConfig: Record<string, { icon: any; color: string; bg: string }> = {
  trial_expiry:        { icon: Clock,        color: "text-amber-600",  bg: "bg-amber-100 dark:bg-amber-900/30" },
  device_disconnected: { icon: Wifi,         color: "text-red-500",    bg: "bg-red-100 dark:bg-red-900/30" },
  system:              { icon: Megaphone,    color: "text-purple-600", bg: "bg-purple-100 dark:bg-purple-900/30" },
  success:             { icon: CheckCircle2, color: "text-green-600",  bg: "bg-green-100 dark:bg-green-900/30" },
  error:               { icon: XCircle,     color: "text-red-500",    bg: "bg-red-100 dark:bg-red-900/30" },
  warning:             { icon: AlertTriangle,color: "text-amber-600",  bg: "bg-amber-100 dark:bg-amber-900/30" },
};

function getNotifCfg(type: string) {
  return notifTypeConfig[type] ?? { icon: Info, color: "text-blue-500", bg: "bg-blue-100 dark:bg-blue-900/30" };
}

interface Notification {
  id: number;
  type: string;
  title: string;
  message: string;
  link: string | null;
  isRead: boolean;
  createdAt: string;
}

// ── Detail Dialog ─────────────────────────────────────────────────────────────

function NotifDetailDialog({
  notif,
  onClose,
  onNavigate,
}: {
  notif: Notification | null;
  onClose: () => void;
  onNavigate: (link: string) => void;
}) {
  if (!notif) return null;
  const cfg = getNotifCfg(notif.type);
  const Icon = cfg.icon;
  const isExternal = notif.link && (notif.link.startsWith("http://") || notif.link.startsWith("https://"));

  const typeLabel: Record<string, string> = {
    trial_expiry: "Masa Trial",
    device_disconnected: "Perangkat",
    system: "Pengumuman",
    success: "Sukses",
    error: "Error",
    warning: "Peringatan",
    info: "Informasi",
  };

  return (
    <Dialog open={!!notif} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2.5">
            <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0", cfg.bg)}>
              <Icon className={cn("w-4 h-4", cfg.color)} />
            </div>
            <span className="leading-tight">{notif.title}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          {/* Meta */}
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <Badge variant="secondary" className="text-[10px] font-medium px-1.5">
              {typeLabel[notif.type] ?? notif.type}
            </Badge>
            <span>
              {format(new Date(notif.createdAt), "dd MMM yyyy, HH:mm", { locale: localeId })}
            </span>
            <span className="ml-auto">
              ({formatDistanceToNow(new Date(notif.createdAt), { addSuffix: true, locale: localeId })})
            </span>
          </div>

          {/* Message */}
          <div className="rounded-xl bg-muted/50 border border-border/50 p-4">
            <p className="text-sm leading-relaxed whitespace-pre-line">{notif.message}</p>
          </div>

          {/* Link */}
          {notif.link && (
            <Button
              className="w-full gap-2"
              variant={isExternal ? "outline" : "default"}
              onClick={() => onNavigate(notif.link!)}
            >
              {isExternal
                ? <><ExternalLink className="w-4 h-4" /> Buka Link Eksternal</>
                : <><Globe className="w-4 h-4" /> Pergi ke Halaman</>
              }
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Pusat Informasi (Information Center) ─────────────────────────────────────

const PAGE_SIZE = 5;

function PusatInformasi() {
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Notification | null>(null);

  const { data, isLoading } = useQuery<{ notifications: Notification[]; unreadCount: number }>({
    queryKey: ["notifications"],
    queryFn: () => apiFetch("/notifications").then((r) => r.json()),
    refetchInterval: 30000,
  });

  const notifications = data?.notifications ?? [];
  const unreadCount = data?.unreadCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(notifications.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageItems = notifications.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
  const start = notifications.length === 0 ? 0 : safePage * PAGE_SIZE + 1;
  const end = Math.min(safePage * PAGE_SIZE + PAGE_SIZE, notifications.length);

  const markRead = useMutation({
    mutationFn: (id: number) => apiFetch(`/notifications/${id}/read`, { method: "PUT" }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const markAllRead = useMutation({
    mutationFn: () => apiFetch("/notifications/read-all", { method: "PUT" }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  function openDetail(n: Notification) {
    if (!n.isRead) markRead.mutate(n.id);
    setSelected(n);
  }

  function handleNavigate(link: string) {
    setSelected(null);
    if (link.startsWith("http://") || link.startsWith("https://")) {
      window.open(link, "_blank", "noopener,noreferrer");
    } else {
      navigate(link);
    }
  }

  return (
    <>
      <NotifDetailDialog
        notif={selected}
        onClose={() => setSelected(null)}
        onNavigate={handleNavigate}
      />

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Bell className="w-4 h-4 text-primary" />
              Pusat Informasi
              {unreadCount > 0 && (
                <Badge className="h-5 px-1.5 text-[10px] bg-red-500 hover:bg-red-500 text-white border-0 font-semibold">
                  {unreadCount} baru
                </Badge>
              )}
            </CardTitle>
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs gap-1 text-muted-foreground hover:text-foreground"
                onClick={() => markAllRead.mutate()}
                disabled={markAllRead.isPending}
              >
                <CheckCheck className="w-3.5 h-3.5" />
                Tandai semua dibaca
              </Button>
            )}
          </div>
        </CardHeader>

        <CardContent className="p-0 pb-0">
          {isLoading ? (
            <div className="space-y-2 px-4 py-2">
              {Array.from({ length: PAGE_SIZE }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full rounded-xl" />
              ))}
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 gap-2 text-muted-foreground">
              <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
                <BellOff className="w-5 h-5 opacity-50" />
              </div>
              <p className="text-sm font-medium">Tidak ada informasi</p>
              <p className="text-xs text-center px-8">
                Pengumuman, peringatan, dan informasi penting dari sistem akan muncul di sini
              </p>
            </div>
          ) : (
            <>
              {/* List */}
              <div className="divide-y divide-border/40">
                {pageItems.map((n) => {
                  const cfg = getNotifCfg(n.type);
                  const Icon = cfg.icon;
                  const isExternal = n.link && (n.link.startsWith("http://") || n.link.startsWith("https://"));

                  return (
                    <div
                      key={n.id}
                      onClick={() => openDetail(n)}
                      className={cn(
                        "flex gap-3 px-4 py-3 transition-colors cursor-pointer hover:bg-muted/50",
                        !n.isRead && "bg-primary/[0.03]"
                      )}
                    >
                      <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5", cfg.bg)}>
                        <Icon className={cn("w-4 h-4", cfg.color)} />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className={cn("text-sm leading-snug truncate", !n.isRead && "font-semibold")}>
                            {n.title}
                          </p>
                          {!n.isRead && <span className="w-2 h-2 rounded-full bg-primary shrink-0 mt-1" />}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed line-clamp-1">
                          {n.message}
                        </p>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-[11px] text-muted-foreground/70">
                            {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true, locale: localeId })}
                          </span>
                          {n.link && (
                            <span className={cn("text-[11px] flex items-center gap-0.5 truncate max-w-[140px]", isExternal ? "text-sky-500" : "text-primary/70")}>
                              {isExternal
                                ? <><ExternalLink className="w-2.5 h-2.5 shrink-0" /><span className="truncate">{n.link}</span></>
                                : <><Globe className="w-2.5 h-2.5 shrink-0" /><span className="truncate">{n.link}</span></>
                              }
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Pagination footer */}
              <div className="flex items-center justify-between px-4 py-2.5 border-t border-border/40 bg-muted/20">
                <span className="text-xs text-muted-foreground">
                  {start}–{end} dari {notifications.length} informasi
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    disabled={safePage === 0}
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <span className="text-xs font-medium px-1.5 min-w-[48px] text-center">
                    Hal {safePage + 1}/{totalPages}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    disabled={safePage >= totalPages - 1}
                    onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const { siteName } = useSiteConfig();

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: () => apiFetch("/dashboard/stats").then((r) => r.json()),
    refetchInterval: 30000,
  });

  const [chartPeriod, setChartPeriod] = useState<"7d" | "30d" | "90d">("7d");

  const { data: chartData, isLoading: chartLoading } = useQuery({
    queryKey: ["dashboard-chart", chartPeriod],
    queryFn: () => apiFetch(`/dashboard/chart?period=${chartPeriod}`).then((r) => r.json()),
  });

  const { data: hourlyData, isLoading: hourlyLoading } = useQuery({
    queryKey: ["dashboard-hourly"],
    queryFn: () => apiFetch("/dashboard/hourly").then((r) => r.json()),
    refetchInterval: 120000,
  });

  const { data: topDevices, isLoading: topDevicesLoading } = useQuery({
    queryKey: ["dashboard-top-devices"],
    queryFn: () => apiFetch("/dashboard/top-devices").then((r) => r.json()),
    refetchInterval: 60000,
  });

  const { data: usage, isLoading: usageLoading } = useQuery<UsageData>({
    queryKey: ["billing-usage"],
    queryFn: () => apiFetch("/billing/usage").then((r) => r.json()),
    refetchInterval: 60000,
  });

  const anyAtLimit = usage && !usageLoading && (
    (!usage.usage.devices.unlimited && usage.usage.devices.percentage >= 100) ||
    (!usage.usage.messagesPerDay.unlimited && usage.usage.messagesPerDay.percentage >= 100) ||
    (!usage.usage.contacts.unlimited && usage.usage.contacts.percentage >= 100)
  );

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {statsLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}><CardContent className="p-5"><Skeleton className="h-16 w-full" /></CardContent></Card>
          ))
        ) : (
          <>
            <StatCard icon={MessageSquare} label="Total Pesan" value={stats?.totalMessages ?? 0} sub="Semua waktu" color="bg-primary" />
            <StatCard icon={CheckCircle2} label="Terkirim" value={stats?.sentMessages ?? 0} sub={`${stats?.successRate ?? 0}% sukses`} color="bg-green-500" />
            <StatCard icon={Smartphone} label="Perangkat Aktif" value={`${stats?.activeDevices ?? 0}/${stats?.totalDevices ?? 0}`} sub="Terhubung" color="bg-blue-500" />
            <StatCard icon={Users} label="Kontak" value={stats?.totalContacts ?? 0} sub="Total kontak" color="bg-purple-500" />
          </>
        )}
      </div>

      {/* Penggunaan Paket */}
      <Card className={anyAtLimit ? "border-destructive/50 bg-destructive/5" : ""}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="w-4 h-4 text-primary" />
              Penggunaan Paket
              {!usageLoading && usage && (
                <Badge variant="secondary" className="font-normal text-xs">{usage.planName}</Badge>
              )}
            </CardTitle>
            {anyAtLimit && (
              <Button size="sm" variant="default" onClick={() => setLocation("/billing")} className="text-xs h-7 gap-1">
                <Zap className="h-3.5 w-3.5" /> Upgrade <ArrowRight className="h-3 w-3" />
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {usageLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-6 w-full" />
              ))}
            </div>
          ) : usage ? (
            <div className="grid sm:grid-cols-3 gap-x-6 gap-y-4">
              <UsageBar label="Perangkat" stat={usage.usage.devices} color="bg-blue-500" />
              <UsageBar label="Pesan Hari Ini" stat={usage.usage.messagesPerDay} color="bg-primary" />
              <UsageBar label="Kontak" stat={usage.usage.contacts} color="bg-purple-500" />
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Chart + Status ringkas */}
      <div className="grid md:grid-cols-3 gap-6">
        <Card className="md:col-span-2">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-base">
                Pesan {chartPeriod === "7d" ? "7 Hari" : chartPeriod === "30d" ? "30 Hari" : "90 Hari"} Terakhir
              </CardTitle>
              <div className="flex gap-1">
                {(["7d", "30d", "90d"] as const).map((p) => (
                  <Button
                    key={p}
                    size="sm"
                    variant={chartPeriod === p ? "default" : "ghost"}
                    className="h-7 px-2.5 text-xs"
                    onClick={() => setChartPeriod(p)}
                  >
                    {p === "7d" ? "7H" : p === "30d" ? "30H" : "90H"}
                  </Button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {chartLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={chartData ?? []}>
                  <defs>
                    <linearGradient id="colorSent" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(145,63%,49%)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(145,63%,49%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(v) => format(new Date(v), "dd/MM")}
                    tick={{ fontSize: 11 }}
                    className="fill-muted-foreground"
                  />
                  <YAxis tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                  <Tooltip
                    labelFormatter={(v) => format(new Date(v), "dd MMM yyyy")}
                    contentStyle={{ borderRadius: "8px", border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }}
                  />
                  <Area type="monotone" dataKey="sent" stroke="hsl(145,63%,49%)" fill="url(#colorSent)" name="Terkirim" strokeWidth={2} />
                  <Area type="monotone" dataKey="failed" stroke="hsl(0,84%,60%)" fill="none" name="Gagal" strokeWidth={2} strokeDasharray="4 2" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Status Ringkas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {statsLoading ? (
              <Skeleton className="h-32 w-full" />
            ) : (
              <>
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                    Terkirim
                  </div>
                  <span className="font-semibold">{stats?.sentMessages ?? 0}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <XCircle className="w-4 h-4 text-destructive" />
                    Gagal
                  </div>
                  <span className="font-semibold">{stats?.failedMessages ?? 0}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Clock className="w-4 h-4 text-yellow-500" />
                    Pending
                  </div>
                  <span className="font-semibold">{stats?.pendingMessages ?? 0}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <TrendingUp className="w-4 h-4 text-primary" />
                    Tingkat Sukses
                  </div>
                  <Badge variant="secondary" className="text-xs">{stats?.successRate ?? 0}%</Badge>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Chart Tambahan: Pesan Per Jam + Top Devices */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Pesan Per Jam */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Pesan Per Jam (24 Jam Terakhir)</CardTitle>
          </CardHeader>
          <CardContent>
            {hourlyLoading ? (
              <Skeleton className="h-44 w-full" />
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={hourlyData ?? []} barSize={8}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis
                    dataKey="hour"
                    tick={{ fontSize: 10 }}
                    className="fill-muted-foreground"
                    interval={3}
                    tickFormatter={(v) => v.slice(0, 2)}
                  />
                  <YAxis tick={{ fontSize: 10 }} className="fill-muted-foreground" />
                  <Tooltip
                    contentStyle={{ borderRadius: "8px", border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }}
                  />
                  <Bar dataKey="sent" name="Terkirim" fill="hsl(145,63%,49%)" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="failed" name="Gagal" fill="hsl(0,84%,60%)" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Top Devices */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Top Perangkat (Volume Pesan)</CardTitle>
          </CardHeader>
          <CardContent>
            {topDevicesLoading ? (
              <Skeleton className="h-44 w-full" />
            ) : !topDevices?.length ? (
              <div className="flex items-center justify-center h-44 text-sm text-muted-foreground">
                Belum ada data perangkat
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart
                  layout="vertical"
                  data={topDevices}
                  margin={{ left: 8, right: 16 }}
                >
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10 }} className="fill-muted-foreground" />
                  <YAxis
                    dataKey="name"
                    type="category"
                    tick={{ fontSize: 10 }}
                    className="fill-muted-foreground"
                    width={80}
                    tickFormatter={(v) => v.length > 12 ? v.slice(0, 12) + "…" : v}
                  />
                  <Tooltip
                    contentStyle={{ borderRadius: "8px", border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }}
                  />
                  <Bar dataKey="sent" name="Terkirim" fill="hsl(217,91%,60%)" radius={[0, 3, 3, 0]}>
                    {(topDevices ?? []).map((_: any, i: number) => (
                      <Cell
                        key={i}
                        fill={["hsl(217,91%,60%)", "hsl(262,83%,58%)", "hsl(145,63%,49%)", "hsl(38,92%,50%)", "hsl(0,84%,60%)"][i % 5]}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Pusat Informasi — menggantikan Aktivitas Terbaru */}
      <PusatInformasi />
    </div>
  );
}

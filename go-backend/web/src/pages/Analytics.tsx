import { useEffect, useState } from "react";
import { Link } from "wouter";
import { RefreshCw, Send, Inbox, Download, FileJson } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiFetch, apiGet } from "@/lib/api";
import { useLang } from "@/lib/i18n";

const NAVY = "#243370";

interface Overview {
  totalMessages: number;
  todayMessages: number;
  sentMessages: number;
  failedMessages: number;
  totalContacts: number;
  activeDevices: number;
  deliveryRate: number;
}

interface DayStat {
  date: string;
  sent: number;
  failed: number;
}

interface Funnel {
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  readRate: number;
  replied: number;
  replyRate: number;
  buyers: number;
  orders: number;
  revenue: number;
  buyRate: number;
}

interface DevicePerf {
  deviceId: number;
  name: string;
  phone: string;
  status: string;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  readRate: number;
  replied: number;
  replyRate: number;
  buyers: number;
  orders: number;
  revenue: number;
  buyRate: number;
}

interface CampaignPerf {
  jobId: number;
  name: string;
  status: string;
  totalCount: number;
  sentCount: number;
  failedCount: number;
  read: number;
  readRate: number;
  replied: number;
  replyRate: number;
  buyers: number;
  orders: number;
  revenue: number;
  buyRate: number;
  createdAt: string;
}

interface DeviceResponse {
  deviceId: number;
  name: string;
  conversations: number;
  replied: number;
  avgFirstResponseSeconds: number;
  medianFirstResponseSeconds: number;
}

interface ResponseTime {
  conversations: number;
  replied: number;
  replyRate: number;
  avgFirstResponseSeconds: number;
  medianFirstResponseSeconds: number;
  buckets: Record<string, number>;
  resolved: number;
  avgResolutionSeconds: number;
  medianResolutionSeconds: number;
  resolutionNote: string;
  perDevice: DeviceResponse[];
}

interface DeviceOption {
  id: number;
  name: string;
  phone: string;
}

function StatCard({
  label,
  value,
  loading,
  badge,
}: {
  label: string;
  value: string;
  loading: boolean;
  badge?: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-xs text-muted-foreground">{label}</p>
        {loading ? (
          <div className="mt-2 h-8 w-20 rounded bg-muted animate-pulse" />
        ) : (
          <>
            <p className="text-2xl font-bold text-foreground mt-1">{value}</p>
            {badge}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function dayLabel(dateStr: string, short: boolean): string {
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return short
    ? d.toLocaleDateString("id-ID", { weekday: "short" })
    : d.toLocaleDateString("id-ID", { day: "numeric", month: "short" });
}

export default function Analytics({ embedded = false }: { embedded?: boolean }) {
  const { t } = useLang();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [stats, setStats] = useState<DayStat[]>([]);
  const [days, setDays] = useState<7 | 30 | 90>(30);
  const [deviceId, setDeviceId] = useState<number>(0);
  const [deviceOptions, setDeviceOptions] = useState<DeviceOption[]>([]);
  const [funnel, setFunnel] = useState<Funnel | null>(null);
  const [devices, setDevices] = useState<DevicePerf[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignPerf[]>([]);
  const [response, setResponse] = useState<ResponseTime | null>(null);
  const [loading, setLoading] = useState(true);
  const [chartLoading, setChartLoading] = useState(false);
  const [advLoading, setAdvLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [advError, setAdvError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);

  const fmtDur = (sec: number): string => {
    if (!sec || sec <= 0) return "—";
    const s = Math.round(sec);
    if (s < 60) return t("analytics.durSeconds").replace("{s}", String(s));
    if (s < 3600) {
      return t("analytics.durMinutes")
        .replace("{m}", String(Math.floor(s / 60)))
        .replace("{s}", String(s % 60));
    }
    return t("analytics.durHours")
      .replace("{h}", String(Math.floor(s / 3600)))
      .replace("{m}", String(Math.floor((s % 3600) / 60)));
  };

  const fmtPct = (v: number) => `${v.toFixed(1)}%`;
  const fmtNum = (v: number) => v.toLocaleString("id-ID");
  const fmtMoney = (v: number) => `Rp${v.toLocaleString("id-ID")}`;

  const loadOverview = () => {
    setLoading(true);
    setError(null);
    apiGet<Overview>("/analytics/overview")
      .then(setOverview)
      .catch((e) => setError(e instanceof Error ? e.message : t("analytics.loadFail")))
      .finally(() => setLoading(false));
  };

  const loadChart = (d: 7 | 30 | 90) => {
    setChartLoading(true);
    apiGet<{ stats: DayStat[] }>(`/analytics/messages?days=${d}`)
      .then((res) => setStats(res.stats || []))
      .catch(() => setStats([]))
      .finally(() => setChartLoading(false));
  };

  const loadAdvanced = (d: number, dev: number) => {
    setAdvLoading(true);
    setAdvError(null);
    const devQ = dev > 0 ? `&deviceId=${dev}` : "";
    Promise.all([
      apiGet<Funnel>(`/analytics/funnel?days=${d}${devQ}`),
      apiGet<{ devices: DevicePerf[] }>(`/analytics/devices?days=${d}`),
      apiGet<{ campaigns: CampaignPerf[] }>(`/analytics/campaigns?days=${d}`),
      apiGet<ResponseTime>(`/analytics/response-time?days=${d}${devQ}`),
    ])
      .then(([f, dv, cp, rt]) => {
        setFunnel(f);
        setDevices(dv.devices || []);
        setCampaigns(cp.campaigns || []);
        setResponse(rt);
      })
      .catch((e) =>
        setAdvError(e instanceof Error ? e.message : t("analytics.loadFail"))
      )
      .finally(() => setAdvLoading(false));
  };

  const loadDevices = () => {
    apiGet<{ devices: DeviceOption[] }>("/devices")
      .then((res) => setDeviceOptions(res.devices || []))
      .catch(() => setDeviceOptions([]));
  };

  useEffect(() => {
    loadOverview();
    loadChart(30);
    loadDevices();
    loadAdvanced(30, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const changeDays = (d: 7 | 30 | 90) => {
    setDays(d);
    loadChart(d);
    loadAdvanced(d, deviceId);
  };

  const changeDevice = (dev: number) => {
    setDeviceId(dev);
    loadAdvanced(days, dev);
  };

  const downloadExport = async (
    section: "funnel" | "devices" | "campaigns" | "response",
    format: "csv" | "json"
  ) => {
    const key = `${section}-${format}`;
    setExporting(key);
    try {
      const devQ = deviceId > 0 ? `&deviceId=${deviceId}` : "";
      const res = await apiFetch(
        `/analytics/export?section=${section}&format=${format}&days=${days}${devQ}`
      );
      if (!res.ok) throw new Error(t("analytics.exportFail"));
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `analytics-${section}-${days}hari.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setAdvError(e instanceof Error ? e.message : t("analytics.exportFail"));
    } finally {
      setExporting(null);
    }
  };

  const maxTotal = Math.max(1, ...stats.map((s) => s.sent + s.failed));

  const empty = !loading && !error && overview && overview.totalMessages === 0;

  const funnelStages = funnel
    ? [
        { label: t("analytics.funnelSent"), value: funnel.sent, rate: null as string | null },
        { label: t("analytics.funnelRead"), value: funnel.read, rate: fmtPct(funnel.readRate) },
        { label: t("analytics.funnelReplied"), value: funnel.replied, rate: fmtPct(funnel.replyRate) },
        { label: t("analytics.funnelBought"), value: funnel.buyers, rate: fmtPct(funnel.buyRate) },
      ]
    : [];

  return (
    <div className="space-y-6">
      {!embedded && (
        <div>
          <h2 className="text-lg font-semibold text-foreground">{t("analytics.title")}</h2>
          <p className="text-sm text-muted-foreground">
            {t("analytics.subtitle").replace("{days}", String(days))}
          </p>
        </div>
      )}

      {error && (
        <Card className="border-destructive/50">
          <CardContent className="p-5 flex items-center justify-between">
            <p className="text-sm text-destructive">{error}</p>
            <Button variant="outline" size="sm" onClick={loadOverview} className="gap-1.5">
              <RefreshCw className="w-3.5 h-3.5" /> {t("common.retry")}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Filter periode + device (berlaku untuk funnel & waktu respons) */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="inline-flex rounded-lg bg-muted p-1">
          {([7, 30, 90] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => changeDays(d)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                days === d
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t("analytics.daysButton").replace("{days}", String(d))}
            </button>
          ))}
        </div>
        <select
          value={deviceId}
          onChange={(e) => changeDevice(Number(e.target.value))}
          className="h-9 rounded-lg border border-input bg-background px-3 text-sm text-foreground"
          aria-label={t("analytics.filterDevice")}
        >
          <option value={0}>{t("analytics.allDevices")}</option>
          {deviceOptions.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
              {d.phone ? ` (${d.phone})` : ""}
            </option>
          ))}
        </select>
      </div>

      {empty ? (
        <Card>
          <CardContent className="py-14 flex flex-col items-center text-center">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{ backgroundColor: `${NAVY}1a` }}
            >
              <Inbox className="w-8 h-8" style={{ color: NAVY }} />
            </div>
            <p className="mt-4 text-base font-semibold text-foreground">
              {t("analytics.emptyTitle")}
            </p>
            <p className="mt-1 text-sm text-muted-foreground max-w-sm">
              {t("analytics.emptyHint")}
            </p>
            <Link to="/send">
              <Button className="mt-5 gap-1.5">
                <Send className="w-4 h-4" /> {t("analytics.sendFirst")}
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Kartu statistik */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <StatCard
              label={t("analytics.totalMessages")}
              loading={loading}
              value={(overview?.totalMessages ?? 0).toLocaleString("id-ID")}
            />
            <StatCard
              label={t("analytics.sent")}
              loading={loading}
              value={(overview?.sentMessages ?? 0).toLocaleString("id-ID")}
              badge={
                <Badge
                  className="mt-1.5 bg-[#243370]/10 text-[10px] text-[#243370] dark:bg-[#4c63d2]/15 dark:text-[#aab6f5]"
                >
                  {(overview?.deliveryRate ?? 0).toFixed(1)}%
                </Badge>
              }
            />
            <StatCard
              label={t("analytics.failed")}
              loading={loading}
              value={(overview?.failedMessages ?? 0).toLocaleString("id-ID")}
            />
            <StatCard
              label={t("analytics.todayMessages")}
              loading={loading}
              value={(overview?.todayMessages ?? 0).toLocaleString("id-ID")}
            />
            <StatCard
              label={t("analytics.activeDevices")}
              loading={loading}
              value={(overview?.activeDevices ?? 0).toLocaleString("id-ID")}
            />
            <StatCard
              label={t("analytics.totalContacts")}
              loading={loading}
              value={(overview?.totalContacts ?? 0).toLocaleString("id-ID")}
            />
          </div>

          {/* Grafik pesan per hari */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <CardTitle className="text-sm font-semibold">
                  {t("analytics.chartTitle")}
                </CardTitle>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        className="w-2.5 h-2.5 rounded-sm inline-block"
                        style={{ backgroundColor: NAVY }}
                      />
                      {t("analytics.sent")}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-sm inline-block bg-red-500" />
                      {t("analytics.failed")}
                    </span>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {chartLoading ? (
                <div className="h-40 flex items-end gap-3">
                  {Array.from({ length: days }).map((_, i) => (
                    <div
                      key={i}
                      className="flex-1 rounded-sm bg-muted animate-pulse"
                      style={{ height: `${30 + ((i * 37) % 60)}%` }}
                    />
                  ))}
                </div>
              ) : stats.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  {t("analytics.noChartData")}
                </p>
              ) : (
                <div className="flex items-end gap-1.5 sm:gap-3 h-44">
                  {stats.map((s, i) => {
                    const total = s.sent + s.failed;
                    const barH = total > 0 ? Math.max(3, (total / maxTotal) * 100) : 0;
                    const sentH = total > 0 ? (s.sent / total) * 100 : 0;
                    const showLabel =
                      days === 7 || i % 5 === 0 || i === stats.length - 1;
                    return (
                      <div
                        key={s.date}
                        className="flex-1 flex flex-col items-center gap-1.5 min-w-0"
                        title={t("analytics.chartTooltip").replace("{date}", dayLabel(s.date, false)).replace("{sent}", String(s.sent)).replace("{failed}", String(s.failed))}
                      >
                        <div className="w-full flex flex-col justify-end h-32">
                          <div
                            className="w-full rounded-sm overflow-hidden flex flex-col justify-end"
                            style={{ height: `${barH}%` }}
                          >
                            {s.failed > 0 && (
                              <div
                                className="w-full bg-red-500"
                                style={{ height: `${100 - sentH}%` }}
                              />
                            )}
                            {s.sent > 0 && (
                              <div
                                className="w-full"
                                style={{
                                  height: `${sentH}%`,
                                  backgroundColor: NAVY,
                                }}
                              />
                            )}
                          </div>
                        </div>
                        <span className="text-[10px] text-muted-foreground font-medium truncate">
                          {showLabel ? dayLabel(s.date, days === 7) : ""}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── Analitik lanjutan ── */}
          {advError && (
            <Card className="border-destructive/50">
              <CardContent className="p-5 flex items-center justify-between">
                <p className="text-sm text-destructive">{advError}</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => loadAdvanced(days, deviceId)}
                  className="gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> {t("common.retry")}
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Funnel baca → balas → beli */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <CardTitle className="text-sm font-semibold">
                    {t("analytics.funnelTitle")}
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t("analytics.funnelNote")}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={exporting === "funnel-csv"}
                    onClick={() => downloadExport("funnel", "csv")}
                    className="gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" /> CSV
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={exporting === "funnel-json"}
                    onClick={() => downloadExport("funnel", "json")}
                    className="gap-1.5"
                  >
                    <FileJson className="w-3.5 h-3.5" /> JSON
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {advLoading && !funnel ? (
                <div className="h-20 rounded bg-muted animate-pulse" />
              ) : !funnel || funnel.sent === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  {t("analytics.funnelEmpty")}
                </p>
              ) : (
                <>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    {funnelStages.map((s, i) => (
                      <div
                        key={s.label}
                        className="rounded-xl border p-4 text-center relative"
                      >
                        {i > 0 && (
                          <span className="hidden lg:block absolute -left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-lg">
                            ›
                          </span>
                        )}
                        <p className="text-xs text-muted-foreground">{s.label}</p>
                        <p className="text-2xl font-bold mt-1">{fmtNum(s.value)}</p>
                        {s.rate !== null && (
                          <Badge className="mt-1.5 bg-[#243370]/10 text-[11px] text-[#243370] dark:bg-[#4c63d2]/15 dark:text-[#aab6f5]">
                            {s.rate}
                          </Badge>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 flex gap-4 flex-wrap text-xs text-muted-foreground">
                    <span>
                      {t("analytics.funnelOrders")}: <b className="text-foreground">{fmtNum(funnel.orders)}</b>
                    </span>
                    <span>
                      {t("analytics.funnelRevenue")}: <b className="text-foreground">{fmtMoney(funnel.revenue)}</b>
                    </span>
                    <span>
                      {t("analytics.funnelFailed")}: <b className="text-foreground">{fmtNum(funnel.failed)}</b>
                    </span>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Waktu respons CS */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <CardTitle className="text-sm font-semibold">
                    {t("analytics.responseTitle")}
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t("analytics.responseNote")}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={exporting === "response-csv"}
                    onClick={() => downloadExport("response", "csv")}
                    className="gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" /> CSV
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={exporting === "response-json"}
                    onClick={() => downloadExport("response", "json")}
                    className="gap-1.5"
                  >
                    <FileJson className="w-3.5 h-3.5" /> JSON
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {advLoading && !response ? (
                <div className="h-20 rounded bg-muted animate-pulse" />
              ) : !response || response.conversations === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  {t("analytics.responseEmpty")}
                </p>
              ) : (
                <>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <div className="rounded-xl border p-4">
                      <p className="text-xs text-muted-foreground">{t("analytics.responseConversations")}</p>
                      <p className="text-2xl font-bold mt-1">{fmtNum(response.conversations)}</p>
                    </div>
                    <div className="rounded-xl border p-4">
                      <p className="text-xs text-muted-foreground">{t("analytics.responseReplyRate")}</p>
                      <p className="text-2xl font-bold mt-1">{fmtPct(response.replyRate)}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {fmtNum(response.replied)} / {fmtNum(response.conversations)}
                      </p>
                    </div>
                    <div className="rounded-xl border p-4">
                      <p className="text-xs text-muted-foreground">{t("analytics.responseAvgFrt")}</p>
                      <p className="text-2xl font-bold mt-1">{fmtDur(response.avgFirstResponseSeconds)}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {t("analytics.responseMedian")}: {fmtDur(response.medianFirstResponseSeconds)}
                      </p>
                    </div>
                    <div className="rounded-xl border p-4">
                      <p className="text-xs text-muted-foreground">{t("analytics.responseAvgResolution")}</p>
                      <p className="text-2xl font-bold mt-1">
                        {response.resolved > 0 ? fmtDur(response.avgResolutionSeconds) : "—"}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {t("analytics.responseResolved")}: {fmtNum(response.resolved)}
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 flex gap-2 flex-wrap">
                    {(["<5m", "5-15m", "15-60m", ">60m"] as const).map((b) => (
                      <Badge key={b} variant="secondary" className="text-[11px]">
                        {b}: {fmtNum(response.buckets[b] ?? 0)}
                      </Badge>
                    ))}
                  </div>
                  <p className="mt-3 text-[11px] text-muted-foreground">
                    {response.resolutionNote}
                  </p>
                  {response.perDevice.length > 0 && (
                    <div className="mt-4 overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b text-left text-xs text-muted-foreground">
                            <th className="py-2 pr-3 font-medium">{t("analytics.colDevice")}</th>
                            <th className="py-2 pr-3 font-medium text-right">{t("analytics.responseConversations")}</th>
                            <th className="py-2 pr-3 font-medium text-right">{t("analytics.responseReplyRate")}</th>
                            <th className="py-2 font-medium text-right">{t("analytics.responseAvgFrt")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {response.perDevice.map((d) => (
                            <tr key={d.deviceId} className="border-b last:border-0">
                              <td className="py-2 pr-3">{d.name || `#${d.deviceId}`}</td>
                              <td className="py-2 pr-3 text-right">{fmtNum(d.conversations)}</td>
                              <td className="py-2 pr-3 text-right">
                                {d.conversations > 0
                                  ? fmtPct((d.replied / d.conversations) * 100)
                                  : "—"}
                              </td>
                              <td className="py-2 text-right">{fmtDur(d.avgFirstResponseSeconds)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {/* Performa per device */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <CardTitle className="text-sm font-semibold">
                  {t("analytics.devicesTitle")}
                </CardTitle>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={exporting === "devices-csv"}
                    onClick={() => downloadExport("devices", "csv")}
                    className="gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" /> CSV
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={exporting === "devices-json"}
                    onClick={() => downloadExport("devices", "json")}
                    className="gap-1.5"
                  >
                    <FileJson className="w-3.5 h-3.5" /> JSON
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {advLoading && devices.length === 0 ? (
                <div className="h-20 rounded bg-muted animate-pulse" />
              ) : devices.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  {t("analytics.devicesEmpty")}
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs text-muted-foreground">
                        <th className="py-2 pr-3 font-medium">{t("analytics.colDevice")}</th>
                        <th className="py-2 pr-3 font-medium text-right">{t("analytics.colSent")}</th>
                        <th className="py-2 pr-3 font-medium text-right">{t("analytics.colRead")}</th>
                        <th className="py-2 pr-3 font-medium text-right">{t("analytics.colReplied")}</th>
                        <th className="py-2 pr-3 font-medium text-right">{t("analytics.colBuyers")}</th>
                        <th className="py-2 font-medium text-right">{t("analytics.colRevenue")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {devices.map((d) => (
                        <tr key={d.deviceId} className="border-b last:border-0">
                          <td className="py-2 pr-3">
                            <span className="font-medium">{d.name}</span>
                            <span className="block text-xs text-muted-foreground">
                              {d.phone} · {d.status}
                            </span>
                          </td>
                          <td className="py-2 pr-3 text-right">{fmtNum(d.sent)}</td>
                          <td className="py-2 pr-3 text-right">
                            {fmtNum(d.read)}
                            <span className="block text-xs text-muted-foreground">{fmtPct(d.readRate)}</span>
                          </td>
                          <td className="py-2 pr-3 text-right">
                            {fmtNum(d.replied)}
                            <span className="block text-xs text-muted-foreground">{fmtPct(d.replyRate)}</span>
                          </td>
                          <td className="py-2 pr-3 text-right">
                            {fmtNum(d.buyers)}
                            <span className="block text-xs text-muted-foreground">{fmtPct(d.buyRate)}</span>
                          </td>
                          <td className="py-2 text-right">{fmtMoney(d.revenue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Performa kampanye */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <CardTitle className="text-sm font-semibold">
                    {t("analytics.campaignsTitle")}
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t("analytics.campaignsNote")}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={exporting === "campaigns-csv"}
                    onClick={() => downloadExport("campaigns", "csv")}
                    className="gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" /> CSV
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={exporting === "campaigns-json"}
                    onClick={() => downloadExport("campaigns", "json")}
                    className="gap-1.5"
                  >
                    <FileJson className="w-3.5 h-3.5" /> JSON
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {advLoading && campaigns.length === 0 ? (
                <div className="h-20 rounded bg-muted animate-pulse" />
              ) : campaigns.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  {t("analytics.campaignsEmpty")}
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs text-muted-foreground">
                        <th className="py-2 pr-3 font-medium">{t("analytics.colCampaign")}</th>
                        <th className="py-2 pr-3 font-medium text-right">{t("analytics.colSent")}</th>
                        <th className="py-2 pr-3 font-medium text-right">{t("analytics.colRead")}</th>
                        <th className="py-2 pr-3 font-medium text-right">{t("analytics.colReplied")}</th>
                        <th className="py-2 pr-3 font-medium text-right">{t("analytics.colBuyers")}</th>
                        <th className="py-2 font-medium text-right">{t("analytics.colRevenue")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {campaigns.map((cp) => (
                        <tr key={cp.jobId} className="border-b last:border-0">
                          <td className="py-2 pr-3">
                            <span className="font-medium">{cp.name}</span>
                            <span className="block text-xs text-muted-foreground">
                              {dayLabel(cp.createdAt.slice(0, 10), false)} · {cp.status}
                            </span>
                          </td>
                          <td className="py-2 pr-3 text-right">
                            {fmtNum(cp.sentCount)}
                            {cp.failedCount > 0 && (
                              <span className="block text-xs text-red-500">
                                {t("analytics.failed")}: {fmtNum(cp.failedCount)}
                              </span>
                            )}
                          </td>
                          <td className="py-2 pr-3 text-right">
                            {fmtNum(cp.read)}
                            <span className="block text-xs text-muted-foreground">{fmtPct(cp.readRate)}</span>
                          </td>
                          <td className="py-2 pr-3 text-right">
                            {fmtNum(cp.replied)}
                            <span className="block text-xs text-muted-foreground">{fmtPct(cp.replyRate)}</span>
                          </td>
                          <td className="py-2 pr-3 text-right">
                            {fmtNum(cp.buyers)}
                            <span className="block text-xs text-muted-foreground">{fmtPct(cp.buyRate)}</span>
                          </td>
                          <td className="py-2 text-right">{fmtMoney(cp.revenue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

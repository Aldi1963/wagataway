import { useEffect, useState } from "react";
import { Link } from "wouter";
import { RefreshCw, Send, Inbox } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiGet } from "@/lib/api";

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

export default function Analytics() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [stats, setStats] = useState<DayStat[]>([]);
  const [days, setDays] = useState<7 | 30>(7);
  const [loading, setLoading] = useState(true);
  const [chartLoading, setChartLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadOverview = () => {
    setLoading(true);
    setError(null);
    apiGet<Overview>("/analytics/overview")
      .then(setOverview)
      .catch((e) => setError(e instanceof Error ? e.message : "Gagal memuat data"))
      .finally(() => setLoading(false));
  };

  const loadChart = (d: 7 | 30) => {
    setChartLoading(true);
    apiGet<{ stats: DayStat[] }>(`/analytics/messages?days=${d}`)
      .then((res) => setStats(res.stats || []))
      .catch(() => setStats([]))
      .finally(() => setChartLoading(false));
  };

  useEffect(() => {
    loadOverview();
    loadChart(7);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const changeDays = (d: 7 | 30) => {
    setDays(d);
    loadChart(d);
  };

  const maxTotal = Math.max(1, ...stats.map((s) => s.sent + s.failed));

  const empty = !loading && !error && overview && overview.totalMessages === 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Analytics</h2>
        <p className="text-sm text-muted-foreground">
          Ringkasan pengiriman pesan {days} hari terakhir
        </p>
      </div>

      {error && (
        <Card className="border-destructive/50">
          <CardContent className="p-5 flex items-center justify-between">
            <p className="text-sm text-destructive">{error}</p>
            <Button variant="outline" size="sm" onClick={loadOverview} className="gap-1.5">
              <RefreshCw className="w-3.5 h-3.5" /> Coba lagi
            </Button>
          </CardContent>
        </Card>
      )}

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
              Belum ada pesan terkirim
            </p>
            <p className="mt-1 text-sm text-muted-foreground max-w-sm">
              Mulai kirim pesan WhatsApp pertama kamu, statistik pengiriman
              akan tampil di sini.
            </p>
            <Link to="/send">
              <Button className="mt-5 gap-1.5">
                <Send className="w-4 h-4" /> Kirim Pesan Pertama
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Kartu statistik */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <StatCard
              label="Total Pesan"
              loading={loading}
              value={(overview?.totalMessages ?? 0).toLocaleString("id-ID")}
            />
            <StatCard
              label="Terkirim"
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
              label="Gagal"
              loading={loading}
              value={(overview?.failedMessages ?? 0).toLocaleString("id-ID")}
            />
            <StatCard
              label="Pesan Hari Ini"
              loading={loading}
              value={(overview?.todayMessages ?? 0).toLocaleString("id-ID")}
            />
            <StatCard
              label="Perangkat Aktif"
              loading={loading}
              value={(overview?.activeDevices ?? 0).toLocaleString("id-ID")}
            />
            <StatCard
              label="Total Kontak"
              loading={loading}
              value={(overview?.totalContacts ?? 0).toLocaleString("id-ID")}
            />
          </div>

          {/* Grafik pesan per hari */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <CardTitle className="text-sm font-semibold">
                  Pesan per Hari
                </CardTitle>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        className="w-2.5 h-2.5 rounded-sm inline-block"
                        style={{ backgroundColor: NAVY }}
                      />
                      Terkirim
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-sm inline-block bg-red-500" />
                      Gagal
                    </span>
                  </div>
                  <div className="inline-flex rounded-lg bg-muted p-1">
                    {([7, 30] as const).map((d) => (
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
                        {d} Hari
                      </button>
                    ))}
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
                  Belum ada data pengiriman.
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
                        title={`${dayLabel(s.date, false)} — Terkirim: ${s.sent}, Gagal: ${s.failed}`}
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
        </>
      )}
    </div>
  );
}

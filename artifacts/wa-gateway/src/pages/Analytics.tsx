import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart2, TrendingUp, Clock, Smartphone, MessageSquare,
  ArrowUpRight, ArrowDownRight, RefreshCw, Inbox,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiFetch } from "@/lib/api";

const DAYS_OPTIONS = [
  { value: "7", label: "7 Hari" },
  { value: "14", label: "14 Hari" },
  { value: "30", label: "30 Hari" },
];

const DAY_NAMES = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const HOURS = Array.from({ length: 24 }, (_, i) => `${i.toString().padStart(2, "0")}:00`);

function StatCard({ icon: Icon, label, value, sub, color }: any) {
  return (
    <Card>
      <CardContent className="p-5 flex gap-4 items-start">
        <div className={`p-2.5 rounded-lg ${color}`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold mt-0.5">{value?.toLocaleString() ?? "–"}</p>
          {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

function BarMini({ value, max, color = "bg-blue-500" }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="w-full bg-muted rounded-full h-1.5">
      <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function Analytics() {
  const [days, setDays] = useState("30");

  const { data: summary, isLoading: sumLoading } = useQuery({
    queryKey: ["analytics-summary"],
    queryFn: () => apiFetch("/analytics/summary").then((r) => r.json()),
    refetchInterval: 60000,
  });

  const { data: trend, isLoading: trendLoading } = useQuery({
    queryKey: ["analytics-messages", days],
    queryFn: () => apiFetch(`/analytics/messages?days=${days}`).then((r) => r.json()),
  });

  const { data: heatmap, isLoading: heatLoading } = useQuery({
    queryKey: ["analytics-heatmap"],
    queryFn: () => apiFetch("/analytics/heatmap").then((r) => r.json()),
  });

  const { data: devicesStats, isLoading: devLoading } = useQuery({
    queryKey: ["analytics-devices"],
    queryFn: () => apiFetch("/analytics/devices").then((r) => r.json()),
  });

  // Aggregate sent by day
  const sentByDay: Record<string, number> = {};
  const failedByDay: Record<string, number> = {};
  if (trend?.sent) {
    for (const row of trend.sent) {
      const d = new Date(row.day).toLocaleDateString("id-ID", { month: "short", day: "numeric" });
      if (row.status === "sent") sentByDay[d] = (sentByDay[d] ?? 0) + Number(row.count);
      if (row.status === "failed") failedByDay[d] = (failedByDay[d] ?? 0) + Number(row.count);
    }
  }
  const days_arr = Object.keys(sentByDay).slice(-parseInt(days));
  const maxSent = Math.max(...Object.values(sentByDay), 1);

  // Build heatmap grid
  const heatGrid: Record<string, number> = {};
  if (heatmap) {
    for (const row of heatmap) {
      heatGrid[`${row.dow}-${row.hour}`] = Number(row.count);
    }
  }
  const maxHeat = Math.max(...Object.values(heatGrid), 1);

  function heatColor(val: number): string {
    if (val === 0) return "bg-muted";
    const pct = val / maxHeat;
    if (pct < 0.25) return "bg-blue-200 dark:bg-blue-900";
    if (pct < 0.5) return "bg-blue-400 dark:bg-blue-700";
    if (pct < 0.75) return "bg-blue-600 dark:bg-blue-500";
    return "bg-blue-800 dark:bg-blue-400";
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end gap-4">
        <Select value={days} onValueChange={setDays}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DAYS_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {sumLoading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)
        ) : (
          <>
            <StatCard icon={MessageSquare} label="Terkirim Hari Ini" value={summary?.todaySent} color="bg-green-500" />
            <StatCard icon={TrendingUp} label="Terkirim Bulan Ini" value={summary?.monthSent} color="bg-blue-500" />
            <StatCard icon={Inbox} label="Diterima Bulan Ini" value={summary?.monthReceived} color="bg-purple-500" />
            <StatCard icon={ArrowDownRight} label="Total Gagal" value={summary?.totalFailed} color="bg-red-500" />
          </>
        )}
      </div>

      {/* Trend chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-blue-500" /> Tren Pesan {days} Hari Terakhir
          </CardTitle>
        </CardHeader>
        <CardContent>
          {trendLoading ? (
            <Skeleton className="h-40 w-full rounded-lg" />
          ) : days_arr.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-10">Belum ada data pesan</p>
          ) : (
            <div className="space-y-1.5">
              {days_arr.map((d) => {
                const sent = sentByDay[d] ?? 0;
                const failed = failedByDay[d] ?? 0;
                return (
                  <div key={d} className="flex items-center gap-3 text-xs">
                    <span className="w-16 text-muted-foreground shrink-0">{d}</span>
                    <div className="flex-1 relative h-5 flex items-center gap-1">
                      <div className="h-5 bg-blue-500 rounded-sm flex items-center px-1.5 text-white font-medium min-w-[2rem]"
                        style={{ width: `${Math.max(4, (sent / maxSent) * 100)}%` }}>
                        {sent}
                      </div>
                      {failed > 0 && (
                        <div className="h-5 bg-red-400 rounded-sm flex items-center px-1 text-white text-[10px]"
                          style={{ width: `${Math.max(2, (failed / maxSent) * 30)}%` }}>
                          {failed}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              <div className="flex gap-4 mt-3 pt-2 border-t text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-blue-500 inline-block" />Terkirim</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-red-400 inline-block" />Gagal</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Heatmap */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="w-4 h-4 text-purple-500" /> Heatmap Jam Sibuk (30 Hari)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {heatLoading ? (
            <Skeleton className="h-32 w-full rounded-lg" />
          ) : (
            <div className="overflow-x-auto">
              <div className="min-w-max">
                <div className="flex gap-1 mb-1 ml-10">
                  {HOURS.map((h) => (
                    <div key={h} className="w-5 text-[9px] text-muted-foreground text-center">{h.slice(0, 2)}</div>
                  ))}
                </div>
                {DAY_NAMES.map((day, dow) => (
                  <div key={day} className="flex items-center gap-1 mb-1">
                    <span className="w-8 text-[10px] text-muted-foreground text-right">{day}</span>
                    <div className="flex gap-1">
                      {Array.from({ length: 24 }, (_, hour) => {
                        const val = heatGrid[`${dow}-${hour}`] ?? 0;
                        return (
                          <div
                            key={hour}
                            className={`w-5 h-5 rounded-sm ${heatColor(val)} cursor-default`}
                            title={`${day} ${hour}:00 — ${val} pesan`}
                          />
                        );
                      })}
                    </div>
                  </div>
                ))}
                <div className="flex items-center gap-2 mt-3 text-[10px] text-muted-foreground ml-10">
                  <span>Rendah</span>
                  {["bg-muted", "bg-blue-200 dark:bg-blue-900", "bg-blue-400 dark:bg-blue-700", "bg-blue-600 dark:bg-blue-500", "bg-blue-800 dark:bg-blue-400"].map((c, i) => (
                    <div key={i} className={`w-4 h-4 rounded-sm ${c}`} />
                  ))}
                  <span>Tinggi</span>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Per-device stats */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-green-500" /> Performa per Perangkat (30 Hari)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {devLoading ? (
            <Skeleton className="h-32 w-full rounded-lg" />
          ) : !devicesStats?.length ? (
            <p className="text-center text-sm text-muted-foreground py-8">Belum ada perangkat</p>
          ) : (
            <div className="space-y-4">
              {devicesStats.map((d: any) => {
                const total = Number(d.sent) + Number(d.failed) + Number(d.pending);
                return (
                  <div key={d.id} className="space-y-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${d.status === "connected" ? "bg-green-500" : "bg-gray-400"}`} />
                        <span className="font-medium">{d.name}</span>
                        <span className="text-muted-foreground text-xs">{d.phone}</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs">
                        <span className="text-green-600 font-medium">{d.sent} terkirim</span>
                        <span className="text-red-500">{d.failed} gagal</span>
                        <Badge variant="outline" className="text-[10px] px-1.5">
                          {d.success_rate}% sukses
                        </Badge>
                      </div>
                    </div>
                    <div className="flex gap-1 h-2">
                      {total > 0 && (
                        <>
                          <div className="bg-green-500 rounded-full h-2" style={{ width: `${(Number(d.sent) / total) * 100}%` }} />
                          <div className="bg-red-400 rounded-full h-2" style={{ width: `${(Number(d.failed) / total) * 100}%` }} />
                          <div className="bg-yellow-400 rounded-full h-2" style={{ width: `${(Number(d.pending) / total) * 100}%` }} />
                        </>
                      )}
                      {total === 0 && <div className="bg-muted rounded-full h-2 w-full" />}
                    </div>
                  </div>
                );
              })}
              <div className="flex gap-4 text-[10px] text-muted-foreground pt-2 border-t">
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block" />Terkirim</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-red-400 inline-block" />Gagal</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-yellow-400 inline-block" />Pending</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

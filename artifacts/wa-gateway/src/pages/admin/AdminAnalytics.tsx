import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Users, Smartphone, MessageSquare, TrendingUp, DollarSign,
  UserPlus, RefreshCw, Crown, BarChart2, Activity,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { apiFetch } from "@/lib/api";
import { format, parseISO } from "date-fns";
import { id as localeId } from "date-fns/locale";

const PLAN_COLORS: Record<string, string> = {
  free: "bg-zinc-400",
  basic: "bg-blue-500",
  pro: "bg-emerald-500",
  enterprise: "bg-violet-500",
};
const PLAN_LABELS: Record<string, string> = {
  free: "Free", basic: "Basic", pro: "Pro", enterprise: "Enterprise",
};

function StatCard({ icon: Icon, label, value, sub, color, loading }: any) {
  return (
    <Card>
      <CardContent className="p-5 flex gap-4 items-start">
        <div className={`p-2.5 rounded-lg ${color}`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          {loading ? (
            <Skeleton className="h-7 w-20 mt-1" />
          ) : (
            <p className="text-2xl font-bold mt-0.5">{value}</p>
          )}
          {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

function MiniBar({ value, max, color = "bg-primary" }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <div className="w-full bg-muted rounded-full h-1.5 mt-1">
      <div className={`h-1.5 rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function fmtRevenue(amount: number) {
  if (amount <= 0) return "Rp 0";
  return `Rp ${amount.toLocaleString("id-ID")}`;
}

function buildDailyMap(rows: { day: string | Date; count: number }[], days = 30): { label: string; count: number }[] {
  const map = new Map<string, number>();
  for (const r of rows) {
    const key = typeof r.day === "string" ? r.day.slice(0, 10) : r.day.toISOString().slice(0, 10);
    map.set(key, Number(r.count));
  }
  const result: { label: string; count: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    const key = d.toISOString().slice(0, 10);
    result.push({ label: format(d, "dd/MM", { locale: localeId }), count: map.get(key) ?? 0 });
  }
  return result;
}

export default function AdminAnalytics() {
  const [refreshKey, setRefreshKey] = useState(0);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-analytics", refreshKey],
    queryFn: () => apiFetch("/admin/analytics").then((r) => r.json()),
    refetchInterval: 60000,
  });

  const stats = data?.stats;
  const userGrowth = buildDailyMap(data?.userGrowth ?? []);
  const msgTrend = buildDailyMap(data?.messageTrend ?? []);
  const planDist: { planId: string; count: number }[] = data?.planDistribution ?? [];
  const topUsers: any[] = data?.topUsers ?? [];

  const maxUserGrowth = Math.max(...userGrowth.map((d) => d.count), 1);
  const maxMsgTrend = Math.max(...msgTrend.map((d) => d.count), 1);
  const maxPlanCount = Math.max(...planDist.map((p) => p.count), 1);
  const totalPlanUsers = planDist.reduce((s, p) => s + p.count, 0);
  const maxMsgUser = Math.max(...topUsers.map((u) => u.messageCount), 1);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end">
        <Button variant="outline" size="sm" className="gap-2" onClick={() => setRefreshKey((k) => k + 1)}>
          <RefreshCw className="w-4 h-4" /> Refresh
        </Button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard icon={Users} label="Total Pengguna" value={stats?.totalUsers?.toLocaleString()} sub={`+${stats?.newUsersToday ?? 0} hari ini`} color="bg-blue-500" loading={isLoading} />
        <StatCard icon={UserPlus} label="Registrasi Baru" value={stats?.newUsersToday?.toLocaleString()} sub="Hari ini" color="bg-emerald-500" loading={isLoading} />
        <StatCard icon={Smartphone} label="Total Device" value={stats?.totalDevices?.toLocaleString()} sub="Semua user" color="bg-violet-500" loading={isLoading} />
        <StatCard icon={MessageSquare} label="Pesan Hari Ini" value={stats?.messagesToday?.toLocaleString()} sub="Semua user, semua device" color="bg-orange-500" loading={isLoading} />
        <StatCard icon={DollarSign} label="Revenue Bulan Ini" value={stats ? fmtRevenue(stats.revenueMonth) : "—"} sub="Transaksi paid" color="bg-amber-500" loading={isLoading} />
        <StatCard icon={TrendingUp} label="Total Revenue" value={stats ? fmtRevenue(stats.totalRevenue) : "—"} sub="Semua waktu" color="bg-rose-500" loading={isLoading} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Message trend chart */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart2 className="w-4 h-4 text-primary" />
              Volume Pesan (30 Hari)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-6 w-full" />)}
              </div>
            ) : (
              <div className="space-y-1.5">
                {msgTrend.filter((_, i) => i % 3 === 0 || i === msgTrend.length - 1).map((d) => (
                  <div key={d.label} className="flex items-center gap-2 text-xs">
                    <span className="w-10 text-muted-foreground shrink-0 text-right">{d.label}</span>
                    <div className="flex-1">
                      <div className="flex items-center gap-1.5">
                        <div className="flex-1 bg-muted rounded-full h-4 relative overflow-hidden">
                          <div
                            className="h-full rounded-full bg-primary/80 transition-all"
                            style={{ width: `${Math.max(2, Math.round((d.count / maxMsgTrend) * 100))}%` }}
                          />
                        </div>
                        <span className="text-muted-foreground w-8 text-right shrink-0">{d.count > 999 ? `${(d.count / 1000).toFixed(1)}k` : d.count}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* User growth chart */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-500" />
              Pertumbuhan User (30 Hari)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-6 w-full" />)}
              </div>
            ) : (
              <div className="space-y-1.5">
                {userGrowth.filter((_, i) => i % 3 === 0 || i === userGrowth.length - 1).map((d) => (
                  <div key={d.label} className="flex items-center gap-2 text-xs">
                    <span className="w-10 text-muted-foreground shrink-0 text-right">{d.label}</span>
                    <div className="flex-1">
                      <div className="flex items-center gap-1.5">
                        <div className="flex-1 bg-muted rounded-full h-4 relative overflow-hidden">
                          <div
                            className="h-full rounded-full bg-emerald-500/80 transition-all"
                            style={{ width: `${Math.max(2, Math.round((d.count / maxUserGrowth) * 100))}%` }}
                          />
                        </div>
                        <span className="text-muted-foreground w-6 text-right shrink-0">{d.count}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Plan distribution */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Crown className="w-4 h-4 text-amber-500" />
              Distribusi Paket
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)
            ) : planDist.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Belum ada data</p>
            ) : (
              planDist.map((p) => {
                const pct = totalPlanUsers > 0 ? Math.round((p.count / totalPlanUsers) * 100) : 0;
                const color = PLAN_COLORS[p.planId] ?? "bg-zinc-400";
                return (
                  <div key={p.planId} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <div className={`w-2.5 h-2.5 rounded-full ${color}`} />
                        <span className="font-medium">{PLAN_LABELS[p.planId] ?? p.planId}</span>
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <span>{p.count} user</span>
                        <Badge variant="outline" className="text-[10px] h-4 px-1">{pct}%</Badge>
                      </div>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2">
                      <div className={`h-2 rounded-full ${color} transition-all`} style={{ width: `${Math.max(2, pct)}%` }} />
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        {/* Top users */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="w-4 h-4 text-blue-500" />
              Top 10 User Paling Aktif
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)
            ) : topUsers.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Belum ada aktivitas</p>
            ) : (
              topUsers.map((u, idx) => (
                <div key={u.id} className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground w-5 text-right shrink-0">{idx + 1}</span>
                  <Avatar className="h-7 w-7 shrink-0">
                    <AvatarFallback className="text-[10px] bg-primary/10 text-primary font-bold">
                      {(u.name || u.email || "U").charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{u.name || u.email}</p>
                    <MiniBar value={u.messageCount} max={maxMsgUser} color={PLAN_COLORS[u.planId] ?? "bg-primary"} />
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs font-semibold">{u.messageCount.toLocaleString()}</p>
                    <p className="text-[10px] text-muted-foreground">{PLAN_LABELS[u.planId] ?? u.planId}</p>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

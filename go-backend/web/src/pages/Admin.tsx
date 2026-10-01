import { toast } from "sonner";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useSearch } from "wouter";
import {
  LayoutDashboard,
  Users,
  Package,
  Ticket,
  ReceiptText,
  Settings,
  BellRing,
  ScrollText,
  HeartPulse,
  Smartphone,
  MessageSquareText,
  Wallet,
  Plus,
  Pencil,
  Trash2,
  X,
  RefreshCw,
  Search,
  ChevronLeft,
  ChevronRight,
  Wrench,
  Send,
  Download,
  Eye,
  EyeOff,
  Copy,
  CreditCard,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { apiGet, apiPost, apiPut, apiDelete } from "@/lib/api";
import { useLang } from "@/lib/i18n";

/* ── Tipe data ──────────────────────────────────────── */

interface AdminUser {
  id: number;
  name: string;
  email: string;
  role: string;
  plan: string;
  status: string;
  createdAt: string;
}

interface Pkg {
  id: number;
  name: string;
  slug: string;
  price: number;
  duration: number;
  maxDevices: number;
  maxMessages: number;
  maxContacts: number;
  isActive: boolean;
}

interface Voucher {
  id: number;
  code: string;
  type: string;
  planId?: number | null;
  duration: number;
  discount: number;
  maxUses: number;
  usedCount: number;
  isActive: boolean;
  expiresAt?: string | null;
}

interface Txn {
  id: number;
  amount: number;
  status: string;
  createdAt: string;
  user: { name: string; email: string };
  plan: { name: string };
}

interface Analytics {
  totalUsers: number;
  totalDevices: number;
  totalMessages: number;
  totalRevenue: number;
}

interface TrendPoint {
  date: string;
  signups: number;
  revenue: number;
}

/* ── Helper ─────────────────────────────────────────── */

const fmtRp = (n: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n || 0);

const fmtNum = (n: number) => new Intl.NumberFormat("id-ID").format(n || 0);

const fmtDate = (s?: string | null) =>
  s ? new Date(s).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" }) : "-";

const PAGE_LIMIT = 50;

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const { t } = useLang();
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden />
      <div className="relative bg-card text-card-foreground rounded-xl border border-border shadow-lg w-full max-w-lg max-h-[90vh] overflow-y-auto p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold">{title}</h3>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose} aria-label={t("admin.closeModal")}>
            <X className="w-4 h-4" />
          </Button>
        </div>
        {children}
      </div>
    </div>
  );
}

import { Dropdown } from "@/components/ui/dropdown";

function Select({
  value,
  onChange,
  options,
  className,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <Dropdown
      value={value}
      onChange={onChange}
      options={options}
      className={className}
      ariaLabel={ariaLabel}
    />
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="text-xs font-medium text-foreground">{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function ErrorCard({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { t } = useLang();
  return (
    <Card>
      <CardContent className="p-6 text-center space-y-3">
        <p className="text-sm text-destructive">{message}</p>
        <Button size="sm" variant="outline" onClick={onRetry} className="gap-1.5">
          <RefreshCw className="w-3.5 h-3.5" /> {t("admin.retry")}
        </Button>
      </CardContent>
    </Card>
  );
}

function LoadingRows({ n = 3 }: { n?: number }) {
  return (
    <div className="space-y-3">
      {[0, 1, 2].map((i) =>
        i < n ? (
          <Card key={i}>
            <CardContent className="p-4">
              <div className="animate-pulse space-y-2">
                <div className="h-4 bg-secondary rounded w-1/3" />
                <div className="h-3 bg-secondary rounded w-1/2" />
              </div>
            </CardContent>
          </Card>
        ) : null
      )}
    </div>
  );
}

const errMsg = (e: unknown, fallback: string) =>
  e instanceof Error ? e.message : fallback;

/* ── Helper CSV ─────────────────────────────────────── */

const csvDate = () => new Date().toISOString().slice(0, 10);

const toCsv = (rows: (string | number | null | undefined)[][]) =>
  rows
    .map((r) =>
      r
        .map((v) => {
          const s = v === null || v === undefined ? "" : String(v);
          return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(",")
    )
    .join("\r\n");

const downloadCsv = (filename: string, rows: (string | number | null | undefined)[][]) => {
  const blob = new Blob(["\uFEFF" + toCsv(rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

const fmtDayShort = (iso: string) => {
  const d = new Date(iso + "T00:00:00");
  return isNaN(d.getTime()) ? iso : `${d.getDate()}/${d.getMonth() + 1}`;
};

/* ── Tab: Ringkasan ─────────────────────────────────── */

function OverviewTab() {
  const { t } = useLang();
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [maintenance, setMaintenance] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [trends, setTrends] = useState<TrendPoint[]>([]);

  const load = () => {
    setLoading(true);
    setError(null);
    Promise.all([
      apiGet<Analytics>("/admin/analytics"),
      apiGet<{ settings: Record<string, string> }>("/admin/settings").catch(() => ({
        settings: {} as Record<string, string>,
      })),
      apiGet<{ days: TrendPoint[] }>("/admin/trends?days=30").catch(() => ({
        days: [] as TrendPoint[],
      })),
    ])
      .then(([a, s, t]) => {
        setData(a);
        const v = s.settings?.["maintenance"] ?? s.settings?.["maintenance_mode"];
        setMaintenance(v === "true" || v === "1");
        setTrends(t.days || []);
      })
      .catch((e) => setError(errMsg(e, t("admin.errLoadOverview"))))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const toggleMaintenance = async () => {
    const next = !maintenance;
    setToggling(true);
    try {
      await apiPut("/admin/maintenance", { enabled: next });
      setMaintenance(next);
      toast.success(next ? t("admin.maintenanceOn") : t("admin.maintenanceOff"));
    } catch (e) {
      toast.error(errMsg(e, t("admin.errMaintenance")));
    } finally {
      setToggling(false);
    }
  };

  const stats = [
    { icon: Users, label: t("admin.statUsers"), value: fmtNum(data?.totalUsers ?? 0), tint: "bg-[#243370]/10 text-[#243370] dark:text-[#8fa0e8]" },
    { icon: Smartphone, label: t("admin.statDevices"), value: fmtNum(data?.totalDevices ?? 0), tint: "bg-violet-500/10 text-violet-600" },
    { icon: MessageSquareText, label: t("admin.statMessages"), value: fmtNum(data?.totalMessages ?? 0), tint: "bg-emerald-500/10 text-emerald-600" },
    { icon: Wallet, label: t("admin.statRevenue"), value: fmtRp(data?.totalRevenue ?? 0), tint: "bg-amber-500/10 text-amber-600" },
  ];

  return (
    <div className="space-y-6">
      {loading && <LoadingRows n={2} />}
      {!loading && error && <ErrorCard message={error} onRetry={load} />}
      {!loading && !error && data && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {stats.map((s) => (
              <Card key={s.label}>
                <CardContent className="p-4 flex items-center gap-3">
                  <div className={`w-10 h-10 shrink-0 rounded-lg flex items-center justify-center ${s.tint}`}>
                    <s.icon className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">{s.label}</p>
                    <p className="text-lg font-bold text-foreground truncate">{s.value}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardContent className="p-4">
                <p className="text-sm font-semibold text-foreground mb-3">{t("admin.newUsersPerDay")}</p>
                {trends.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-10 text-center">{t("admin.noTrendData")}</p>
                ) : (
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={trends} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis
                          dataKey="date"
                          tickFormatter={fmtDayShort}
                          tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                          axisLine={false}
                          tickLine={false}
                          interval="preserveStartEnd"
                        />
                        <YAxis
                          allowDecimals={false}
                          tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                          axisLine={false}
                          tickLine={false}
                          width={36}
                        />
                        <Tooltip
                          labelFormatter={(d) => fmtDayShort(String(d))}
                          formatter={(value) => [fmtNum(Number(value)), t("admin.chartUsers")]}
                          contentStyle={{ borderRadius: 8, fontSize: 12 }}
                        />
                        <Bar dataKey="signups" name={t("admin.chartUsers")} fill="#243370" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-sm font-semibold text-foreground mb-3">{t("admin.revenuePerDay")}</p>
                {trends.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-10 text-center">{t("admin.noTrendData")}</p>
                ) : (
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={trends} margin={{ top: 4, right: 8, left: -4, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis
                          dataKey="date"
                          tickFormatter={fmtDayShort}
                          tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                          axisLine={false}
                          tickLine={false}
                          interval="preserveStartEnd"
                        />
                        <YAxis
                          tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}rb` : `${v}`)}
                          tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                          axisLine={false}
                          tickLine={false}
                          width={44}
                        />
                        <Tooltip
                          labelFormatter={(d) => fmtDayShort(String(d))}
                          formatter={(value) => [fmtRp(Number(value)), t("admin.chartRevenue")]}
                          contentStyle={{ borderRadius: 8, fontSize: 12 }}
                        />
                        <Area
                          type="monotone"
                          dataKey="revenue"
                          name={t("admin.chartRevenue")}
                          stroke="#059669"
                          strokeWidth={2}
                          fill="#059669"
                          fillOpacity={0.15}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card className={maintenance ? "border-amber-500/50" : ""}>
            <CardContent className="p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${maintenance ? "bg-amber-500/10 text-amber-600" : "bg-secondary text-muted-foreground"}`}>
                  <Wrench className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">{t("admin.maintenanceTitle")}</p>
                  <p className="text-xs text-muted-foreground">
                    {maintenance ? t("admin.maintenanceOnDesc") : t("admin.maintenanceOffDesc")}
                  </p>
                </div>
              </div>
              <Button
                size="sm"
                variant={maintenance ? "destructive" : "outline"}
                onClick={toggleMaintenance}
                disabled={toggling}
              >
                {toggling ? t("admin.processing") : maintenance ? t("admin.turnOff") : t("admin.turnOn")}
              </Button>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

/* ── Tab: Pengguna ──────────────────────────────────── */

function statusBadge(t: (k: string) => string, s: string) {
  if (s === "active") return <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">{t("admin.statusActive")}</Badge>;
  if (s === "suspended") return <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20">Suspended</Badge>;
  return <Badge variant="destructive">Banned</Badge>;
}

function UsersTab() {
  const { t } = useLang();
  const ROLE_OPTS = [
    { value: "user", label: "User" },
    { value: "admin", label: "Admin" },
  ];
  const PLAN_OPTS = [
    { value: "free", label: "Free" },
    { value: "lite", label: "Lite" },
    { value: "regular", label: "Regular" },
    { value: "pro", label: "Pro" },
    { value: "master", label: "Master" },
  ];
  const STATUS_OPTS = [
    { value: "active", label: t("admin.statusActive") },
    { value: "suspended", label: "Suspended" },
    { value: "banned", label: "Banned" },
  ];
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<AdminUser | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "user", plan: "free" });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const openForm = () => {
    setForm({ name: "", email: "", password: "", role: "user", plan: "free" });
    setShowForm(true);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.password.length < 6) {
      toast.error(t("admin.errPasswordShort"));
      return;
    }
    setCreating(true);
    try {
      await apiPost("/admin/users", form);
      toast.success(t("admin.userAdded"));
      setShowForm(false);
      load(1, search);
      setPage(1);
    } catch (err) {
      toast.error(errMsg(err, t("admin.errAddUser")));
    } finally {
      setCreating(false);
    }
  };

  const load = (p = page, q = search) => {
    setLoading(true);
    setError(null);
    apiGet<{ users: AdminUser[]; total: number }>(
      `/admin/users?search=${encodeURIComponent(q)}&page=${p}&limit=${PAGE_LIMIT}`
    )
      .then((res) => {
        setUsers(res.users || []);
        setTotal(res.total || 0);
      })
      .catch((e) => setError(errMsg(e, t("admin.errLoadUsers"))))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load(1, search);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  useEffect(() => {
    load(page, search);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const doSearch = () => {
    setPage(1);
    setSearch(searchInput.trim());
  };

  const updateField = async (u: AdminUser, field: "role" | "plan" | "status", value: string) => {
    try {
      // backend memakai map mentah ke GORM: kirim snake_case agar kolom cocok
      await apiPut(`/admin/users/${u.id}`, { [field]: value });
      setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, [field]: value } : x)));
      toast.success(t("admin.userUpdated").replace("{email}", u.email));
    } catch (e) {
      toast.error(errMsg(e, t("admin.errUpdateUser")));
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setDeletingBusy(true);
    try {
      await apiDelete(`/admin/users/${deleting.id}`);
      toast.success(t("admin.userDeleted"));
      setDeleting(null);
      load();
    } catch (e) {
      toast.error(errMsg(e, t("admin.errDeleteUser")));
    } finally {
      setDeletingBusy(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_LIMIT));

  const exportCsv = async () => {
    try {
      const res = await apiGet<{ users: AdminUser[] }>("/admin/users?limit=1000&page=1");
      const rows: (string | number | null | undefined)[][] = [
        ["id", "name", "email", "role", "plan", "status", "createdAt"],
        ...(res.users || []).map((u) => [u.id, u.name, u.email, u.role, u.plan, u.status, u.createdAt]),
      ];
      downloadCsv(`pengguna-${csvDate()}.csv`, rows);
      toast.success(t("admin.userCsvDownloaded"));
    } catch (e) {
      toast.error(errMsg(e, t("admin.errExportCsv")));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder={t("admin.searchUsersPlaceholder")}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && doSearch()}
          />
        </div>
        <Button size="sm" variant="outline" onClick={doSearch} className="h-10">
          {t("admin.search")}
        </Button>
        <Button size="sm" variant="outline" onClick={exportCsv} className="h-10 gap-1.5">
          <Download className="w-4 h-4" /> {t("admin.exportCsv")}
        </Button>
        <Button size="sm" onClick={openForm} className="h-10 gap-1.5">
          <Plus className="w-4 h-4" /> {t("admin.addUser")}
        </Button>
      </div>

      {loading && <LoadingRows />}
      {!loading && error && <ErrorCard message={error} onRetry={() => load()} />}

      {!loading && !error && (
        <>
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[760px]">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="p-3 font-medium">{t("admin.colUser")}</th>
                    <th className="p-3 font-medium">{t("admin.colRole")}</th>
                    <th className="p-3 font-medium">{t("admin.colPlan")}</th>
                    <th className="p-3 font-medium">{t("admin.colStatus")}</th>
                    <th className="p-3 font-medium">{t("admin.colRegistered")}</th>
                    <th className="p-3 font-medium text-right">{t("admin.colActions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className="border-b border-border last:border-0">
                      <td className="p-3">
                        <p className="font-medium text-foreground truncate max-w-[220px]">{u.name}</p>
                        <p className="text-xs text-muted-foreground truncate max-w-[220px]">{u.email}</p>
                      </td>
                      <td className="p-3">
                        <Select value={u.role} onChange={(v) => updateField(u, "role", v)} options={ROLE_OPTS} ariaLabel={t("admin.changeRole")} />
                      </td>
                      <td className="p-3">
                        <Select value={u.plan} onChange={(v) => updateField(u, "plan", v)} options={PLAN_OPTS} ariaLabel={t("admin.changePlan")} />
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <Select value={u.status} onChange={(v) => updateField(u, "status", v)} options={STATUS_OPTS} ariaLabel={t("admin.changeStatus")} />
                          {statusBadge(t, u.status)}
                        </div>
                      </td>
                      <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">{fmtDate(u.createdAt)}</td>
                      <td className="p-3 text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive"
                          onClick={() => setDeleting(u)}
                          aria-label={t("admin.deleteUser")}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {users.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-sm text-muted-foreground">
                        {t("admin.noUsersFound")}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <p>
              {t("admin.usersPageInfo")
                .replace("{total}", String(total))
                .replace("{page}", String(page))
                .replace("{totalPages}", String(totalPages))}
            </p>
            <div className="flex gap-1">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)} className="gap-1">
                <ChevronLeft className="w-3.5 h-3.5" /> {t("admin.prevPage")}
              </Button>
              <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage(page + 1)} className="gap-1">
                {t("admin.nextPage")} <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        </>
      )}

      {showForm && (
        <Modal title={t("admin.addUserTitle")} onClose={() => setShowForm(false)}>
          <form onSubmit={handleCreate} className="space-y-3">
            <div>
              <label className="text-sm font-medium text-foreground">{t("admin.nameLabel")}</label>
              <Input value={form.name} onChange={set("name")} required className="mt-1" placeholder={t("admin.fullNamePlaceholder")} />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">{t("admin.emailLabel")}</label>
              <Input type="email" value={form.email} onChange={set("email")} required className="mt-1" placeholder="email@contoh.com" />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">{t("admin.passwordLabel")}</label>
              <Input type="password" value={form.password} onChange={set("password")} required className="mt-1" placeholder={t("admin.passwordPlaceholder")} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-foreground block">{t("admin.roleLabel")}</label>
                <Select value={form.role} onChange={(v) => setForm((f) => ({ ...f, role: v }))} options={ROLE_OPTS} ariaLabel={t("admin.roleLabel")} className="mt-1 w-full" />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground block">{t("admin.planLabel")}</label>
                <Select value={form.plan} onChange={(v) => setForm((f) => ({ ...f, plan: v }))} options={PLAN_OPTS} ariaLabel={t("admin.planLabel")} className="mt-1 w-full" />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setShowForm(false)}>
                {t("admin.cancel")}
              </Button>
              <Button type="submit" size="sm" disabled={creating}>
                {creating ? t("admin.saving") : t("admin.save")}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {deleting && (
        <Modal title={t("admin.deleteUserTitle")} onClose={() => setDeleting(null)}>
          <p className="text-sm text-muted-foreground">
            {t("admin.deleteUserBody1")} <b className="text-foreground">{deleting.email}</b>{t("admin.deleteUserBody2")}
          </p>
          <div className="flex justify-end gap-2 mt-5">
            <Button variant="outline" size="sm" onClick={() => setDeleting(null)}>
              {t("admin.cancel")}
            </Button>
            <Button size="sm" variant="destructive" onClick={handleDelete} disabled={deletingBusy}>
              {deletingBusy ? t("admin.deleting") : t("admin.delete")}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ── Tab: Paket ─────────────────────────────────────── */

const emptyPkg = { name: "", slug: "", price: "", duration: "30", maxDevices: "1", maxMessages: "1000", maxContacts: "100", isActive: true };

function PackagesTab() {
  const { t } = useLang();
  const [pkgs, setPkgs] = useState<Pkg[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Pkg | null>(null);
  const [form, setForm] = useState(emptyPkg);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<Pkg | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);

  const load = () => {
    setLoading(true);
    setError(null);
    apiGet<{ packages: Pkg[] }>("/admin/packages")
      .then((res) => setPkgs(res.packages || []))
      .catch((e) => setError(errMsg(e, t("admin.errLoadPackages"))))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const set = (k: keyof typeof emptyPkg, v: string | boolean) =>
    setForm((f) => ({ ...f, [k]: v }));

  const openAdd = () => {
    setForm(emptyPkg);
    setEditing(null);
    setShowForm(true);
  };

  const openEdit = (p: Pkg) => {
    setForm({
      name: p.name,
      slug: p.slug,
      price: String(p.price),
      duration: String(p.duration),
      maxDevices: String(p.maxDevices),
      maxMessages: String(p.maxMessages),
      maxContacts: String(p.maxContacts),
      isActive: p.isActive,
    });
    setEditing(p);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.slug.trim()) {
      toast.error(t("admin.errPackageNameSlug"));
      return;
    }
    setSaving(true);
    try {
      const body = {
        name: form.name.trim(),
        slug: form.slug.trim(),
        price: Number(form.price) || 0,
        duration: Number(form.duration) || 30,
        max_devices: Number(form.maxDevices) || 1,
        max_messages: Number(form.maxMessages) || 0,
        max_contacts: Number(form.maxContacts) || 0,
        is_active: form.isActive,
      };
      if (editing) {
        await apiPut(`/admin/packages/${editing.id}`, body);
        toast.success(t("admin.packageUpdated"));
      } else {
        await apiPost("/admin/packages", body);
        toast.success(t("admin.packageAdded"));
      }
      setShowForm(false);
      load();
    } catch (e) {
      toast.error(errMsg(e, t("admin.errSavePackage")));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setDeletingBusy(true);
    try {
      await apiDelete(`/admin/packages/${deleting.id}`);
      toast.success(t("admin.packageDeleted"));
      setDeleting(null);
      load();
    } catch (e) {
      toast.error(errMsg(e, t("admin.errDeletePackage")));
    } finally {
      setDeletingBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" className="gap-1.5" onClick={openAdd}>
          <Plus className="w-3.5 h-3.5" /> {t("admin.addPackage")}
        </Button>
      </div>

      {loading && <LoadingRows />}
      {!loading && error && <ErrorCard message={error} onRetry={load} />}

      {!loading && !error && (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[820px]">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="p-3 font-medium">{t("admin.colPlan")}</th>
                  <th className="p-3 font-medium">{t("admin.colPrice")}</th>
                  <th className="p-3 font-medium">{t("admin.colDuration")}</th>
                  <th className="p-3 font-medium">{t("admin.colLimit")}</th>
                  <th className="p-3 font-medium">{t("admin.colStatus")}</th>
                  <th className="p-3 font-medium text-right">{t("admin.colActions")}</th>
                </tr>
              </thead>
              <tbody>
                {pkgs.map((p) => (
                  <tr key={p.id} className="border-b border-border last:border-0">
                    <td className="p-3">
                      <p className="font-medium text-foreground">{p.name}</p>
                      <p className="text-xs text-muted-foreground font-mono">{p.slug}</p>
                    </td>
                    <td className="p-3 font-medium text-foreground whitespace-nowrap">{fmtRp(p.price)}</td>
                    <td className="p-3 text-muted-foreground whitespace-nowrap">{t("admin.daysCount").replace("{count}", String(p.duration))}</td>
                    <td className="p-3 text-xs text-muted-foreground">
                      {t("admin.packageLimits")
                          .replace("{devices}", String(fmtNum(p.maxDevices)))
                          .replace("{messages}", String(fmtNum(p.maxMessages)))
                          .replace("{contacts}", String(fmtNum(p.maxContacts)))}
                    </td>
                    <td className="p-3">
                      {p.isActive ? (
                        <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">{t("admin.statusActive")}</Badge>
                      ) : (
                        <Badge variant="outline">{t("admin.statusInactive")}</Badge>
                      )}
                    </td>
                    <td className="p-3 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(p)} aria-label={t("admin.editPackage")}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleting(p)} aria-label={t("admin.deletePackage")}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {pkgs.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-sm text-muted-foreground">
                      {t("admin.noPackages")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {showForm && (
        <Modal title={editing ? t("admin.editPackageTitle") : t("admin.addPackageTitle")} onClose={() => setShowForm(false)}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("admin.packageNameLabel")}>
                <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Regular" />
              </Field>
              <Field label={t("admin.slugLabel")}>
                <Input value={form.slug} onChange={(e) => set("slug", e.target.value)} placeholder="regular" />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("admin.priceLabel")}>
                <Input type="number" min="0" value={form.price} onChange={(e) => set("price", e.target.value)} placeholder="66000" />
              </Field>
              <Field label={t("admin.durationLabel")}>
                <Input type="number" min="1" value={form.duration} onChange={(e) => set("duration", e.target.value)} />
              </Field>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Field label={t("admin.maxDevicesLabel")}>
                <Input type="number" min="1" value={form.maxDevices} onChange={(e) => set("maxDevices", e.target.value)} />
              </Field>
              <Field label={t("admin.maxMessagesLabel")}>
                <Input type="number" min="0" value={form.maxMessages} onChange={(e) => set("maxMessages", e.target.value)} />
              </Field>
              <Field label={t("admin.maxContactsLabel")}>
                <Input type="number" min="0" value={form.maxContacts} onChange={(e) => set("maxContacts", e.target.value)} />
              </Field>
            </div>
            <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
              <input type="checkbox" checked={form.isActive} onChange={(e) => set("isActive", e.target.checked)} className="w-4 h-4 accent-primary" />
              {t("admin.packageActiveLabel")}
            </label>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowForm(false)}>
                {t("admin.cancel")}
              </Button>
              <Button size="sm" onClick={handleSave} disabled={saving}>
                {saving ? t("admin.saving") : t("admin.save")}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {deleting && (
        <Modal title={t("admin.deletePackageTitle")} onClose={() => setDeleting(null)}>
          <p className="text-sm text-muted-foreground">
            {t("admin.deletePackageBody1")} <b className="text-foreground">{deleting.name}</b>{t("admin.deletePackageBody2")}
          </p>
          <div className="flex justify-end gap-2 mt-5">
            <Button variant="outline" size="sm" onClick={() => setDeleting(null)}>
              {t("admin.cancel")}
            </Button>
            <Button size="sm" variant="destructive" onClick={handleDelete} disabled={deletingBusy}>
              {deletingBusy ? t("admin.deleting") : t("admin.delete")}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ── Tab: Voucher ───────────────────────────────────── */

function VouchersTab() {
  const { t } = useLang();
  const VOUCHER_TYPES = [
    { value: "trial", label: "Trial" },
    { value: "discount", label: t("admin.voucherDiscount") },
    { value: "plan", label: t("admin.voucherPackage") },
  ];
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [code, setCode] = useState("");
  const [type, setType] = useState("trial");
  const [planId, setPlanId] = useState("");
  const [duration, setDuration] = useState("7");
  const [discount, setDiscount] = useState("0");
  const [maxUses, setMaxUses] = useState("100");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<Voucher | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);

  const load = () => {
    setLoading(true);
    setError(null);
    apiGet<{ vouchers: Voucher[] }>("/admin/vouchers")
      .then((res) => setVouchers(res.vouchers || []))
      .catch((e) => setError(errMsg(e, t("admin.errLoadVouchers"))))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const resetForm = () => {
    setCode("");
    setType("trial");
    setPlanId("");
    setDuration("7");
    setDiscount("0");
    setMaxUses("100");
  };

  const handleAdd = async () => {
    if (!code.trim()) {
      toast.error(t("admin.errVoucherCode"));
      return;
    }
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        code: code.trim().toUpperCase(),
        type,
        duration: Number(duration) || 0,
        discount: Number(discount) || 0,
        max_uses: Number(maxUses) || 1,
      };
      if (type === "plan" && planId.trim()) body.plan_id = Number(planId);
      await apiPost("/admin/vouchers", body);
      toast.success(t("admin.voucherCreated"));
      setShowForm(false);
      resetForm();
      load();
    } catch (e) {
      toast.error(errMsg(e, t("admin.errCreateVoucher")));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setDeletingBusy(true);
    try {
      await apiDelete(`/admin/vouchers/${deleting.id}`);
      toast.success(t("admin.voucherDeleted"));
      setDeleting(null);
      load();
    } catch (e) {
      toast.error(errMsg(e, t("admin.errDeleteVoucher")));
    } finally {
      setDeletingBusy(false);
    }
  };

  const typeLabel = (tv: string) => VOUCHER_TYPES.find((x) => x.value === tv)?.label || tv;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" className="gap-1.5" onClick={() => setShowForm(true)}>
          <Plus className="w-3.5 h-3.5" /> {t("admin.addVoucher")}
        </Button>
      </div>

      {loading && <LoadingRows />}
      {!loading && error && <ErrorCard message={error} onRetry={load} />}

      {!loading && !error && (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[760px]">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="p-3 font-medium">{t("admin.colCode")}</th>
                  <th className="p-3 font-medium">{t("admin.colType")}</th>
                  <th className="p-3 font-medium">{t("admin.colDuration")}</th>
                  <th className="p-3 font-medium">{t("admin.colDiscount")}</th>
                  <th className="p-3 font-medium">{t("admin.colUsed")}</th>
                  <th className="p-3 font-medium">{t("admin.colExpires")}</th>
                  <th className="p-3 font-medium">{t("admin.colStatus")}</th>
                  <th className="p-3 font-medium text-right">{t("admin.colActions")}</th>
                </tr>
              </thead>
              <tbody>
                {vouchers.map((v) => (
                  <tr key={v.id} className="border-b border-border last:border-0">
                    <td className="p-3 font-mono font-semibold text-foreground">{v.code}</td>
                    <td className="p-3">
                      <Badge variant="outline">{typeLabel(v.type)}</Badge>
                    </td>
                    <td className="p-3 text-muted-foreground whitespace-nowrap">{t("admin.daysCount").replace("{count}", String(v.duration))}</td>
                    <td className="p-3 text-muted-foreground">{t("admin.discountPct").replace("{pct}", String(v.discount))}</td>
                    <td className="p-3 text-muted-foreground whitespace-nowrap">
                      {fmtNum(v.usedCount)} / {fmtNum(v.maxUses)}
                    </td>
                    <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">{fmtDate(v.expiresAt)}</td>
                    <td className="p-3">
                      {v.isActive ? (
                        <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">{t("admin.statusActive")}</Badge>
                      ) : (
                        <Badge variant="outline">{t("admin.statusInactive")}</Badge>
                      )}
                    </td>
                    <td className="p-3 text-right">
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleting(v)} aria-label={t("admin.deleteVoucher")}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
                {vouchers.length === 0 && (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-sm text-muted-foreground">
                      {t("admin.noVouchers")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {showForm && (
        <Modal title={t("admin.addVoucherTitle")} onClose={() => setShowForm(false)}>
          <div className="space-y-4">
            <Field label={t("admin.voucherCodeLabel")}>
              <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="cth: HEMAT50" className="font-mono uppercase" />
            </Field>
            <Field label={t("admin.typeLabel")}>
              <Select value={type} onChange={setType} options={VOUCHER_TYPES} className="h-10 w-full text-sm" ariaLabel={t("admin.voucherTypeAria")} />
            </Field>
            {type === "plan" && (
              <Field label={t("admin.packageIdLabel")}>
                <Input type="number" min="1" value={planId} onChange={(e) => setPlanId(e.target.value)} placeholder="cth: 3" />
              </Field>
            )}
            <div className="grid grid-cols-3 gap-3">
              <Field label={t("admin.durationLabel")}>
                <Input type="number" min="0" value={duration} onChange={(e) => setDuration(e.target.value)} />
              </Field>
              <Field label={t("admin.discountLabel")}>
                <Input type="number" min="0" max="100" value={discount} onChange={(e) => setDiscount(e.target.value)} />
              </Field>
              <Field label={t("admin.maxUsesLabel")}>
                <Input type="number" min="1" value={maxUses} onChange={(e) => setMaxUses(e.target.value)} />
              </Field>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowForm(false)}>
                {t("admin.cancel")}
              </Button>
              <Button size="sm" onClick={handleAdd} disabled={saving}>
                {saving ? t("admin.saving") : t("admin.save")}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {deleting && (
        <Modal title={t("admin.deleteVoucherTitle")} onClose={() => setDeleting(null)}>
          <p className="text-sm text-muted-foreground">
            {t("admin.deleteVoucherBody1")} <b className="text-foreground font-mono">{deleting.code}</b>{t("admin.deleteVoucherBody2")}
          </p>
          <div className="flex justify-end gap-2 mt-5">
            <Button variant="outline" size="sm" onClick={() => setDeleting(null)}>
              {t("admin.cancel")}
            </Button>
            <Button size="sm" variant="destructive" onClick={handleDelete} disabled={deletingBusy}>
              {deletingBusy ? t("admin.deleting") : t("admin.delete")}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ── Tab: Transaksi ─────────────────────────────────── */

function txnBadge(t: (k: string) => string, s: string) {
  const v = s.toLowerCase();
  if (v === "paid" || v === "success" || v === "settlement")
    return <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">{t("admin.txnSuccess")}</Badge>;
  if (v === "pending")
    return <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20">{t("admin.txnPending")}</Badge>;
  if (v === "expired" || v === "cancel" || v === "deny" || v === "failed")
    return <Badge variant="destructive">{t("admin.txnFailed")}</Badge>;
  return <Badge variant="outline">{s}</Badge>;
}

function TransactionsTab() {
  const { t } = useLang();
  const [txns, setTxns] = useState<Txn[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = (p = page, status = statusFilter) => {
    setLoading(true);
    setError(null);
    const q = new URLSearchParams({ page: String(p), limit: String(PAGE_LIMIT) });
    if (status) q.set("status", status);
    apiGet<{ transactions: Txn[]; total: number }>(`/admin/transactions?${q}`)
      .then((res) => {
        setTxns(res.transactions || []);
        setTotal(res.total || 0);
      })
      .catch((e) => setError(errMsg(e, t("admin.errLoadTransactions"))))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load(page, statusFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_LIMIT));

  const exportCsv = async () => {
    try {
      const q = new URLSearchParams({ page: "1", limit: "1000" });
      if (statusFilter) q.set("status", statusFilter);
      const res = await apiGet<{ transactions: Txn[] }>(`/admin/transactions?${q}`);
      const rows: (string | number | null | undefined)[][] = [
        ["id", t("admin.csvDate"), t("admin.csvName"), "email", t("admin.csvPackage"), "amount", "status"],
        ...(res.transactions || []).map((x) => [
          x.id,
          x.createdAt,
          x.user?.name || "",
          x.user?.email || "",
          x.plan?.name || "",
          x.amount,
          x.status,
        ]),
      ];
      downloadCsv(`transaksi-${csvDate()}.csv`, rows);
      toast.success(t("admin.txnCsvDownloaded"));
    } catch (e) {
      toast.error(errMsg(e, t("admin.errExportCsv")));
    }
  };

  const TXN_STATUS_OPTS = [
    { value: "", label: t("admin.allStatuses") },
    { value: "pending", label: t("admin.txnPending") },
    { value: "paid", label: t("admin.txnSuccess") },
    { value: "failed", label: t("admin.txnFailed") },
    { value: "expired", label: t("admin.txnExpired") },
    { value: "cancel", label: t("admin.txnCancelled") },
  ];

  return (
    <div className="space-y-4">
      <div className="flex justify-between gap-2 flex-wrap">
        <Select
          value={statusFilter}
          onChange={(v) => {
            setPage(1);
            setStatusFilter(v);
          }}
          options={TXN_STATUS_OPTS}
          ariaLabel={t("admin.filterTxnStatus")}
          className="w-44"
        />
        <Button size="sm" variant="outline" onClick={exportCsv} className="gap-1.5">
          <Download className="w-4 h-4" /> {t("admin.exportCsv")}
        </Button>
      </div>
      {loading && <LoadingRows />}
      {!loading && error && <ErrorCard message={error} onRetry={() => load()} />}

      {!loading && !error && (
        <>
          <Card className="hidden md:block">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[720px]">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="p-3 font-medium">ID</th>
                    <th className="p-3 font-medium">{t("admin.colUser")}</th>
                    <th className="p-3 font-medium">{t("admin.colPlan")}</th>
                    <th className="p-3 font-medium">{t("admin.colAmount")}</th>
                    <th className="p-3 font-medium">{t("admin.colStatus")}</th>
                    <th className="p-3 font-medium">{t("admin.colDate")}</th>
                  </tr>
                </thead>
                <tbody>
                  {txns.map((x) => (
                    <tr key={x.id} className="border-b border-border last:border-0">
                      <td className="p-3 font-mono text-xs text-muted-foreground">#{x.id}</td>
                      <td className="p-3">
                        <p className="font-medium text-foreground truncate max-w-[200px]">{x.user?.name || "-"}</p>
                        <p className="text-xs text-muted-foreground truncate max-w-[200px]">{x.user?.email || ""}</p>
                      </td>
                      <td className="p-3 text-muted-foreground">{x.plan?.name || "-"}</td>
                      <td className="p-3 font-semibold text-foreground whitespace-nowrap">{fmtRp(x.amount)}</td>
                      <td className="p-3">{txnBadge(t, x.status)}</td>
                      <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">{fmtDate(x.createdAt)}</td>
                    </tr>
                  ))}
                  {txns.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-sm text-muted-foreground">
                        {t("admin.noTransactions")}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
          {/* Daftar mobile — flat tanpa card per item, cuma divider */}
          <div className="md:hidden rounded-xl border border-border bg-card divide-y divide-border">
            {txns.map((x) => (
              <div key={x.id} className="px-3 py-2.5 flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-[11px] text-muted-foreground shrink-0">#{x.id}</span>
                    <p className="text-sm font-semibold text-foreground">{fmtRp(x.amount)}</p>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground truncate">
                    {x.user?.name || x.user?.email || "-"}
                    {x.plan?.name ? ` · ${x.plan.name}` : ""} · {fmtDate(x.createdAt)}
                  </p>
                </div>
                <div className="shrink-0">{txnBadge(t, x.status)}</div>
              </div>
            ))}
            {txns.length === 0 && (
              <p className="p-8 text-center text-sm text-muted-foreground">{t("admin.noTransactions")}</p>
            )}
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <p>
              {t("admin.txnPageInfo")
                .replace("{total}", String(total))
                .replace("{page}", String(page))
                .replace("{totalPages}", String(totalPages))}
            </p>
            <div className="flex gap-1">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)} className="gap-1">
                <ChevronLeft className="w-3.5 h-3.5" /> {t("admin.prevPage")}
              </Button>
              <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage(page + 1)} className="gap-1">
                {t("admin.nextPage")} <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ── Tab: Pengaturan ────────────────────────────────── */

interface SettingRow {
  key: string;
  value: string;
}

interface KnownSetting {
  key: string;
  label: string;
  desc: string;
  type: "text" | "number" | "toggle" | "select" | "password";
  def: string;
  options?: { value: string; label: string }[];
  group?: "general" | "gateway" | "oauth";
}

function SettingsTab() {
  const { t } = useLang();
  const PLAN_OPTS = [
    { value: "free", label: "Free" },
    { value: "lite", label: "Lite" },
    { value: "regular", label: "Regular" },
    { value: "pro", label: "Pro" },
    { value: "master", label: "Master" },
  ];
  const KNOWN_SETTINGS: KnownSetting[] = [
    {
      key: "site_name",
      label: t("admin.settingSiteNameLabel"),
      desc: t("admin.settingSiteNameDesc"),
      type: "text",
      def: "WaGataway",
    },
    {
      key: "support_email",
      label: t("admin.settingSupportEmailLabel"),
      desc: t("admin.settingSupportEmailDesc"),
      type: "text",
      def: "",
    },
    {
      key: "support_whatsapp",
      label: t("admin.settingSupportWaLabel"),
      desc: t("admin.settingSupportWaDesc"),
      type: "text",
      def: "",
    },
    {
      key: "registration_enabled",
      label: t("admin.settingRegistrationLabel"),
      desc: t("admin.settingRegistrationDesc"),
      type: "toggle",
      def: "true",
    },
    {
      key: "default_plan",
      label: t("admin.settingDefaultPlanLabel"),
      desc: t("admin.settingDefaultPlanDesc"),
      type: "select",
      def: "free",
      options: PLAN_OPTS,
    },
    {
      key: "max_devices_per_user",
      label: t("admin.settingMaxDevicesLabel"),
      desc: t("admin.settingMaxDevicesDesc"),
      type: "number",
      def: "5",
      group: "general",
    },
    {
      key: "clipkupay_api_key",
      label: t("admin.settingClipkuApiKeyLabel"),
      desc: t("admin.settingClipkuApiKeyDesc"),
      type: "password",
      def: "",
      group: "gateway",
    },
    {
      key: "clipkupay_webhook_url",
      label: t("admin.settingWebhookUrlLabel"),
      desc: t("admin.settingWebhookUrlDesc"),
      type: "text",
      def: "https://wa.clipku.com/api/billing/clipkupay/webhook",
      group: "gateway",
    },
    {
      key: "google_client_id",
      label: t("admin.settingGoogleClientIdLabel"),
      desc: t("admin.settingGoogleClientIdDesc"),
      type: "text",
      def: "",
      group: "oauth",
    },
    {
      key: "google_client_secret",
      label: t("admin.settingGoogleClientSecretLabel"),
      desc: t("admin.settingGoogleClientSecretDesc"),
      type: "password",
      def: "",
      group: "oauth",
    },
    {
      key: "github_client_id",
      label: t("admin.settingGithubClientIdLabel"),
      desc: t("admin.settingGithubClientIdDesc"),
      type: "text",
      def: "",
      group: "oauth",
    },
    {
      key: "github_client_secret",
      label: t("admin.settingGithubClientSecretLabel"),
      desc: t("admin.settingGithubClientSecretDesc"),
      type: "password",
      def: "",
      group: "oauth",
    },
  ];
  const [values, setValues] = useState<Record<string, string>>({});
  const [customRows, setCustomRows] = useState<SettingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [maskedKeys, setMaskedKeys] = useState<Record<string, boolean>>({});
  const [gateway, setGateway] = useState<{
    mode: string;
    webhook_url: string;
    has_api_key: boolean;
  } | null>(null);
  const [testing, setTesting] = useState(false);

  const knownKeys = useMemo(() => new Set(KNOWN_SETTINGS.map((s) => s.key)), []);

  const generalSettings = useMemo(
    () => KNOWN_SETTINGS.filter((s) => (s.group || "general") === "general"),
    []
  );
  const gatewaySettings = useMemo(
    () => KNOWN_SETTINGS.filter((s) => s.group === "gateway"),
    []
  );
  const oauthSettings = useMemo(
    () => KNOWN_SETTINGS.filter((s) => s.group === "oauth"),
    []
  );
  const [oauthStatus, setOauthStatus] = useState<Record<
    string,
    { enabled: boolean; redirect_uri: string }
  > | null>(null);

  const loadGateway = () => {
    apiGet<{ mode: string; webhook_url: string; has_api_key: boolean }>(
      "/admin/billing/gateway"
    )
      .then((res) => setGateway(res))
      .catch(() => setGateway(null));
    apiGet<{ providers: Record<string, { enabled: boolean; redirect_uri: string }> }>(
      "/auth/oauth/status"
    )
      .then((res) => setOauthStatus(res.providers || null))
      .catch(() => setOauthStatus(null));
  };

  const load = () => {
    setLoading(true);
    setError(null);
    apiGet<{ settings: Record<string, string>; masked?: Record<string, boolean> }>(
      "/admin/settings"
    )
      .then((res) => {
        const s = res.settings || {};
        const v: Record<string, string> = {};
        const custom: SettingRow[] = [];
        for (const [key, val] of Object.entries(s)) {
          const str = String(val ?? "");
          if (knownKeys.has(key)) v[key] = str;
          else custom.push({ key, value: str });
        }
        for (const ks of KNOWN_SETTINGS) {
          if (!(ks.key in v)) v[ks.key] = ks.def;
        }
        setValues(v);
        setCustomRows(custom);
        setMaskedKeys(res.masked || {});
      })
      .catch((e) => setError(errMsg(e, t("admin.errLoadSettings"))))
      .finally(() => setLoading(false));
    loadGateway();
  };

  useEffect(load, []);

  const setVal = (key: string, val: string) =>
    setValues((prev) => ({ ...prev, [key]: val }));

  const addRow = () => setCustomRows((r) => [...r, { key: "", value: "" }]);
  const removeRow = (i: number) => setCustomRows((r) => r.filter((_, idx) => idx !== i));
  const setRow = (i: number, k: "key" | "value", v: string) =>
    setCustomRows((r) => r.map((row, idx) => (idx === i ? { ...row, [k]: v } : row)));

  const handleSave = async () => {
    const body: Record<string, string> = { ...values };
    for (const r of customRows) {
      const k = r.key.trim();
      if (!k || knownKeys.has(k)) continue;
      body[k] = r.value;
    }
    setSaving(true);
    try {
      await apiPut("/admin/settings", body);
      toast.success(t("admin.settingsSaved"));
      load();
    } catch (e) {
      toast.error(errMsg(e, t("admin.errSaveSettings")));
    } finally {
      setSaving(false);
    }
  };

  const handleTestGateway = async () => {
    setTesting(true);
    try {
      const res = await apiPost<{ ok: boolean; message: string }>(
        "/admin/billing/gateway/test",
        {}
      );
      if (res.ok) toast.success(res.message);
      else toast.error(res.message);
    } catch (e) {
      toast.error(errMsg(e, t("admin.errTestConnection")));
    } finally {
      setTesting(false);
    }
  };

  const copyWebhookUrl = async () => {
    const url = gateway?.webhook_url || values["clipkupay_webhook_url"] || "";
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t("admin.webhookUrlCopied"));
    } catch {
      toast.error(t("admin.errCopy"));
    }
  };

  const renderControl = (ks: KnownSetting) => {
    const val = values[ks.key] ?? ks.def;
    switch (ks.type) {
      case "toggle": {
        const on = val === "true";
        return (
          <button
            type="button"
            role="switch"
            aria-checked={on}
            aria-label={ks.label}
            onClick={() => setVal(ks.key, on ? "false" : "true")}
            className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${
              on ? "bg-primary" : "bg-muted"
            }`}
          >
            <span
              className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${
                on ? "left-6" : "left-1"
              }`}
            />
          </button>
        );
      }
      case "select":
        return (
          <Select
            value={val}
            onChange={(v) => setVal(ks.key, v)}
            options={ks.options || []}
            ariaLabel={ks.label}
            className="w-40"
          />
        );
      case "number":
        return (
          <Input
            type="number"
            min={0}
            value={val}
            onChange={(e) => setVal(ks.key, e.target.value)}
            className="w-28"
          />
        );
      case "password":
        return (
          <div className="flex items-center gap-2">
            <Input
              type={showPassword ? "text" : "password"}
              value={val}
              onChange={(e) => setVal(ks.key, e.target.value)}
              placeholder={
                ks.type === "password" && maskedKeys[ks.key]
                  ? t("admin.passwordSaved")
                  : ks.key === "clipkupay_api_key"
                    ? t("admin.apiKeyPlaceholder")
                    : t("admin.secretPlaceholder")
              }
              className="w-full sm:max-w-xs font-mono"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0"
              onClick={() => setShowPassword((s) => !s)}
              aria-label={showPassword ? t("admin.hide") : t("admin.show")}
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </Button>
          </div>
        );
      default:
        return (
          <Input
            value={val}
            onChange={(e) => setVal(ks.key, e.target.value)}
            placeholder={ks.def}
            className="w-full sm:max-w-xs"
          />
        );
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={handleSave} disabled={saving || loading}>
          {saving ? t("admin.saving") : t("admin.saveSettings")}
        </Button>
      </div>

      {loading && <LoadingRows />}
      {!loading && error && <ErrorCard message={error} onRetry={load} />}

      {!loading && !error && (
        <>
          <Card>
            <CardContent className="p-4 sm:p-5">
              <h3 className="text-sm font-semibold text-foreground mb-1">{t("admin.generalSettingsTitle")}</h3>
              <p className="text-xs text-muted-foreground mb-2">
                {t("admin.generalSettingsDesc")}
              </p>
              <div className="divide-y divide-border">
                {generalSettings.map((ks) => (
                  <div
                    key={ks.key}
                    className="py-3.5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">{ks.label}</p>
                      <p className="text-xs text-muted-foreground">{ks.desc}</p>
                    </div>
                    <div className="shrink-0">{renderControl(ks)}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <CreditCard className="w-4 h-4" /> Payment Gateway
                </h3>
                {gateway && (
                  <span
                    className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${
                      gateway.mode === "disabled"
                        ? "bg-muted text-muted-foreground"
                        : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        gateway.mode === "disabled" ? "bg-muted-foreground" : "bg-emerald-500"
                      }`}
                    />
                    {gateway.mode === "disabled"
                      ? t("admin.gatewayDisabled")
                      : gateway.mode === "api_key"
                        ? t("admin.gatewayApiKey")
                        : t("admin.gatewayServer")}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mb-2">
                {t("admin.gatewayDesc")}
              </p>
              <div className="divide-y divide-border">
                {gatewaySettings.map((ks) => (
                  <div
                    key={ks.key}
                    className="py-3.5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">{ks.label}</p>
                      <p className="text-xs text-muted-foreground">{ks.desc}</p>
                    </div>
                    <div className="shrink-0">{renderControl(ks)}</div>
                  </div>
                ))}
              </div>
              <div className="mt-4 rounded-lg border border-border bg-muted/50 p-3">
                <p className="text-xs font-medium text-foreground mb-1.5">
                  {t("admin.webhookLinkTitle")}
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 min-w-0 truncate text-xs font-mono bg-background border border-border rounded-md px-2.5 py-2">
                    {gateway?.webhook_url || values["clipkupay_webhook_url"] || "—"}
                  </code>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5 shrink-0"
                    onClick={copyWebhookUrl}
                  >
                    <Copy className="w-3.5 h-3.5" /> {t("admin.copy")}
                  </Button>
                </div>
              </div>
              <div className="mt-3 flex justify-end">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleTestGateway}
                  disabled={testing}
                >
                  {testing ? t("admin.testing") : t("admin.testConnection")}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 sm:p-5">
              <h3 className="text-sm font-semibold text-foreground mb-1">
                {t("admin.oauthTitle")}
              </h3>
              <p className="text-xs text-muted-foreground mb-2">
                {t("admin.oauthDesc")}
              </p>
              <div className="divide-y divide-border">
                {oauthSettings.map((ks) => (
                  <div
                    key={ks.key}
                    className="py-3.5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">{ks.label}</p>
                      <p className="text-xs text-muted-foreground">{ks.desc}</p>
                    </div>
                    <div className="shrink-0">{renderControl(ks)}</div>
                  </div>
                ))}
              </div>
              {oauthStatus && (
                <div className="mt-4 rounded-lg border border-border bg-muted/50 p-3 space-y-2.5">
                  <p className="text-xs font-medium text-foreground">
                    {t("admin.redirectUriTitle")}
                  </p>
                  {(["google", "github"] as const).map((name) => (
                    <div key={name} className="flex items-center gap-2">
                      <span
                        className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded-full shrink-0 capitalize ${
                          oauthStatus[name]?.enabled
                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            oauthStatus[name]?.enabled ? "bg-emerald-500" : "bg-muted-foreground"
                          }`}
                        />
                        {name}
                      </span>
                      <code className="flex-1 min-w-0 truncate text-xs font-mono bg-background border border-border rounded-md px-2.5 py-2">
                        {oauthStatus[name]?.redirect_uri || "—"}
                      </code>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-1.5 shrink-0"
                        onClick={() => {
                          const uri = oauthStatus[name]?.redirect_uri;
                          if (uri) {
                            navigator.clipboard
                              .writeText(uri)
                              .then(() => toast.success(t("admin.redirectUriCopied")))
                              .catch(() => toast.error(t("admin.errCopy")));
                          }
                        }}
                      >
                        <Copy className="w-3.5 h-3.5" /> {t("admin.copy")}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-sm font-semibold text-foreground">{t("admin.customSettingsTitle")}</h3>
                <Button size="sm" variant="outline" className="gap-1.5" onClick={addRow}>
                  <Plus className="w-3.5 h-3.5" /> {t("admin.addRow")}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mb-4">
                {t("admin.customSettingsDesc")}
              </p>
              {customRows.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-6">
                  {t("admin.noCustomSettings")}
                </p>
              )}
              <div className="space-y-3">
                {customRows.map((r, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <Input
                      className="font-mono"
                      placeholder={t("admin.settingKeyPlaceholder")}
                      value={r.key}
                      onChange={(e) => setRow(i, "key", e.target.value)}
                    />
                    <Input
                      placeholder={t("admin.settingValuePlaceholder")}
                      value={r.value}
                      onChange={(e) => setRow(i, "value", e.target.value)}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 shrink-0 text-destructive"
                      onClick={() => removeRow(i)}
                      aria-label={t("admin.deleteRow")}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

/* ── Tab: Notifikasi ────────────────────────────────── */

function NotificationsTab() {
  const { t } = useLang();
  const NOTIF_TYPES = [
    { value: "info", label: "Info" },
    { value: "warning", label: t("admin.notifWarning") },
    { value: "promo", label: t("admin.notifPromo") },
  ];
  const [userId, setUserId] = useState("");
  const [type, setType] = useState("info");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [link, setLink] = useState("");
  const [sending, setSending] = useState(false);
  const [waMessage, setWaMessage] = useState("");
  const [waConfirm, setWaConfirm] = useState(false);
  const [waSending, setWaSending] = useState(false);
  const [waResult, setWaResult] = useState<{ sent: number; failed: number } | null>(null);

  const handleSend = async () => {
    if (!title.trim() || !message.trim()) {
      toast.error(t("admin.errNotifTitleMessage"));
      return;
    }
    setSending(true);
    try {
      const body: Record<string, unknown> = {
        type,
        title: title.trim(),
        message: message.trim(),
      };
      if (userId.trim()) body.user_id = Number(userId) || userId.trim();
      if (link.trim()) body.link = link.trim();
      await apiPost("/admin/notifications", body);
      toast.success(userId.trim() ? t("admin.notifSentUser") : t("admin.notifSentBroadcast"));
      setUserId("");
      setType("info");
      setTitle("");
      setMessage("");
      setLink("");
    } catch (e) {
      toast.error(errMsg(e, t("admin.errSendNotif")));
    } finally {
      setSending(false);
    }
  };

  const handleWaSend = async () => {
    if (!waMessage.trim()) {
      toast.error(t("admin.errWaMessage"));
      return;
    }
    setWaSending(true);
    try {
      const res = await apiPost<{ sent: number; failed: number }>("/admin/broadcast-wa", {
        message: waMessage.trim(),
      });
      setWaResult({ sent: res.sent || 0, failed: res.failed || 0 });
      setWaConfirm(false);
      setWaMessage("");
      toast.success(t("admin.broadcastSent").replace("{sent}", String(res.sent || 0)));
    } catch (e) {
      toast.error(errMsg(e, t("admin.errBroadcastWa")));
    } finally {
      setWaSending(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-5 space-y-4 max-w-2xl">
          <Field label={t("admin.notifUserIdLabel")}>
            <Input
              type="number"
              min="1"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder="cth: 12 — kosongkan untuk semua"
            />
          </Field>
          <Field label={t("admin.typeLabel")}>
            <Select value={type} onChange={setType} options={NOTIF_TYPES} className="h-10 w-full text-sm" ariaLabel={t("admin.notifTypeAria")} />
          </Field>
          <Field label={t("admin.notifTitleLabel")}>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="cth: Promo akhir tahun" />
          </Field>
          <Field label={t("admin.notifMessageLabel")}>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={t("admin.notifMessagePlaceholder")}
              rows={4}
              className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </Field>
          <Field label={t("admin.notifLinkLabel")}>
            <Input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://... atau /dashboard" />
          </Field>
          <div className="flex justify-end">
            <Button size="sm" onClick={handleSend} disabled={sending} className="gap-1.5">
              <Send className="w-3.5 h-3.5" />
              {sending ? t("admin.sending") : t("admin.sendNotification")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Broadcast WhatsApp */}
      <Card>
        <CardContent className="p-5 space-y-4 max-w-2xl">
          <div>
            <h3 className="font-medium text-foreground">Broadcast WhatsApp</h3>
            <p className="text-xs text-muted-foreground mt-1">
              {t("admin.broadcastWaDesc")}
            </p>
          </div>
          <Field label={t("admin.waMessageLabel").replace("{len}", String(waMessage.length))}>
            <textarea
              value={waMessage}
              onChange={(e) => setWaMessage(e.target.value.slice(0, 1000))}
              placeholder={t("admin.waMessagePlaceholder")}
              rows={4}
              className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </Field>
          {waResult && (
            <p className="text-sm text-muted-foreground">
              {t("admin.waResultSent").replace("{sent}", String(waResult.sent))}
              {waResult.failed > 0 ? t("admin.waResultFailed").replace("{failed}", String(waResult.failed)) : ""}.
            </p>
          )}
          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={() => setWaConfirm(true)}
              disabled={!waMessage.trim() || waSending}
              className="gap-1.5"
            >
              <Send className="w-3.5 h-3.5" />
              {waSending ? t("admin.sending") : t("admin.sendViaWa")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {waConfirm && (
        <Modal title={t("admin.waConfirmTitle")} onClose={() => setWaConfirm(false)}>
          <p className="text-sm text-muted-foreground">
            {t("admin.waConfirmBody")}
          </p>
          <div className="flex justify-end gap-2 mt-5">
            <Button variant="outline" size="sm" onClick={() => setWaConfirm(false)}>
              {t("admin.cancel")}
            </Button>
            <Button size="sm" onClick={handleWaSend} disabled={waSending}>
              {waSending ? t("admin.sending") : t("admin.yesSend")}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ── Tab: Log Aktivitas ─────────────────────────────── */

interface ActivityLog {
  id: number;
  adminId: number;
  adminEmail: string;
  action: string;
  targetType: string;
  targetId: string;
  detail: string;
  createdAt: string;
}

function actionLabel(t: (k: string) => string, a: string) {
  const labels: Record<string, string> = {
    create_user: t("admin.actionCreateUser"),
    update_user: t("admin.actionUpdateUser"),
    delete_user: t("admin.actionDeleteUser"),
    create_package: t("admin.actionCreatePackage"),
    update_package: t("admin.actionUpdatePackage"),
    delete_package: t("admin.actionDeletePackage"),
    create_voucher: t("admin.actionCreateVoucher"),
    delete_voucher: t("admin.actionDeleteVoucher"),
    send_notification: t("admin.actionSendNotification"),
    broadcast_wa: t("admin.actionBroadcastWa"),
    update_setting: t("admin.actionUpdateSetting"),
    update_plan: t("admin.actionUpdatePlan"),
    login: t("admin.actionLogin"),
    logout: t("admin.actionLogout"),
  };
  return labels[a] || a.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function ActivityLogTab() {
  const { t } = useLang();
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = (p = page) => {
    setLoading(true);
    setError(null);
    apiGet<{ logs: ActivityLog[]; total: number }>(`/admin/activity-logs?page=${p}&limit=${PAGE_LIMIT}`)
      .then((res) => {
        setLogs(res.logs || []);
        setTotal(res.total || 0);
      })
      .catch((e) => setError(errMsg(e, t("admin.errLoadActivity"))))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_LIMIT));

  const targetText = (l: ActivityLog) =>
    l.targetType ? `${l.targetType}${l.targetId ? ` #${l.targetId}` : ""}` : "-";

  return (
    <div className="space-y-4">
      {loading && <LoadingRows />}
      {!loading && error && <ErrorCard message={error} onRetry={() => load()} />}

      {!loading && !error && (
        <>
          <Card className="hidden md:block">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[680px]">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="p-3 font-medium">{t("admin.colTime")}</th>
                    <th className="p-3 font-medium">{t("admin.colAdmin")}</th>
                    <th className="p-3 font-medium">{t("admin.colAction")}</th>
                    <th className="p-3 font-medium">{t("admin.colTarget")}</th>
                    <th className="p-3 font-medium">{t("admin.colDetail")}</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((l) => (
                    <tr key={l.id} className="border-b border-border last:border-0">
                      <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">{fmtDate(l.createdAt)}</td>
                      <td className="p-3 text-xs truncate max-w-[180px]">{l.adminEmail || `#${l.adminId}`}</td>
                      <td className="p-3">
                        <Badge variant="secondary">{actionLabel(t, l.action)}</Badge>
                      </td>
                      <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">{targetText(l)}</td>
                      <td className="p-3 text-xs text-muted-foreground max-w-[280px] truncate" title={l.detail || ""}>
                        {l.detail || "-"}
                      </td>
                    </tr>
                  ))}
                  {logs.length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-sm text-muted-foreground">
                        {t("admin.noActivity")}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Kartu mobile */}
          <div className="md:hidden space-y-3">
            {logs.map((l) => (
              <Card key={l.id}>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <Badge variant="secondary">{actionLabel(t, l.action)}</Badge>
                    <span className="text-xs text-muted-foreground shrink-0">{fmtDate(l.createdAt)}</span>
                  </div>
                  <p className="text-sm text-foreground truncate">{l.adminEmail || `Admin #${l.adminId}`}</p>
                  {(l.targetType || l.detail) && (
                    <p className="text-xs text-muted-foreground">
                      {l.targetType ? t("admin.targetLabel").replace("{target}", targetText(l)) : ""}
                      {l.detail ? `${l.targetType ? " · " : ""}${l.detail}` : ""}
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
            {logs.length === 0 && (
              <Card>
                <CardContent className="p-8 text-center text-sm text-muted-foreground">
                  {t("admin.noActivity")}
                </CardContent>
              </Card>
            )}
          </div>

          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <p>
              {t("admin.logPageInfo")
                .replace("{total}", String(total))
                .replace("{page}", String(page))
                .replace("{totalPages}", String(totalPages))}
            </p>
            <div className="flex gap-1">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)} className="gap-1">
                <ChevronLeft className="w-3.5 h-3.5" /> {t("admin.prevPage")}
              </Button>
              <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage(page + 1)} className="gap-1">
                {t("admin.nextPage")} <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ── Tab: Kesehatan Sistem ──────────────────────────── */

interface HealthStatus {
  database: "ok" | "error";
  redis: "ok" | "error" | "disabled";
  clipkupay: "ok" | "disabled";
  timestamp: number;
}

function HealthTab() {
  const { t } = useLang();
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    apiGet<HealthStatus>("/admin/health")
      .then(setHealth)
      .catch((e) => setError(errMsg(e, t("admin.errLoadHealth"))))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const statusCard = (label: string, status: "ok" | "error" | "disabled") => (
    <Card>
      <CardContent className="p-5 flex items-center gap-4">
        <span
          className={cn(
            "w-3 h-3 rounded-full shrink-0",
            status === "ok" && "bg-green-500",
            status === "error" && "bg-red-500",
            status === "disabled" && "bg-slate-400"
          )}
        />
        <div>
          <p className="font-medium text-foreground">{label}</p>
          <p
            className={cn(
              "text-sm",
              status === "ok" && "text-green-600 dark:text-green-400",
              status === "error" && "text-red-600 dark:text-red-400",
              status === "disabled" && "text-muted-foreground"
            )}
          >
            {status === "ok"
              ? t("admin.healthOk")
              : status === "disabled"
                ? t("admin.healthUnused")
                : t("admin.healthError")}
          </p>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" variant="outline" onClick={load} disabled={loading} className="gap-1.5">
          <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} /> {t("admin.reload")}
        </Button>
      </div>

      {loading && <LoadingRows n={2} />}
      {!loading && error && <ErrorCard message={error} onRetry={load} />}

      {!loading && !error && health && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {statusCard("Database", health.database)}
            {statusCard("Redis", health.redis)}
            {statusCard("Clipku Pay", health.clipkupay ?? "disabled")}
          </div>
          <p className="text-xs text-muted-foreground">
            {t("admin.lastChecked").replace("{date}", new Date(health.timestamp * 1000).toLocaleString("id-ID"))}
          </p>
        </>
      )}
    </div>
  );
}

/* ── Halaman utama ──────────────────────────────────── */

const TABS = [
  { id: "ringkasan", icon: LayoutDashboard },
  { id: "pengguna", icon: Users },
  { id: "paket", icon: Package },
  { id: "voucher", icon: Ticket },
  { id: "transaksi", icon: ReceiptText },
  { id: "log", icon: ScrollText },
  { id: "kesehatan", icon: HeartPulse },
  { id: "pengaturan", icon: Settings },
  { id: "notifikasi", icon: BellRing },
];

const TAB_LABEL_KEYS: Record<string, string> = {
  ringkasan: "admin.tabOverview",
  pengguna: "admin.tabUsers",
  paket: "admin.tabPackages",
  voucher: "admin.tabVouchers",
  transaksi: "admin.tabTransactions",
  log: "admin.tabActivityLog",
  kesehatan: "admin.tabHealth",
  pengaturan: "admin.tabSettings",
  notifikasi: "admin.tabNotifications",
};

const TAB_DESC_KEYS: Record<string, string> = {
  ringkasan: "admin.tabOverviewDesc",
  pengguna: "admin.tabUsersDesc",
  paket: "admin.tabPackagesDesc",
  voucher: "admin.tabVouchersDesc",
  transaksi: "admin.tabTransactionsDesc",
  log: "admin.tabActivityLogDesc",
  kesehatan: "admin.tabHealthDesc",
  pengaturan: "admin.tabSettingsDesc",
  notifikasi: "admin.tabNotificationsDesc",
};

export default function Admin() {
  const { t } = useLang();
  // Tab dikendalikan URL (?tab=...) agar bisa di-link dari sidebar admin
  const search = useSearch();
  const tabParam = new URLSearchParams(search).get("tab");
  const tab = TABS.some((x) => x.id === tabParam) ? (tabParam as string) : "ringkasan";
  const active = TABS.find((x) => x.id === tab) ?? TABS[0];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-foreground">{t(TAB_LABEL_KEYS[active.id])}</h2>
        <p className="text-sm text-muted-foreground">{t(TAB_DESC_KEYS[tab])}</p>
      </div>

      {tab === "ringkasan" && <OverviewTab />}
      {tab === "pengguna" && <UsersTab />}
      {tab === "paket" && <PackagesTab />}
      {tab === "voucher" && <VouchersTab />}
      {tab === "transaksi" && <TransactionsTab />}
      {tab === "log" && <ActivityLogTab />}
      {tab === "kesehatan" && <HealthTab />}
      {tab === "pengaturan" && <SettingsTab />}
      {tab === "notifikasi" && <NotificationsTab />}
    </div>
  );
}

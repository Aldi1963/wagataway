import { toast } from "sonner";
import { useEffect, useState, type ReactNode } from "react";
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
  Menu,
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
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden />
      <div className="relative bg-card text-card-foreground rounded-xl border border-border shadow-lg w-full max-w-lg max-h-[90vh] overflow-y-auto p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold">{title}</h3>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose} aria-label="Tutup">
            <X className="w-4 h-4" />
          </Button>
        </div>
        {children}
      </div>
    </div>
  );
}

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
    <select
      value={value}
      aria-label={ariaLabel}
      onChange={(e) => onChange(e.target.value)}
      className={`h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground ${className || ""}`}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
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
  return (
    <Card>
      <CardContent className="p-6 text-center space-y-3">
        <p className="text-sm text-destructive">{message}</p>
        <Button size="sm" variant="outline" onClick={onRetry} className="gap-1.5">
          <RefreshCw className="w-3.5 h-3.5" /> Coba lagi
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
      .catch((e) => setError(errMsg(e, "Gagal memuat ringkasan")))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const toggleMaintenance = async () => {
    const next = !maintenance;
    setToggling(true);
    try {
      await apiPut("/admin/maintenance", { enabled: next });
      setMaintenance(next);
      toast.success(next ? "Mode maintenance diaktifkan" : "Mode maintenance dimatikan");
    } catch (e) {
      toast.error(errMsg(e, "Gagal mengubah mode maintenance"));
    } finally {
      setToggling(false);
    }
  };

  const stats = [
    { icon: Users, label: "Total Pengguna", value: fmtNum(data?.totalUsers ?? 0), tint: "bg-blue-500/10 text-blue-600" },
    { icon: Smartphone, label: "Total Device", value: fmtNum(data?.totalDevices ?? 0), tint: "bg-violet-500/10 text-violet-600" },
    { icon: MessageSquareText, label: "Total Pesan", value: fmtNum(data?.totalMessages ?? 0), tint: "bg-emerald-500/10 text-emerald-600" },
    { icon: Wallet, label: "Total Pendapatan", value: fmtRp(data?.totalRevenue ?? 0), tint: "bg-amber-500/10 text-amber-600" },
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
                <p className="text-sm font-semibold text-foreground mb-3">Pengguna baru / hari</p>
                {trends.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-10 text-center">Belum ada data tren.</p>
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
                          formatter={(value) => [fmtNum(Number(value)), "Pengguna"]}
                          contentStyle={{ borderRadius: 8, fontSize: 12 }}
                        />
                        <Bar dataKey="signups" name="Pengguna" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-sm font-semibold text-foreground mb-3">Pendapatan / hari</p>
                {trends.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-10 text-center">Belum ada data tren.</p>
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
                          formatter={(value) => [fmtRp(Number(value)), "Pendapatan"]}
                          contentStyle={{ borderRadius: 8, fontSize: 12 }}
                        />
                        <Area
                          type="monotone"
                          dataKey="revenue"
                          name="Pendapatan"
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
                  <p className="text-sm font-semibold text-foreground">Mode maintenance</p>
                  <p className="text-xs text-muted-foreground">
                    {maintenance ? "Aktif — pengguna non-admin tidak bisa mengakses layanan" : "Nonaktif — layanan berjalan normal"}
                  </p>
                </div>
              </div>
              <Button
                size="sm"
                variant={maintenance ? "destructive" : "outline"}
                onClick={toggleMaintenance}
                disabled={toggling}
              >
                {toggling ? "Memproses..." : maintenance ? "Matikan" : "Aktifkan"}
              </Button>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

/* ── Tab: Pengguna ──────────────────────────────────── */

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
  { value: "active", label: "Aktif" },
  { value: "suspended", label: "Suspended" },
  { value: "banned", label: "Banned" },
];

function statusBadge(s: string) {
  if (s === "active") return <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">Aktif</Badge>;
  if (s === "suspended") return <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20">Suspended</Badge>;
  return <Badge variant="destructive">Banned</Badge>;
}

function UsersTab() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<AdminUser | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);

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
      .catch((e) => setError(errMsg(e, "Gagal memuat pengguna")))
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
      toast.success(`${u.email} diperbarui`);
    } catch (e) {
      toast.error(errMsg(e, "Gagal memperbarui pengguna"));
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setDeletingBusy(true);
    try {
      await apiDelete(`/admin/users/${deleting.id}`);
      toast.success("Pengguna dihapus");
      setDeleting(null);
      load();
    } catch (e) {
      toast.error(errMsg(e, "Gagal menghapus pengguna"));
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
      toast.success("CSV pengguna diunduh");
    } catch (e) {
      toast.error(errMsg(e, "Gagal mengekspor CSV"));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Cari nama atau email..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && doSearch()}
          />
        </div>
        <Button size="sm" variant="outline" onClick={doSearch} className="h-10">
          Cari
        </Button>
        <Button size="sm" variant="outline" onClick={exportCsv} className="h-10 gap-1.5">
          <Download className="w-4 h-4" /> Export CSV
        </Button>
      </div>

      {loading && <LoadingRows />}
      {!loading && error && <ErrorCard message={error} onRetry={() => load()} />}

      {!loading && !error && (
        <>
          <Card className="hidden md:block">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[760px]">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="p-3 font-medium">Pengguna</th>
                    <th className="p-3 font-medium">Role</th>
                    <th className="p-3 font-medium">Paket</th>
                    <th className="p-3 font-medium">Status</th>
                    <th className="p-3 font-medium">Terdaftar</th>
                    <th className="p-3 font-medium text-right">Aksi</th>
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
                        <Select value={u.role} onChange={(v) => updateField(u, "role", v)} options={ROLE_OPTS} ariaLabel="Ubah role" />
                      </td>
                      <td className="p-3">
                        <Select value={u.plan} onChange={(v) => updateField(u, "plan", v)} options={PLAN_OPTS} ariaLabel="Ubah paket" />
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <Select value={u.status} onChange={(v) => updateField(u, "status", v)} options={STATUS_OPTS} ariaLabel="Ubah status" />
                          {statusBadge(u.status)}
                        </div>
                      </td>
                      <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">{fmtDate(u.createdAt)}</td>
                      <td className="p-3 text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive"
                          onClick={() => setDeleting(u)}
                          aria-label="Hapus pengguna"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {users.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-sm text-muted-foreground">
                        Tidak ada pengguna ditemukan
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
          {/* Kartu mobile */}
          <div className="md:hidden space-y-3">
            {users.map((u) => (
              <Card key={u.id}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-foreground truncate">{u.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                    </div>
                    {statusBadge(u.status)}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Role</p>
                      <Select value={u.role} onChange={(v) => updateField(u, "role", v)} options={ROLE_OPTS} ariaLabel="Ubah role" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Paket</p>
                      <Select value={u.plan} onChange={(v) => updateField(u, "plan", v)} options={PLAN_OPTS} ariaLabel="Ubah paket" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Status</p>
                      <Select value={u.status} onChange={(v) => updateField(u, "status", v)} options={STATUS_OPTS} ariaLabel="Ubah status" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Terdaftar</p>
                      <p className="text-xs text-foreground">{fmtDate(u.createdAt)}</p>
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive gap-1"
                      onClick={() => setDeleting(u)}
                      aria-label="Hapus pengguna"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Hapus
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
            {users.length === 0 && (
              <Card>
                <CardContent className="p-8 text-center text-sm text-muted-foreground">
                  Tidak ada pengguna ditemukan
                </CardContent>
              </Card>
            )}
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <p>
              {total} pengguna · Halaman {page} dari {totalPages}
            </p>
            <div className="flex gap-1">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)} className="gap-1">
                <ChevronLeft className="w-3.5 h-3.5" /> Sebelumnya
              </Button>
              <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage(page + 1)} className="gap-1">
                Berikutnya <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        </>
      )}

      {deleting && (
        <Modal title="Hapus Pengguna" onClose={() => setDeleting(null)}>
          <p className="text-sm text-muted-foreground">
            Hapus pengguna <b className="text-foreground">{deleting.email}</b>? Tindakan ini tidak bisa dibatalkan.
          </p>
          <div className="flex justify-end gap-2 mt-5">
            <Button variant="outline" size="sm" onClick={() => setDeleting(null)}>
              Batal
            </Button>
            <Button size="sm" variant="destructive" onClick={handleDelete} disabled={deletingBusy}>
              {deletingBusy ? "Menghapus..." : "Hapus"}
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
      .catch((e) => setError(errMsg(e, "Gagal memuat paket")))
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
      toast.error("Nama dan slug paket wajib diisi");
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
        toast.success("Paket diperbarui");
      } else {
        await apiPost("/admin/packages", body);
        toast.success("Paket ditambahkan");
      }
      setShowForm(false);
      load();
    } catch (e) {
      toast.error(errMsg(e, "Gagal menyimpan paket"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setDeletingBusy(true);
    try {
      await apiDelete(`/admin/packages/${deleting.id}`);
      toast.success("Paket dihapus");
      setDeleting(null);
      load();
    } catch (e) {
      toast.error(errMsg(e, "Gagal menghapus paket"));
    } finally {
      setDeletingBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" className="gap-1.5" onClick={openAdd}>
          <Plus className="w-3.5 h-3.5" /> Tambah Paket
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
                  <th className="p-3 font-medium">Paket</th>
                  <th className="p-3 font-medium">Harga</th>
                  <th className="p-3 font-medium">Durasi</th>
                  <th className="p-3 font-medium">Limit</th>
                  <th className="p-3 font-medium">Status</th>
                  <th className="p-3 font-medium text-right">Aksi</th>
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
                    <td className="p-3 text-muted-foreground whitespace-nowrap">{p.duration} hari</td>
                    <td className="p-3 text-xs text-muted-foreground">
                      {fmtNum(p.maxDevices)} device · {fmtNum(p.maxMessages)} pesan · {fmtNum(p.maxContacts)} kontak
                    </td>
                    <td className="p-3">
                      {p.isActive ? (
                        <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">Aktif</Badge>
                      ) : (
                        <Badge variant="outline">Nonaktif</Badge>
                      )}
                    </td>
                    <td className="p-3 text-right whitespace-nowrap">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(p)} aria-label="Edit paket">
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleting(p)} aria-label="Hapus paket">
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
                {pkgs.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-sm text-muted-foreground">
                      Belum ada paket
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {showForm && (
        <Modal title={editing ? "Edit Paket" : "Tambah Paket"} onClose={() => setShowForm(false)}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Nama paket">
                <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Regular" />
              </Field>
              <Field label="Slug">
                <Input value={form.slug} onChange={(e) => set("slug", e.target.value)} placeholder="regular" />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Harga (Rp)">
                <Input type="number" min="0" value={form.price} onChange={(e) => set("price", e.target.value)} placeholder="66000" />
              </Field>
              <Field label="Durasi (hari)">
                <Input type="number" min="1" value={form.duration} onChange={(e) => set("duration", e.target.value)} />
              </Field>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Maks device">
                <Input type="number" min="1" value={form.maxDevices} onChange={(e) => set("maxDevices", e.target.value)} />
              </Field>
              <Field label="Maks pesan">
                <Input type="number" min="0" value={form.maxMessages} onChange={(e) => set("maxMessages", e.target.value)} />
              </Field>
              <Field label="Maks kontak">
                <Input type="number" min="0" value={form.maxContacts} onChange={(e) => set("maxContacts", e.target.value)} />
              </Field>
            </div>
            <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
              <input type="checkbox" checked={form.isActive} onChange={(e) => set("isActive", e.target.checked)} className="w-4 h-4 accent-primary" />
              Paket aktif
            </label>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowForm(false)}>
                Batal
              </Button>
              <Button size="sm" onClick={handleSave} disabled={saving}>
                {saving ? "Menyimpan..." : "Simpan"}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {deleting && (
        <Modal title="Hapus Paket" onClose={() => setDeleting(null)}>
          <p className="text-sm text-muted-foreground">
            Hapus paket <b className="text-foreground">{deleting.name}</b>? Tindakan ini tidak bisa dibatalkan.
          </p>
          <div className="flex justify-end gap-2 mt-5">
            <Button variant="outline" size="sm" onClick={() => setDeleting(null)}>
              Batal
            </Button>
            <Button size="sm" variant="destructive" onClick={handleDelete} disabled={deletingBusy}>
              {deletingBusy ? "Menghapus..." : "Hapus"}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ── Tab: Voucher ───────────────────────────────────── */

const VOUCHER_TYPES = [
  { value: "trial", label: "Trial" },
  { value: "discount", label: "Diskon" },
  { value: "plan", label: "Paket" },
];

function VouchersTab() {
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
      .catch((e) => setError(errMsg(e, "Gagal memuat voucher")))
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
      toast.error("Kode voucher wajib diisi");
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
      toast.success("Voucher dibuat");
      setShowForm(false);
      resetForm();
      load();
    } catch (e) {
      toast.error(errMsg(e, "Gagal membuat voucher"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setDeletingBusy(true);
    try {
      await apiDelete(`/admin/vouchers/${deleting.id}`);
      toast.success("Voucher dihapus");
      setDeleting(null);
      load();
    } catch (e) {
      toast.error(errMsg(e, "Gagal menghapus voucher"));
    } finally {
      setDeletingBusy(false);
    }
  };

  const typeLabel = (t: string) => VOUCHER_TYPES.find((x) => x.value === t)?.label || t;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" className="gap-1.5" onClick={() => setShowForm(true)}>
          <Plus className="w-3.5 h-3.5" /> Tambah Voucher
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
                  <th className="p-3 font-medium">Kode</th>
                  <th className="p-3 font-medium">Tipe</th>
                  <th className="p-3 font-medium">Durasi</th>
                  <th className="p-3 font-medium">Diskon</th>
                  <th className="p-3 font-medium">Terpakai</th>
                  <th className="p-3 font-medium">Kedaluwarsa</th>
                  <th className="p-3 font-medium">Status</th>
                  <th className="p-3 font-medium text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {vouchers.map((v) => (
                  <tr key={v.id} className="border-b border-border last:border-0">
                    <td className="p-3 font-mono font-semibold text-foreground">{v.code}</td>
                    <td className="p-3">
                      <Badge variant="outline">{typeLabel(v.type)}</Badge>
                    </td>
                    <td className="p-3 text-muted-foreground whitespace-nowrap">{v.duration} hari</td>
                    <td className="p-3 text-muted-foreground">{v.discount}%</td>
                    <td className="p-3 text-muted-foreground whitespace-nowrap">
                      {fmtNum(v.usedCount)} / {fmtNum(v.maxUses)}
                    </td>
                    <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">{fmtDate(v.expiresAt)}</td>
                    <td className="p-3">
                      {v.isActive ? (
                        <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">Aktif</Badge>
                      ) : (
                        <Badge variant="outline">Nonaktif</Badge>
                      )}
                    </td>
                    <td className="p-3 text-right">
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleting(v)} aria-label="Hapus voucher">
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
                {vouchers.length === 0 && (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-sm text-muted-foreground">
                      Belum ada voucher
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {showForm && (
        <Modal title="Tambah Voucher" onClose={() => setShowForm(false)}>
          <div className="space-y-4">
            <Field label="Kode voucher">
              <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="cth: HEMAT50" className="font-mono uppercase" />
            </Field>
            <Field label="Tipe">
              <Select value={type} onChange={setType} options={VOUCHER_TYPES} className="h-10 w-full text-sm" ariaLabel="Tipe voucher" />
            </Field>
            {type === "plan" && (
              <Field label="ID Paket (untuk tipe paket)">
                <Input type="number" min="1" value={planId} onChange={(e) => setPlanId(e.target.value)} placeholder="cth: 3" />
              </Field>
            )}
            <div className="grid grid-cols-3 gap-3">
              <Field label="Durasi (hari)">
                <Input type="number" min="0" value={duration} onChange={(e) => setDuration(e.target.value)} />
              </Field>
              <Field label="Diskon (%)">
                <Input type="number" min="0" max="100" value={discount} onChange={(e) => setDiscount(e.target.value)} />
              </Field>
              <Field label="Maks pakai">
                <Input type="number" min="1" value={maxUses} onChange={(e) => setMaxUses(e.target.value)} />
              </Field>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowForm(false)}>
                Batal
              </Button>
              <Button size="sm" onClick={handleAdd} disabled={saving}>
                {saving ? "Menyimpan..." : "Simpan"}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {deleting && (
        <Modal title="Hapus Voucher" onClose={() => setDeleting(null)}>
          <p className="text-sm text-muted-foreground">
            Hapus voucher <b className="text-foreground font-mono">{deleting.code}</b>?
          </p>
          <div className="flex justify-end gap-2 mt-5">
            <Button variant="outline" size="sm" onClick={() => setDeleting(null)}>
              Batal
            </Button>
            <Button size="sm" variant="destructive" onClick={handleDelete} disabled={deletingBusy}>
              {deletingBusy ? "Menghapus..." : "Hapus"}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ── Tab: Transaksi ─────────────────────────────────── */

function txnBadge(s: string) {
  const v = s.toLowerCase();
  if (v === "paid" || v === "success" || v === "settlement")
    return <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">Berhasil</Badge>;
  if (v === "pending")
    return <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20">Menunggu</Badge>;
  if (v === "expired" || v === "cancel" || v === "deny" || v === "failed")
    return <Badge variant="destructive">Gagal</Badge>;
  return <Badge variant="outline">{s}</Badge>;
}

function TransactionsTab() {
  const [txns, setTxns] = useState<Txn[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = (p = page) => {
    setLoading(true);
    setError(null);
    apiGet<{ transactions: Txn[]; total: number }>(`/admin/transactions?page=${p}&limit=${PAGE_LIMIT}`)
      .then((res) => {
        setTxns(res.transactions || []);
        setTotal(res.total || 0);
      })
      .catch((e) => setError(errMsg(e, "Gagal memuat transaksi")))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_LIMIT));

  const exportCsv = async () => {
    try {
      const res = await apiGet<{ transactions: Txn[] }>("/admin/transactions?limit=1000&page=1");
      const rows: (string | number | null | undefined)[][] = [
        ["id", "tanggal", "nama", "email", "paket", "amount", "status"],
        ...(res.transactions || []).map((t) => [
          t.id,
          t.createdAt,
          t.user?.name || "",
          t.user?.email || "",
          t.plan?.name || "",
          t.amount,
          t.status,
        ]),
      ];
      downloadCsv(`transaksi-${csvDate()}.csv`, rows);
      toast.success("CSV transaksi diunduh");
    } catch (e) {
      toast.error(errMsg(e, "Gagal mengekspor CSV"));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" variant="outline" onClick={exportCsv} className="gap-1.5">
          <Download className="w-4 h-4" /> Export CSV
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
                    <th className="p-3 font-medium">Pengguna</th>
                    <th className="p-3 font-medium">Paket</th>
                    <th className="p-3 font-medium">Jumlah</th>
                    <th className="p-3 font-medium">Status</th>
                    <th className="p-3 font-medium">Tanggal</th>
                  </tr>
                </thead>
                <tbody>
                  {txns.map((t) => (
                    <tr key={t.id} className="border-b border-border last:border-0">
                      <td className="p-3 font-mono text-xs text-muted-foreground">#{t.id}</td>
                      <td className="p-3">
                        <p className="font-medium text-foreground truncate max-w-[200px]">{t.user?.name || "-"}</p>
                        <p className="text-xs text-muted-foreground truncate max-w-[200px]">{t.user?.email || ""}</p>
                      </td>
                      <td className="p-3 text-muted-foreground">{t.plan?.name || "-"}</td>
                      <td className="p-3 font-semibold text-foreground whitespace-nowrap">{fmtRp(t.amount)}</td>
                      <td className="p-3">{txnBadge(t.status)}</td>
                      <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">{fmtDate(t.createdAt)}</td>
                    </tr>
                  ))}
                  {txns.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-sm text-muted-foreground">
                        Belum ada transaksi
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
          {/* Kartu mobile */}
          <div className="md:hidden space-y-3">
            {txns.map((t) => (
              <Card key={t.id}>
                <CardContent className="p-4 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs text-muted-foreground">#{t.id}</span>
                    {txnBadge(t.status)}
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-foreground truncate">{t.user?.name || "-"}</p>
                    <p className="text-xs text-muted-foreground truncate">{t.user?.email || ""}</p>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <p className="text-muted-foreground mb-0.5">Paket</p>
                      <p className="text-foreground">{t.plan?.name || "-"}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground mb-0.5">Jumlah</p>
                      <p className="font-semibold text-foreground">{fmtRp(t.amount)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground mb-0.5">Tanggal</p>
                      <p className="text-foreground">{fmtDate(t.createdAt)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
            {txns.length === 0 && (
              <Card>
                <CardContent className="p-8 text-center text-sm text-muted-foreground">
                  Belum ada transaksi
                </CardContent>
              </Card>
            )}
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <p>
              {total} transaksi · Halaman {page} dari {totalPages}
            </p>
            <div className="flex gap-1">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)} className="gap-1">
                <ChevronLeft className="w-3.5 h-3.5" /> Sebelumnya
              </Button>
              <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage(page + 1)} className="gap-1">
                Berikutnya <ChevronRight className="w-3.5 h-3.5" />
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

function SettingsTab() {
  const [rows, setRows] = useState<SettingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    setError(null);
    apiGet<{ settings: Record<string, string> }>("/admin/settings")
      .then((res) => {
        const s = res.settings || {};
        setRows(Object.entries(s).map(([key, value]) => ({ key, value: String(value ?? "") })));
      })
      .catch((e) => setError(errMsg(e, "Gagal memuat pengaturan")))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const addRow = () => setRows((r) => [...r, { key: "", value: "" }]);
  const removeRow = (i: number) => setRows((r) => r.filter((_, idx) => idx !== i));
  const setRow = (i: number, k: "key" | "value", v: string) =>
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, [k]: v } : row)));

  const handleSave = async () => {
    const body: Record<string, string> = {};
    for (const r of rows) {
      const k = r.key.trim();
      if (!k) continue;
      body[k] = r.value;
    }
    setSaving(true);
    try {
      await apiPut("/admin/settings", body);
      toast.success("Pengaturan disimpan");
      load();
    } catch (e) {
      toast.error(errMsg(e, "Gagal menyimpan pengaturan"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="outline" className="gap-1.5" onClick={addRow}>
          <Plus className="w-3.5 h-3.5" /> Tambah Baris
        </Button>
        <Button size="sm" onClick={handleSave} disabled={saving || loading}>
          {saving ? "Menyimpan..." : "Simpan Pengaturan"}
        </Button>
      </div>

      {loading && <LoadingRows />}
      {!loading && error && <ErrorCard message={error} onRetry={load} />}

      {!loading && !error && (
        <Card>
          <CardContent className="p-4 space-y-3">
            {rows.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">
                Belum ada pengaturan. Tambah baris untuk membuat pengaturan baru.
              </p>
            )}
            {rows.map((r, i) => (
              <div key={i} className="flex gap-2 items-center">
                <Input
                  className="font-mono"
                  placeholder="kunci_pengaturan"
                  value={r.key}
                  onChange={(e) => setRow(i, "key", e.target.value)}
                />
                <Input
                  placeholder="nilai"
                  value={r.value}
                  onChange={(e) => setRow(i, "value", e.target.value)}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 shrink-0 text-destructive"
                  onClick={() => removeRow(i)}
                  aria-label="Hapus baris"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* ── Tab: Notifikasi ────────────────────────────────── */

const NOTIF_TYPES = [
  { value: "info", label: "Info" },
  { value: "warning", label: "Peringatan" },
  { value: "promo", label: "Promo" },
];

function NotificationsTab() {
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
      toast.error("Judul dan pesan wajib diisi");
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
      toast.success(userId.trim() ? "Notifikasi dikirim ke pengguna" : "Notifikasi broadcast dikirim");
      setUserId("");
      setType("info");
      setTitle("");
      setMessage("");
      setLink("");
    } catch (e) {
      toast.error(errMsg(e, "Gagal mengirim notifikasi"));
    } finally {
      setSending(false);
    }
  };

  const handleWaSend = async () => {
    if (!waMessage.trim()) {
      toast.error("Pesan WhatsApp wajib diisi");
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
      toast.success(`Broadcast terkirim ke ${res.sent || 0} perangkat`);
    } catch (e) {
      toast.error(errMsg(e, "Gagal mengirim broadcast WhatsApp"));
    } finally {
      setWaSending(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-5 space-y-4 max-w-2xl">
          <Field label="ID Pengguna (kosongkan = broadcast ke semua pengguna)">
            <Input
              type="number"
              min="1"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder="cth: 12 — kosongkan untuk semua"
            />
          </Field>
          <Field label="Tipe">
            <Select value={type} onChange={setType} options={NOTIF_TYPES} className="h-10 w-full text-sm" ariaLabel="Tipe notifikasi" />
          </Field>
          <Field label="Judul">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="cth: Promo akhir tahun" />
          </Field>
          <Field label="Pesan">
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Isi pesan notifikasi..."
              rows={4}
              className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </Field>
          <Field label="Link (opsional)">
            <Input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://... atau /dashboard" />
          </Field>
          <div className="flex justify-end">
            <Button size="sm" onClick={handleSend} disabled={sending} className="gap-1.5">
              <Send className="w-3.5 h-3.5" />
              {sending ? "Mengirim..." : "Kirim Notifikasi"}
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
              Pesan dikirim sebagai pesan WhatsApp ke nomor masing-masing pengguna yang perangkatnya terhubung.
            </p>
          </div>
          <Field label={`Pesan (${waMessage.length}/1000)`}>
            <textarea
              value={waMessage}
              onChange={(e) => setWaMessage(e.target.value.slice(0, 1000))}
              placeholder="Tulis pesan broadcast..."
              rows={4}
              className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </Field>
          {waResult && (
            <p className="text-sm text-muted-foreground">
              Terkirim ke {waResult.sent} perangkat
              {waResult.failed > 0 ? `, gagal ${waResult.failed}` : ""}.
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
              {waSending ? "Mengirim..." : "Kirim via WhatsApp"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {waConfirm && (
        <Modal title="Kirim Broadcast WhatsApp" onClose={() => setWaConfirm(false)}>
          <p className="text-sm text-muted-foreground">
            Pesan akan dikirim ke semua perangkat terhubung. Lanjutkan?
          </p>
          <div className="flex justify-end gap-2 mt-5">
            <Button variant="outline" size="sm" onClick={() => setWaConfirm(false)}>
              Batal
            </Button>
            <Button size="sm" onClick={handleWaSend} disabled={waSending}>
              {waSending ? "Mengirim..." : "Ya, kirim"}
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

const ACTION_LABEL: Record<string, string> = {
  create_user: "Buat pengguna",
  update_user: "Ubah pengguna",
  delete_user: "Hapus pengguna",
  create_package: "Buat paket",
  update_package: "Ubah paket",
  delete_package: "Hapus paket",
  create_voucher: "Buat voucher",
  delete_voucher: "Hapus voucher",
  send_notification: "Kirim notifikasi",
  broadcast_wa: "Broadcast WhatsApp",
  update_setting: "Ubah pengaturan",
  update_plan: "Ubah paket pengguna",
  login: "Masuk",
  logout: "Keluar",
};

const actionLabel = (a: string) =>
  ACTION_LABEL[a] || a.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

function ActivityLogTab() {
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
      .catch((e) => setError(errMsg(e, "Gagal memuat log aktivitas")))
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
                    <th className="p-3 font-medium">Waktu</th>
                    <th className="p-3 font-medium">Admin</th>
                    <th className="p-3 font-medium">Aksi</th>
                    <th className="p-3 font-medium">Target</th>
                    <th className="p-3 font-medium">Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((l) => (
                    <tr key={l.id} className="border-b border-border last:border-0">
                      <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">{fmtDate(l.createdAt)}</td>
                      <td className="p-3 text-xs truncate max-w-[180px]">{l.adminEmail || `#${l.adminId}`}</td>
                      <td className="p-3">
                        <Badge variant="secondary">{actionLabel(l.action)}</Badge>
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
                        Belum ada aktivitas tercatat
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
                    <Badge variant="secondary">{actionLabel(l.action)}</Badge>
                    <span className="text-xs text-muted-foreground shrink-0">{fmtDate(l.createdAt)}</span>
                  </div>
                  <p className="text-sm text-foreground truncate">{l.adminEmail || `Admin #${l.adminId}`}</p>
                  {(l.targetType || l.detail) && (
                    <p className="text-xs text-muted-foreground">
                      {l.targetType ? `Target: ${targetText(l)}` : ""}
                      {l.detail ? `${l.targetType ? " · " : ""}${l.detail}` : ""}
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
            {logs.length === 0 && (
              <Card>
                <CardContent className="p-8 text-center text-sm text-muted-foreground">
                  Belum ada aktivitas tercatat
                </CardContent>
              </Card>
            )}
          </div>

          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <p>
              {total} log · Halaman {page} dari {totalPages}
            </p>
            <div className="flex gap-1">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)} className="gap-1">
                <ChevronLeft className="w-3.5 h-3.5" /> Sebelumnya
              </Button>
              <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage(page + 1)} className="gap-1">
                Berikutnya <ChevronRight className="w-3.5 h-3.5" />
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
  redis: "ok" | "error";
  timestamp: number;
}

function HealthTab() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    apiGet<HealthStatus>("/admin/health")
      .then(setHealth)
      .catch((e) => setError(errMsg(e, "Gagal memeriksa kesehatan sistem")))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const statusCard = (label: string, status: "ok" | "error") => (
    <Card>
      <CardContent className="p-5 flex items-center gap-4">
        <span
          className={cn("w-3 h-3 rounded-full shrink-0", status === "ok" ? "bg-green-500" : "bg-red-500")}
        />
        <div>
          <p className="font-medium text-foreground">{label}</p>
          <p
            className={cn(
              "text-sm",
              status === "ok" ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
            )}
          >
            {status === "ok" ? "Berfungsi normal" : "Bermasalah"}
          </p>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" variant="outline" onClick={load} disabled={loading} className="gap-1.5">
          <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} /> Muat ulang
        </Button>
      </div>

      {loading && <LoadingRows n={2} />}
      {!loading && error && <ErrorCard message={error} onRetry={load} />}

      {!loading && !error && health && (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            {statusCard("Database", health.database)}
            {statusCard("Redis", health.redis)}
          </div>
          <p className="text-xs text-muted-foreground">
            Terakhir dicek: {new Date(health.timestamp * 1000).toLocaleString("id-ID")}
          </p>
        </>
      )}
    </div>
  );
}

/* ── Halaman utama ──────────────────────────────────── */

const TABS = [
  { id: "ringkasan", label: "Ringkasan", icon: LayoutDashboard },
  { id: "pengguna", label: "Pengguna", icon: Users },
  { id: "paket", label: "Paket", icon: Package },
  { id: "voucher", label: "Voucher", icon: Ticket },
  { id: "transaksi", label: "Transaksi", icon: ReceiptText },
  { id: "log", label: "Log Aktivitas", icon: ScrollText },
  { id: "kesehatan", label: "Kesehatan Sistem", icon: HeartPulse },
  { id: "pengaturan", label: "Pengaturan", icon: Settings },
  { id: "notifikasi", label: "Notifikasi", icon: BellRing },
];

const SECTION_DESC: Record<string, string> = {
  ringkasan: "Pantau pengguna, perangkat, pesan, dan pendapatan",
  pengguna: "Kelola semua pengguna terdaftar",
  paket: "Kelola paket langganan",
  voucher: "Kelola kode voucher",
  transaksi: "Riwayat transaksi pembayaran",
  log: "Jejak aktivitas para admin",
  kesehatan: "Status database dan Redis",
  pengaturan: "Pengaturan sistem",
  notifikasi: "Kirim notifikasi ke pengguna",
};

function AdminNav({
  activeTab,
  onSelect,
}: {
  activeTab: string;
  onSelect: (id: string) => void;
}) {
  return (
    <nav className="space-y-1">
      {TABS.map((t) => {
        const isActive = activeTab === t.id;
        return (
          <button
            key={t.id}
            onClick={() => onSelect(t.id)}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
              isActive
                ? "bg-primary/10 text-primary font-medium"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            )}
          >
            <t.icon className="w-4 h-4 shrink-0" />
            {t.label}
          </button>
        );
      })}
    </nav>
  );
}

export default function Admin() {
  const [tab, setTab] = useState("ringkasan");
  const [mobileOpen, setMobileOpen] = useState(false);
  const active = TABS.find((t) => t.id === tab) ?? TABS[0];

  const selectTab = (id: string) => {
    setTab(id);
    setMobileOpen(false);
  };

  return (
    <div className="flex gap-6">
      {/* Sidebar — desktop */}
      <aside className="hidden lg:block w-60 shrink-0">
        <div className="sticky top-6 space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Dashboard Admin</h2>
            <p className="text-sm text-muted-foreground">
              Kelola pengguna, paket, voucher, transaksi, dan pengaturan sistem
            </p>
          </div>
          <AdminNav activeTab={tab} onSelect={selectTab} />
        </div>
      </aside>

      {/* Drawer — mobile */}
      <div className={cn("fixed inset-0 z-50 lg:hidden", !mobileOpen && "pointer-events-none")}>
        <div
          onClick={() => setMobileOpen(false)}
          className={cn(
            "absolute inset-0 bg-black/50 transition-opacity duration-200",
            mobileOpen ? "opacity-100" : "opacity-0"
          )}
        />
        <aside
          className={cn(
            "absolute inset-y-0 left-0 w-64 bg-background border-r border-border p-4 transition-transform duration-200",
            mobileOpen ? "translate-x-0" : "-translate-x-full"
          )}
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-foreground">Dashboard Admin</h2>
            <button
              onClick={() => setMobileOpen(false)}
              aria-label="Tutup menu"
              className="p-2 -mr-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <AdminNav activeTab={tab} onSelect={selectTab} />
        </aside>
      </div>

      {/* Konten */}
      <div className="flex-1 min-w-0 space-y-6">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMobileOpen(true)}
            aria-label="Buka menu admin"
            className="lg:hidden p-2 -ml-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-lg font-semibold text-foreground">{active.label}</h2>
            <p className="text-sm text-muted-foreground">{SECTION_DESC[tab]}</p>
          </div>
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
    </div>
  );
}

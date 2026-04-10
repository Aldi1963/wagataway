import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3, Download, FileText, Users, Smartphone,
  MessageSquare, CreditCard, Calendar, Loader2, TrendingUp, RefreshCw,
  Send, CheckCircle2, XCircle, Clock,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { id as localeId } from "date-fns/locale";

// ── CSV Helper ────────────────────────────────────────────────────────────────

function downloadCSV(rows: string[][], filename: string) {
  const csv = rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}

// ── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, sub, color }: {
  icon: React.FC<{ className?: string }>;
  label: string;
  value: string | number;
  sub?: string;
  color: string;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className={`text-2xl font-bold mt-0.5 ${color}`}>{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
          </div>
          <div className="p-2.5 rounded-xl bg-muted/60 shrink-0">
            <Icon className={`w-5 h-5 ${color}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function Laporan() {
  const { toast } = useToast();
  const [exportingTransactions, setExportingTransactions] = useState(false);
  const [exportingUsers, setExportingUsers] = useState(false);
  const [exportingDevices, setExportingDevices] = useState(false);
  const [exportingMessages, setExportingMessages] = useState(false);

  const { data: transactions = [], isLoading: txLoading, refetch: refetchTx } = useQuery<any[]>({
    queryKey: ["laporan-transactions"],
    queryFn: () => apiFetch("/billing/transactions").then((r) => r.json()),
  });

  const { data: subscription } = useQuery<any>({
    queryKey: ["billing-subscription"],
    queryFn: () => apiFetch("/billing/subscription").then((r) => r.json()),
  });

  const { data: usage } = useQuery<any>({
    queryKey: ["billing-usage"],
    queryFn: () => apiFetch("/billing/usage").then((r) => r.json()),
  });

  const { data: messagesData, isLoading: msgLoading, refetch: refetchMsg } = useQuery<any>({
    queryKey: ["laporan-messages"],
    queryFn: () => apiFetch("/messages?limit=50").then((r) => r.json()),
  });

  const messages: any[] = messagesData?.data ?? [];
  const totalMessages: number = messagesData?.total ?? 0;

  // ── Export handlers ────────────────────────────────────────────────────────

  function exportTransactionsCSV() {
    setExportingTransactions(true);
    try {
      const rows: string[][] = [
        ["ID", "Deskripsi", "Jumlah (IDR)", "Status", "Tanggal"],
        ...transactions.map((t: any) => [
          String(t.id),
          t.description ?? "",
          String(t.amount ?? 0),
          t.status ?? "",
          t.createdAt ? format(new Date(t.createdAt), "dd MMMM yyyy HH:mm", { locale: localeId }) : "",
        ]),
      ];
      downloadCSV(rows, `transaksi-${format(new Date(), "yyyyMMdd")}.csv`);
      toast({ title: "CSV transaksi berhasil diunduh" });
    } finally {
      setExportingTransactions(false);
    }
  }

  async function exportUsersCSV() {
    setExportingUsers(true);
    try {
      const res = await apiFetch("/admin/users?limit=1000");
      const data = await res.json();
      const users: any[] = Array.isArray(data) ? data : (data.users ?? []);
      const rows: string[][] = [
        ["ID", "Nama", "Email", "Paket", "Role", "Perangkat", "Disuspend", "Dibuat"],
        ...users.map((u: any) => [
          String(u.id),
          u.name ?? "",
          u.email ?? "",
          u.plan ?? "free",
          u.role ?? "user",
          String(u.deviceCount ?? 0),
          u.isSuspended ? "Ya" : "Tidak",
          u.createdAt ? format(new Date(u.createdAt), "dd MMMM yyyy", { locale: localeId }) : "",
        ]),
      ];
      downloadCSV(rows, `pengguna-${format(new Date(), "yyyyMMdd")}.csv`);
      toast({ title: "CSV pengguna berhasil diunduh" });
    } catch {
      toast({ title: "Gagal mengunduh data pengguna", variant: "destructive" });
    } finally {
      setExportingUsers(false);
    }
  }

  async function exportDevicesCSV() {
    setExportingDevices(true);
    try {
      const res = await apiFetch("/devices");
      const devices: any[] = await res.json();
      const rows: string[][] = [
        ["ID", "Nama", "Nomor WhatsApp", "Status", "Pesan Terkirim", "Dibuat"],
        ...devices.map((d: any) => [
          String(d.id),
          d.name ?? "",
          d.phone ?? "",
          d.status ?? "",
          String(d.messagesSent ?? 0),
          d.createdAt ? format(new Date(d.createdAt), "dd MMMM yyyy HH:mm", { locale: localeId }) : "",
        ]),
      ];
      downloadCSV(rows, `perangkat-${format(new Date(), "yyyyMMdd")}.csv`);
      toast({ title: "CSV perangkat berhasil diunduh" });
    } catch {
      toast({ title: "Gagal mengunduh data perangkat", variant: "destructive" });
    } finally {
      setExportingDevices(false);
    }
  }

  async function exportMessagesCSV() {
    setExportingMessages(true);
    try {
      const res = await apiFetch("/messages?limit=5000&page=1");
      const data = await res.json();
      const msgs: any[] = data.data ?? [];
      const rows: string[][] = [
        ["ID", "Nomor Tujuan", "Pesan", "Status", "Perangkat", "Tanggal"],
        ...msgs.map((m: any) => [
          String(m.id),
          m.phone ?? "",
          m.message ?? "",
          m.status ?? "",
          `Device #${m.deviceId}`,
          m.createdAt ? format(new Date(m.createdAt), "dd MMMM yyyy HH:mm", { locale: localeId }) : "",
        ]),
      ];
      downloadCSV(rows, `pesan-${format(new Date(), "yyyyMMdd")}.csv`);
      toast({ title: `CSV pesan berhasil diunduh (${msgs.length} pesan)` });
    } catch {
      toast({ title: "Gagal mengunduh data pesan", variant: "destructive" });
    } finally {
      setExportingMessages(false);
    }
  }

  // ── Derived stats ──────────────────────────────────────────────────────────

  const totalRevenue = transactions
    .filter((t: any) => t.status === "paid" && Number(t.amount) > 0)
    .reduce((sum: number, t: any) => sum + Number(t.amount ?? 0), 0);

  const paidTxCount = transactions.filter((t: any) => t.status === "paid").length;
  const pendingTxCount = transactions.filter((t: any) => t.status === "pending").length;

  const formatIDR = (n: number) =>
    new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);

  const sentCount = messages.filter((m: any) => m.status === "sent").length;
  const failedCount = messages.filter((m: any) => m.status === "failed").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end gap-3">
        <Button variant="outline" size="sm" onClick={() => { refetchTx(); refetchMsg(); }} className="gap-2">
          <RefreshCw className="w-4 h-4" />
          Refresh
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          icon={CreditCard}
          label="Total Pendapatan"
          value={formatIDR(totalRevenue)}
          sub={`${paidTxCount} transaksi berhasil`}
          color="text-green-600"
        />
        <StatCard
          icon={TrendingUp}
          label="Paket Aktif"
          value={subscription?.planName ?? "Free"}
          sub={subscription?.currentPeriodEnd
            ? `s/d ${format(new Date(subscription.currentPeriodEnd), "d MMM yyyy", { locale: localeId })}`
            : undefined}
          color="text-blue-600"
        />
        <StatCard
          icon={MessageSquare}
          label="Pesan Hari Ini"
          value={usage?.messages?.used ?? 0}
          sub={usage?.messages?.limit === -1 ? "Tidak terbatas" : `Limit: ${usage?.messages?.limit ?? 0}`}
          color="text-purple-600"
        />
        <StatCard
          icon={Smartphone}
          label="Perangkat Aktif"
          value={usage?.devices?.used ?? 0}
          sub={usage?.devices?.limit === -1 ? "Tidak terbatas" : `Limit: ${usage?.devices?.limit ?? 0}`}
          color="text-orange-600"
        />
      </div>

      {/* Export Cards */}
      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-green-600" />
              Transaksi
            </CardTitle>
            <CardDescription>Riwayat pembayaran dan pembelian paket</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Total transaksi</span>
              <span className="font-semibold">{transactions.length}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Berhasil</span>
              <Badge variant="secondary" className="text-green-700 bg-green-50 border-green-200 dark:bg-green-950/30 dark:text-green-400">{paidTxCount}</Badge>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Pending</span>
              <Badge variant="secondary" className="text-amber-700 bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400">{pendingTxCount}</Badge>
            </div>
            <Button
              className="w-full gap-2 mt-1"
              size="sm"
              onClick={exportTransactionsCSV}
              disabled={exportingTransactions || transactions.length === 0}
            >
              {exportingTransactions ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              Unduh CSV
            </Button>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-purple-600" />
              Pesan
            </CardTitle>
            <CardDescription>Riwayat semua pesan yang dikirim</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Total pesan</span>
              <span className="font-semibold">{totalMessages}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Terkirim</span>
              <Badge variant="secondary" className="text-green-700 bg-green-50 border-green-200 dark:bg-green-950/30 dark:text-green-400">{sentCount}</Badge>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Gagal</span>
              <Badge variant="secondary" className="text-red-700 bg-red-50 border-red-200 dark:bg-red-950/30 dark:text-red-400">{failedCount}</Badge>
            </div>
            <Button
              className="w-full gap-2 mt-1"
              size="sm"
              variant="outline"
              onClick={exportMessagesCSV}
              disabled={exportingMessages || totalMessages === 0}
            >
              {exportingMessages ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              Unduh CSV
            </Button>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="w-4 h-4 text-blue-600" />
              Pengguna
            </CardTitle>
            <CardDescription>Daftar semua pengguna terdaftar (Admin only)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Termasuk nama, email, paket, status akun, dan jumlah perangkat.
            </p>
            <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 px-3 py-2 text-xs text-blue-700 dark:text-blue-400">
              Memerlukan akses admin untuk mengunduh data ini
            </div>
            <Button
              className="w-full gap-2 mt-1"
              size="sm"
              variant="outline"
              onClick={exportUsersCSV}
              disabled={exportingUsers}
            >
              {exportingUsers ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              Unduh CSV
            </Button>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-orange-600" />
              Perangkat
            </CardTitle>
            <CardDescription>Daftar perangkat WhatsApp yang terhubung</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Nama perangkat, nomor WhatsApp, status koneksi, dan jumlah pesan terkirim.
            </p>
            <Button
              className="w-full gap-2 mt-1"
              size="sm"
              variant="outline"
              onClick={exportDevicesCSV}
              disabled={exportingDevices}
            >
              {exportingDevices ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              Unduh CSV
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* History Tabs */}
      <Tabs defaultValue="pesan">
        <TabsList>
          <TabsTrigger value="pesan" className="gap-1.5">
            <Send className="w-3.5 h-3.5" />
            Riwayat Pesan
          </TabsTrigger>
          <TabsTrigger value="transaksi" className="gap-1.5">
            <FileText className="w-3.5 h-3.5" />
            Riwayat Transaksi
          </TabsTrigger>
        </TabsList>

        {/* Messages Tab */}
        <TabsContent value="pesan">
          <Card>
            <CardContent className="p-0">
              {msgLoading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
                  <MessageSquare className="w-8 h-8" />
                  <p className="text-sm">Belum ada riwayat pesan</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/40">
                        <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Nomor Tujuan</th>
                        <th className="text-left px-4 py-3 font-semibold text-muted-foreground max-w-[200px]">Pesan</th>
                        <th className="text-center px-4 py-3 font-semibold text-muted-foreground">Status</th>
                        <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Tanggal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {messages.map((m: any) => (
                        <tr key={m.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                          <td className="px-4 py-3 font-mono text-xs text-foreground">{m.phone}</td>
                          <td className="px-4 py-3 text-muted-foreground max-w-[200px] truncate">{m.message ?? "—"}</td>
                          <td className="px-4 py-3 text-center">
                            <Badge
                              variant="secondary"
                              className={
                                m.status === "sent"
                                  ? "text-green-700 bg-green-50 border-green-200 dark:bg-green-950/30 dark:text-green-400"
                                  : m.status === "failed"
                                  ? "text-red-700 bg-red-50 border-red-200 dark:bg-red-950/30 dark:text-red-400"
                                  : "text-amber-700 bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400"
                              }
                            >
                              {m.status === "sent"
                                ? <><CheckCircle2 className="w-3 h-3 inline mr-1" />Terkirim</>
                                : m.status === "failed"
                                ? <><XCircle className="w-3 h-3 inline mr-1" />Gagal</>
                                : <><Clock className="w-3 h-3 inline mr-1" />Pending</>}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-right text-muted-foreground whitespace-nowrap text-xs">
                            {m.createdAt ? format(new Date(m.createdAt), "d MMM yyyy HH:mm", { locale: localeId }) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {totalMessages > 50 && (
                    <p className="text-xs text-center text-muted-foreground py-3 border-t">
                      Menampilkan 50 dari {totalMessages} pesan. Gunakan tombol "Unduh CSV" untuk semua data.
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Transactions Tab */}
        <TabsContent value="transaksi">
          <Card>
            <CardContent className="p-0">
              {txLoading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : transactions.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
                  <FileText className="w-8 h-8" />
                  <p className="text-sm">Belum ada riwayat transaksi</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/40">
                        <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Deskripsi</th>
                        <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Jumlah</th>
                        <th className="text-center px-4 py-3 font-semibold text-muted-foreground">Status</th>
                        <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Tanggal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {transactions.map((t: any) => (
                        <tr key={t.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                          <td className="px-4 py-3 text-foreground max-w-[200px] truncate">{t.description ?? "—"}</td>
                          <td className="px-4 py-3 text-right font-medium">
                            {Number(t.amount) > 0
                              ? formatIDR(Number(t.amount))
                              : <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <Badge
                              variant="secondary"
                              className={
                                t.status === "paid"
                                  ? "text-green-700 bg-green-50 border-green-200 dark:bg-green-950/30 dark:text-green-400"
                                  : t.status === "pending"
                                  ? "text-amber-700 bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400"
                                  : "text-red-700 bg-red-50 border-red-200 dark:bg-red-950/30 dark:text-red-400"
                              }
                            >
                              {t.status === "paid" ? "Berhasil" : t.status === "pending" ? "Pending" : t.status}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-right text-muted-foreground whitespace-nowrap">
                            {t.createdAt ? format(new Date(t.createdAt), "d MMM yyyy", { locale: localeId }) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Info footer */}
      <Card className="bg-muted/30">
        <CardContent className="p-4">
          <div className="flex gap-3 items-start">
            <Calendar className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
            <p className="text-xs text-muted-foreground">
              Data diperbarui secara real-time. File CSV menggunakan encoding UTF-8 BOM agar kompatibel dengan Microsoft Excel.
              Laporan dihasilkan pada: <strong>{format(new Date(), "d MMMM yyyy, HH:mm", { locale: localeId })}</strong>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

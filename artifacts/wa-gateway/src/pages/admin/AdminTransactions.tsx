import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Receipt, Search, ChevronLeft, ChevronRight, CheckCircle2,
  XCircle, Clock, RefreshCw, Filter, Wallet, CreditCard, Activity,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { apiFetch } from "@/lib/api";
import { format } from "date-fns";
import { id as localeId } from "date-fns/locale";

function fmtAmount(amount: number, currency: string) {
  if (currency === "IDR") return `Rp ${amount.toLocaleString("id-ID")}`;
  return `$${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function StatusBadge({ status }: { status: string }) {
  if (status === "paid") return (
    <Badge className="gap-1 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 hover:bg-emerald-100">
      <CheckCircle2 className="w-3 h-3" /> Paid
    </Badge>
  );
  if (status === "pending") return (
    <Badge variant="outline" className="gap-1 text-yellow-600 border-yellow-300 bg-yellow-50 dark:bg-yellow-950/20">
      <Clock className="w-3 h-3" /> Pending
    </Badge>
  );
  return (
    <Badge variant="outline" className="gap-1 text-destructive border-destructive/30 bg-destructive/5">
      <XCircle className="w-3 h-3" /> {status}
    </Badge>
  );
}

interface AdminTransaction {
  type: "plan" | "wallet";
  id: number;
  amount: number;
  currency: string;
  status: string;
  description: string | null;
  createdAt: string | null;
  orderId: string | null;
  walletType: string | null;
  planId: string | null;
  webhook: {
    status: string;
    message: string | null;
    httpStatus: number | null;
    createdAt: string | null;
    count: number;
  } | null;
  user: { id: number; email: string; name: string | null };
}

function TypeBadge({ tx }: { tx: AdminTransaction }) {
  if (tx.type === "wallet") {
    return (
      <Badge variant="outline" className="gap-1 bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/20 dark:text-blue-300">
        <Wallet className="w-3 h-3" /> {tx.walletType === "topup" ? "Topup" : tx.walletType ?? "Wallet"}
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className="gap-1 bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-950/20 dark:text-slate-300">
      <CreditCard className="w-3 h-3" /> Paket
    </Badge>
  );
}

function WebhookSummary({ webhook }: { webhook: AdminTransaction["webhook"] }) {
  if (!webhook) {
    return <span className="text-xs text-muted-foreground">Belum ada webhook</span>;
  }

  const statusClass =
    webhook.status === "paid"
      ? "text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-300 dark:bg-emerald-950/20"
      : webhook.status === "failed"
        ? "text-red-700 bg-red-50 border-red-200 dark:text-red-300 dark:bg-red-950/20"
        : webhook.status === "ignored"
          ? "text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-300 dark:bg-amber-950/20"
          : "text-sky-700 bg-sky-50 border-sky-200 dark:text-sky-300 dark:bg-sky-950/20";

  return (
    <div className="min-w-0">
      <Badge variant="outline" className={`gap-1 ${statusClass}`}>
        <Activity className="w-3 h-3" /> {webhook.status}
        {webhook.count > 1 ? ` (${webhook.count})` : ""}
      </Badge>
      <p className="mt-1 max-w-[220px] truncate text-[10px] text-muted-foreground">
        {webhook.message ?? (webhook.httpStatus ? `HTTP ${webhook.httpStatus}` : "Webhook tercatat")}
      </p>
    </div>
  );
}

export default function AdminTransactions() {
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [status, setStatus] = useState("__all__");
  const [type, setType] = useState("__all__");
  const [page, setPage] = useState(1);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin-transactions", page, search, status, type],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), limit: "30" });
      if (search) params.set("search", search);
      if (status !== "__all__") params.set("status", status);
      if (type !== "__all__") params.set("type", type);
      return apiFetch(`/admin/transactions?${params}`).then((r) => r.json());
    },
  });

  const transactions: AdminTransaction[] = data?.data ?? [];
  const total: number = data?.total ?? 0;
  const totalPages: number = data?.totalPages ?? 1;

  function handleSearch() {
    setSearch(searchInput);
    setPage(1);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end">
        <Button variant="outline" size="sm" className="gap-2" onClick={() => refetch()}>
          <RefreshCw className="w-4 h-4" /> Refresh
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3">
            <div className="flex-1 min-w-[200px] flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                <Input
                  placeholder="Cari email, nama, order ID, atau deskripsi..."
                  className="pl-9 h-9"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                />
              </div>
              <Button size="sm" onClick={handleSearch} className="h-9 gap-1.5">
                <Search className="w-3.5 h-3.5" /> Cari
              </Button>
            </div>
            <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
              <SelectTrigger className="w-40 h-9">
                <Filter className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Semua Status</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
              </SelectContent>
            </Select>
            <Select value={type} onValueChange={(v) => { setType(v); setPage(1); }}>
              <SelectTrigger className="w-40 h-9">
                <Receipt className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Semua Tipe</SelectItem>
                <SelectItem value="wallet">Topup/Wallet</SelectItem>
                <SelectItem value="plan">Paket</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Receipt className="w-4 h-4" />
            Daftar Transaksi ({total})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
            </div>
          ) : transactions.length === 0 ? (
            <div className="py-16 flex flex-col items-center gap-3 text-center px-4">
              <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center">
                <Receipt className="w-7 h-7 text-muted-foreground/50" />
              </div>
              <div>
                <p className="font-semibold">Tidak ada transaksi</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {search || status !== "__all__" || type !== "__all__" ? "Coba ubah filter pencarian" : "Belum ada transaksi yang tercatat"}
                </p>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              {/* Header row */}
              <div className="grid min-w-[1040px] grid-cols-[1.1fr_1.35fr_auto_auto_1fr_auto_auto] gap-3 px-4 py-2 border-b bg-muted/50 text-xs text-muted-foreground font-medium">
                <span>Pengguna</span>
                <span>Order & Deskripsi</span>
                <span>Tipe</span>
                <span>Status</span>
                <span>Webhook</span>
                <span className="text-right">Jumlah</span>
                <span className="text-right">Tanggal</span>
              </div>
              <div className="divide-y">
                {transactions.map((tx) => (
                  <div key={`${tx.type}-${tx.id}`} className="grid min-w-[1040px] grid-cols-[1.1fr_1.35fr_auto_auto_1fr_auto_auto] gap-3 px-4 py-3 items-center hover:bg-muted/20 transition-colors">
                    {/* User */}
                    <div className="flex items-center gap-2 min-w-0">
                      <Avatar className="h-7 w-7 shrink-0">
                        <AvatarFallback className="text-[10px] bg-primary/10 text-primary font-bold">
                          {(tx.user?.name || tx.user?.email || "U").charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="text-xs font-medium truncate">{tx.user?.name || "—"}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{tx.user?.email}</p>
                      </div>
                    </div>
                    {/* Order & description */}
                    <div className="min-w-0">
                      <p className="font-mono text-[11px] font-medium truncate">{tx.orderId || "order ID kosong"}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground truncate">{tx.description || "Tidak ada deskripsi"}</p>
                    </div>
                    {/* Type */}
                    <TypeBadge tx={tx} />
                    {/* Status */}
                    <StatusBadge status={tx.status} />
                    {/* Webhook */}
                    <WebhookSummary webhook={tx.webhook} />
                    {/* Amount */}
                    <div className="text-right">
                      <p className="text-sm font-semibold">{fmtAmount(tx.amount, tx.currency)}</p>
                      <p className="text-[10px] text-muted-foreground uppercase">{tx.currency}</p>
                    </div>
                    {/* Date */}
                    <div className="text-right shrink-0">
                      <p className="text-xs font-medium">
                        {tx.createdAt ? format(new Date(tx.createdAt), "dd MMM yy", { locale: localeId }) : "—"}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {tx.createdAt ? format(new Date(tx.createdAt), "HH:mm") : ""}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm text-muted-foreground">
            Halaman {page} dari {totalPages}
          </span>
          <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

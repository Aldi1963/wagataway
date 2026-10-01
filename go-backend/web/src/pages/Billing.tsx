import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ExternalLink, Loader2, QrCode, Receipt, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { apiGet, apiPost } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import InvoiceModal, {
  tglID,
  metodeLabel,
  type InvoiceTx,
} from "./InvoiceModal";

interface Plan {
  id: number;
  name: string;
  slug: string;
  description: string;
  price: number;
  duration: number;
  features: string;
  sortOrder: number;
}

interface Subscription {
  id: number;
  planId: number;
  status: string;
  startDate: string;
  endDate: string;
  Plan: Plan;
}

interface TxStatus {
  id: number;
  status: string;
  paymentRef?: string;
}

// Fitur 2: riwayat transaksi milik user (dari GET /billing/transactions).
interface Tx extends InvoiceTx {
  externalId?: string;
}

// Fitur 4: rincian ganti paket prorata (dari GET /billing/prorate).
interface ProrateQuote {
  prorate: boolean;
  oldPlanId?: number;
  oldPlanName?: string;
  newPlanId: number;
  newPlanName: string;
  newPrice: number;
  remainingDays: number;
  creditAmount: number;
  payableAmount: number;
  isTrial?: boolean;
}

const txStatusMeta: Record<string, { label: string; className: string }> = {
  paid: { label: "Lunas", className: "bg-green-500/15 text-green-600 border-green-500/30" },
  pending: { label: "Menunggu", className: "bg-amber-500/15 text-amber-600 border-amber-500/30" },
  failed: { label: "Gagal", className: "bg-red-500/15 text-red-600 border-red-500/30" },
  expired: { label: "Kadaluarsa", className: "bg-muted text-muted-foreground border-border" },
  cancelled: { label: "Dibatalkan", className: "bg-muted text-muted-foreground border-border" },
  refunded: { label: "Refund", className: "bg-blue-500/15 text-blue-600 border-blue-500/30" },
};

function txStatusBadge(status: string) {
  const meta = txStatusMeta[status?.toLowerCase()] || {
    label: status || "-",
    className: "bg-muted text-muted-foreground border-border",
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${meta.className}`}
    >
      {meta.label}
    </span>
  );
}

function parseFeatures(raw: string): string[] {
  try {
    const arr = JSON.parse(raw || "[]");
    return Array.isArray(arr) ? arr.map(String) : [];
  } catch {
    return [];
  }
}

function rupiah(n: number) {
  return `Rp ${n.toLocaleString("id-ID")}`;
}

export default function Billing({ embedded = false }: { embedded?: boolean }) {
  const { user } = useAuth();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [sub, setSub] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);

  // Fitur 2: riwayat transaksi + kwitansi
  const [txs, setTxs] = useState<Tx[]>([]);
  const [txLoading, setTxLoading] = useState(true);
  const [invoiceTx, setInvoiceTx] = useState<Tx | null>(null);

  // Payment modal state
  const [payPlan, setPayPlan] = useState<Plan | null>(null);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState("");
  const [paymentUrl, setPaymentUrl] = useState("");
  const [qrUrl, setQrUrl] = useState("");
  const [txStatus, setTxStatus] = useState("");
  const pollRef = useRef<number | null>(null);

  // Fitur 4: quote prorata saat ganti paket
  const [quote, setQuote] = useState<ProrateQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      const [p, s] = await Promise.all([
        apiGet<{ plans: Plan[] }>("/billing/plans"),
        apiGet<{ subscription: Subscription | null }>("/billing/subscription"),
      ]);
      setPlans(p.plans || []);
      setSub(s.subscription);
      // Fitur 1: tombol "Perpanjang" di dashboard mengarah ke /billing?perpanjang=1
      // -> langsung buka modal pembayaran untuk paket yang SAMA (tanpa pilih ulang).
      try {
        const q = new URLSearchParams(window.location.search);
        if (q.get("perpanjang") === "1" && s.subscription?.Plan) {
          q.delete("perpanjang");
          const qs = q.toString();
          window.history.replaceState(
            null,
            "",
            window.location.pathname + (qs ? `?${qs}` : "")
          );
          setPayPlan(s.subscription.Plan);
        }
      } catch {
        /* abaikan */
      }
    } catch {
      /* abaikan, tampilkan kosong */
    } finally {
      setLoading(false);
    }
    // Fitur 2: riwayat transaksi milik user yang login
    try {
      const t = await apiGet<{ transactions: Tx[] }>("/billing/transactions");
      setTxs(t.transactions || []);
    } catch {
      /* abaikan */
    } finally {
      setTxLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, [load]);

  const stopPoll = () => {
    if (pollRef.current) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const closePay = () => {
    stopPoll();
    setPayPlan(null);
    setPaying(false);
    setPayError("");
    setPaymentUrl("");
    setQrUrl("");
    setTxStatus("");
    setQuote(null);
    setQuoteLoading(false);
  };

  // Fitur 4: buka modal pembayaran. Bila user punya langganan aktif dan
  // memilih paket BERBEDA → ambil dulu rincian prorata untuk ditampilkan
  // sebagai konfirmasi sebelum bayar.
  const openPay = async (plan: Plan) => {
    setPayError("");
    setPaymentUrl("");
    setQrUrl("");
    setTxStatus("");
    setQuote(null);
    const isSwitch = !!sub && sub.planId !== plan.id;
    setPayPlan(plan);
    if (isSwitch) {
      setQuoteLoading(true);
      try {
        const r = await apiGet<{ quote: ProrateQuote }>(
          `/billing/prorate?planId=${plan.id}`
        );
        setQuote(r.quote);
      } catch {
        setPayError("Gagal menghitung prorata. Coba lagi.");
      } finally {
        setQuoteLoading(false);
      }
    }
  };

  const startPolling = (id: number) => {
    stopPoll();
    pollRef.current = window.setInterval(async () => {
      try {
        const r = await apiGet<{ transaction: TxStatus }>(`/billing/transactions/${id}`);
        const st = r.transaction.status;
        setTxStatus(st);
        if (st === "paid") {
          stopPoll();
          load();
        } else if (st === "expired" || st === "failed" || st === "cancelled") {
          stopPoll();
        }
      } catch {
        /* coba lagi di interval berikutnya */
      }
    }, 5000);
  };

  const bayar = async () => {
    if (!payPlan || paying) return;
    setPaying(true);
    setPayError("");
    try {
      const r = await apiPost<{
        paymentUrl: string;
        qrUrl: string;
        quote?: ProrateQuote;
        activated?: boolean;
        transaction: { id: number };
      }>("/billing/subscribe", { planId: payPlan.id });
      // Fitur 4: payable 0 → langsung aktif, tanpa pembayaran
      if (r.activated) {
        setTxStatus("paid");
        load();
        return;
      }
      setPaymentUrl(r.paymentUrl);
      setQrUrl(r.qrUrl);
      setTxStatus("pending");
      startPolling(r.transaction.id);
    } catch (e: any) {
      setPayError(e?.message || "Gagal membuat pembayaran");
    } finally {
      setPaying(false);
    }
  };

  const currentPlanName = sub?.Plan?.name || "Free";
  const paid = txStatus === "paid";
  const dead = ["expired", "failed", "cancelled"].includes(txStatus);

  return (
    <div className="space-y-6">
      {!embedded && (
        <div>
          <h2 className="text-lg font-semibold text-foreground">Langganan</h2>
          <p className="text-sm text-muted-foreground">Pilih paket yang sesuai kebutuhan</p>
        </div>
      )}

      {/* Current Plan */}
      <Card>
        <CardContent className="p-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">
              Paket saat ini: <span className="font-bold">{currentPlanName}</span>
            </p>
            <p className="text-xs text-muted-foreground">
              {sub
                ? `Aktif sampai ${new Date(sub.endDate).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}`
                : "Paket dasar gratis"}
            </p>
          </div>
          <Badge variant="outline">Aktif</Badge>
        </CardContent>
      </Card>

      {/* Plans Grid */}
      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {plans.map((plan, i) => {
            const isCurrent = sub?.planId === plan.id || (!sub && plan.price === 0);
            // Fitur 4: langganan aktif memilih paket lain = ganti paket (prorata)
            const isSwitch = !!sub && sub.planId !== plan.id;
            const features = parseFeatures(plan.features);
            return (
              <Card key={plan.id} className={i === 1 && plans.length > 2 ? "border-foreground" : ""}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm">{plan.name}</CardTitle>
                    {i === 1 && plans.length > 2 && <Badge className="text-[9px]">Popular</Badge>}
                  </div>
                  <div className="pt-1">
                    <span className="text-2xl font-bold text-foreground">
                      {plan.price === 0 ? "Gratis" : rupiah(plan.price)}
                    </span>
                    {plan.price > 0 && (
                      <span className="text-xs text-muted-foreground">
                        /{plan.duration >= 360 ? "tahun" : "bulan"}
                      </span>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 mb-4">
                    {features.map((f) => (
                      <li key={f} className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Check className="w-3 h-3 text-foreground shrink-0" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <Button
                    variant={isCurrent ? "outline" : "default"}
                    className="w-full"
                    size="sm"
                    disabled={isCurrent}
                    onClick={() => openPay(plan)}
                  >
                    {isCurrent ? "Paket Saat Ini" : isSwitch ? "Ganti Paket" : "Pilih Paket"}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Fitur 2: Riwayat Transaksi */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Riwayat Transaksi</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {txLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : txs.length === 0 ? (
            <p className="text-sm text-muted-foreground px-4 pb-4">
              Belum ada riwayat transaksi.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-sm">
                <thead>
                  <tr className="border-y border-border text-left text-xs text-muted-foreground">
                    <th className="font-medium px-4 py-2.5">Tanggal</th>
                    <th className="font-medium px-4 py-2.5">Invoice</th>
                    <th className="font-medium px-4 py-2.5">Paket</th>
                    <th className="font-medium px-4 py-2.5 text-right">Nominal</th>
                    <th className="font-medium px-4 py-2.5">Metode</th>
                    <th className="font-medium px-4 py-2.5">Status</th>
                    <th className="font-medium px-4 py-2.5 w-28" />
                  </tr>
                </thead>
                <tbody>
                  {txs.map((tx) => (
                    <tr key={tx.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                        {tglID(tx.paidAt || tx.createdAt)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap font-mono text-xs">
                        {tx.invoiceNumber || "-"}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap font-medium text-foreground">
                        {tx.Plan?.name || "-"}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-right font-semibold text-foreground">
                        {rupiah(tx.amount)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                        {metodeLabel(tx.paymentMethod)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {txStatusBadge(tx.status)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-right">
                        {tx.status === "paid" && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => setInvoiceTx(tx)}
                          >
                            <Receipt className="w-3.5 h-3.5 mr-1" />
                            Kwitansi
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Payment modal */}
      {payPlan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={closePay} />
          <Card className="relative w-full max-w-md max-h-[90vh] overflow-y-auto">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-base">
                {paid ? "Pembayaran Berhasil" : `Bayar Paket ${payPlan.name}`}
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={closePay} aria-label="Tutup">
                <X className="w-4 h-4" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {!paymentUrl && !paid && !dead ? (
                <>
                  <div className="rounded-lg border border-border p-3">
                    <div className="flex items-baseline justify-between">
                      <span className="text-sm font-semibold text-foreground">{payPlan.name}</span>
                      <span className="text-lg font-bold text-foreground">{rupiah(payPlan.price)}</span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {payPlan.duration} hari &middot; pembayaran via QRIS / VA / e-wallet melalui Clipku Pay
                    </p>
                  </div>
                  {/* Fitur 4: rincian prorata sebelum bayar */}
                  {quoteLoading ? (
                    <div className="flex items-center justify-center gap-2 py-3 text-sm text-muted-foreground">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Menghitung prorata&hellip;
                    </div>
                  ) : quote?.prorate ? (
                    <div className="rounded-lg border border-[#243370]/30 bg-[#243370]/5 p-3 space-y-2">
                      <p className="text-xs font-semibold text-foreground">
                        Rincian Ganti Paket (prorata)
                      </p>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">
                          Harga {quote.newPlanName}
                        </span>
                        <span className="font-medium text-foreground">{rupiah(quote.newPrice)}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">
                          Sisa nilai {quote.oldPlanName}
                          <span className="block text-[11px]">
                            {quote.remainingDays} hari tersisa{quote.isTrial ? " (trial)" : ""}
                          </span>
                        </span>
                        <span className="font-medium text-foreground">− {rupiah(quote.creditAmount)}</span>
                      </div>
                      <div className="flex items-center justify-between border-t border-border pt-2">
                        <span className="text-sm font-semibold text-foreground">Total bayar</span>
                        <span className="text-base font-bold text-foreground">
                          {quote.payableAmount === 0 ? "Gratis" : rupiah(quote.payableAmount)}
                        </span>
                      </div>
                      {quote.payableAmount === 0 && (
                        <p className="text-[11px] text-muted-foreground">
                          Sisa nilai paket lama menutupi penuh — paket baru langsung aktif tanpa pembayaran.
                        </p>
                      )}
                    </div>
                  ) : null}
                  {payError && (
                    <p className="text-sm text-destructive">{payError}</p>
                  )}
                  <div className="flex gap-2">
                    <Button
                      className="flex-1 bg-[#243370] hover:bg-[#1c2a5c] text-white"
                      onClick={bayar}
                      disabled={paying || quoteLoading}
                    >
                      {paying && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                      {quote?.prorate && quote.payableAmount === 0 ? "Aktifkan Sekarang" : "Bayar Sekarang"}
                    </Button>
                    <Button variant="outline" onClick={closePay}>
                      Batal
                    </Button>
                  </div>
                </>
              ) : paid ? (
                <div className="text-center space-y-3 py-4">
                  <div className="mx-auto w-12 h-12 rounded-full bg-green-500/15 flex items-center justify-center">
                    <Check className="w-6 h-6 text-green-500" />
                  </div>
                  <p className="text-sm font-semibold text-foreground">
                    Paket {payPlan.name} sudah aktif
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Langganan Anda berlaku {payPlan.duration} hari ke depan.
                  </p>
                  <Button className="w-full" onClick={closePay}>
                    Selesai
                  </Button>
                </div>
              ) : dead ? (
                <div className="text-center space-y-3 py-4">
                  <p className="text-sm font-semibold text-foreground">Pembayaran {txStatus}</p>
                  <p className="text-xs text-muted-foreground">
                    Silakan buat pembayaran baru bila masih ingin upgrade.
                  </p>
                  <Button className="w-full" variant="outline" onClick={closePay}>
                    Tutup
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex flex-col items-center gap-2">
                    {qrUrl ? (
                      <img
                        src={qrUrl}
                        alt="QRIS pembayaran"
                        className="w-48 h-48 rounded-lg border border-border bg-white p-2"
                      />
                    ) : (
                      <div className="w-48 h-48 rounded-lg border border-border flex items-center justify-center">
                        <QrCode className="w-10 h-10 text-muted-foreground" />
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground text-center">
                      Scan QRIS di atas atau buka halaman pembayaran
                    </p>
                  </div>
                  <Button
                    className="w-full bg-[#243370] hover:bg-[#1c2a5c] text-white"
                    onClick={() => window.open(paymentUrl, "_blank", "noopener")}
                  >
                    <ExternalLink className="w-4 h-4 mr-2" />
                    Buka Halaman Pembayaran
                  </Button>
                  <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Menunggu pembayaran&hellip; status diperbarui otomatis
                  </div>
                  <Button variant="ghost" className="w-full" size="sm" onClick={closePay}>
                    Tutup (pembayaran tetap berjalan)
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
      {/* Fitur 2: modal kwitansi untuk transaksi lunas */}
      {invoiceTx && (
        <InvoiceModal
          tx={invoiceTx}
          userName={user?.name || ""}
          userEmail={user?.email || ""}
          onClose={() => setInvoiceTx(null)}
        />
      )}
    </div>
  );
}

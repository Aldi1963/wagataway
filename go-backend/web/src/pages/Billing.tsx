import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ExternalLink, Loader2, QrCode, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { apiGet, apiPost } from "@/lib/api";

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
  const [plans, setPlans] = useState<Plan[]>([]);
  const [sub, setSub] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);

  // Payment modal state
  const [payPlan, setPayPlan] = useState<Plan | null>(null);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState("");
  const [paymentUrl, setPaymentUrl] = useState("");
  const [qrUrl, setQrUrl] = useState("");
  const [txStatus, setTxStatus] = useState("");
  const pollRef = useRef<number | null>(null);

  const load = useCallback(async () => {
    try {
      const [p, s] = await Promise.all([
        apiGet<{ plans: Plan[] }>("/billing/plans"),
        apiGet<{ subscription: Subscription | null }>("/billing/subscription"),
      ]);
      setPlans(p.plans || []);
      setSub(s.subscription);
    } catch {
      /* abaikan, tampilkan kosong */
    } finally {
      setLoading(false);
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
        transaction: { id: number };
      }>("/billing/subscribe", { planId: payPlan.id });
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
                    onClick={() => setPayPlan(plan)}
                  >
                    {isCurrent ? "Paket Saat Ini" : "Pilih Paket"}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

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
              {!paymentUrl ? (
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
                  {payError && (
                    <p className="text-sm text-destructive">{payError}</p>
                  )}
                  <div className="flex gap-2">
                    <Button
                      className="flex-1 bg-[#243370] hover:bg-[#1c2a5c] text-white"
                      onClick={bayar}
                      disabled={paying}
                    >
                      {paying && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                      Bayar Sekarang
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
    </div>
  );
}

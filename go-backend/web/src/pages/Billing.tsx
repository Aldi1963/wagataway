import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ExternalLink, Loader2, QrCode, Receipt, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { apiGet, apiPost } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { useLang } from "@/lib/i18n";
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
  maxDevices?: number;
  maxMessages?: number;
  monthlyMessageLimit?: number;
  maxContacts?: number;
  maxBulk?: number;
  maxAutoReply?: number;
}

interface Subscription {
  id: number;
  planId: number;
  status: string;
  startDate: string;
  endDate: string;
  // Fitur 7: penanda trial otomatis 7 hari.
  isTrial?: boolean;
  // BONUS: status langganan terpusat (active | grace | expired) dari endpoint.
  subState?: string;
  Plan: Plan;
}

interface TxStatus {
  id: number;
  status: string;
  paymentRef?: string;
}

// Item 3: tagihan pelanggan (invoice + QRIS Clipku Pay di WA).
interface InvoiceItem {
  description: string;
  qty: number;
  price: number;
}

interface CustomerInvoice {
  id: number;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  items: InvoiceItem[];
  amount: number;
  notes?: string;
  dueDate?: string;
  status: string;
  externalId?: string;
  paymentUrl?: string;
  qrUrl?: string;
  paidAt?: string;
  sentAt?: string;
  createdAt: string;
  invoiceNumber?: string;
}

interface ContactPick {
  id: number;
  name: string;
  phone: string;
  email?: string;
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

const txStatusMeta: Record<string, { key: string; className: string }> = {
  paid: { key: "billing.txPaid", className: "bg-green-500/15 text-green-600 border-green-500/30" },
  pending: { key: "billing.txPending", className: "bg-amber-500/15 text-amber-600 border-amber-500/30" },
  failed: { key: "billing.txFailed", className: "bg-red-500/15 text-red-600 border-red-500/30" },
  expired: { key: "billing.txExpired", className: "bg-muted text-muted-foreground border-border" },
  cancelled: { key: "billing.txCancelled", className: "bg-muted text-muted-foreground border-border" },
  refunded: { key: "billing.txRefunded", className: "bg-blue-500/15 text-blue-600 border-blue-500/30" },
};

function txStatusBadge(status: string, t: (key: string) => string) {
  const meta = txStatusMeta[status?.toLowerCase()] || {
    key: "",
    className: "bg-muted text-muted-foreground border-border",
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${meta.className}`}
    >
      {meta.key ? t(meta.key) : status || "-"}
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
  const { t } = useLang();
  const { user } = useAuth();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [sub, setSub] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);
  // Gagal fetch paket: tampilkan error + tombol "Coba lagi", jangan diam-diam kosong.
  const [plansError, setPlansError] = useState(false);

  // Fitur 2: riwayat transaksi + kwitansi
  const [txs, setTxs] = useState<Tx[]>([]);
  const [txLoading, setTxLoading] = useState(true);
  const [invoiceTx, setInvoiceTx] = useState<Tx | null>(null);

  // Item 3: tagihan pelanggan
  const [invoices, setInvoices] = useState<CustomerInvoice[]>([]);
  const [invLoading, setInvLoading] = useState(true);
  const [invFilter, setInvFilter] = useState("all");
  const [invError, setInvError] = useState("");
  const [showInvCreate, setShowInvCreate] = useState(false);
  const [invDetail, setInvDetail] = useState<CustomerInvoice | null>(null);
  const [invAction, setInvAction] = useState("");
  const [invActionError, setInvActionError] = useState("");
  const [contacts, setContacts] = useState<ContactPick[]>([]);
  const [invContactId, setInvContactId] = useState("");
  const [invName, setInvName] = useState("");
  const [invPhone, setInvPhone] = useState("");
  const [invEmail, setInvEmail] = useState("");
  const [invItems, setInvItems] = useState<{ description: string; qty: string; price: string }[]>([
    { description: "", qty: "1", price: "" },
  ]);
  const [invDue, setInvDue] = useState(() => {
    const d = new Date(Date.now() + 7 * 86400000);
    return d.toISOString().slice(0, 10);
  });
  const [invNotes, setInvNotes] = useState("");
  const [invCreating, setInvCreating] = useState(false);
  const [invCreateError, setInvCreateError] = useState("");

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
    setPlansError(false);
    // Paket & langganan di-fetch terpisah (allSettled): gagalnya satu
    // tidak boleh mengosongkan yang lain diam-diam.
    const [plansRes, subRes] = await Promise.allSettled([
      apiGet<{ plans: Plan[] }>("/billing/plans"),
      apiGet<{ subscription: Subscription | null }>("/billing/subscription"),
    ]);
    if (plansRes.status === "fulfilled") {
      setPlans(plansRes.value.plans || []);
    } else {
      setPlansError(true);
    }
    if (subRes.status === "fulfilled") {
      const s = subRes.value;
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
    }
    // Kartu langganan sudah menangani sub null, jadi gagal fetch langganan
    // dibiarkan tampil sebagai "tidak ada langganan aktif".
    setLoading(false);
    // Fitur 2: riwayat transaksi milik user yang login
    try {
      const t = await apiGet<{ transactions: Tx[] }>("/billing/transactions");
      setTxs(t.transactions || []);
    } catch {
      /* abaikan */
    } finally {
      setTxLoading(false);
    }
    // Item 3: daftar tagihan pelanggan
    await loadInvoices(invFilter);
  }, []);

  // Item 3: muat ulang daftar tagihan (dipakai filter + setelah aksi).
  const loadInvoices = useCallback(async (status: string) => {
    setInvLoading(true);
    setInvError("");
    try {
      const q = status && status !== "all" ? `?status=${status}` : "";
      const r = await apiGet<{ invoices: CustomerInvoice[] }>(`/billing/invoices${q}`);
      setInvoices(r.invoices || []);
    } catch (e: any) {
      setInvError(e?.message || t("billing.invLoadFail"));
    } finally {
      setInvLoading(false);
    }
  }, []);

  const openInvCreate = async () => {
    setInvCreateError("");
    setInvContactId("");
    setInvName("");
    setInvPhone("");
    setInvEmail("");
    setInvItems([{ description: "", qty: "1", price: "" }]);
    setInvNotes("");
    setShowInvCreate(true);
    try {
      const r = await apiGet<{ contacts: ContactPick[] }>("/contacts?limit=200");
      setContacts(r.contacts || []);
    } catch {
      setContacts([]);
    }
  };

  const invTotal = invItems.reduce(
    (s, it) => s + (parseInt(it.qty, 10) || 0) * (parseInt(it.price, 10) || 0),
    0
  );

  const createInvoice = async () => {
    if (invCreating) return;
    setInvCreating(true);
    setInvCreateError("");
    try {
      const items = invItems
        .map((it) => ({
          description: it.description.trim(),
          qty: parseInt(it.qty, 10) || 0,
          price: parseInt(it.price, 10) || 0,
        }))
        .filter((it) => it.description !== "");
      const r = await apiPost<{ invoice: CustomerInvoice }>("/billing/invoices", {
        contactId: invContactId ? parseInt(invContactId, 10) : undefined,
        customerName: invName.trim() || undefined,
        customerPhone: invPhone.trim() || undefined,
        customerEmail: invEmail.trim() || undefined,
        items,
        dueDate: invDue || undefined,
        notes: invNotes.trim() || undefined,
      });
      setShowInvCreate(false);
      setInvDetail(r.invoice);
      loadInvoices(invFilter);
    } catch (e: any) {
      setInvCreateError(e?.message || t("billing.invCreateFail"));
    } finally {
      setInvCreating(false);
    }
  };

  const sendInvoice = async (id: number) => {
    setInvAction("send");
    setInvActionError("");
    try {
      const r = await apiPost<{ invoice: CustomerInvoice }>(`/billing/invoices/${id}/send`, {});
      setInvDetail(r.invoice);
      loadInvoices(invFilter);
    } catch (e: any) {
      setInvActionError(e?.message || t("billing.payFail"));
    } finally {
      setInvAction("");
    }
  };

  const cancelInvoice = async (id: number) => {
    if (!window.confirm(t("billing.invCancelConfirm"))) return;
    setInvAction("cancel");
    setInvActionError("");
    try {
      const r = await apiPost<{ invoice: CustomerInvoice }>(`/billing/invoices/${id}/cancel`, {});
      setInvDetail(r.invoice);
      loadInvoices(invFilter);
    } catch (e: any) {
      setInvActionError(e?.message || t("billing.payFail"));
    } finally {
      setInvAction("");
    }
  };

  const refreshInvoiceDetail = async (id: number) => {
    try {
      const r = await apiGet<{ invoice: CustomerInvoice }>(`/billing/invoices/${id}`);
      setInvDetail(r.invoice);
      loadInvoices(invFilter);
    } catch {
      /* abaikan */
    }
  };

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
        setPayError(t("billing.prorateFail"));
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
      setPayError(e?.message || t("billing.payFail"));
    } finally {
      setPaying(false);
    }
  };

  const currentPlanName = sub?.Plan?.name || "Free";
  const paid = txStatus === "paid";
  const dead = ["expired", "failed", "cancelled"].includes(txStatus);
  // BONUS: badge & teks tanggal mengikuti status langganan terpusat.
  const subState = sub?.subState || "active";
  const subStateMeta: Record<string, { key: string; className: string }> = {
    active: { key: "billing.subActive", className: "" },
    grace: { key: "billing.subGrace", className: "bg-amber-500/15 text-amber-700 border-amber-500/30" },
    expired: { key: "billing.subExpired", className: "bg-red-500/15 text-red-600 border-red-500/30" },
  };
  const subMeta = subStateMeta[subState] || subStateMeta.active;
  const endDateLabel = sub
    ? new Date(sub.endDate).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })
    : "";

  return (
    <div className="space-y-6">
      {!embedded && (
        <div>
          <h2 className="text-lg font-semibold text-foreground">{t("billing.title")}</h2>
          <p className="text-sm text-muted-foreground">{t("billing.subtitle")}</p>
        </div>
      )}

      {/* Current Plan */}
      <Card>
        <CardContent className="p-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">
              {t("billing.currentPlan").replace("{name}", currentPlanName)}
              {/* Fitur 7: label Trial */}
              {sub?.isTrial && (
                <span className="ml-2 align-middle inline-flex items-center rounded-full bg-[#243370]/10 text-[#243370] dark:text-blue-400 text-[11px] font-semibold px-2 py-0.5">
                  Trial
                </span>
              )}
            </p>
            <p className="text-xs text-muted-foreground">
              {sub
                ? subState === "active"
                  ? t("billing.activeUntil").replace("{date}", endDateLabel)
                  : t("billing.endedAt").replace("{date}", endDateLabel)
                : t("billing.noSubscription")}
            </p>
            {/* Fitur 7: ajakan upgrade untuk user trial */}
            {sub?.isTrial && (
              <Button
                size="sm"
                className="mt-2 bg-[#243370] hover:bg-[#1c2a5c] text-white"
                onClick={() =>
                  document
                    .getElementById("daftar-paket")
                    ?.scrollIntoView({ behavior: "smooth" })
                }
              >
                {t("billing.upgradeNow")}
              </Button>
            )}
          </div>
          <Badge variant="outline" className={`shrink-0 ${subMeta.className}`}>
            {t(subMeta.key)}
          </Badge>
        </CardContent>
      </Card>

      {/* Plans Grid */}
      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : plansError ? (
        <Card className="border-destructive/50">
          <CardContent className="p-5 flex items-center justify-between">
            <p className="text-sm text-destructive">{t("billing.plansLoadFail")}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setLoading(true);
                load();
              }}
              className="gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" /> {t("common.retry")}
            </Button>
          </CardContent>
        </Card>
      ) : plans.length === 0 ? (
        <Card>
          <CardContent className="p-5 text-center">
            <p className="text-sm text-muted-foreground">{t("billing.noPlans")}</p>
          </CardContent>
        </Card>
      ) : (
        <div id="daftar-paket" className="grid grid-cols-1 md:grid-cols-3 gap-4 scroll-mt-4">
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
                      {plan.price === 0 ? t("billing.free") : rupiah(plan.price)}
                    </span>
                    {plan.price > 0 && (
                      <span className="text-xs text-muted-foreground">
                        /{t(plan.duration >= 360 ? "billing.perYear" : "billing.perMonth")}
                      </span>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground mb-3">
                    {t("billing.planLimits")
                      .replace("{contacts}", (plan.maxContacts ?? 0).toLocaleString("id-ID"))
                      .replace("{bulk}", (plan.maxBulk ?? 0).toLocaleString("id-ID"))
                      .replace("{autoReply}", String(plan.maxAutoReply ?? 0))}
                  </p>
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
                    {isCurrent ? t("billing.currentPlanBtn") : isSwitch ? t("billing.switchPlan") : t("billing.choosePlan")}
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
          <CardTitle className="text-sm">{t("billing.txHistory")}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {txLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : txs.length === 0 ? (
            <p className="text-sm text-muted-foreground px-4 pb-4">
              {t("billing.noTx")}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-sm">
                <thead>
                  <tr className="border-y border-border text-left text-xs text-muted-foreground">
                    <th className="font-medium px-4 py-2.5">{t("billing.colDate")}</th>
                    <th className="font-medium px-4 py-2.5">{t("billing.colInvoice")}</th>
                    <th className="font-medium px-4 py-2.5">{t("billing.colPlan")}</th>
                    <th className="font-medium px-4 py-2.5 text-right">{t("billing.colAmount")}</th>
                    <th className="font-medium px-4 py-2.5">{t("billing.colMethod")}</th>
                    <th className="font-medium px-4 py-2.5">{t("billing.colStatus")}</th>
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
                        {metodeLabel(tx.paymentMethod, t)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {txStatusBadge(tx.status, t)}
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
                            {t("billing.receipt")}
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

      {/* Item 3: Tagihan Pelanggan */}
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
          <div>
            <CardTitle className="text-sm">{t("billing.invTitle")}</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">{t("billing.invSubtitle")}</p>
          </div>
          <Button size="sm" className="bg-[#243370] hover:bg-[#1c2a5c] text-white shrink-0" onClick={openInvCreate}>
            {t("billing.invCreate")}
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {["all", "pending", "paid", "expired", "cancelled"].map((f) => (
              <button
                key={f}
                onClick={() => {
                  setInvFilter(f);
                  loadInvoices(f);
                }}
                className={`px-2.5 py-1 rounded-full text-xs font-medium border ${
                  invFilter === f
                    ? "bg-foreground text-background border-foreground"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {f === "all" ? t("billing.invFilterAll") : t(txStatusMeta[f]?.key || "") || f}
              </button>
            ))}
          </div>
          {invLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : invError ? (
            <p className="text-sm text-destructive">{invError}</p>
          ) : invoices.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("billing.invEmpty")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-sm">
                <thead>
                  <tr className="border-y border-border text-left text-xs text-muted-foreground">
                    <th className="font-medium px-4 py-2.5">{t("billing.colDate")}</th>
                    <th className="font-medium px-4 py-2.5">{t("billing.colInvoice")}</th>
                    <th className="font-medium px-4 py-2.5">{t("billing.invColCustomer")}</th>
                    <th className="font-medium px-4 py-2.5 text-right">{t("billing.colAmount")}</th>
                    <th className="font-medium px-4 py-2.5">{t("billing.invColDue")}</th>
                    <th className="font-medium px-4 py-2.5">{t("billing.colStatus")}</th>
                    <th className="font-medium px-4 py-2.5 w-24" />
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => (
                    <tr key={inv.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                        {tglID(inv.createdAt)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap font-mono text-xs">
                        {inv.invoiceNumber || "-"}
                      </td>
                      <td className="px-4 py-3 font-medium text-foreground">
                        <div className="min-w-0">
                          <p className="truncate">{inv.customerName}</p>
                          <p className="text-xs text-muted-foreground font-normal">{inv.customerPhone}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-right font-semibold text-foreground">
                        {rupiah(inv.amount)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                        {inv.dueDate ? tglID(inv.dueDate) : "-"}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {txStatusBadge(inv.status, t)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => setInvDetail(inv)}
                        >
                          {t("billing.invDetail")}
                        </Button>
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
                {paid ? t("billing.paySuccess") : t("billing.payPlan").replace("{name}", payPlan.name)}
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={closePay} aria-label={t("common.close")}>
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
                      {t("billing.payInfo").replace("{days}", String(payPlan.duration))}
                    </p>
                  </div>
                  {/* Fitur 4: rincian prorata sebelum bayar */}
                  {quoteLoading ? (
                    <div className="flex items-center justify-center gap-2 py-3 text-sm text-muted-foreground">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      {t("billing.calcProrate")}
                    </div>
                  ) : quote?.prorate ? (
                    <div className="rounded-lg border border-[#243370]/30 bg-[#243370]/5 p-3 space-y-2">
                      <p className="text-xs font-semibold text-foreground">
                        {t("billing.prorateTitle")}
                      </p>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">
                          {t("billing.priceOf").replace("{name}", quote.newPlanName)}
                        </span>
                        <span className="font-medium text-foreground">{rupiah(quote.newPrice)}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">
                          {t("billing.remainingValue").replace("{name}", quote.oldPlanName || "")}
                          <span className="block text-[11px]">
                            {t("billing.daysLeft").replace("{days}", String(quote.remainingDays))}{quote.isTrial ? " (trial)" : ""}
                          </span>
                        </span>
                        <span className="font-medium text-foreground">− {rupiah(quote.creditAmount)}</span>
                      </div>
                      <div className="flex items-center justify-between border-t border-border pt-2">
                        <span className="text-sm font-semibold text-foreground">{t("billing.totalPay")}</span>
                        <span className="text-base font-bold text-foreground">
                          {quote.payableAmount === 0 ? t("billing.free") : rupiah(quote.payableAmount)}
                        </span>
                      </div>
                      {quote.payableAmount === 0 && (
                        <p className="text-[11px] text-muted-foreground">
                          {t("billing.prorateFreeNote")}
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
                      {quote?.prorate && quote.payableAmount === 0 ? t("billing.activateNow") : t("billing.payNow")}
                    </Button>
                    <Button variant="outline" onClick={closePay}>
                      {t("common.cancel")}
                    </Button>
                  </div>
                </>
              ) : paid ? (
                <div className="text-center space-y-3 py-4">
                  <div className="mx-auto w-12 h-12 rounded-full bg-green-500/15 flex items-center justify-center">
                    <Check className="w-6 h-6 text-green-500" />
                  </div>
                  <p className="text-sm font-semibold text-foreground">
                    {t("billing.planActive").replace("{name}", payPlan.name)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("billing.validFor").replace("{days}", String(payPlan.duration))}
                  </p>
                  <Button className="w-full" onClick={closePay}>
                    {t("billing.done")}
                  </Button>
                </div>
              ) : dead ? (
                <div className="text-center space-y-3 py-4">
                  <p className="text-sm font-semibold text-foreground">{t("billing.payStatus").replace("{status}", txStatus)}</p>
                  <p className="text-xs text-muted-foreground">
                    {t("billing.payDeadNote")}
                  </p>
                  <Button className="w-full" variant="outline" onClick={closePay}>
                    {t("common.close")}
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex flex-col items-center gap-2">
                    {qrUrl ? (
                      <img
                        src={qrUrl}
                        alt={t("billing.qrAlt")}
                        className="w-48 h-48 rounded-lg border border-border bg-white p-2"
                      />
                    ) : (
                      <div className="w-48 h-48 rounded-lg border border-border flex items-center justify-center">
                        <QrCode className="w-10 h-10 text-muted-foreground" />
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground text-center">
                      {t("billing.scanHint")}
                    </p>
                  </div>
                  <Button
                    className="w-full bg-[#243370] hover:bg-[#1c2a5c] text-white"
                    onClick={() => window.open(paymentUrl, "_blank", "noopener")}
                  >
                    <ExternalLink className="w-4 h-4 mr-2" />
                    {t("billing.openPayPage")}
                  </Button>
                  <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    {t("billing.waitingPay")}
                  </div>
                  <Button variant="ghost" className="w-full" size="sm" onClick={closePay}>
                    {t("billing.closeKeepRunning")}
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

      {/* Item 3: modal buat tagihan pelanggan */}
      {showInvCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowInvCreate(false)} />
          <Card className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-base">{t("billing.invCreate")}</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setShowInvCreate(false)} aria-label={t("common.close")}>
                <X className="w-4 h-4" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground">{t("billing.invColCustomer")}</label>
                <select
                  className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                  value={invContactId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setInvContactId(id);
                    const ct = contacts.find((c) => String(c.id) === id);
                    if (ct) {
                      setInvName(ct.name);
                      setInvPhone(ct.phone);
                      setInvEmail(ct.email || "");
                    }
                  }}
                >
                  <option value="">{t("billing.invPickContact")}</option>
                  {contacts.map((ct) => (
                    <option key={ct.id} value={ct.id}>
                      {ct.name} — {ct.phone}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-muted-foreground mt-1">{t("billing.invManual")}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">{t("billing.invName")}</label>
                  <input
                    className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                    value={invName}
                    onChange={(e) => setInvName(e.target.value)}
                    placeholder="Budi"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">{t("billing.invPhone")}</label>
                  <input
                    className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                    value={invPhone}
                    onChange={(e) => setInvPhone(e.target.value)}
                    placeholder="6281234567890"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">{t("billing.invEmail")}</label>
                <input
                  className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                  value={invEmail}
                  onChange={(e) => setInvEmail(e.target.value)}
                  placeholder="budi@example.com"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">{t("billing.invItems")}</label>
                <div className="mt-1 space-y-2">
                  {invItems.map((it, i) => (
                    <div key={i} className="flex gap-2">
                      <input
                        className="flex-1 min-w-0 h-9 rounded-md border border-input bg-background px-3 text-sm"
                        value={it.description}
                        onChange={(e) => {
                          const next = [...invItems];
                          next[i] = { ...next[i], description: e.target.value };
                          setInvItems(next);
                        }}
                        placeholder={t("billing.invItemDesc")}
                      />
                      <input
                        className="w-16 h-9 rounded-md border border-input bg-background px-2 text-sm text-center"
                        value={it.qty}
                        inputMode="numeric"
                        onChange={(e) => {
                          const next = [...invItems];
                          next[i] = { ...next[i], qty: e.target.value.replace(/[^0-9]/g, "") };
                          setInvItems(next);
                        }}
                        aria-label={t("billing.invItemQty")}
                      />
                      <input
                        className="w-28 h-9 rounded-md border border-input bg-background px-2 text-sm text-right"
                        value={it.price}
                        inputMode="numeric"
                        onChange={(e) => {
                          const next = [...invItems];
                          next[i] = { ...next[i], price: e.target.value.replace(/[^0-9]/g, "") };
                          setInvItems(next);
                        }}
                        placeholder={t("billing.invItemPrice")}
                      />
                      {invItems.length > 1 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-9 px-2 text-destructive"
                          onClick={() => setInvItems(invItems.filter((_, j) => j !== i))}
                          aria-label={t("billing.invRemoveItem")}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() => setInvItems([...invItems, { description: "", qty: "1", price: "" }])}
                >
                  {t("billing.invAddItem")}
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">{t("billing.invDueDate")}</label>
                  <input
                    type="date"
                    className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                    value={invDue}
                    onChange={(e) => setInvDue(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">{t("billing.invTotal")}</label>
                  <p className="mt-1 h-9 flex items-center text-base font-bold text-foreground">
                    {rupiah(invTotal)}
                  </p>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">{t("billing.invNotes")}</label>
                <input
                  className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                  value={invNotes}
                  onChange={(e) => setInvNotes(e.target.value)}
                />
              </div>
              {invCreateError && <p className="text-sm text-destructive">{invCreateError}</p>}
              <div className="flex gap-2">
                <Button
                  className="flex-1 bg-[#243370] hover:bg-[#1c2a5c] text-white"
                  onClick={createInvoice}
                  disabled={invCreating || invTotal <= 0}
                >
                  {invCreating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  {invCreating ? t("billing.invCreating") : t("billing.invCreate")}
                </Button>
                <Button variant="outline" onClick={() => setShowInvCreate(false)}>
                  {t("common.cancel")}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Item 3: modal detail tagihan pelanggan */}
      {invDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setInvDetail(null)} />
          <Card className="relative w-full max-w-md max-h-[90vh] overflow-y-auto">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-base">{invDetail.invoiceNumber || t("billing.invTitle")}</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setInvDetail(null)} aria-label={t("common.close")}>
                <X className="w-4 h-4" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{invDetail.customerName}</p>
                  <p className="text-xs text-muted-foreground">{invDetail.customerPhone}</p>
                </div>
                {txStatusBadge(invDetail.status, t)}
              </div>
              <div className="rounded-lg border border-border divide-y divide-border">
                {(invDetail.items || []).map((it, i) => (
                  <div key={i} className="flex items-center justify-between px-3 py-2 text-sm">
                    <span className="text-foreground">
                      {it.description} <span className="text-muted-foreground">×{it.qty}</span>
                    </span>
                    <span className="font-medium text-foreground">{rupiah(it.qty * it.price)}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between px-3 py-2">
                  <span className="text-sm font-semibold text-foreground">{t("billing.invTotal")}</span>
                  <span className="text-base font-bold text-foreground">{rupiah(invDetail.amount)}</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <p className="text-muted-foreground">{t("billing.invColDue")}</p>
                  <p className="font-medium text-foreground">{invDetail.dueDate ? tglID(invDetail.dueDate) : "-"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">{t("billing.colDate")}</p>
                  <p className="font-medium text-foreground">{tglID(invDetail.createdAt)}</p>
                </div>
                {invDetail.sentAt && (
                  <div>
                    <p className="text-muted-foreground">{t("billing.invSentAt")}</p>
                    <p className="font-medium text-foreground">{tglID(invDetail.sentAt)}</p>
                  </div>
                )}
                {invDetail.paidAt && (
                  <div>
                    <p className="text-muted-foreground">{t("billing.invPaidAt")}</p>
                    <p className="font-medium text-foreground">{tglID(invDetail.paidAt)}</p>
                  </div>
                )}
              </div>
              {invDetail.notes && (
                <p className="text-xs text-muted-foreground">{invDetail.notes}</p>
              )}
              {invDetail.status === "pending" && invDetail.qrUrl && (
                <div className="flex flex-col items-center gap-2">
                  <img
                    src={invDetail.qrUrl}
                    alt={t("billing.qrAlt")}
                    className="w-48 h-48 rounded-lg border border-border bg-white p-2"
                  />
                  <p className="text-xs text-muted-foreground text-center">{t("billing.scanHint")}</p>
                </div>
              )}
              {invDetail.status === "pending" && invDetail.paymentUrl && (
                <Button
                  className="w-full bg-[#243370] hover:bg-[#1c2a5c] text-white"
                  onClick={() => window.open(invDetail.paymentUrl, "_blank", "noopener")}
                >
                  <ExternalLink className="w-4 h-4 mr-2" />
                  {t("billing.invOpenPay")}
                </Button>
              )}
              {invActionError && <p className="text-sm text-destructive">{invActionError}</p>}
              {invDetail.status === "pending" && (
                <div className="flex gap-2">
                  <Button
                    className="flex-1"
                    variant="outline"
                    onClick={() => sendInvoice(invDetail.id)}
                    disabled={invAction !== ""}
                  >
                    {invAction === "send" && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    {invDetail.sentAt ? t("billing.invResend") : t("billing.invSendWA")}
                  </Button>
                  <Button
                    variant="outline"
                    className="text-destructive border-destructive/40 hover:text-destructive"
                    onClick={() => cancelInvoice(invDetail.id)}
                    disabled={invAction !== ""}
                  >
                    {t("billing.invCancel")}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => refreshInvoiceDetail(invDetail.id)}>
                    <RefreshCw className="w-4 h-4" />
                  </Button>
                </div>
              )}
              {invDetail.status === "paid" && (
                <p className="text-sm text-green-600 text-center flex items-center justify-center gap-1.5">
                  <Check className="w-4 h-4" /> {t("billing.txPaid")}
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

import { useCallback, useEffect, useState } from "react";
import { Check, ExternalLink, Loader2, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DateTimePicker } from "@/components/DateTimePicker";
import { apiGet, apiPost } from "@/lib/api";
import { useLang } from "@/lib/i18n";
import { tglID } from "./InvoiceModal";

// Halaman Tagihan Pelanggan — dipisah dari Billing.tsx (dulu "Item 3" di
// halaman Langganan): invoice + QRIS Clipku Pay di WA. Semua logika dan
// modal dipindah apa adanya dari Billing.tsx, tanpa perubahan perilaku.
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

function rupiah(n: number) {
  return `Rp ${n.toLocaleString("id-ID")}`;
}

export default function TagihanPelanggan() {
  const { t } = useLang();
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

  // Muat ulang daftar tagihan (dipakai filter + setelah aksi).
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

  useEffect(() => {
    loadInvoices("all");
  }, [loadInvoices]);

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

  return (
    <div className="max-w-5xl">
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-foreground">{t("billing.invTitle")}</h2>
          <p className="text-sm text-muted-foreground">{t("billing.invSubtitle")}</p>
        </div>

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

        {/* Modal buat tagihan pelanggan */}
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
                    <div className="mt-1">
                      <DateTimePicker showTime={false} value={invDue} onChange={setInvDue} />
                    </div>
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

        {/* Modal detail tagihan pelanggan */}
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
    </div>
  );
}

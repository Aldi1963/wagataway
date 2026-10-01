import { useState } from "react";
import { Printer, X, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface InvoiceTx {
  id: number;
  amount: number;
  status: string;
  paymentMethod?: string;
  externalId?: string;
  paidAt?: string;
  createdAt: string;
  invoiceNumber?: string;
  Plan?: { name: string; duration: number } | null;
}

export function tglID(input?: string | Date): string {
  if (!input) return "-";
  const d = input instanceof Date ? input : new Date(input);
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function rupiah(n: number) {
  return `Rp ${Number(n || 0).toLocaleString("id-ID")}`;
}

export function metodeLabel(m?: string): string {
  if (!m) return "-";
  const map: Record<string, string> = {
    clipkupay: "Clipku Pay (QRIS / VA / E-wallet)",
    qris: "QRIS",
  };
  return map[m.toLowerCase()] || m.charAt(0).toUpperCase() + m.slice(1);
}

// Print CSS: saat dialog print dibuka, hanya area invoice yang tercetak;
// tombol & latar modal disembunyikan. User bisa cetak / simpan sebagai PDF
// lewat dialog print bawaan browser (tanpa dependency PDF tambahan).
const printCss = `
@media print {
  body * { visibility: hidden !important; }
  #invoice-print, #invoice-print * { visibility: visible !important; }
  #invoice-print {
    position: fixed !important;
    inset: 0 !important;
    width: 100% !important;
    max-width: none !important;
    max-height: none !important;
    margin: 0 !important;
    border-radius: 0 !important;
    box-shadow: none !important;
    overflow: visible !important;
  }
  .invoice-no-print { display: none !important; }
}
`;

interface Props {
  tx: InvoiceTx;
  userName: string;
  userEmail: string;
  onClose: () => void;
}

/** Kwitansi/invoice rapi untuk transaksi berstatus paid. */
export default function InvoiceModal({ tx, userName, userEmail, onClose }: Props) {
  const [downloading, setDownloading] = useState(false);
  const planName = tx.Plan?.name || "Paket WaGataway";
  const durasi = tx.Plan?.duration || 30;
  const start = new Date(tx.paidAt || tx.createdAt);
  const end = new Date(start.getTime() + durasi * 24 * 60 * 60 * 1000);
  const nomor = tx.invoiceNumber || `INV/-/${String(tx.id).padStart(6, "0")}`;

  const downloadPdf = async () => {
    setDownloading(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/billing/transactions/${tx.id}/invoice.pdf`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("gagal");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Kwitansi-${nomor.split("/").join("-")}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      alert("Gagal mengunduh PDF. Coba lagi.");
    } finally {
      setDownloading(false);
    }
  };

  const row = (label: string, value: React.ReactNode) => (
    <div className="flex items-start justify-between gap-4 py-2.5 border-b border-slate-100 last:border-0">
      <span className="text-xs text-slate-500 shrink-0 pt-0.5">{label}</span>
      <span className="text-sm font-medium text-slate-800 text-right">{value}</span>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <style>{printCss}</style>
      <div className="absolute inset-0 bg-black/50 invoice-no-print" onClick={onClose} />
      <div
        id="invoice-print"
        className="relative w-full max-w-lg bg-white text-slate-900 rounded-xl shadow-2xl p-6 md:p-8 max-h-[90vh] overflow-y-auto"
      >
        {/* Kop */}
        <div className="flex items-start justify-between pb-4 border-b-2 border-[#243370]">
          <div>
            <p className="text-lg font-bold text-[#243370]">WaGataway</p>
            <p className="text-[11px] text-slate-500">Kwitansi Pembayaran</p>
          </div>
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-green-100 text-green-700 border border-green-200">
            LUNAS
          </span>
        </div>

        {/* Meta invoice */}
        <div className="grid grid-cols-2 gap-3 py-4 border-b border-slate-100">
          <div>
            <p className="text-[11px] text-slate-500">No. Invoice</p>
            <p className="text-sm font-bold font-mono text-slate-800">{nomor}</p>
          </div>
          <div>
            <p className="text-[11px] text-slate-500">Tanggal Pembayaran</p>
            <p className="text-sm font-semibold text-slate-800">{tglID(tx.paidAt || tx.createdAt)}</p>
          </div>
          <div className="col-span-2">
            <p className="text-[11px] text-slate-500">Ditagihkan Kepada</p>
            <p className="text-sm font-semibold text-slate-800">{userName || "-"}</p>
            <p className="text-xs text-slate-500">{userEmail || ""}</p>
          </div>
        </div>

        {/* Rincian */}
        <div className="py-2">
          {row("Paket", planName)}
          {row("Periode Aktif", `${tglID(start)} – ${tglID(end)}`)}
          {row("Metode Pembayaran", metodeLabel(tx.paymentMethod))}
        </div>

        {/* Total */}
        <div className="mt-2 rounded-lg bg-[#243370]/5 border border-[#243370]/15 px-4 py-3 flex items-center justify-between">
          <span className="text-sm font-semibold text-[#243370]">Total Dibayar</span>
          <span className="text-xl font-bold text-[#243370]">{rupiah(tx.amount)}</span>
        </div>

        <p className="mt-4 text-[11px] text-slate-400 leading-relaxed">
          Kwitansi ini dibuat otomatis oleh sistem WaGataway dan sah tanpa tanda tangan basah.
          Simpan nomor invoice untuk keperluan administrasi.
        </p>

        {/* Tombol: tidak ikut tercetak */}
        <div className="invoice-no-print mt-5 flex gap-2">
          <Button
            className="flex-1 bg-[#243370] hover:bg-[#1c2a5c] text-white"
            onClick={downloadPdf}
            disabled={downloading}
          >
            {downloading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
            Unduh PDF
          </Button>
          <Button variant="outline" onClick={() => window.print()} aria-label="Cetak">
            <Printer className="w-4 h-4" />
          </Button>
          <Button variant="outline" onClick={onClose} aria-label="Tutup">
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

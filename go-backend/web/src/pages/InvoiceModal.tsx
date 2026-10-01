import { useState } from "react";
import { createPortal } from "react-dom";
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

const _kata = ["", "Satu", "Dua", "Tiga", "Empat", "Lima", "Enam", "Tujuh", "Delapan", "Sembilan", "Sepuluh", "Sebelas"];
/** Angka -> kata Bahasa Indonesia, mis. 175000 -> "Seratus Tujuh Puluh Lima Ribu". */
export function terbilang(n: number): string {
  n = Math.floor(Math.abs(n));
  if (n < 12) return _kata[n];
  if (n < 20) return terbilang(n - 10) + " Belas";
  if (n < 100) return terbilang(Math.floor(n / 10)) + " Puluh" + (n % 10 ? " " + terbilang(n % 10) : "");
  if (n < 200) return "Seratus" + (n % 100 ? " " + terbilang(n % 100) : "");
  if (n < 1000) return terbilang(Math.floor(n / 100)) + " Ratus" + (n % 100 ? " " + terbilang(n % 100) : "");
  if (n < 2000) return "Seribu" + (n % 1000 ? " " + terbilang(n % 1000) : "");
  if (n < 1000000) return terbilang(Math.floor(n / 1000)) + " Ribu" + (n % 1000 ? " " + terbilang(n % 1000) : "");
  if (n < 1000000000) return terbilang(Math.floor(n / 1000000)) + " Juta" + (n % 1000000 ? " " + terbilang(n % 1000000) : "");
  if (n < 1000000000000) return terbilang(Math.floor(n / 1000000000)) + " Miliar" + (n % 1000000000 ? " " + terbilang(n % 1000000000) : "");
  return terbilang(Math.floor(n / 1000000000000)) + " Triliun" + (n % 1000000000000 ? " " + terbilang(n % 1000000000000) : "");
}

// Print CSS: invoice dirender via portal langsung di bawah <body>, sehingga
// saat print cukup sembunyikan semua anak body kecuali portal invoice.
const printCss = `
@font-face {
  font-family: 'GreatVibes';
  src: url('/fonts/GreatVibes-Regular.ttf') format('truetype');
}
@media print {
  @page { size: A4; margin: 12mm; }
  body > *:not(#invoice-print-root) { display: none !important; }
  #invoice-print-root {
    display: block !important;
    position: static !important;
    padding: 0 !important;
  }
  #invoice-print {
    position: static !important;
    width: 100% !important;
    max-width: none !important;
    max-height: none !important;
    margin: 0 !important;
    padding: 0 !important;
    border-radius: 0 !important;
    box-shadow: none !important;
    overflow: visible !important;
  }
  .invoice-no-print { display: none !important; }
}
`;

const screenFontCss = `
@font-face {
  font-family: 'GreatVibes';
  src: url('/fonts/GreatVibes-Regular.ttf') format('truetype');
}
`;

interface Props {
  tx: InvoiceTx;
  userName: string;
  userEmail: string;
  onClose: () => void;
}

/** Invoice resmi: kop, tabel rincian, terbilang, stempel LUNAS, blok tanda tangan. */
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

  return createPortal(
    <div id="invoice-print-root" className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <style>{printCss}</style>
      <style>{screenFontCss}</style>
      <div className="absolute inset-0 bg-black/50 invoice-no-print" onClick={onClose} />
      <div
        id="invoice-print"
        className="relative w-full max-w-2xl bg-white text-slate-900 rounded-xl shadow-2xl p-6 md:p-8 max-h-[90vh] overflow-y-auto"
      >
        {/* Kop */}
        <div className="flex items-start justify-between">
          <div>
            <p className="text-2xl font-bold text-[#243370]">WaGataway</p>
            <p className="text-[11px] text-slate-500 mt-1">Jakarta, Indonesia</p>
            <p className="text-[11px] text-slate-500">wa.clipku.com</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-slate-800 tracking-wide">INVOICE</p>
            <p className="text-xs text-slate-500 mt-1">No. {nomor}</p>
            <p className="text-xs text-slate-500">Tanggal: {tglID(tx.paidAt || tx.createdAt)}</p>
          </div>
        </div>
        <div className="h-[3px] bg-[#243370] mt-4 mb-5" />

        {/* Ditagihkan kepada | Metode */}
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <p className="text-[10px] font-bold text-slate-500 tracking-wider">DITAGIHKAN KEPADA</p>
            <p className="text-sm font-bold text-slate-800 mt-1">{userName || "-"}</p>
            {userEmail && <p className="text-xs text-slate-500">{userEmail}</p>}
          </div>
          <div className="text-right">
            <p className="text-[10px] font-bold text-slate-500 tracking-wider">METODE PEMBAYARAN</p>
            <p className="text-xs text-slate-700 mt-1">{metodeLabel(tx.paymentMethod)}</p>
          </div>
        </div>

        {/* Tabel rincian */}
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-[#243370] text-white">
              <th className="text-left text-[11px] font-bold px-3 py-2.5">DESKRIPSI</th>
              <th className="text-center text-[11px] font-bold px-2 py-2.5 w-12">QTY</th>
              <th className="text-right text-[11px] font-bold px-3 py-2.5 w-28">HARGA</th>
              <th className="text-right text-[11px] font-bold px-3 py-2.5 w-28">JUMLAH</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-slate-200">
              <td className="px-3 py-3">
                <p className="font-semibold text-slate-800 text-[13px]">Langganan Paket {planName} ({durasi} hari)</p>
                <p className="text-[11px] text-slate-500 mt-0.5">Periode {tglID(start)} – {tglID(end)}</p>
              </td>
              <td className="text-center text-slate-700 px-2 py-3">1</td>
              <td className="text-right text-slate-700 px-3 py-3">{rupiah(tx.amount)}</td>
              <td className="text-right font-semibold text-slate-800 px-3 py-3">{rupiah(tx.amount)}</td>
            </tr>
            <tr className="border-b border-slate-200">
              <td colSpan={4} className="px-3 py-2.5">
                <p className="text-[11px] italic text-slate-500">Terbilang: &ldquo;{terbilang(tx.amount)} Rupiah&rdquo;</p>
              </td>
            </tr>
            <tr>
              <td colSpan={3} className="px-3 py-3 text-right font-bold text-[#243370] bg-[#243370]/5 text-[13px]">TOTAL</td>
              <td className="px-3 py-3 text-right font-bold text-[#243370] bg-[#243370]/5 text-lg">{rupiah(tx.amount)}</td>
            </tr>
          </tbody>
        </table>

        {/* Stempel + TTD */}
        <div className="flex items-start justify-between mt-8 gap-4">
          <div className="flex-1 flex items-center justify-center pt-2">
            <div
              className="w-28 h-28 rounded-full border-[3px] border-green-600 flex flex-col items-center justify-center -rotate-12 opacity-90"
              style={{ boxShadow: "inset 0 0 0 2px #fff, inset 0 0 0 4px #16a34a" }}
            >
              <span className="text-green-700 font-bold text-lg tracking-widest">LUNAS</span>
              <span className="text-green-700 text-[9px] font-bold tracking-wider mt-0.5">WAGATAWAY</span>
            </div>
          </div>
          <div className="w-44 text-[13px] text-slate-800">
            <p>Jakarta, {tglID(tx.paidAt || tx.createdAt)}</p>
            <p className="mt-1">Hormat kami,</p>
            <p className="text-[#243370] mt-2 mb-1 leading-none" style={{ fontFamily: "'GreatVibes', cursive", fontSize: "2.6rem" }}>
              WaGataway
            </p>
            <p className="font-bold">( Tim Finance )</p>
            <p className="text-[11px] text-slate-500">Finance – WaGataway</p>
          </div>
        </div>

        <div className="border-t border-slate-200 mt-8 pt-3">
          <p className="text-[10px] text-slate-400 leading-relaxed">
            Dokumen ini dibuat otomatis oleh sistem WaGataway. Simpan nomor invoice untuk keperluan administrasi.
          </p>
        </div>

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
    </div>,
    document.body
  );
}

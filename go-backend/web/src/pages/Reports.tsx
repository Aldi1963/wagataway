import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Send, XCircle, Eye, Megaphone } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dropdown } from "@/components/ui/dropdown";
import { apiGet } from "@/lib/api";

interface SummaryRow {
  campaignId: string;
  total: number;
  sent: number;
  failed: number;
  read: number;
}

interface DetailRow {
  id: number;
  phone: string;
  status: string;
  sentAt?: string;
  errorMsg?: string;
}

function statusBadge(status: string) {
  const s = (status || "").toLowerCase();
  if (s === "read") return <Badge variant="success">Dibaca</Badge>;
  if (s === "sent") return <Badge variant="default">Terkirim</Badge>;
  if (s === "failed") return <Badge variant="destructive">Gagal</Badge>;
  return <Badge variant="secondary">{status}</Badge>;
}

export default function Reports() {
  const [rows, setRows] = useState<SummaryRow[]>([]);
  const [selected, setSelected] = useState("");
  const [details, setDetails] = useState<DetailRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const r = await apiGet<{ summary: SummaryRow[] } | SummaryRow[]>("/reports/summary");
        setRows(Array.isArray(r) ? r : r.summary ?? []);
      } catch (e: any) {
        toast.error(e.message || "Gagal memuat laporan");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const loadDetail = async (id: string) => {
    setSelected(id);
    if (!id) { setDetails([]); return; }
    setLoadingDetail(true);
    try {
      const r = await apiGet<{ reports: DetailRow[] } | DetailRow[]>(`/reports/campaigns/${encodeURIComponent(id)}`);
      setDetails(Array.isArray(r) ? r : r.reports ?? []);
    } catch (e: any) {
      toast.error(e.message || "Gagal memuat detail campaign");
      setDetails([]);
    } finally {
      setLoadingDetail(false);
    }
  };

  const totals = rows.reduce(
    (acc, r) => ({ sent: acc.sent + r.sent, failed: acc.failed + r.failed, read: acc.read + r.read }),
    { sent: 0, failed: 0, read: 0 }
  );

  const cards = [
    { label: "Terkirim", value: totals.sent, icon: Send, cls: "text-[#243370] dark:text-blue-400" },
    { label: "Gagal", value: totals.failed, icon: XCircle, cls: "text-red-500" },
    { label: "Dibaca", value: totals.read, icon: Eye, cls: "text-emerald-500" },
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-foreground">Laporan Broadcast</h1>

      {loading ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">Memuat...</CardContent></Card>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {cards.map((c) => (
              <Card key={c.label}>
                <CardContent className="p-4 flex items-center gap-3">
                  <span className="w-11 h-11 rounded-2xl bg-[#243370] flex items-center justify-center shrink-0">
                    <c.icon className="w-5 h-5 text-white" />
                  </span>
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{c.label}</p>
                    <p className={`text-2xl font-bold ${c.cls}`}>{c.value.toLocaleString("id-ID")}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Megaphone className="w-4 h-4" /> Detail per Campaign
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Dropdown
                value={selected}
                onChange={loadDetail}
                ariaLabel="Pilih campaign"
                className="max-w-sm"
                options={[
                  { value: "", label: "Pilih campaign..." },
                  ...rows.map((r) => ({ value: r.campaignId, label: `${r.campaignId} (${r.sent} terkirim, ${r.failed} gagal)` })),
                ]}
              />

              {loadingDetail ? (
                <p className="text-sm text-muted-foreground">Memuat detail...</p>
              ) : selected && (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] text-sm">
                    <thead>
                      <tr className="border-b border-border text-left">
                        <th className="py-2.5 pr-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Nomor</th>
                        <th className="py-2.5 pr-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Status</th>
                        <th className="py-2.5 pr-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Waktu Kirim</th>
                        <th className="py-2.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Keterangan</th>
                      </tr>
                    </thead>
                    <tbody>
                      {details.length === 0 && (
                        <tr><td colSpan={4} className="py-8 text-center text-muted-foreground">Tidak ada data.</td></tr>
                      )}
                      {details.map((d) => (
                        <tr key={d.id} className="border-b border-border last:border-0">
                          <td className="py-3 pr-4 font-mono text-[13px]">{d.phone}</td>
                          <td className="py-3 pr-4">{statusBadge(d.status)}</td>
                          <td className="py-3 pr-4 text-xs text-muted-foreground">
                            {d.sentAt ? new Date(d.sentAt).toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "-"}
                          </td>
                          <td className="py-3 text-xs text-muted-foreground max-w-[240px] truncate" title={d.errorMsg}>{d.errorMsg || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

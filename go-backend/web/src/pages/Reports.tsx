import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Send, XCircle, Eye, Megaphone } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { apiGet } from "@/lib/api";

interface Summary {
  total_sent: number;
  total_failed: number;
  total_read: number;
}

interface Campaign {
  id: number;
  name: string;
  sent?: number;
  failed?: number;
}

interface DetailRow {
  number: string;
  status: string;
  sent_at?: string;
  error?: string;
}

const inputCls =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring";

function statusBadge(status: string) {
  const s = status.toLowerCase();
  if (s.includes("read") || s.includes("dibaca"))
    return <Badge variant="success">Dibaca</Badge>;
  if (s.includes("sent") || s.includes("terkirim") || s.includes("deliver"))
    return <Badge variant="default">Terkirim</Badge>;
  if (s.includes("fail") || s.includes("gagal") || s.includes("error"))
    return <Badge variant="destructive">Gagal</Badge>;
  return <Badge variant="secondary">{status}</Badge>;
}

export default function Reports() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selected, setSelected] = useState("");
  const [details, setDetails] = useState<DetailRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [s, c] = await Promise.all([
          apiGet<Summary>("/reports/summary").catch(() => null),
          apiGet<{ campaigns: Campaign[] } | Campaign[]>("/api/bulk/campaigns")
            .then((r) => (Array.isArray(r) ? r : r.campaigns ?? []))
            .catch(() => [] as Campaign[]),
        ]);
        setSummary(s);
        setCampaigns(c);
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
      const r = await apiGet<{ details: DetailRow[] } | DetailRow[]>(`/reports/campaigns/${id}`);
      setDetails(Array.isArray(r) ? r : r.details ?? []);
    } catch (e: any) {
      toast.error(e.message || "Gagal memuat detail campaign");
      setDetails([]);
    } finally {
      setLoadingDetail(false);
    }
  };

  const cards = [
    { label: "Terkirim", value: summary?.total_sent ?? 0, icon: Send, cls: "text-[#243370] dark:text-blue-400" },
    { label: "Gagal", value: summary?.total_failed ?? 0, icon: XCircle, cls: "text-red-500" },
    { label: "Dibaca", value: summary?.total_read ?? 0, icon: Eye, cls: "text-emerald-500" },
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
              <select value={selected} onChange={(e) => loadDetail(e.target.value)} className={`${inputCls} max-w-sm`}>
                <option value="">Pilih campaign...</option>
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>

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
                      {details.map((d, i) => (
                        <tr key={i} className="border-b border-border last:border-0">
                          <td className="py-3 pr-4 font-mono text-[13px]">{d.number}</td>
                          <td className="py-3 pr-4">{statusBadge(d.status)}</td>
                          <td className="py-3 pr-4 text-xs text-muted-foreground">{d.sent_at || "-"}</td>
                          <td className="py-3 text-xs text-muted-foreground max-w-[240px] truncate" title={d.error}>{d.error || "-"}</td>
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

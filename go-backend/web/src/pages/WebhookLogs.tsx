import { useEffect, useState } from "react";
import { toast } from "sonner";
import { RotateCcw, Webhook } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { apiGet, apiPost } from "@/lib/api";

interface Delivery {
  id: number;
  created_at: string;
  device_name?: string;
  url: string;
  event: string;
  status_code?: number;
  success: boolean;
  error?: string;
}

const inputCls =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring";

function fmtTime(s: string) {
  try {
    return new Date(s).toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch { return s; }
}

export default function WebhookLogs() {
  const [items, setItems] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "success" | "failed">("all");
  const [retrying, setRetrying] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const r = await apiGet<{ deliveries: Delivery[] } | Delivery[]>("/webhook-deliveries");
      setItems(Array.isArray(r) ? r : r.deliveries ?? []);
    } catch (e: any) {
      toast.error(e.message || "Gagal memuat log webhook");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const retry = async (d: Delivery) => {
    setRetrying(d.id);
    try {
      await apiPost(`/webhook-deliveries/${d.id}/retry`);
      toast.success("Webhook dikirim ulang");
      load();
    } catch (e: any) {
      toast.error(e.message || "Gagal retry webhook");
    } finally {
      setRetrying(null);
    }
  };

  const filtered = items.filter((d) =>
    filter === "all" ? true : filter === "success" ? d.success : !d.success
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-foreground">Webhook Logs</h1>
          <p className="text-sm text-muted-foreground">Riwayat pengiriman webhook per device.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={filter} onChange={(e) => setFilter(e.target.value as any)} className={`${inputCls} w-auto`}>
            <option value="all">Semua</option>
            <option value="success">Sukses</option>
            <option value="failed">Gagal</option>
          </select>
          <Button variant="outline" size="sm" onClick={load}>Muat Ulang</Button>
        </div>
      </div>

      {loading ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">Memuat...</CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="py-3 px-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Waktu</th>
                    <th className="py-3 px-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Device</th>
                    <th className="py-3 px-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">URL</th>
                    <th className="py-3 px-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Event</th>
                    <th className="py-3 px-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">HTTP</th>
                    <th className="py-3 px-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Status</th>
                    <th className="py-3 px-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 && (
                    <tr><td colSpan={7} className="py-8 text-center text-muted-foreground">
                      <Webhook className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      Belum ada log webhook.
                    </td></tr>
                  )}
                  {filtered.map((d) => (
                    <tr key={d.id} className="border-b border-border last:border-0">
                      <td className="py-3 px-4 text-xs text-muted-foreground whitespace-nowrap">{fmtTime(d.created_at)}</td>
                      <td className="py-3 px-4 font-medium">{d.device_name || "-"}</td>
                      <td className="py-3 px-4 font-mono text-[12px] max-w-[220px] truncate" title={d.url}>{d.url}</td>
                      <td className="py-3 px-4"><Badge variant="secondary">{d.event}</Badge></td>
                      <td className="py-3 px-4 font-mono text-[13px]">{d.status_code ?? "-"}</td>
                      <td className="py-3 px-4">
                        {d.success ? <Badge variant="success">Sukses</Badge> : <Badge variant="destructive">Gagal</Badge>}
                      </td>
                      <td className="py-3 px-4 text-right">
                        {!d.success && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1.5"
                            disabled={retrying === d.id}
                            onClick={() => retry(d)}
                          >
                            <RotateCcw className={`w-3.5 h-3.5 ${retrying === d.id ? "animate-spin" : ""}`} />
                            {retrying === d.id ? "Mengirim..." : "Retry"}
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

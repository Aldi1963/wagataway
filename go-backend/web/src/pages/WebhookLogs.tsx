import { useEffect, useState } from "react";
import { toast } from "sonner";
import { RotateCcw, Webhook } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dropdown } from "@/components/ui/dropdown";
import { apiGet, apiPost } from "@/lib/api";

interface Delivery {
  id: number;
  createdAt: string;
  deviceId: number;
  url: string;
  event: string;
  statusCode?: number;
  success: boolean;
  errorMsg?: string;
  retryCount?: number;
}

interface Device {
  id: number;
  name: string;
}

function fmtTime(s: string) {
  try {
    return new Date(s).toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch { return s; }
}

export default function WebhookLogs({ embedded = false }: { embedded?: boolean }) {
  const [items, setItems] = useState<Delivery[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "success" | "failed">("all");
  const [retrying, setRetrying] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [r, d] = await Promise.all([
        apiGet<{ deliveries: Delivery[] } | Delivery[]>("/webhook-deliveries"),
        apiGet<{ devices: Device[] }>("/devices").catch(() => ({ devices: [] as Device[] })),
      ]);
      setItems(Array.isArray(r) ? r : r.deliveries ?? []);
      setDevices(d.devices ?? []);
    } catch (e: any) {
      toast.error(e.message || "Gagal memuat log webhook");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const deviceName = (id: number) => devices.find((x) => x.id === id)?.name ?? `#${id}`;

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
        {!embedded && (
          <div>
            <h1 className="text-xl font-bold text-foreground">Webhook Logs</h1>
            <p className="text-sm text-muted-foreground">Riwayat pengiriman webhook per device.</p>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Dropdown
            value={filter}
            onChange={(v) => setFilter(v as any)}
            ariaLabel="Filter status"
            className="w-auto min-w-[120px]"
            options={[
              { value: "all", label: "Semua" },
              { value: "success", label: "Sukses" },
              { value: "failed", label: "Gagal" },
            ]}
          />
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
                      <td className="py-3 px-4 text-xs text-muted-foreground whitespace-nowrap">{fmtTime(d.createdAt)}</td>
                      <td className="py-3 px-4 font-medium whitespace-nowrap">{deviceName(d.deviceId)}</td>
                      <td className="py-3 px-4 font-mono text-[12px] max-w-[220px] truncate" title={d.url}>{d.url}</td>
                      <td className="py-3 px-4"><Badge variant="secondary">{d.event}</Badge></td>
                      <td className="py-3 px-4 font-mono text-[13px]">{d.statusCode ?? "-"}</td>
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

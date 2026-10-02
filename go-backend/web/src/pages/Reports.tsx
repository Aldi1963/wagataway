import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Send, XCircle, Eye, Megaphone, BarChart3 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { Dropdown } from "@/components/ui/dropdown";
import { apiGet } from "@/lib/api";
import { useLang } from "@/lib/i18n";

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
  deviceId?: number;
  status: string;
  sentAt?: string;
  errorMsg?: string;
}

interface DeviceInfo {
  id: number;
  name: string;
  phone: string;
}

function statusBadge(status: string, t: (key: string) => string) {
  const s = (status || "").toLowerCase();
  if (s === "read") return <Badge variant="success">{t("reports.read")}</Badge>;
  if (s === "sent") return <Badge variant="default">{t("reports.sent")}</Badge>;
  if (s === "failed") return <Badge variant="destructive">{t("reports.failed")}</Badge>;
  return <Badge variant="secondary">{status}</Badge>;
}

export default function Reports({ embedded = false }: { embedded?: boolean }) {
  const { t } = useLang();
  const [rows, setRows] = useState<SummaryRow[]>([]);
  const [selected, setSelected] = useState("");
  const [details, setDetails] = useState<DetailRow[]>([]);
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const deviceById = new Map(devices.map((d) => [d.id, d]));

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [r, d] = await Promise.all([
          apiGet<{ summary: SummaryRow[] } | SummaryRow[]>("/reports/summary"),
          apiGet<{ devices: DeviceInfo[] }>("/devices").catch(() => ({ devices: [] })),
        ]);
        setRows(Array.isArray(r) ? r : r.summary ?? []);
        setDevices(d.devices ?? []);
      } catch (e: any) {
        toast.error(e.message || t("reports.loadFail"));
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
      toast.error(e.message || t("reports.detailFail"));
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
    { label: t("reports.sent"), value: totals.sent, icon: Send, cls: "text-[#243370] dark:text-blue-400" },
    { label: t("reports.failed"), value: totals.failed, icon: XCircle, cls: "text-red-500" },
    { label: t("reports.read"), value: totals.read, icon: Eye, cls: "text-emerald-500" },
  ];

  return (
    <div className="space-y-4">
      {!embedded && (
        <h1 className="text-xl font-bold text-foreground">{t("reports.title")}</h1>
      )}

      {loading ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">{t("reports.loading")}</CardContent></Card>
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
                <Megaphone className="w-4 h-4" /> {t("reports.detailTitle")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Dropdown
                value={selected}
                onChange={loadDetail}
                ariaLabel={t("reports.selectCampaignAria")}
                className="max-w-sm"
                options={[
                  { value: "", label: t("reports.selectCampaign") },
                  ...rows.map((r) => ({ value: r.campaignId, label: t("reports.campaignOption").replace("{id}", r.campaignId).replace("{sent}", String(r.sent)).replace("{failed}", String(r.failed)) })),
                ]}
              />

              {loadingDetail ? (
                <p className="text-sm text-muted-foreground">{t("reports.loadingDetail")}</p>
              ) : selected && (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[680px] text-sm">
                    <thead>
                      <tr className="border-b border-border text-left">
                        <th className="py-2.5 pr-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t("reports.colPhone")}</th>
                        <th className="py-2.5 pr-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t("reports.colSender")}</th>
                        <th className="py-2.5 pr-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t("reports.colStatus")}</th>
                        <th className="py-2.5 pr-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t("reports.colSentAt")}</th>
                        <th className="py-2.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t("reports.colNote")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {details.length === 0 && (
                        <tr><td colSpan={5} className="py-8 text-center">
                          <EmptyState
                            icon={BarChart3}
                            title={t("reports.noData")}
                          />
                        </td></tr>
                      )}
                      {details.map((d) => (
                        <tr key={d.id} className="border-b border-border last:border-0">
                          <td className="py-3 pr-4 font-mono text-[13px]">{d.phone}</td>
                          <td className="py-3 pr-4 text-xs">
                            {d.deviceId && deviceById.get(d.deviceId) ? (
                              <span title={deviceById.get(d.deviceId)!.name}>
                                <span className="block font-medium">{deviceById.get(d.deviceId)!.name}</span>
                                <span className="block text-muted-foreground font-mono">{deviceById.get(d.deviceId)!.phone}</span>
                              </span>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </td>
                          <td className="py-3 pr-4">{statusBadge(d.status, t)}</td>
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

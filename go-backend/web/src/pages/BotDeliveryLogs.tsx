import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Bot, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { apiGet } from "@/lib/api";
import { useActiveDevice } from "@/hooks/use-active-device";
import { useLang } from "@/lib/i18n";

interface BotDelivery {
  id: number;
  createdAt: string;
  deviceId: number;
  url: string;
  event: string;
  payload: string;
  statusCode?: number;
  success: boolean;
  errorMsg?: string;
  retryCount?: number;
}

interface PayloadPreview {
  from?: string;
  message?: string;
}

function fmtTime(s: string) {
  try {
    return new Date(s).toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch { return s; }
}

function parsePayload(raw: string): PayloadPreview {
  try {
    return JSON.parse(raw) as PayloadPreview;
  } catch {
    return {};
  }
}

const PAGE_SIZE = 20;

export default function BotDeliveryLogs({ embedded = false }: { embedded?: boolean }) {
  const { activeDeviceId, activeDevice } = useActiveDevice();
  const { t } = useLang();
  const [items, setItems] = useState<BotDelivery[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const load = async (p: number, deviceId: number) => {
    setLoading(true);
    try {
      const r = await apiGet<{ deliveries: BotDelivery[]; total: number }>(
        `/devices/${deviceId}/bot-deliveries?page=${p}&limit=${PAGE_SIZE}`
      );
      setItems(r.deliveries ?? []);
      setTotal(r.total ?? 0);
      setPage(p);
    } catch (e: any) {
      toast.error(e.message || t("botDeliveryLogs.toastLoadFailed"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeDeviceId) load(1, activeDeviceId);
    else setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDeviceId]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {!embedded && (
          <div>
            <h1 className="text-xl font-bold text-foreground">{t("botDeliveryLogs.title")}</h1>
            <p className="text-sm text-muted-foreground">
              {t("botDeliveryLogs.subtitle")}{activeDevice ? ` — ${activeDevice.name}` : ""}.
            </p>
          </div>
        )}
        <Button variant="outline" size="sm" onClick={() => activeDeviceId && load(page, activeDeviceId)} disabled={!activeDeviceId}>
          {t("botDeliveryLogs.reload")}
        </Button>
      </div>

      {!activeDeviceId ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">
          {t("botDeliveryLogs.noDevice")}
        </CardContent></Card>
      ) : loading ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">{t("botDeliveryLogs.loading")}</CardContent></Card>
      ) : (
        <>
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-sm">
                  <thead>
                    <tr className="border-b border-border text-left">
                      <th className="py-3 px-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t("botDeliveryLogs.colTime")}</th>
                      <th className="py-3 px-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t("botDeliveryLogs.colFrom")}</th>
                      <th className="py-3 px-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t("botDeliveryLogs.colMessage")}</th>
                      <th className="py-3 px-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t("botDeliveryLogs.colHttp")}</th>
                      <th className="py-3 px-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t("botDeliveryLogs.colTries")}</th>
                      <th className="py-3 px-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t("botDeliveryLogs.colStatus")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.length === 0 && (
                      <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">
                        <Bot className="w-8 h-8 mx-auto mb-2 opacity-30" />
                        {t("botDeliveryLogs.empty")}
                      </td></tr>
                    )}
                    {items.map((d) => {
                      const p = parsePayload(d.payload);
                      return (
                        <tr key={d.id} className="border-b border-border last:border-0">
                          <td className="py-3 px-4 text-xs text-muted-foreground whitespace-nowrap">{fmtTime(d.createdAt)}</td>
                          <td className="py-3 px-4 font-mono text-[13px] whitespace-nowrap">{p.from ?? "-"}</td>
                          <td className="py-3 px-4 max-w-[280px] truncate" title={p.message}>{p.message ?? "-"}</td>
                          <td className="py-3 px-4 font-mono text-[13px]">{d.statusCode ?? "-"}</td>
                          <td className="py-3 px-4 font-mono text-[13px]">{(d.retryCount ?? 0) + 1}x</td>
                          <td className="py-3 px-4">
                            {d.success ? (
                              <Badge variant="success">{t("botDeliveryLogs.statusSent")}</Badge>
                            ) : (
                              <span title={d.errorMsg}>
                                <Badge variant="destructive">{t("botDeliveryLogs.statusFailed")}</Badge>
                              </span>
                            )}
                            {!d.success && d.errorMsg && (
                              <div className="mt-1 text-[11px] text-muted-foreground max-w-[240px] truncate" title={d.errorMsg}>
                                {d.errorMsg}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              {t("botDeliveryLogs.pageInfo").replace("{page}", String(page)).replace("{totalPages}", String(totalPages)).replace("{total}", String(total))}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => activeDeviceId && load(page - 1, activeDeviceId)}>
                <ChevronLeft className="w-4 h-4" /> {t("botDeliveryLogs.prevPage")}
              </Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => activeDeviceId && load(page + 1, activeDeviceId)}>
                {t("botDeliveryLogs.nextPage")} <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

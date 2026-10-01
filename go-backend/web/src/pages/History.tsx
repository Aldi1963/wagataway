import { useEffect, useState } from "react";
import { toast } from "sonner";
import { History as HistoryIcon, MessageSquareOff, Undo2, ChevronLeft, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiGet, apiDelete } from "@/lib/api";
import { useLang } from "@/lib/i18n";

interface HistoryMessage {
  id: number;
  deviceId: number;
  to: string;
  type: string;
  content: string;
  status: string;
  via: string;
  messageId: string;
  createdAt: string;
}

interface Device {
  id: number;
  name: string;
  phone: string;
}

function statusBadge(status: string, t: (key: string) => string) {
  const s = (status || "").toLowerCase();
  if (s === "read") return <Badge variant="success">{t("history.statusRead")}</Badge>;
  if (s === "delivered") return <Badge variant="default">{t("history.statusDelivered")}</Badge>;
  if (s === "sent") return <Badge variant="default">{t("history.statusDelivered")}</Badge>;
  if (s === "failed") return <Badge variant="destructive">{t("history.statusFailed")}</Badge>;
  if (s === "revoked") return <Badge variant="secondary">{t("history.statusRevoked")}</Badge>;
  if (s === "pending") return <Badge variant="secondary">{t("history.statusPending")}</Badge>;
  return <Badge variant="secondary">{status || "-"}</Badge>;
}

function formatDate(iso: string) {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const PAGE_SIZE = 20;

const HEADERS = [
  "headerId",
  "headerSender",
  "headerNumber",
  "headerMessage",
  "headerStatus",
  "headerVia",
  "headerDate",
  "headerAction",
];

export default function History() {
  const { t } = useLang();
  const [rows, setRows] = useState<HistoryMessage[]>([]);
  const [devices, setDevices] = useState<Record<number, string>>({});
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState<number | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const load = async (p: number) => {
    setLoading(true);
    try {
      const [m, d] = await Promise.all([
        apiGet<{ messages: HistoryMessage[]; total: number }>(`/messages?page=${p}&limit=${PAGE_SIZE}`),
        apiGet<{ devices: Device[] }>("/devices"),
      ]);
      setRows(m.messages ?? []);
      setTotal(m.total ?? 0);
      const map: Record<number, string> = {};
      for (const dev of d.devices ?? []) map[dev.id] = dev.phone || dev.name || `#${dev.id}`;
      setDevices(map);
      setPage(p);
    } catch (e: any) {
      toast.error(e.message || t("history.loadFailed"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(1);
  }, []);

  const canRevoke = (m: HistoryMessage) =>
    ["sent", "delivered", "read"].includes((m.status || "").toLowerCase()) && !!m.messageId;

  const revoke = async (m: HistoryMessage) => {
    if (!window.confirm(t("history.revokeConfirm").replace("{to}", m.to))) return;
    setRevoking(m.id);
    try {
      await apiDelete(`/messages/${m.id}`);
      toast.success(t("history.revoked"));
      setRows((rs) => rs.map((r) => (r.id === m.id ? { ...r, status: "revoked" } : r)));
    } catch (e: any) {
      toast.error(e.message || t("history.revokeFailed"));
    } finally {
      setRevoking(null);
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-foreground">{t("history.title")}</h1>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <HistoryIcon className="w-4 h-4" /> {t("history.allMessages")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{t("history.loading")}</p>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <MessageSquareOff className="h-5 w-5 text-muted-foreground" />
              </span>
              <p className="text-sm font-medium text-foreground">{t("history.emptyTitle")}</p>
              <p className="text-xs text-muted-foreground">{t("history.emptyHint")}</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[860px] text-sm">
                  <thead>
                    <tr className="border-b border-border text-left">
                      {HEADERS.map((h) => (
                        <th key={h} className="py-2.5 pr-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground last:pr-0">
                          {t(`history.${h}`)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((m) => (
                      <tr key={m.id} className="border-b border-border last:border-0">
                        <td className="py-3 pr-4 font-mono text-[13px]">{m.id}</td>
                        <td className="py-3 pr-4 font-mono text-[13px]">{devices[m.deviceId] ?? `#${m.deviceId}`}</td>
                        <td className="py-3 pr-4 font-mono text-[13px]">{m.to}</td>
                        <td className="py-3 pr-4 text-xs text-muted-foreground max-w-[280px] truncate" title={m.content}>
                          {m.content || "-"}
                        </td>
                        <td className="py-3 pr-4">{statusBadge(m.status, t)}</td>
                        <td className="py-3 pr-4">
                          <Badge variant="secondary">{m.via || "-"}</Badge>
                        </td>
                        <td className="py-3 pr-4 text-xs text-muted-foreground whitespace-nowrap">{formatDate(m.createdAt)}</td>
                        <td className="py-3">
                          {canRevoke(m) ? (
                            <Button
                              variant="destructive"
                              size="sm"
                              disabled={revoking === m.id}
                              onClick={() => revoke(m)}
                            >
                              <Undo2 className="w-3.5 h-3.5 mr-1" />
                              {revoking === m.id ? "..." : t("history.revokeButton")}
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  {t("history.pageInfo")
                    .replace("{page}", String(page))
                    .replace("{totalPages}", String(totalPages))
                    .replace("{total}", total.toLocaleString("id-ID"))}
                </p>
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" disabled={page <= 1 || loading} onClick={() => load(page - 1)}>
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <Button variant="secondary" size="sm" disabled={page >= totalPages || loading} onClick={() => load(page + 1)}>
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

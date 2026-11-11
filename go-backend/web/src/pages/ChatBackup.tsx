import { toast } from "sonner";
import { useEffect, useState } from "react";
import {
  Archive,
  Download,
  Trash2,
  RefreshCw,
  FileDown,
  DatabaseBackup,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { apiGet, apiPost, apiDelete, apiFetch } from "@/lib/api";
import { useLang } from "@/lib/i18n";

interface Device {
  id: number;
  name: string;
  phone: string;
  status: "connected" | "connecting" | "disconnected";
}

interface ChatBackupItem {
  id: number;
  userId: number;
  deviceId: number;
  fileName: string;
  format: string;
  conversationCount: number;
  messageCount: number;
  sizeBytes: number;
  status: string;
  errorMsg?: string;
  createdAt: string;
}

function formatBytes(n: number): string {
  if (!n) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 100 ? 0 : 1)} ${units[i]}`;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function ChatBackup() {
  const { t } = useLang();
  const [devices, setDevices] = useState<Device[]>([]);
  const [backups, setBackups] = useState<ChatBackupItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [deviceId, setDeviceId] = useState<string>("");
  const [phone, setPhone] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [format, setFormat] = useState<"csv" | "pdf" | "txt">("csv");

  const load = async () => {
    setLoading(true);
    try {
      const [devRes, bakRes] = await Promise.all([
        apiGet<{ devices: Device[] }>("/devices"),
        apiGet<{ backups: ChatBackupItem[] }>("/chat/backups"),
      ]);
      setDevices(devRes.devices || []);
      setBackups(bakRes.backups || []);
      if (!deviceId && devRes.devices?.length) {
        setDeviceId(String(devRes.devices[0].id));
      }
    } catch {
      toast.error(t("chatBackup.loadFailed"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const deviceName = (id: number) => {
    const d = devices.find((x) => x.id === id);
    return d ? `${d.name} (${d.phone})` : `#${id}`;
  };

  const runBackup = async () => {
    if (!deviceId || running) return;
    setRunning(true);
    try {
      const res = await apiPost<{ backup: ChatBackupItem }>("/chat/backups", {
        deviceId: Number(deviceId),
      });
      setBackups((p) => [res.backup, ...p]);
      toast.success(t("chatBackup.created"));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t("chatBackup.createFailed"));
    } finally {
      setRunning(false);
    }
  };

  const downloadBackup = async (b: ChatBackupItem) => {
    try {
      const res = await apiFetch(`/chat/backups/${b.id}/download`);
      if (!res.ok) throw new Error(t("chatBackup.downloadFailed"));
      downloadBlob(await res.blob(), b.fileName);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t("chatBackup.downloadFailed"));
    }
  };

  const deleteBackup = async (b: ChatBackupItem) => {
    try {
      await apiDelete(`/chat/backups/${b.id}`);
      setBackups((p) => p.filter((x) => x.id !== b.id));
      toast.success(t("chatBackup.deleted"));
    } catch {
      toast.error(t("chatBackup.deleteFailed"));
    }
  };

  const exportChat = async () => {
    if (!phone.trim() || !deviceId || exporting) return;
    setExporting(true);
    try {
      const q = new URLSearchParams({
        deviceId,
        phone: phone.trim(),
        format,
      });
      if (from) q.set("from", from);
      if (to) q.set("to", to);
      const res = await apiFetch(`/chat/export?${q.toString()}`);
      if (!res.ok) throw new Error(t("chatBackup.exportFailed"));
      downloadBlob(await res.blob(), `chat-${phone.trim()}.${format}`);
      toast.success(t("chatBackup.exported"));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t("chatBackup.exportFailed"));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-5xl">
      <div>
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <DatabaseBackup className="w-5 h-5" />
          {t("chatBackup.title")}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t("chatBackup.subtitle")}
        </p>
      </div>

      {/* Cadangan otomatis */}
      <Card>
        <CardContent className="pt-5 space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                {t("chatBackup.device")}
              </label>
              <select
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                value={deviceId}
                onChange={(e) => setDeviceId(e.target.value)}
              >
                {devices.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.phone})
                  </option>
                ))}
              </select>
            </div>
            <Button onClick={runBackup} disabled={running || !deviceId}>
              {running ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Archive className="w-4 h-4" />
              )}
              {t("chatBackup.runNow")}
            </Button>
            <Button variant="outline" onClick={load} disabled={loading}>
              <RefreshCw className="w-4 h-4" />
              {t("common.refresh")}
            </Button>
          </div>

          {loading ? (
            <p className="text-sm text-muted-foreground">
              {t("common.loading")}
            </p>
          ) : backups.length === 0 ? (
            <EmptyState
              icon={DatabaseBackup}
              title={t("chatBackup.empty")}
              hint={t("chatBackup.emptyDesc")}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground border-b border-border">
                    <th className="py-2 pr-3 font-medium">{t("chatBackup.colDate")}</th>
                    <th className="py-2 pr-3 font-medium">{t("chatBackup.colDevice")}</th>
                    <th className="py-2 pr-3 font-medium">{t("chatBackup.colConversations")}</th>
                    <th className="py-2 pr-3 font-medium">{t("chatBackup.colMessages")}</th>
                    <th className="py-2 pr-3 font-medium">{t("chatBackup.colSize")}</th>
                    <th className="py-2 pr-3 font-medium">{t("chatBackup.colStatus")}</th>
                    <th className="py-2 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {backups.map((b) => (
                    <tr key={b.id} className="border-b border-border last:border-0">
                      <td className="py-2 pr-3 whitespace-nowrap">
                        {new Date(b.createdAt).toLocaleString()}
                      </td>
                      <td className="py-2 pr-3">{deviceName(b.deviceId)}</td>
                      <td className="py-2 pr-3">{b.conversationCount}</td>
                      <td className="py-2 pr-3">{b.messageCount}</td>
                      <td className="py-2 pr-3 whitespace-nowrap">{formatBytes(b.sizeBytes)}</td>
                      <td className="py-2 pr-3">
                        {b.status === "ready" ? (
                          <Badge>{t("chatBackup.statusReady")}</Badge>
                        ) : (
                          <Badge variant="destructive">
                            {t("chatBackup.statusFailed")}
                          </Badge>
                        )}
                        {b.errorMsg && (
                          <span className="block text-xs text-muted-foreground max-w-55 truncate">
                            {b.errorMsg}
                          </span>
                        )}
                      </td>
                      <td className="py-2 text-right whitespace-nowrap">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => downloadBackup(b)}
                          disabled={b.status !== "ready"}
                          aria-label={t("chatBackup.download")}
                        >
                          <Download className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => deleteBackup(b)}
                          aria-label={t("chatBackup.delete")}
                        >
                          <Trash2 className="w-4 h-4" />
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

      {/* Ekspor manual per percakapan */}
      <Card>
        <CardContent className="pt-5 space-y-4">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <FileDown className="w-4 h-4" />
            {t("chatBackup.exportTitle")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t("chatBackup.exportDesc")}
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                {t("chatBackup.phone")}
              </label>
              <Input
                className="w-44"
                placeholder="628123456789"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                {t("chatBackup.from")}
              </label>
              <Input
                type="date"
                className="w-40"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                {t("chatBackup.to")}
              </label>
              <Input
                type="date"
                className="w-40"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                {t("chatBackup.format")}
              </label>
              <select
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                value={format}
                onChange={(e) => setFormat(e.target.value as "csv" | "pdf" | "txt")}
              >
                <option value="csv">CSV</option>
                <option value="pdf">PDF</option>
                <option value="txt">TXT</option>
              </select>
            </div>
            <Button onClick={exportChat} disabled={exporting || !phone.trim() || !deviceId}>
              {exporting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              {t("chatBackup.exportButton")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { toast } from "sonner";
import {
  Send,
  Smartphone,
  Loader2,
  History,
  Inbox,
  FileText,
  Paperclip,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiGet, apiPost } from "@/lib/api";
import { useActiveDevice } from "@/hooks/use-active-device";
import FilePickerModal, { type PickedFile } from "@/components/FilePickerModal";

interface Device {
  id: number;
  name: string;
  phone: string;
  status: "connected" | "connecting" | "disconnected";
}

interface Template {
  id: number;
  name: string;
  category: string;
  content: string;
}

interface Message {
  id: number;
  to: string;
  content: string;
  status: string;
  createdAt: string;
}

function timeAgo(iso: string | null): string {
  if (!iso) return "-";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) return "baru saja";
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "baru saja";
  if (mins < 60) return mins + " menit lalu";
  const hours = Math.floor(mins / 60);
  if (hours < 24) return hours + " jam lalu";
  return Math.floor(hours / 24) + " hari lalu";
}

const STATUS_LABEL: Record<string, string> = {
  pending: "Menunggu",
  sent: "Terkirim",
  delivered: "Terkirim",
  read: "Dibaca",
  failed: "Gagal",
};

function StatusBadge({ status }: { status: string }) {
  const label = STATUS_LABEL[status] ?? status;
  const cls =
    status === "failed"
      ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
      : status === "pending"
        ? "bg-muted text-muted-foreground"
        : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300";
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${cls}`}
    >
      {label}
    </span>
  );
}

const selectCls =
  "flex h-9 w-full rounded-md border border-border bg-background px-3 py-1 text-sm text-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 focus:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50";

export default function SendMessage({ embedded = false }: { embedded?: boolean }) {
  const [, navigate] = useLocation();
  const { activeDeviceId } = useActiveDevice();
  const [devices, setDevices] = useState<Device[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [history, setHistory] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [deviceId, setDeviceId] = useState<number | "">("");
  const [to, setTo] = useState("");
  const [content, setContent] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [sending, setSending] = useState(false);
  const [pickedFile, setPickedFile] = useState<PickedFile | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const loadHistory = async () => {
    try {
      const res = await apiGet<{ messages: Message[] }>("/messages");
      setHistory(res.messages ?? []);
    } catch {
      // riwayat gagal dimuat — biarkan kosong
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const [d, t] = await Promise.all([
          apiGet<{ devices: Device[] }>("/devices"),
          apiGet<{ templates: Template[] }>("/templates"),
        ]);
        const devs = d.devices ?? [];
        setDevices(devs);
        setTemplates(t.templates ?? []);
        // Prioritas: Active Device global (sidebar) > device terhubung > pertama
        const active =
          activeDeviceId != null
            ? devs.find((x) => x.id === activeDeviceId)
            : undefined;
        const preferred =
          active ??
          devs.find((x) => x.status === "connected") ??
          devs[0];
        if (preferred) setDeviceId(preferred.id);
      } catch (e) {
        toast.error(
          e instanceof Error ? e.message : "Gagal memuat data"
        );
      } finally {
        setLoading(false);
      }
      await loadHistory();
    })();
  }, []);

  const handleTemplate = (id: string) => {
    setTemplateId(id);
    if (!id) return;
    const tpl = templates.find((x) => x.id === Number(id));
    if (tpl) setContent(tpl.content);
  };

  const canSend =
    !sending && deviceId !== "" && to.trim() !== "" && content.trim() !== "";

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSend) return;
    setSending(true);
    try {
      const body: Record<string, unknown> = {
        deviceId,
        to: to.trim(),
        content: content.trim(),
      };
      if (pickedFile) {
        const mime = pickedFile.mime ?? "";
        body.type = mime.startsWith("image/")
          ? "image"
          : mime.startsWith("video/")
            ? "video"
            : mime.startsWith("audio/")
              ? "audio"
              : "document";
        body.fileId = pickedFile.id;
      } else {
        body.type = "text";
      }
      await apiPost("/messages/send", body);
      toast.success("Pesan terkirim");
      setTo("");
      setContent("");
      setTemplateId("");
      await loadHistory();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal mengirim pesan");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      <Card>
        {!embedded && (
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Kirim Pesan</CardTitle>
          </CardHeader>
        )}
        <CardContent>
          {loading ? (
            <div className="space-y-4 animate-pulse">
              <div className="h-9 rounded-md bg-muted" />
              <div className="h-9 rounded-md bg-muted" />
              <div className="h-28 rounded-md bg-muted" />
            </div>
          ) : devices.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <Smartphone className="h-10 w-10 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">
                  Belum ada perangkat
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Tambahkan dan hubungkan perangkat WhatsApp dulu sebelum
                  mengirim pesan.
                </p>
              </div>
              <Button size="sm" onClick={() => navigate("/")}>
                Ke Dashboard
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSend} className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-medium text-foreground">
                  Perangkat
                </label>
                <select
                  className={selectCls}
                  value={deviceId}
                  onChange={(e) =>
                    setDeviceId(e.target.value === "" ? "" : Number(e.target.value))
                  }
                  disabled={sending}
                >
                  {devices.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                      {d.phone ? ` (${d.phone})` : ""} —{" "}
                      {d.status === "connected"
                        ? "Terhubung"
                        : d.status === "connecting"
                          ? "Menghubungkan"
                          : "Terputus"}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-foreground">
                  Nomor Tujuan
                </label>
                <Input
                  placeholder="628xxxxxxxxxx"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className="font-mono"
                  disabled={sending}
                  required
                />
                <p className="text-[10px] text-muted-foreground">
                  Format: 628xxx (tanpa + atau 0)
                </p>
              </div>

              {templates.length > 0 && (
                <div className="space-y-2">
                  <label className="text-xs font-medium text-foreground">
                    Template <span className="text-muted-foreground">(opsional)</span>
                  </label>
                  <select
                    className={selectCls}
                    value={templateId}
                    onChange={(e) => handleTemplate(e.target.value)}
                    disabled={sending}
                  >
                    <option value="">Tanpa template</option>
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="space-y-2">
                <label className="text-xs font-medium text-foreground">
                  Pesan
                </label>
                <textarea
                  className="flex w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 min-h-[120px] resize-y disabled:cursor-not-allowed disabled:opacity-50"
                  placeholder="Tulis pesan Anda..."
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  disabled={sending}
                  required
                />
                <p className="text-[10px] text-muted-foreground text-right">
                  {content.length} karakter
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-foreground">
                  Lampiran <span className="text-muted-foreground">(opsional)</span>
                </label>
                {pickedFile ? (
                  <div className="flex items-center gap-2 rounded-md border border-border bg-muted/50 px-3 py-2">
                    <Paperclip className="w-4 h-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate text-xs font-medium">
                      {pickedFile.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => setPickedFile(null)}
                      aria-label="Hapus lampiran"
                      className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() => setPickerOpen(true)}
                    disabled={sending}
                  >
                    <Paperclip className="w-4 h-4" />
                    Pilih dari File Manager
                  </Button>
                )}
              </div>

              <Button type="submit" className="gap-2" disabled={!canSend}>
                {sending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                {sending ? "Mengirim..." : "Kirim"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <History className="w-4 h-4" />
            Riwayat Pengiriman
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3 animate-pulse">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-12 rounded-md bg-muted" />
              ))}
            </div>
          ) : history.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <Inbox className="h-8 w-8 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">
                Belum ada pesan terkirim
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {history.slice(0, 10).map((m) => (
                <li key={m.id} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-medium">
                      {m.to}
                    </span>
                    <StatusBadge status={m.status} />
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                    {m.content}
                  </p>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {timeAgo(m.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {templates.length === 0 && !loading && devices.length > 0 && (
        <p className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <FileText className="w-3.5 h-3.5" />
          Belum ada template.{" "}
          <Link to="/templates" className="underline underline-offset-2">
            Buat template
          </Link>{" "}
          untuk pengiriman lebih cepat.
        </p>
      )}

      <FilePickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={(f) => setPickedFile(f)}
      />
    </div>
  );
}

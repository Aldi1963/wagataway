import { useEffect, useState } from "react";
import { Plus, Clock, X, RefreshCw, Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { apiGet, apiPost, apiDelete, apiFetch } from "@/lib/api";
import { toast } from "sonner";

interface ScheduleItem {
  id: number;
  deviceId: number;
  to: string;
  content: string;
  sendAt: string;
  status: "pending" | "sent" | "failed" | "cancelled";
  errorMsg?: string;
}

interface Device {
  id: number;
  name: string;
}

const statusStyle: Record<string, string> = {
  pending: "border-amber-500/50 text-amber-600",
  sent: "bg-green-600 text-white border-green-600",
  failed: "bg-destructive text-destructive-foreground border-destructive",
  cancelled: "text-muted-foreground",
};

const statusLabel: Record<string, string> = {
  pending: "Menunggu",
  sent: "Terkirim",
  failed: "Gagal",
  cancelled: "Dibatalkan",
};

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative bg-card text-card-foreground border border-border rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-border sticky top-0 bg-card rounded-t-xl">
          <h3 className="font-semibold">{title}</h3>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose} aria-label="Tutup">
            <X className="w-4 h-4" />
          </Button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

function toDateTimeLocal(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function Schedule() {
  const [schedules, setSchedules] = useState<ScheduleItem[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [deviceId, setDeviceId] = useState("");
  const [to, setTo] = useState("");
  const [content, setContent] = useState("");
  const [sendAt, setSendAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<ScheduleItem | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    Promise.all([
      apiGet<{ schedules: ScheduleItem[] }>("/schedule"),
      apiGet<{ devices: Device[] }>("/devices"),
    ])
      .then(([s, d]) => {
        setSchedules(s.schedules || []);
        setDevices(d.devices || []);
      })
      .catch((e) => setError(e.message || "Gagal memuat data"))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const openAdd = () => {
    setDeviceId(devices.length === 1 ? String(devices[0].id) : "");
    setTo("");
    setContent("");
    setSendAt("");
    setShowForm(true);
  };

  const save = async () => {
    if (!deviceId) {
      toast.error("Pilih perangkat dulu");
      return;
    }
    if (!to.trim() || !content.trim() || !sendAt) {
      toast.error("Nomor tujuan, isi pesan, dan waktu kirim wajib diisi");
      return;
    }
    const iso = new Date(sendAt).toISOString();
    if (new Date(iso).getTime() <= Date.now()) {
      toast.error("Waktu kirim harus di masa depan");
      return;
    }
    setSaving(true);
    try {
      const res = await apiPost<{ schedule: ScheduleItem }>("/schedule", {
        deviceId: Number(deviceId),
        to: to.trim(),
        content: content.trim(),
        sendAt: iso,
      });
      setSchedules((prev) => [res.schedule, ...prev].sort((a, b) => +new Date(a.sendAt) - +new Date(b.sendAt)));
      setShowForm(false);
      toast.success("Pesan dijadwalkan");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal menjadwalkan");
    } finally {
      setSaving(false);
    }
  };

  const cancel = async (item: ScheduleItem) => {
    try {
      const res = await apiFetch(`/schedule/${item.id}/cancel`, { method: "PATCH" });
      if (!res.ok) throw new Error((await res.json()).message || "Gagal membatalkan");
      setSchedules((prev) => prev.map((s) => (s.id === item.id ? { ...s, status: "cancelled" } : s)));
      toast.success("Jadwal dibatalkan");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal membatalkan");
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await apiDelete(`/schedule/${deleting.id}`);
      setSchedules((prev) => prev.filter((s) => s.id !== deleting.id));
      toast.success("Jadwal dihapus");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal menghapus");
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Jadwal Pesan</h2>
          <p className="text-sm text-muted-foreground">Kirim pesan di waktu tertentu</p>
        </div>
        <Button size="sm" className="gap-1.5" onClick={openAdd}>
          <Plus className="w-3.5 h-3.5" />
          Jadwalkan Baru
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 rounded-lg bg-secondary animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-lg border border-border p-8 text-center space-y-3">
          <p className="text-sm text-destructive">{error}</p>
          <Button size="sm" variant="outline" onClick={load} className="gap-1.5">
            <RefreshCw className="w-3.5 h-3.5" /> Coba lagi
          </Button>
        </div>
      ) : schedules.length === 0 ? (
        <div className="rounded-lg border border-border p-8 text-center">
          <Clock className="w-8 h-8 mx-auto text-muted-foreground" />
          <p className="text-sm font-medium mt-2">Belum ada jadwal</p>
          <p className="text-xs text-muted-foreground mt-1">Jadwalkan pesan untuk dikirim nanti</p>
        </div>
      ) : (
        <div className="space-y-3">
          {schedules.map((item) => (
            <Card key={item.id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-md bg-secondary flex items-center justify-center shrink-0">
                      <Clock className="w-4 h-4 text-foreground" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground line-clamp-1">{item.content}</p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className="text-xs text-muted-foreground font-mono">{item.to}</span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(item.sendAt).toLocaleString("id-ID")}
                        </span>
                      </div>
                      {item.status === "failed" && item.errorMsg && (
                        <p className="text-xs text-destructive mt-0.5 line-clamp-1">{item.errorMsg}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="outline" className={`text-[10px] ${statusStyle[item.status] || ""}`}>
                      {statusLabel[item.status] || item.status}
                    </Badge>
                    {item.status === "pending" && (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => cancel(item)}
                          aria-label="Batalkan"
                          title="Batalkan jadwal"
                        >
                          <Ban className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive"
                          onClick={() => setDeleting(item)}
                          aria-label="Hapus"
                        >
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {showForm && (
        <Modal title="Jadwalkan Pesan Baru" onClose={() => setShowForm(false)}>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium">Perangkat</label>
              <select
                className="mt-1 flex h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
                value={deviceId}
                onChange={(e) => setDeviceId(e.target.value)}
              >
                <option value="">— Pilih perangkat —</option>
                {devices.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium">Nomor tujuan</label>
              <Input
                className="mt-1 font-mono"
                placeholder="628123456789"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-medium">Isi pesan</label>
              <textarea
                className="mt-1 flex w-full rounded-md border border-border bg-background px-3 py-2 text-sm min-h-[100px]"
                placeholder="Tulis pesan..."
                value={content}
                onChange={(e) => setContent(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-medium">Waktu kirim</label>
              <Input
                className="mt-1"
                type="datetime-local"
                value={sendAt}
                min={toDateTimeLocal(new Date(Date.now() + 60000).toISOString())}
                onChange={(e) => setSendAt(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setShowForm(false)} disabled={saving}>
                Batal
              </Button>
              <Button onClick={save} disabled={saving}>
                {saving ? "Menyimpan..." : "Jadwalkan"}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {deleting && (
        <Modal title="Hapus Jadwal" onClose={() => setDeleting(null)}>
          <p className="text-sm text-muted-foreground">
            Hapus jadwal pesan ke <span className="font-mono font-semibold text-foreground">{deleting.to}</span>?
          </p>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setDeleting(null)}>
              Batal
            </Button>
            <Button variant="destructive" onClick={confirmDelete}>
              Hapus
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

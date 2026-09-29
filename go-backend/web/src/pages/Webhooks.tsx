import { useEffect, useState } from "react";
import { Plus, Globe, Trash2, Zap, X, RefreshCw, Pencil, Copy, ChevronDown, ChevronUp, RotateCcw, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { apiGet, apiPost, apiPut, apiDelete, apiFetch } from "@/lib/api";
import { toast } from "sonner";

interface Webhook {
  id: number;
  url: string;
  secret: string;
  events: string;
  deviceId: number | null;
  isActive: boolean;
  triggerCount: number;
}

interface Delivery {
  id: number;
  event: string;
  statusCode: number;
  success: boolean;
  errorMsg: string;
  durationMs: number;
  createdAt: string;
}

interface Device {
  id: number;
  name: string;
}

const EVENT_OPTIONS = ["message.received", "message.sent", "message.delivered", "device.connected"];

function parseEvents(events: string): string[] {
  if (!events) return [];
  try {
    const arr = JSON.parse(events);
    return Array.isArray(arr) ? arr.filter((e) => typeof e === "string") : [];
  } catch {
    return events === "*" ? ["*"] : [];
  }
}

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

const emptyForm = { url: "", secret: "", deviceId: "", events: [] as string[] };

export default function Webhooks() {
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Webhook | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<Webhook | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [deliveries, setDeliveries] = useState<Record<number, Delivery[]>>({});
  const [loadingDeliveries, setLoadingDeliveries] = useState<Record<number, boolean>>({});
  const [retrying, setRetrying] = useState<number | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    Promise.all([
      apiGet<{ webhooks: Webhook[] }>("/webhooks"),
      apiGet<{ devices: Device[] }>("/devices"),
    ])
      .then(([w, d]) => {
        setWebhooks(w.webhooks || []);
        setDevices(d.devices || []);
      })
      .catch((e) => setError(e.message || "Gagal memuat data"))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm);
    setShowForm(true);
  };

  const openEdit = (hook: Webhook) => {
    setEditing(hook);
    setForm({
      url: hook.url,
      secret: hook.secret || "",
      deviceId: hook.deviceId ? String(hook.deviceId) : "",
      events: parseEvents(hook.events),
    });
    setShowForm(true);
  };

  const toggleEvent = (ev: string) => {
    setForm((f) => ({
      ...f,
      events: f.events.includes(ev) ? f.events.filter((e) => e !== ev) : [...f.events, ev],
    }));
  };

  const save = async () => {
    if (!form.url.trim()) {
      toast.error("URL webhook wajib diisi");
      return;
    }
    try {
      new URL(form.url.trim());
    } catch {
      toast.error("URL tidak valid");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        url: form.url.trim(),
        secret: form.secret.trim(),
        events: JSON.stringify(form.events),
        deviceId: form.deviceId ? Number(form.deviceId) : null,
      };
      if (editing) {
        const res = await apiPut<{ webhook: Webhook }>(`/webhooks/${editing.id}`, payload);
        setWebhooks((prev) => prev.map((w) => (w.id === editing.id ? res.webhook : w)));
        toast.success("Webhook diperbarui");
      } else {
        const res = await apiPost<{ webhook: Webhook }>("/webhooks", payload);
        setWebhooks((prev) => [res.webhook, ...prev]);
        toast.success("Webhook ditambahkan");
      }
      setShowForm(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal menyimpan");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (hook: Webhook) => {
    const next = !hook.isActive;
    setWebhooks((prev) => prev.map((w) => (w.id === hook.id ? { ...w, isActive: next } : w)));
    try {
      await apiPut(`/webhooks/${hook.id}`, { isActive: next });
      toast.success(next ? "Webhook diaktifkan" : "Webhook dinonaktifkan");
    } catch (e) {
      setWebhooks((prev) => prev.map((w) => (w.id === hook.id ? { ...w, isActive: hook.isActive } : w)));
      toast.error(e instanceof Error ? e.message : "Gagal mengubah status");
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await apiDelete(`/webhooks/${deleting.id}`);
      setWebhooks((prev) => prev.filter((w) => w.id !== deleting.id));
      toast.success("Webhook dihapus");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal menghapus");
    } finally {
      setDeleting(null);
    }
  };

  const copyUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("URL disalin");
    } catch {
      toast.error("Gagal menyalin");
    }
  };

  const deviceName = (id: number | null) =>
    id == null ? "Semua perangkat" : devices.find((d) => d.id === id)?.name || `Perangkat #${id}`;

  const toggleExpand = async (hook: Webhook) => {
    if (expanded === hook.id) {
      setExpanded(null);
      return;
    }
    setExpanded(hook.id);
    if (deliveries[hook.id]) return;
    setLoadingDeliveries((p) => ({ ...p, [hook.id]: true }));
    try {
      const res = await apiGet<{ deliveries: Delivery[] }>(`/webhooks/${hook.id}/deliveries`);
      setDeliveries((p) => ({ ...p, [hook.id]: res.deliveries || [] }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal memuat riwayat pengiriman");
      setExpanded(null);
    } finally {
      setLoadingDeliveries((p) => ({ ...p, [hook.id]: false }));
    }
  };

  const retryDelivery = async (hookId: number, delivery: Delivery) => {
    setRetrying(delivery.id);
    try {
      const res = await apiFetch(`/webhooks/${hookId}/deliveries/${delivery.id}/retry`, {
        method: "POST",
      });
      if (!res.ok) throw new Error((await res.json()).message || "Gagal mengirim ulang");
      const data = await res.json();
      const updated: Delivery = data.delivery || { ...delivery, success: true };
      setDeliveries((p) => ({
        ...p,
        [hookId]: (p[hookId] || []).map((d) => (d.id === delivery.id ? updated : d)),
      }));
      toast.success("Pengiriman ulang berhasil");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal mengirim ulang");
    } finally {
      setRetrying(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Webhooks</h2>
          <p className="text-sm text-muted-foreground">Kirim event ke URL eksternal</p>
        </div>
        <Button size="sm" className="gap-1.5" onClick={openAdd}>
          <Plus className="w-3.5 h-3.5" />
          Tambah Webhook
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
      ) : webhooks.length === 0 ? (
        <div className="rounded-lg border border-border p-8 text-center">
          <Globe className="w-8 h-8 mx-auto text-muted-foreground" />
          <p className="text-sm font-medium mt-2">Belum ada webhook</p>
          <p className="text-xs text-muted-foreground mt-1">Teruskan event WhatsApp ke sistem lain</p>
        </div>
      ) : (
        <div className="space-y-3">
          {webhooks.map((hook) => {
            const events = parseEvents(hook.events);
            const isOpen = expanded === hook.id;
            const hookDeliveries = deliveries[hook.id] || [];
            return (
              <Card key={hook.id}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-md bg-secondary flex items-center justify-center shrink-0">
                        <Globe className="w-4 h-4 text-foreground" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-mono text-foreground truncate">{hook.url}</p>
                          <Badge variant={hook.isActive ? "default" : "outline"} className="text-[10px] shrink-0">
                            {hook.isActive ? "Aktif" : "Nonaktif"}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          {events.length === 0 ? (
                            <span className="text-[10px] text-muted-foreground">Semua event</span>
                          ) : (
                            events.map((e) => (
                              <Badge key={e} variant="outline" className="text-[9px]">
                                {e}
                              </Badge>
                            ))
                          )}
                          <span className="text-[10px] text-muted-foreground">· {deviceName(hook.deviceId)}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="hidden sm:flex items-center gap-1 text-xs text-muted-foreground mr-1">
                        <Zap className="w-3 h-3" /> {hook.triggerCount}x
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => toggleExpand(hook)}
                        aria-label={isOpen ? "Tutup riwayat" : "Lihat riwayat pengiriman"}
                        title="Riwayat pengiriman"
                      >
                        {isOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => copyUrl(hook.url)}
                        aria-label="Salin URL"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => toggleActive(hook)}
                        aria-label={hook.isActive ? "Nonaktifkan" : "Aktifkan"}
                      >
                        <span
                          className={`w-3.5 h-3.5 rounded-full border-2 ${hook.isActive ? "bg-green-600 border-green-600" : "border-muted-foreground"}`}
                        />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(hook)} aria-label="Edit">
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive"
                        onClick={() => setDeleting(hook)}
                        aria-label="Hapus"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>

                  {isOpen && (
                    <div className="mt-4 pt-4 border-t border-border">
                      <p className="text-xs font-semibold text-foreground flex items-center gap-1.5 mb-2">
                        <History className="w-3.5 h-3.5" /> Riwayat Pengiriman
                      </p>
                      {loadingDeliveries[hook.id] ? (
                        <div className="space-y-2">
                          {[0, 1].map((i) => (
                            <div key={i} className="h-9 rounded bg-secondary animate-pulse" />
                          ))}
                        </div>
                      ) : hookDeliveries.length === 0 ? (
                        <p className="text-xs text-muted-foreground py-3 text-center">
                          Belum ada pengiriman tercatat.
                        </p>
                      ) : (
                        <div className="overflow-x-auto rounded-md border border-border">
                          <table className="w-full min-w-[560px] text-xs">
                            <thead>
                              <tr className="border-b border-border bg-secondary/50">
                                <th className="text-left font-medium text-muted-foreground px-3 py-2">Waktu</th>
                                <th className="text-left font-medium text-muted-foreground px-3 py-2">Event</th>
                                <th className="text-left font-medium text-muted-foreground px-3 py-2">HTTP</th>
                                <th className="text-left font-medium text-muted-foreground px-3 py-2">Durasi</th>
                                <th className="text-left font-medium text-muted-foreground px-3 py-2">Status</th>
                                <th className="w-24"></th>
                              </tr>
                            </thead>
                            <tbody>
                              {hookDeliveries.map((d) => (
                                <tr key={d.id} className="border-b border-border last:border-0">
                                  <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                                    {new Date(d.createdAt).toLocaleString("id-ID")}
                                  </td>
                                  <td className="px-3 py-2 font-mono">{d.event}</td>
                                  <td className="px-3 py-2 font-mono">{d.statusCode || "-"}</td>
                                  <td className="px-3 py-2 text-muted-foreground">{d.durationMs} ms</td>
                                  <td className="px-3 py-2">
                                    <Badge
                                      variant="outline"
                                      className={d.success ? "text-green-600 border-green-600/50" : "text-destructive border-destructive/50"}
                                    >
                                      {d.success ? "Sukses" : "Gagal"}
                                    </Badge>
                                    {!d.success && d.errorMsg && (
                                      <p className="text-[10px] text-destructive mt-0.5 max-w-[200px] truncate" title={d.errorMsg}>
                                        {d.errorMsg}
                                      </p>
                                    )}
                                  </td>
                                  <td className="px-3 py-2 text-right">
                                    {!d.success && (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 gap-1 text-[11px]"
                                        disabled={retrying === d.id}
                                        onClick={() => retryDelivery(hook.id, d)}
                                      >
                                        <RotateCcw className="w-3 h-3" />
                                        {retrying === d.id ? "..." : "Kirim ulang"}
                                      </Button>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {showForm && (
        <Modal title={editing ? "Edit Webhook" : "Tambah Webhook"} onClose={() => setShowForm(false)}>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium">URL endpoint</label>
              <Input
                className="mt-1 font-mono"
                placeholder="https://api.aplikasi.com/wa-hook"
                value={form.url}
                onChange={(e) => setForm({ ...form, url: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs font-medium">Secret (opsional)</label>
              <Input
                className="mt-1 font-mono"
                placeholder="Token rahasia untuk verifikasi signature"
                value={form.secret}
                onChange={(e) => setForm({ ...form, secret: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs font-medium">Perangkat</label>
              <select
                className="mt-1 flex h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
                value={form.deviceId}
                onChange={(e) => setForm({ ...form, deviceId: e.target.value })}
              >
                <option value="">Semua perangkat</option>
                {devices.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium">Events (kosongkan = semua)</label>
              <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                {EVENT_OPTIONS.map((ev) => (
                  <label key={ev} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-primary"
                      checked={form.events.includes(ev)}
                      onChange={() => toggleEvent(ev)}
                    />
                    <span className="font-mono text-xs">{ev}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setShowForm(false)} disabled={saving}>
                Batal
              </Button>
              <Button onClick={save} disabled={saving}>
                {saving ? "Menyimpan..." : editing ? "Simpan" : "Tambah"}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {deleting && (
        <Modal title="Hapus Webhook" onClose={() => setDeleting(null)}>
          <p className="text-sm text-muted-foreground">
            Hapus webhook <span className="font-mono font-semibold text-foreground">{deleting.url}</span>? Event
            tidak akan diteruskan lagi.
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

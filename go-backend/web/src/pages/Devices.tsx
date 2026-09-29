import { toast } from "sonner";
import { useEffect, useState, type ReactNode } from "react";
import {
  Smartphone,
  Plus,
  Wifi,
  WifiOff,
  Pencil,
  Trash2,
  X,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { apiGet, apiPost, apiPut, apiDelete } from "@/lib/api";

interface Device {
  id: number;
  name: string;
  phone: string;
  status: "connected" | "connecting" | "disconnected";
  isDefault: boolean;
  autoOnline: boolean;
  webhookUrl: string;
  lastSeen: string | null;
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

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-hidden
      />
      <div className="relative bg-card text-card-foreground rounded-xl border border-border shadow-lg w-full max-w-lg max-h-[90vh] overflow-y-auto p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold">{title}</h3>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={onClose}
            aria-label="Tutup"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function Devices() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showAdd, setShowAdd] = useState(false);
  const [addName, setAddName] = useState("");
  const [savingAdd, setSavingAdd] = useState(false);

  const [editing, setEditing] = useState<Device | null>(null);
  const [editName, setEditName] = useState("");
  const [editWebhook, setEditWebhook] = useState("");
  const [editAutoOnline, setEditAutoOnline] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);

  const [deleting, setDeleting] = useState<Device | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);

  const [qrDevice, setQrDevice] = useState<Device | null>(null);
  const [qrCode, setQrCode] = useState("");
  const [qrLoading, setQrLoading] = useState(false);
  const [qrError, setQrError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    apiGet<{ devices: Device[] }>("/devices")
      .then((res) => setDevices(res.devices || []))
      .catch((e) => setError(e.message || "Gagal memuat perangkat"))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  // Polling status saat dialog QR terbuka
  useEffect(() => {
    if (!qrDevice) return;
    const startedAt = Date.now();
    const iv = setInterval(async () => {
      if (Date.now() - startedAt > 60000) {
        clearInterval(iv);
        toast.error("Waktu tunggu habis, silakan coba hubungkan lagi");
        setQrDevice(null);
        return;
      }
      try {
        const s = await apiGet<{ status: string }>(
          `/devices/${qrDevice.id}/status`
        );
        if (s.status === "connected") {
          clearInterval(iv);
          toast.success("Perangkat terhubung");
          setQrDevice(null);
          load();
        } else {
          const q = await apiGet<{ qr: string }>(
            `/devices/${qrDevice.id}/qr`
          ).catch(() => null);
          if (q && q.qr && q.qr !== qrCode) setQrCode(q.qr);
        }
      } catch {
        /* abaikan, coba lagi di tick berikutnya */
      }
    }, 3000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qrDevice]);

  const handleAdd = async () => {
    if (!addName.trim()) {
      toast.error("Nama perangkat wajib diisi");
      return;
    }
    setSavingAdd(true);
    try {
      await apiPost("/devices", { name: addName.trim() });
      toast.success("Perangkat ditambahkan");
      setShowAdd(false);
      setAddName("");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal menambah perangkat");
    } finally {
      setSavingAdd(false);
    }
  };

  const openEdit = (d: Device) => {
    setEditing(d);
    setEditName(d.name);
    setEditWebhook(d.webhookUrl || "");
    setEditAutoOnline(!!d.autoOnline);
  };

  const handleEdit = async () => {
    if (!editing) return;
    if (!editName.trim()) {
      toast.error("Nama perangkat wajib diisi");
      return;
    }
    setSavingEdit(true);
    try {
      await apiPut(`/devices/${editing.id}`, {
        name: editName.trim(),
        webhookUrl: editWebhook.trim(),
        autoOnline: editAutoOnline,
      });
      toast.success("Perangkat diperbarui");
      setEditing(null);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal memperbarui perangkat");
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setDeletingBusy(true);
    try {
      await apiDelete(`/devices/${deleting.id}`);
      toast.success("Perangkat dihapus");
      setDeleting(null);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal menghapus perangkat");
    } finally {
      setDeletingBusy(false);
    }
  };

  const fetchQr = async (id: number) => {
    const q = await apiGet<{ qr: string }>(`/devices/${id}/qr`);
    setQrCode(q.qr || "");
  };

  const handleConnect = async (d: Device) => {
    setBusyId(d.id);
    setQrDevice(d);
    setQrCode("");
    setQrError(null);
    setQrLoading(true);
    try {
      await apiPost(`/devices/${d.id}/connect`);
      // beri jeda singkat agar sesi sempat membuat QR
      await new Promise((r) => setTimeout(r, 1500));
      await fetchQr(d.id);
    } catch (e) {
      setQrError(e instanceof Error ? e.message : "Gagal memulai koneksi");
    } finally {
      setQrLoading(false);
      setBusyId(null);
    }
  };

  const handleDisconnect = async (d: Device) => {
    setBusyId(d.id);
    try {
      await apiPost(`/devices/${d.id}/disconnect`);
      toast.success("Perangkat diputuskan");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal memutuskan perangkat");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6"> {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Perangkat</h2>
          <p className="text-sm text-muted-foreground">
            Kelola perangkat WhatsApp yang terhubung
          </p>
        </div>
        <Button
          size="sm"
          className="gap-1.5"
          onClick={() => setShowAdd(true)}
        >
          <Plus className="w-3.5 h-3.5" />
          Tambah Perangkat
        </Button>
      </div>

      {/* Loading */}
      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <Card key={i}>
              <CardContent className="p-5">
                <div className="animate-pulse space-y-3">
                  <div className="h-4 bg-secondary rounded w-1/2" />
                  <div className="h-3 bg-secondary rounded w-1/3" />
                  <div className="h-8 bg-secondary rounded w-full" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <Card>
          <CardContent className="p-6 text-center space-y-3">
            <p className="text-sm text-destructive">{error}</p>
            <Button size="sm" variant="outline" onClick={load} className="gap-1.5">
              <RefreshCw className="w-3.5 h-3.5" /> Coba lagi
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Empty */}
      {!loading && !error && devices.length === 0 && (
        <Card>
          <CardContent className="p-10 text-center space-y-3">
            <Smartphone className="w-10 h-10 mx-auto text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">
              Belum ada perangkat
            </p>
            <p className="text-xs text-muted-foreground">
              Tambahkan perangkat lalu pindai QR untuk menghubungkan WhatsApp.
            </p>
            <Button size="sm" onClick={() => setShowAdd(true)} className="gap-1.5">
              <Plus className="w-3.5 h-3.5" /> Tambah Perangkat
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Device Grid */}
      {!loading && !error && devices.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {devices.map((device) => (
            <Card key={device.id}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 shrink-0 rounded-lg border border-border flex items-center justify-center">
                      <Smartphone className="w-5 h-5 text-foreground" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">
                        {device.name}
                      </p>
                      <p className="text-xs text-muted-foreground font-mono">
                        {device.phone || "-"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {device.isDefault && (
                      <Badge variant="secondary" className="text-[10px]">
                        Utama
                      </Badge>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => openEdit(device)}
                      aria-label="Edit perangkat"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive"
                      onClick={() => setDeleting(device)}
                      aria-label="Hapus perangkat"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between">
                  <Badge
                    variant={
                      device.status === "connected" ? "default" : "outline"
                    }
                    className="gap-1"
                  >
                    {device.status === "connected" ? (
                      <Wifi className="w-3 h-3" />
                    ) : (
                      <WifiOff className="w-3 h-3" />
                    )}
                    {device.status === "connected"
                      ? "Terhubung"
                      : device.status === "connecting"
                      ? "Menghubungkan..."
                      : "Terputus"}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground">
                    {timeAgo(device.lastSeen)}
                  </span>
                </div>

                <div className="mt-4 flex gap-2">
                  {device.status === "disconnected" ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 text-xs"
                      disabled={busyId === device.id}
                      onClick={() => handleConnect(device)}
                    >
                      {busyId === device.id ? "Memproses..." : "Hubungkan"}
                    </Button>
                  ) : device.status === "connected" ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 text-xs"
                      disabled={busyId === device.id}
                      onClick={() => handleDisconnect(device)}
                    >
                      {busyId === device.id ? "Memproses..." : "Putuskan"}
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 text-xs"
                      disabled
                    >
                      Menunggu...
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Dialog tambah */}
      {showAdd && (
        <Modal title="Tambah Perangkat" onClose={() => setShowAdd(false)}>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-foreground">
                Nama perangkat
              </label>
              <Input
                className="mt-1"
                placeholder="cth: HP Utama"
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAdd(false)}
              >
                Batal
              </Button>
              <Button size="sm" onClick={handleAdd} disabled={savingAdd}>
                {savingAdd ? "Menyimpan..." : "Simpan"}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Dialog edit */}
      {editing && (
        <Modal title="Edit Perangkat" onClose={() => setEditing(null)}>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-foreground">
                Nama perangkat
              </label>
              <Input
                className="mt-1"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-foreground">
                URL Webhook (opsional)
              </label>
              <Input
                className="mt-1"
                placeholder="https://..."
                value={editWebhook}
                onChange={(e) => setEditWebhook(e.target.value)}
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={editAutoOnline}
                onChange={(e) => setEditAutoOnline(e.target.checked)}
                className="w-4 h-4 accent-primary"
              />
              Online otomatis saat terhubung
            </label>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditing(null)}
              >
                Batal
              </Button>
              <Button size="sm" onClick={handleEdit} disabled={savingEdit}>
                {savingEdit ? "Menyimpan..." : "Simpan"}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Konfirmasi hapus */}
      {deleting && (
        <Modal title="Hapus Perangkat" onClose={() => setDeleting(null)}>
          <p className="text-sm text-muted-foreground">
            Hapus perangkat <b className="text-foreground">{deleting.name}</b>?
            Sesi WhatsApp yang terhubung akan diputus.
          </p>
          <div className="flex justify-end gap-2 mt-5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDeleting(null)}
            >
              Batal
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={handleDelete}
              disabled={deletingBusy}
            >
              {deletingBusy ? "Menghapus..." : "Hapus"}
            </Button>
          </div>
        </Modal>
      )}

      {/* Dialog QR */}
      {qrDevice && (
        <Modal
          title={`Hubungkan ${qrDevice.name}`}
          onClose={() => setQrDevice(null)}
        >
          <div className="flex flex-col items-center space-y-3">
            {qrLoading && (
              <p className="text-sm text-muted-foreground">
                Menyiapkan kode QR...
              </p>
            )}
            {!qrLoading && qrError && (
              <>
                <p className="text-sm text-destructive text-center">{qrError}</p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleConnect(qrDevice)}
                >
                  Coba lagi
                </Button>
              </>
            )}
            {!qrLoading && !qrError && qrCode && (
              <>
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=8&data=${encodeURIComponent(
                    qrCode
                  )}`}
                  alt="Kode QR WhatsApp"
                  className="w-60 h-60 rounded-lg border border-border"
                />
                <p className="text-xs text-muted-foreground text-center">
                  Pindai dengan WhatsApp di HP kamu.
                  <br />
                  Kode diperbarui otomatis, menunggu hingga 60 detik.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => fetchQr(qrDevice.id).catch(() => {})}
                >
                  Muat ulang QR
                </Button>
              </>
            )}
            {!qrLoading && !qrError && !qrCode && (
              <p className="text-sm text-muted-foreground">
                Menunggu kode QR dari WhatsApp...
              </p>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}

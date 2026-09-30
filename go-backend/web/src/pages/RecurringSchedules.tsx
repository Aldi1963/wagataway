import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, X, Repeat } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dropdown } from "@/components/ui/dropdown";
import { Toggle } from "@/components/Toggle";
import { apiGet, apiPost, apiPut, apiDelete } from "@/lib/api";

interface Recurring {
  id: number;
  name: string;
  deviceId: number;
  target: string;
  message: string;
  mediaUrl?: string;
  frequency: string;
  time: string;
  dayOfWeek?: number | null;
  dayOfMonth?: number | null;
  isActive: boolean;
  nextRunAt?: string | null;
}

interface Device {
  id: number;
  name: string;
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden />
      <div className="relative bg-card text-card-foreground rounded-xl border border-border shadow-lg w-full max-w-lg max-h-[90vh] overflow-y-auto p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold">{title}</h3>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose} aria-label="Tutup">
            <X className="w-4 h-4" />
          </Button>
        </div>
        {children}
      </div>
    </div>
  );
}

const inputCls =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring";

const FREQUENCIES = [
  { value: "daily", label: "Harian" },
  { value: "weekly", label: "Mingguan" },
  { value: "monthly", label: "Bulanan" },
];

const DAYS = [
  { value: "0", label: "Minggu" },
  { value: "1", label: "Senin" },
  { value: "2", label: "Selasa" },
  { value: "3", label: "Rabu" },
  { value: "4", label: "Kamis" },
  { value: "5", label: "Jumat" },
  { value: "6", label: "Sabtu" },
];

const freqLabel = (f: string) => FREQUENCIES.find((x) => x.value === f)?.label ?? f;

function fmtNextRun(s?: string | null) {
  if (!s) return "-";
  try {
    return new Date(s).toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch { return "-"; }
}

export default function RecurringSchedules() {
  const [items, setItems] = useState<Recurring[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Recurring | null>(null);
  const [name, setName] = useState("");
  const [deviceId, setDeviceId] = useState("");
  const [target, setTarget] = useState("");
  const [frequency, setFrequency] = useState("daily");
  const [time, setTime] = useState("08:00");
  const [dayOfWeek, setDayOfWeek] = useState("1");
  const [dayOfMonth, setDayOfMonth] = useState("1");
  const [message, setMessage] = useState("");
  const [deleting, setDeleting] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [r, d] = await Promise.all([
        apiGet<{ schedules: Recurring[] } | Recurring[]>("/recurring-schedules"),
        apiGet<{ devices: Device[] }>("/devices"),
      ]);
      setItems(Array.isArray(r) ? r : r.schedules ?? []);
      setDevices(d.devices ?? []);
    } catch (e: any) {
      toast.error(e.message || "Gagal memuat jadwal");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const deviceName = (id: number) => devices.find((x) => x.id === id)?.name ?? `#${id}`;

  const openModal = (s?: Recurring) => {
    setEditing(s ?? null);
    setName(s?.name ?? "");
    setDeviceId(s?.deviceId ? String(s.deviceId) : devices.length === 1 ? String(devices[0].id) : "");
    setTarget(s?.target ?? "");
    setFrequency(s?.frequency ?? "daily");
    setTime(s?.time ?? "08:00");
    setDayOfWeek(s?.dayOfWeek != null ? String(s.dayOfWeek) : "1");
    setDayOfMonth(s?.dayOfMonth != null ? String(s.dayOfMonth) : "1");
    setMessage(s?.message ?? "");
    setShowModal(true);
  };

  const save = async () => {
    if (!name.trim() || !target.trim() || !message.trim()) { toast.error("Nama, target, dan pesan wajib diisi"); return; }
    if (!/^\d{2}:\d{2}$/.test(time)) { toast.error("Format jam harus HH:MM"); return; }
    try {
      const payload: Record<string, unknown> = {
        name: name.trim(),
        deviceId: deviceId ? Number(deviceId) : 0,
        target: target.trim(),
        frequency,
        time,
        message: message.trim(),
      };
      if (frequency === "weekly") payload.dayOfWeek = Number(dayOfWeek);
      if (frequency === "monthly") payload.dayOfMonth = Math.min(31, Math.max(1, Number(dayOfMonth) || 1));
      if (editing) { await apiPut(`/recurring-schedules/${editing.id}`, payload); toast.success("Diperbarui"); }
      else { await apiPost("/recurring-schedules", payload); toast.success("Jadwal ditambahkan"); }
      setShowModal(false);
      load();
    } catch (e: any) { toast.error(e.message || "Gagal menyimpan"); }
  };

  const toggleActive = async (s: Recurring, v: boolean) => {
    try {
      await apiPost(`/recurring-schedules/${s.id}/toggle`, {});
      setItems((prev) => prev.map((x) => (x.id === s.id ? { ...x, isActive: v } : x)));
      toast.success(v ? "Jadwal diaktifkan" : "Jadwal dinonaktifkan");
    } catch (e: any) { toast.error(e.message || "Gagal mengubah status"); }
  };

  const confirmDelete = async () => {
    if (deleting == null) return;
    try {
      await apiDelete(`/recurring-schedules/${deleting}`);
      toast.success("Dihapus");
      setDeleting(null);
      load();
    } catch (e: any) { toast.error(e.message || "Gagal menghapus"); }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-foreground">Jadwal Berulang</h1>
          <p className="text-sm text-muted-foreground">Pesan otomatis yang terkirim berulang: harian, mingguan, atau bulanan.</p>
        </div>
        <Button size="sm" onClick={() => openModal()} className="gap-1.5">
          <Plus className="w-4 h-4" /> Tambah Jadwal
        </Button>
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
                    <th className="py-3 px-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Nama</th>
                    <th className="py-3 px-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Device</th>
                    <th className="py-3 px-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Target</th>
                    <th className="py-3 px-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Frekuensi</th>
                    <th className="py-3 px-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Berikutnya</th>
                    <th className="py-3 px-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Aktif</th>
                    <th className="py-3 px-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {items.length === 0 && (
                    <tr><td colSpan={7} className="py-8 text-center text-muted-foreground">Belum ada jadwal berulang.</td></tr>
                  )}
                  {items.map((s) => (
                    <tr key={s.id} className="border-b border-border last:border-0">
                      <td className="py-3 px-4 font-medium">
                        <span className="inline-flex items-center gap-1.5"><Repeat className="w-3.5 h-3.5 text-muted-foreground" />{s.name}</span>
                      </td>
                      <td className="py-3 px-4 text-xs text-muted-foreground whitespace-nowrap">{deviceName(s.deviceId)}</td>
                      <td className="py-3 px-4 font-mono text-[13px]">{s.target}</td>
                      <td className="py-3 px-4 whitespace-nowrap text-xs">{freqLabel(s.frequency)} · {s.time}</td>
                      <td className="py-3 px-4 text-xs text-muted-foreground whitespace-nowrap">{fmtNextRun(s.nextRunAt)}</td>
                      <td className="py-3 px-4">
                        <Toggle checked={s.isActive} label={`Aktif ${s.name}`} onToggle={(v) => toggleActive(s, v)} />
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openModal(s)} aria-label="Ubah">
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleting(s.id)} aria-label="Hapus">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {showModal && (
        <Modal title={editing ? "Ubah Jadwal" : "Tambah Jadwal Berulang"} onClose={() => setShowModal(false)}>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Nama Jadwal</label>
              <Input className="mt-1.5" placeholder="cth: Pengingat pembayaran" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">Device Pengirim</label>
                <Dropdown
                  value={deviceId}
                  onChange={setDeviceId}
                  ariaLabel="Device pengirim"
                  className="mt-1.5"
                  options={[
                    { value: "", label: "Pilih device" },
                    ...devices.map((d) => ({ value: String(d.id), label: d.name })),
                  ]}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Nomor Target</label>
                <Input className="mt-1.5" placeholder="62812xxxxxxx" value={target} onChange={(e) => setTarget(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">Frekuensi</label>
                <Dropdown
                  value={frequency}
                  onChange={setFrequency}
                  ariaLabel="Frekuensi"
                  className="mt-1.5"
                  options={FREQUENCIES.map((f) => ({ value: f.value, label: f.label }))}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Jam Kirim</label>
                <Input type="time" className="mt-1.5" value={time} onChange={(e) => setTime(e.target.value)} />
              </div>
            </div>
            {frequency === "weekly" && (
              <div>
                <label className="text-sm font-medium">Hari</label>
                <Dropdown
                  value={dayOfWeek}
                  onChange={setDayOfWeek}
                  ariaLabel="Hari"
                  className="mt-1.5"
                  options={DAYS.map((d) => ({ value: d.value, label: d.label }))}
                />
              </div>
            )}
            {frequency === "monthly" && (
              <div>
                <label className="text-sm font-medium">Tanggal</label>
                <Input type="number" min={1} max={31} className="mt-1.5" value={dayOfMonth} onChange={(e) => setDayOfMonth(e.target.value)} />
              </div>
            )}
            <div>
              <label className="text-sm font-medium">Isi Pesan</label>
              <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={4} placeholder="Tulis pesan..." className={`${inputCls} mt-1.5 resize-y`} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowModal(false)}>Batal</Button>
              <Button onClick={save}>Simpan</Button>
            </div>
          </div>
        </Modal>
      )}

      {deleting != null && (
        <Modal title="Hapus?" onClose={() => setDeleting(null)}>
          <p className="text-sm text-muted-foreground">Jadwal yang dihapus tidak bisa dikembalikan.</p>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setDeleting(null)}>Batal</Button>
            <Button variant="destructive" onClick={confirmDelete}>Hapus</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

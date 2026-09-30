import { useEffect, useState } from "react";
import { Plus, Clock, X, RefreshCw, Ban, CalendarDays, List, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dropdown } from "@/components/ui/dropdown";
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

function dateKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const DAY_NAMES = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const MONTH_NAMES = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

function CalendarView({
  schedules,
  month,
  onMonthChange,
  selectedDate,
  onSelectDate,
  onCancel,
  onDelete,
}: {
  schedules: ScheduleItem[];
  month: Date;
  onMonthChange: (d: Date) => void;
  selectedDate: string | null;
  onSelectDate: (k: string | null) => void;
  onCancel: (item: ScheduleItem) => void;
  onDelete: (item: ScheduleItem) => void;
}) {
  const year = month.getFullYear();
  const mon = month.getMonth();
  const firstDay = new Date(year, mon, 1).getDay();
  const daysInMonth = new Date(year, mon + 1, 0).getDate();
  const todayKey = dateKey(new Date());

  const counts: Record<string, number> = {};
  for (const s of schedules) {
    const k = dateKey(new Date(s.sendAt));
    counts[k] = (counts[k] || 0) + 1;
  }

  const cells: (number | null)[] = [
    ...Array<null>(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const dayItems = selectedDate
    ? schedules.filter((s) => dateKey(new Date(s.sendAt)) === selectedDate)
    : [];

  const prevMonth = () => onMonthChange(new Date(year, mon - 1, 1));
  const nextMonth = () => onMonthChange(new Date(year, mon + 1, 1));

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={prevMonth} aria-label="Bulan sebelumnya">
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <p className="text-sm font-semibold text-foreground">
              {MONTH_NAMES[mon]} {year}
            </p>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={nextMonth} aria-label="Bulan berikutnya">
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
          <div className="grid grid-cols-7 gap-1">
            {DAY_NAMES.map((d) => (
              <div key={d} className="text-center text-[10px] font-semibold text-muted-foreground py-1">
                {d}
              </div>
            ))}
            {cells.map((day, i) => {
              if (day === null) return <div key={`e${i}`} />;
              const k = `${year}-${String(mon + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const count = counts[k] || 0;
              const isSelected = selectedDate === k;
              const isToday = todayKey === k;
              return (
                <button
                  key={k}
                  onClick={() => onSelectDate(isSelected ? null : k)}
                  className={`relative rounded-md border p-1.5 min-h-[52px] flex flex-col items-center justify-start transition-colors ${
                    isSelected
                      ? "border-primary bg-primary/10"
                      : "border-border hover:bg-secondary/60"
                  } ${isToday ? "ring-1 ring-primary" : ""}`}
                >
                  <span className={`text-xs ${isToday ? "font-bold text-primary" : "text-foreground"}`}>
                    {day}
                  </span>
                  {count > 0 && (
                    <span className="mt-1 text-[9px] font-semibold rounded-full bg-primary text-primary-foreground px-1.5 py-0.5 min-w-[18px] text-center">
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {selectedDate && (
        <div className="space-y-3">
          <p className="text-sm font-medium text-foreground">
            Jadwal {new Date(selectedDate + "T00:00:00").toLocaleDateString("id-ID", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            })}{" "}
            <span className="text-muted-foreground font-normal">({dayItems.length})</span>
          </p>
          {dayItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">Tidak ada jadwal pada tanggal ini.</p>
          ) : (
            dayItems.map((item) => (
              <ScheduleRow key={item.id} item={item} onCancel={onCancel} onDelete={onDelete} />
            ))
          )}
        </div>
      )}
    </div>
  );
}

function ScheduleRow({
  item,
  onCancel,
  onDelete,
}: {
  item: ScheduleItem;
  onCancel: (item: ScheduleItem) => void;
  onDelete: (item: ScheduleItem) => void;
}) {
  return (
    <Card>
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
                  onClick={() => onCancel(item)}
                  aria-label="Batalkan"
                  title="Batalkan jadwal"
                >
                  <Ban className="w-3.5 h-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive"
                  onClick={() => onDelete(item)}
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
  );
}

export default function Schedule({ embedded = false, forcedView }: { embedded?: boolean; forcedView?: "list" | "calendar" }) {
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
  const [viewState, setView] = useState<"list" | "calendar">("list");
  // Bila dipaksa dari luar (mis. tab Kalender di ScheduleHub), pakai itu dan
  // sembunyikan toggle internal agar tidak ada dua lapis tab.
  const view = forcedView ?? viewState;
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

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
      <div className={`flex gap-3 sm:flex-row sm:items-center ${embedded ? "justify-end" : "flex-col sm:justify-between"}`}>
        {!embedded && (
          <div>
            <h2 className="text-lg font-semibold text-foreground">Jadwal Pesan</h2>
            <p className="text-sm text-muted-foreground">Kirim pesan di waktu tertentu</p>
          </div>
        )}
        <div className="flex items-center gap-2">
          {!forcedView && (
          <div className="flex rounded-md border border-border p-0.5">
            <Button
              variant={view === "list" ? "secondary" : "ghost"}
              size="sm"
              className="h-7 gap-1 text-xs"
              onClick={() => setView("list")}
            >
              <List className="w-3.5 h-3.5" /> Daftar
            </Button>
            <Button
              variant={view === "calendar" ? "secondary" : "ghost"}
              size="sm"
              className="h-7 gap-1 text-xs"
              onClick={() => setView("calendar")}
            >
              <CalendarDays className="w-3.5 h-3.5" /> Kalender
            </Button>
          </div>
          )}
          <Button size="sm" className="gap-1.5" onClick={openAdd}>
            <Plus className="w-3.5 h-3.5" />
            Jadwalkan Baru
          </Button>
        </div>
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
      ) : view === "calendar" ? (
        <CalendarView
          schedules={schedules}
          month={month}
          onMonthChange={setMonth}
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
          onCancel={cancel}
          onDelete={setDeleting}
        />
      ) : schedules.length === 0 ? (
        <div className="rounded-lg border border-border p-8 text-center">
          <Clock className="w-8 h-8 mx-auto text-muted-foreground" />
          <p className="text-sm font-medium mt-2">Belum ada jadwal</p>
          <p className="text-xs text-muted-foreground mt-1">Jadwalkan pesan untuk dikirim nanti</p>
        </div>
      ) : (
        <div className="space-y-3">
          {schedules.map((item) => (
            <ScheduleRow key={item.id} item={item} onCancel={cancel} onDelete={setDeleting} />
          ))}
        </div>
      )}

      {showForm && (
        <Modal title="Jadwalkan Pesan Baru" onClose={() => setShowForm(false)}>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium">Perangkat</label>
              <Dropdown
                value={deviceId}
                onChange={setDeviceId}
                ariaLabel="Perangkat"
                className="mt-1"
                options={[
                  { value: "", label: "— Pilih perangkat —" },
                  ...devices.map((d) => ({ value: String(d.id), label: d.name })),
                ]}
              />
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

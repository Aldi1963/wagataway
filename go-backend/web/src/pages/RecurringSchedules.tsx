import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, X, Repeat } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dropdown } from "@/components/ui/dropdown";
import { Toggle } from "@/components/Toggle";
import { apiGet, apiPost, apiPut, apiDelete } from "@/lib/api";
import { useLang } from "@/lib/i18n";

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
  const { t } = useLang();
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden />
      <div className="relative bg-card text-card-foreground rounded-xl border border-border shadow-lg w-full max-w-lg max-h-[90vh] overflow-y-auto p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold">{title}</h3>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose} aria-label={t("recurringSchedules.close")}>
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

function fmtNextRun(s?: string | null) {
  if (!s) return "-";
  try {
    return new Date(s).toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch { return "-"; }
}

export default function RecurringSchedules({ embedded = false }: { embedded?: boolean }) {
  const { t } = useLang();
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

  const FREQUENCIES = [
    { value: "daily", label: t("recurringSchedules.freqDaily") },
    { value: "weekly", label: t("recurringSchedules.freqWeekly") },
    { value: "monthly", label: t("recurringSchedules.freqMonthly") },
  ];

  const DAYS = [
    { value: "0", label: t("recurringSchedules.daySun") },
    { value: "1", label: t("recurringSchedules.dayMon") },
    { value: "2", label: t("recurringSchedules.dayTue") },
    { value: "3", label: t("recurringSchedules.dayWed") },
    { value: "4", label: t("recurringSchedules.dayThu") },
    { value: "5", label: t("recurringSchedules.dayFri") },
    { value: "6", label: t("recurringSchedules.daySat") },
  ];

  const freqLabel = (f: string) => FREQUENCIES.find((x) => x.value === f)?.label ?? f;

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
      toast.error(e.message || t("recurringSchedules.loadFail"));
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
    if (!name.trim() || !target.trim() || !message.trim()) { toast.error(t("recurringSchedules.fieldsRequired")); return; }
    if (!/^\d{2}:\d{2}$/.test(time)) { toast.error(t("recurringSchedules.timeFormat")); return; }
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
      if (editing) { await apiPut(`/recurring-schedules/${editing.id}`, payload); toast.success(t("recurringSchedules.updated")); }
      else { await apiPost("/recurring-schedules", payload); toast.success(t("recurringSchedules.added")); }
      setShowModal(false);
      load();
    } catch (e: any) { toast.error(e.message || t("recurringSchedules.saveFail")); }
  };

  const toggleActive = async (s: Recurring, v: boolean) => {
    try {
      await apiPost(`/recurring-schedules/${s.id}/toggle`, {});
      setItems((prev) => prev.map((x) => (x.id === s.id ? { ...x, isActive: v } : x)));
      toast.success(v ? t("recurringSchedules.activated") : t("recurringSchedules.deactivated"));
    } catch (e: any) { toast.error(e.message || t("recurringSchedules.statusFail")); }
  };

  const confirmDelete = async () => {
    if (deleting == null) return;
    try {
      await apiDelete(`/recurring-schedules/${deleting}`);
      toast.success(t("recurringSchedules.deleted"));
      setDeleting(null);
      load();
    } catch (e: any) { toast.error(e.message || t("recurringSchedules.deleteFail")); }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {!embedded && (
          <div>
            <h1 className="text-xl font-bold text-foreground">{t("recurringSchedules.title")}</h1>
            <p className="text-sm text-muted-foreground">{t("recurringSchedules.subtitle")}</p>
          </div>
        )}
        <Button size="sm" onClick={() => openModal()} className="gap-1.5">
          <Plus className="w-4 h-4" /> {t("recurringSchedules.addSchedule")}
        </Button>
      </div>

      {loading ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">{t("recurringSchedules.loading")}</CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="py-3 px-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t("recurringSchedules.colName")}</th>
                    <th className="py-3 px-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t("recurringSchedules.colDevice")}</th>
                    <th className="py-3 px-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t("recurringSchedules.colTarget")}</th>
                    <th className="py-3 px-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t("recurringSchedules.colFrequency")}</th>
                    <th className="py-3 px-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t("recurringSchedules.colNext")}</th>
                    <th className="py-3 px-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t("recurringSchedules.colActive")}</th>
                    <th className="py-3 px-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground text-right">{t("recurringSchedules.colAction")}</th>
                  </tr>
                </thead>
                <tbody>
                  {items.length === 0 && (
                    <tr><td colSpan={7} className="py-8 text-center text-muted-foreground">{t("recurringSchedules.empty")}</td></tr>
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
                        <Toggle checked={s.isActive} label={t("recurringSchedules.activeLabel").replace("{name}", s.name)} onToggle={(v) => toggleActive(s, v)} />
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openModal(s)} aria-label={t("recurringSchedules.editAria")}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleting(s.id)} aria-label={t("recurringSchedules.deleteAria")}>
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
        <Modal title={editing ? t("recurringSchedules.editTitle") : t("recurringSchedules.addTitle")} onClose={() => setShowModal(false)}>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">{t("recurringSchedules.nameLabel")}</label>
              <Input className="mt-1.5" placeholder={t("recurringSchedules.namePlaceholder")} value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">{t("recurringSchedules.deviceLabel")}</label>
                <Dropdown
                  value={deviceId}
                  onChange={setDeviceId}
                  ariaLabel={t("recurringSchedules.deviceAria")}
                  className="mt-1.5"
                  options={[
                    { value: "", label: t("recurringSchedules.selectDevice") },
                    ...devices.map((d) => ({ value: String(d.id), label: d.name })),
                  ]}
                />
              </div>
              <div>
                <label className="text-sm font-medium">{t("recurringSchedules.targetLabel")}</label>
                <Input className="mt-1.5" placeholder="62812xxxxxxx" value={target} onChange={(e) => setTarget(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">{t("recurringSchedules.frequencyLabel")}</label>
                <Dropdown
                  value={frequency}
                  onChange={setFrequency}
                  ariaLabel={t("recurringSchedules.frequencyAria")}
                  className="mt-1.5"
                  options={FREQUENCIES.map((f) => ({ value: f.value, label: f.label }))}
                />
              </div>
              <div>
                <label className="text-sm font-medium">{t("recurringSchedules.timeLabel")}</label>
                <Input type="time" className="mt-1.5" value={time} onChange={(e) => setTime(e.target.value)} />
              </div>
            </div>
            {frequency === "weekly" && (
              <div>
                <label className="text-sm font-medium">{t("recurringSchedules.dayLabel")}</label>
                <Dropdown
                  value={dayOfWeek}
                  onChange={setDayOfWeek}
                  ariaLabel={t("recurringSchedules.dayAria")}
                  className="mt-1.5"
                  options={DAYS.map((d) => ({ value: d.value, label: d.label }))}
                />
              </div>
            )}
            {frequency === "monthly" && (
              <div>
                <label className="text-sm font-medium">{t("recurringSchedules.dateLabel")}</label>
                <Input type="number" min={1} max={31} className="mt-1.5" value={dayOfMonth} onChange={(e) => setDayOfMonth(e.target.value)} />
              </div>
            )}
            <div>
              <label className="text-sm font-medium">{t("recurringSchedules.messageLabel")}</label>
              <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={4} placeholder={t("recurringSchedules.messagePlaceholder")} className={`${inputCls} mt-1.5 resize-y`} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowModal(false)}>{t("recurringSchedules.cancel")}</Button>
              <Button onClick={save}>{t("recurringSchedules.save")}</Button>
            </div>
          </div>
        </Modal>
      )}

      {deleting != null && (
        <Modal title={t("recurringSchedules.deleteTitle")} onClose={() => setDeleting(null)}>
          <p className="text-sm text-muted-foreground">{t("recurringSchedules.deleteConfirm")}</p>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setDeleting(null)}>{t("recurringSchedules.cancel")}</Button>
            <Button variant="destructive" onClick={confirmDelete}>{t("recurringSchedules.delete")}</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

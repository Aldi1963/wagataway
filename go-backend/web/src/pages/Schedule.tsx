import { useEffect, useState } from "react";
import { Plus, Clock, X, RefreshCw, Ban, CalendarDays, List, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { apiGet, apiPost, apiDelete, apiFetch } from "@/lib/api";
import { toast } from "sonner";
import { useActiveDevice } from "@/hooks/use-active-device";
import { useLang } from "@/lib/i18n";

interface ScheduleItem {
  id: number;
  deviceId: number;
  to: string;
  content: string;
  sendAt: string;
  status: "pending" | "sent" | "failed" | "cancelled";
  errorMsg?: string;
}

const statusStyle: Record<string, string> = {
  pending: "border-amber-500/50 text-amber-600",
  sent: "bg-green-600 text-white border-green-600",
  failed: "bg-destructive text-destructive-foreground border-destructive",
  cancelled: "text-muted-foreground",
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
  const { t } = useLang();
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative bg-card text-card-foreground border border-border rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-border sticky top-0 bg-card rounded-t-xl">
          <h3 className="font-semibold">{title}</h3>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose} aria-label={t("schedule.close")}>
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
  const { t } = useLang();
  const dayNames = [
    t("schedule.daySun"),
    t("schedule.dayMon"),
    t("schedule.dayTue"),
    t("schedule.dayWed"),
    t("schedule.dayThu"),
    t("schedule.dayFri"),
    t("schedule.daySat"),
  ];
  const monthNames = [
    t("schedule.monthJan"),
    t("schedule.monthFeb"),
    t("schedule.monthMar"),
    t("schedule.monthApr"),
    t("schedule.monthMay"),
    t("schedule.monthJun"),
    t("schedule.monthJul"),
    t("schedule.monthAug"),
    t("schedule.monthSep"),
    t("schedule.monthOct"),
    t("schedule.monthNov"),
    t("schedule.monthDec"),
  ];

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
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={prevMonth} aria-label={t("schedule.prevMonth")}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <p className="text-sm font-semibold text-foreground">
              {monthNames[mon]} {year}
            </p>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={nextMonth} aria-label={t("schedule.nextMonth")}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
          <div className="grid grid-cols-7 gap-1">
            {dayNames.map((d) => (
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
            {t("schedule.dayHeading")}{" "}
            {new Date(selectedDate + "T00:00:00").toLocaleDateString("id-ID", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            })}{" "}
            <span className="text-muted-foreground font-normal">({dayItems.length})</span>
          </p>
          {dayItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("schedule.noScheduleOnDate")}</p>
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
  const { t } = useLang();
  const statusText: Record<string, string> = {
    pending: t("schedule.statusPending"),
    sent: t("schedule.statusSent"),
    failed: t("schedule.statusFailed"),
    cancelled: t("schedule.statusCancelled"),
  };
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
              {statusText[item.status] || item.status}
            </Badge>
            {item.status === "pending" && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => onCancel(item)}
                  aria-label={t("schedule.cancelAria")}
                  title={t("schedule.cancelScheduleTitle")}
                >
                  <Ban className="w-3.5 h-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive"
                  onClick={() => onDelete(item)}
                  aria-label={t("schedule.deleteAria")}
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
  const { t } = useLang();
  const { activeDeviceId, activeDevice } = useActiveDevice();
  const [schedules, setSchedules] = useState<ScheduleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
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
    apiGet<{ schedules: ScheduleItem[] }>("/schedule")
      .then((s) => {
        setSchedules(s.schedules || []);
      })
      .catch((e) => setError(e.message || t("schedule.loadFail")))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const openAdd = () => {
    if (activeDeviceId == null) {
      toast.error(t("schedule.selectDeviceFirst"));
      return;
    }
    setTo("");
    setContent("");
    setSendAt("");
    setShowForm(true);
  };

  const save = async () => {
    if (activeDeviceId == null) {
      toast.error(t("schedule.selectDeviceFirst"));
      return;
    }
    if (!to.trim() || !content.trim() || !sendAt) {
      toast.error(t("schedule.fieldsRequired"));
      return;
    }
    const iso = new Date(sendAt).toISOString();
    if (new Date(iso).getTime() <= Date.now()) {
      toast.error(t("schedule.futureTime"));
      return;
    }
    setSaving(true);
    try {
      const res = await apiPost<{ schedule: ScheduleItem }>("/schedule", {
        deviceId: activeDeviceId,
        to: to.trim(),
        content: content.trim(),
        sendAt: iso,
      });
      setSchedules((prev) => [res.schedule, ...prev].sort((a, b) => +new Date(a.sendAt) - +new Date(b.sendAt)));
      setShowForm(false);
      toast.success(t("schedule.scheduled"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("schedule.scheduleFail"));
    } finally {
      setSaving(false);
    }
  };

  const cancel = async (item: ScheduleItem) => {
    try {
      const res = await apiFetch(`/schedule/${item.id}/cancel`, { method: "PATCH" });
      if (!res.ok) throw new Error((await res.json()).message || t("schedule.cancelFail"));
      setSchedules((prev) => prev.map((s) => (s.id === item.id ? { ...s, status: "cancelled" } : s)));
      toast.success(t("schedule.cancelledToast"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("schedule.cancelFail"));
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await apiDelete(`/schedule/${deleting.id}`);
      setSchedules((prev) => prev.filter((s) => s.id !== deleting.id));
      toast.success(t("schedule.deletedToast"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("schedule.deleteFail"));
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className={`flex gap-3 sm:flex-row sm:items-center ${embedded ? "justify-end" : "flex-col sm:justify-between"}`}>
        {!embedded && (
          <div>
            <h2 className="text-lg font-semibold text-foreground">{t("schedule.title")}</h2>
            <p className="text-sm text-muted-foreground">{t("schedule.subtitle")}</p>
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
              <List className="w-3.5 h-3.5" /> {t("schedule.viewList")}
            </Button>
            <Button
              variant={view === "calendar" ? "secondary" : "ghost"}
              size="sm"
              className="h-7 gap-1 text-xs"
              onClick={() => setView("calendar")}
            >
              <CalendarDays className="w-3.5 h-3.5" /> {t("schedule.viewCalendar")}
            </Button>
          </div>
          )}
          <Button size="sm" className="gap-1.5" onClick={openAdd}>
            <Plus className="w-3.5 h-3.5" />
            {t("schedule.addNew")}
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
            <RefreshCw className="w-3.5 h-3.5" /> {t("schedule.retry")}
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
          <p className="text-sm font-medium mt-2">{t("schedule.emptyTitle")}</p>
          <p className="text-xs text-muted-foreground mt-1">{t("schedule.emptyHint")}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {schedules.map((item) => (
            <ScheduleRow key={item.id} item={item} onCancel={cancel} onDelete={setDeleting} />
          ))}
        </div>
      )}

      {showForm && (
        <Modal title={t("schedule.formTitle")} onClose={() => setShowForm(false)}>
          <div className="space-y-4">
            <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
              {t("schedule.scheduledVia")}{" "}
              <span className="font-medium text-foreground">
                {activeDevice?.name || `#${activeDeviceId}`}
              </span>
            </p>
            <div>
              <label className="text-xs font-medium">{t("schedule.toLabel")}</label>
              <Input
                className="mt-1 font-mono"
                placeholder="628123456789"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-medium">{t("schedule.contentLabel")}</label>
              <textarea
                className="mt-1 flex w-full rounded-md border border-border bg-background px-3 py-2 text-sm min-h-[100px]"
                placeholder={t("schedule.messagePlaceholder")}
                value={content}
                onChange={(e) => setContent(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-medium">{t("schedule.sendAtLabel")}</label>
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
                {t("schedule.cancel")}
              </Button>
              <Button onClick={save} disabled={saving}>
                {saving ? t("schedule.saving") : t("schedule.scheduleBtn")}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {deleting && (
        <Modal title={t("schedule.deleteTitle")} onClose={() => setDeleting(null)}>
          <p className="text-sm text-muted-foreground">
            {t("schedule.deleteConfirm").replace("{to}", deleting.to)}
          </p>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setDeleting(null)}>
              {t("schedule.cancel")}
            </Button>
            <Button variant="destructive" onClick={confirmDelete}>
              {t("schedule.deleteAria")}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

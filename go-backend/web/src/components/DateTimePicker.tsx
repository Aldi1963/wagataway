import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLang } from "@/lib/i18n";
import { Dropdown } from "@/components/ui/dropdown";

interface Parts {
  y: number;
  m: number; // 0-11
  d: number;
  hh: number;
  mm: number;
}

function parseDT(v: string): Parts | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(v || "");
  if (!m) return null;
  return {
    y: Number(m[1]),
    m: Number(m[2]) - 1,
    d: Number(m[3]),
    hh: Number(m[4]),
    mm: Number(m[5]),
  };
}

function toDT(p: Parts): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.y}-${pad(p.m + 1)}-${pad(p.d)}T${pad(p.hh)}:${pad(p.mm)}`;
}

const pad2 = (n: number) => String(n).padStart(2, "0");

// DateTimePicker custom — pengganti <input type="datetime-local"> agar tidak
// memicu picker bawaan Android. Kalender + jam/menit inline sesuai tema aplikasi.
export function DateTimePicker({
  value,
  onChange,
  min,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  min?: string;
  placeholder?: string;
}) {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  // Posisi panel (portal fixed) dihitung dari tombol pemicu
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties>({});

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

  // State draft saat panel dibuka
  const [draft, setDraft] = useState<Parts | null>(null);
  const [viewY, setViewY] = useState(0);
  const [viewM, setViewM] = useState(0);

  const openPicker = () => {
    const base =
      parseDT(value) ||
      parseDT(min || "") || {
        y: new Date().getFullYear(),
        m: new Date().getMonth(),
        d: new Date().getDate(),
        hh: new Date().getHours(),
        mm: new Date().getMinutes(),
      };
    // Bila hari ini sudah lewat jamnya, default besok — jadwal harus masa depan.
    const now = new Date();
    const baseDate = new Date(base.y, base.m, base.d, base.hh, base.mm);
    const start: Parts =
      !value && baseDate.getTime() <= now.getTime()
        ? {
            y: now.getFullYear(),
            m: now.getMonth(),
            d: now.getDate(),
            hh: now.getHours(),
            mm: now.getMinutes(),
          }
        : base;
    setDraft(start);
    setViewY(start.y);
    setViewM(start.m);
    // Hitung posisi panel: di bawah tombol, balik ke atas bila tidak muat
    const r = btnRef.current?.getBoundingClientRect();
    if (r) {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const w = Math.min(320, vw - 24);
      const h = 470; // perkiraan tinggi panel
      const left = Math.max(12, Math.min(r.left, vw - w - 12));
      const top = r.bottom + 6 + h > vh ? Math.max(12, r.top - h - 6) : r.bottom + 6;
      setPanelStyle({ left, top, width: w });
    }
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open ]);

  if (!draft && open) return null;

  const firstDay = new Date(viewY, viewM, 1).getDay();
  const daysInMonth = new Date(viewY, viewM + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array<null>(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const isPastDay = (day: number) => {
    const d = new Date(viewY, viewM, day);
    d.setHours(0, 0, 0, 0);
    return d.getTime() < today.getTime();
  };
  const isSelectedDay = (day: number) =>
    !!draft && draft.y === viewY && draft.m === viewM && draft.d === day;

  const label = value
    ? (() => {
        const p = parseDT(value);
        if (!p) return "";
        return `${p.d} ${monthNames[p.m]} ${p.y}, ${pad2(p.hh)}:${pad2(p.mm)}`;
      })()
    : "";

  const hourOpts = Array.from({ length: 24 }, (_, h) => ({
    value: String(h),
    label: pad2(h),
  }));
  const minOpts = Array.from({ length: 60 }, (_, m) => ({
    value: String(m),
    label: pad2(m),
  }));

  return (
    <div className="relative">
      <button
        type="button"
        ref={btnRef}
        onClick={() => (open ? setOpen(false) : openPicker())}
        className="flex h-10 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
      >
        <span className={cn("truncate", !value && "text-muted-foreground")}>
          {label || placeholder || t("schedule.pickDateTime")}
        </span>
        <CalendarIcon className="w-4 h-4 shrink-0 text-muted-foreground" />
      </button>

      {open &&
        draft &&
        createPortal(
          <>
            {/* Backdrop transparan untuk tutup saat klik di luar */}
            <div className="fixed inset-0 z-[60]" onClick={() => setOpen(false)} />
            <div
              style={panelStyle}
              className="fixed z-[61] rounded-lg border border-border bg-card p-3 shadow-xl max-h-[80vh] overflow-y-auto"
            >
              {/* Navigasi bulan */}
          <div className="flex items-center justify-between mb-2">
            <button
              type="button"
              aria-label={t("schedule.prevMonth")}
              className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground"
              onClick={() => {
                if (viewM === 0) {
                  setViewM(11);
                  setViewY(viewY - 1);
                } else setViewM(viewM - 1);
              }}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <p className="text-sm font-semibold text-foreground">
              {monthNames[viewM]} {viewY}
            </p>
            <button
              type="button"
              aria-label={t("schedule.nextMonth")}
              className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground"
              onClick={() => {
                if (viewM === 11) {
                  setViewM(0);
                  setViewY(viewY + 1);
                } else setViewM(viewM + 1);
              }}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Grid tanggal */}
          <div className="grid grid-cols-7 gap-0.5 text-center">
            {dayNames.map((d) => (
              <div key={d} className="py-1 text-[10px] font-medium text-muted-foreground">
                {d}
              </div>
            ))}
            {cells.map((day, i) =>
              day == null ? (
                <div key={`e${i}`} />
              ) : (
                <button
                  key={day}
                  type="button"
                  disabled={isPastDay(day)}
                  onClick={() => setDraft({ ...draft, y: viewY, m: viewM, d: day })}
                  className={cn(
                    "aspect-square rounded-md text-xs transition-colors",
                    isSelectedDay(day)
                      ? "bg-[#243370] dark:bg-[#4c63d2] text-white font-semibold"
                      : isPastDay(day)
                        ? "text-muted-foreground/30 cursor-not-allowed"
                        : "text-foreground hover:bg-secondary"
                  )}
                >
                  {day}
                </button>
              )
            )}
          </div>

          {/* Jam & menit */}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div>
              <p className="text-[10px] font-medium text-muted-foreground mb-1">
                {t("schedule.hourLabel")}
              </p>
              <Dropdown
                value={String(draft.hh)}
                onChange={(v) => setDraft({ ...draft, hh: Number(v) })}
                options={hourOpts}
                ariaLabel={t("schedule.hourLabel")}
              />
            </div>
            <div>
              <p className="text-[10px] font-medium text-muted-foreground mb-1">
                {t("schedule.minuteLabel")}
              </p>
              <Dropdown
                value={String(draft.mm)}
                onChange={(v) => setDraft({ ...draft, mm: Number(v) })}
                options={minOpts}
                ariaLabel={t("schedule.minuteLabel")}
              />
            </div>
          </div>

          {/* Aksi */}
          <div className="mt-3 flex items-center justify-between">
            <button
              type="button"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
              className="text-xs text-muted-foreground hover:text-destructive transition-colors"
            >
              {t("schedule.clearDate")}
            </button>
            <button
              type="button"
              onClick={() => {
                onChange(toDT(draft));
                setOpen(false);
              }}
              className="h-8 px-4 rounded-full bg-[#243370] dark:bg-[#4c63d2] text-white text-xs font-semibold"
            >
              {t("schedule.chooseDate")}
            </button>
          </div>
            </div>
          </>,
          document.body
        )}
    </div>
  );
}

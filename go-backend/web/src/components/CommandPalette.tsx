import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import {
  Search,
  Send,
  UserPlus,
  CalendarClock,
  Smartphone,
  BookOpen,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { useLang } from "@/lib/i18n";
import { apiGet } from "@/lib/api";
import { routeTitleKeys } from "./layout/TopBar";

type Section = "pages" | "actions" | "contacts";

interface PaletteItem {
  id: string;
  section: Section;
  label: string;
  sub?: string;
  icon: LucideIcon;
  path: string;
}

interface ContactHit {
  name: string;
  phone: string;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onOpen?: () => void;
}

export function CommandPalette({ open, onClose, onOpen }: CommandPaletteProps) {
  const [, navigate] = useLocation();
  const { t } = useLang();
  const [query, setQuery] = useState("");
  const [contactHits, setContactHits] = useState<ContactHit[]>([]);
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Shortcut global Ctrl+K / Cmd+K (boleh dibuka walau fokus sedang di input).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpen?.();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onOpen]);

  // Reset state setiap kali dibuka; autofocus input.
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setContactHits([]);
    setHighlight(0);
    const id = window.setTimeout(() => inputRef.current?.focus(), 30);
    document.body.style.overflow = "hidden";
    return () => {
      window.clearTimeout(id);
      document.body.style.overflow = "";
    };
  }, [open ]);

  const q = query.trim().toLowerCase();

  const pages = useMemo<PaletteItem[]>(() => {
    const items = Object.entries(routeTitleKeys).map(([path, key]) => ({
      id: `page:${path}`,
      section: "pages" as Section,
      label: t(key),
      sub: path,
      icon: Search,
      path,
    }));
    if (!q) return items;
    return items.filter((i) => i.label.toLowerCase().includes(q));
  }, [t, q]);

  const actions = useMemo<PaletteItem[]>(() => {
    const defs: { id: string; key: string; icon: LucideIcon; path: string }[] = [
      { id: "action:send", key: "palette.actionSend", icon: Send, path: "/send" },
      { id: "action:add-contact", key: "palette.actionAddContact", icon: UserPlus, path: "/contacts" },
      { id: "action:schedule", key: "palette.actionSchedule", icon: CalendarClock, path: "/schedule" },
      { id: "action:add-device", key: "palette.actionAddDevice", icon: Smartphone, path: "/" },
      { id: "action:api-docs", key: "palette.actionApiDocs", icon: BookOpen, path: "/api-docs" },
    ];
    const items = defs.map((d) => ({
      id: d.id,
      section: "actions" as Section,
      label: t(d.key),
      icon: d.icon,
      path: d.path,
    }));
    if (!q) return items;
    return items.filter((i) => i.label.toLowerCase().includes(q));
  }, [t, q]);

  const contacts = useMemo<PaletteItem[]>(
    () =>
      contactHits.map((c, idx) => ({
        id: `contact:${idx}:${c.phone}`,
        section: "contacts" as Section,
        label: c.name || c.phone,
        sub: c.phone,
        icon: Users,
        path: "/contacts",
      })),
    [contactHits]
  );

  // Cari kontak dinamis (debounce 300ms), diam-diam bila gagal.
  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setContactHits([]);
      return;
    }
    const id = window.setTimeout(async () => {
      try {
        const res = await apiGet<{ contacts: ContactHit[] }>(
          `/contacts?search=${encodeURIComponent(term)}&q=${encodeURIComponent(term)}&limit=8`
        );
        setContactHits((res.contacts || []).slice(0, 8));
      } catch {
        setContactHits([]);
      }
    }, 300);
    return () => window.clearTimeout(id);
  }, [query]);

  const sections = useMemo(
    () => [
      { key: "pages" as Section, title: t("palette.sectionPages"), items: pages },
      { key: "actions" as Section, title: t("palette.sectionActions"), items: actions },
      { key: "contacts" as Section, title: t("palette.sectionContacts"), items: contacts },
    ],
    [t, pages, actions, contacts]
  );

  const flat = useMemo(() => sections.flatMap((s) => s.items), [sections]);

  useEffect(() => {
    setHighlight(0);
  }, [query, contactHits]);

  const choose = (item: PaletteItem) => {
    onClose();
    navigate(item.path);
  };

  const onInputKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => (flat.length ? (h + 1) % flat.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => (flat.length ? (h - 1 + flat.length) % flat.length : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = flat[highlight];
      if (item) choose(item);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  // Scroll item yang di-highlight ke dalam tampilan.
  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-idx="${highlight}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [highlight]);

  if (!open) return null;

  let running = 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh]"
      role="dialog"
      aria-modal="true"
      aria-label={t("palette.placeholder")}
    >
      {/* Backdrop: klik untuk menutup */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      <div className="relative w-full max-w-lg mx-4 rounded-xl border border-border bg-card shadow-2xl overflow-hidden">
        {/* Input pencarian */}
        <div className="flex items-center gap-2.5 border-b border-border px-4">
          <Search className="w-4 h-4 text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKey}
            placeholder={t("palette.placeholder")}
            className="flex-1 bg-transparent py-3.5 text-sm text-foreground placeholder:text-muted-foreground outline-none"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              aria-label={t("palette.clear")}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Hasil */}
        <div ref={listRef} className="max-h-[70vh] overflow-y-auto p-2">
          {flat.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">
              {t("palette.noResults")}
            </p>
          ) : (
            sections.map(
              (s) =>
                s.items.length > 0 && (
                  <div key={s.key}>
                    <p className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {s.title}
                    </p>
                    {s.items.map((item) => {
                      const idx = running++;
                      const Icon = item.icon;
                      const active = idx === highlight;
                      return (
                        <button
                          key={item.id}
                          data-idx={idx}
                          onClick={() => choose(item)}
                          onMouseEnter={() => setHighlight(idx)}
                          className={`w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
                            active ? "bg-secondary" : "text-foreground"
                          }`}
                        >
                          <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
                          <span className="flex-1 min-w-0 truncate font-medium text-foreground">
                            {item.label}
                          </span>
                          {item.sub && (
                            <span className="text-xs text-muted-foreground truncate max-w-[40%]">
                              {item.sub}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )
            )
          )}
        </div>

        {/* Hint footer */}
        <div className="border-t border-border px-4 py-2.5 text-[11px] text-muted-foreground">
          {t("palette.hint")}
        </div>
      </div>
    </div>
  );
}

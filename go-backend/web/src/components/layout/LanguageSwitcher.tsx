import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLang, type Lang } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/** Bendera Indonesia: merah-putih horizontal. */
function FlagID({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 16" preserveAspectRatio="xMidYMid slice" className={className} aria-hidden>
      <rect width="24" height="8" fill="#E70011" />
      <rect y="8" width="24" height="8" fill="#F8F8F8" />
    </svg>
  );
}

/** Bendera Inggris (Union Jack, versi sederhana). */
function FlagEN({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 16" preserveAspectRatio="xMidYMid slice" className={className} aria-hidden>
      <rect width="24" height="16" fill="#012169" />
      <path d="M0,0 L24,16 M24,0 L0,16" stroke="#FFFFFF" strokeWidth="3" />
      <path d="M0,0 L24,16 M24,0 L0,16" stroke="#C8102E" strokeWidth="1.2" />
      <path d="M12,0 V16 M0,8 H24" stroke="#FFFFFF" strokeWidth="5" />
      <path d="M12,0 V16 M0,8 H24" stroke="#C8102E" strokeWidth="3" />
    </svg>
  );
}

function Flag({ lang, className }: { lang: Lang; className?: string }) {
  return (
    <span
      className={cn(
        "rounded-full overflow-hidden ring-1 ring-black/10 shrink-0 inline-flex",
        className
      )}
    >
      {lang === "id" ? (
        <FlagID className="w-full h-full" />
      ) : (
        <FlagEN className="w-full h-full" />
      )}
    </span>
  );
}

const OPTIONS: { value: Lang; label: string }[] = [
  { value: "id", label: "Indonesia" },
  { value: "en", label: "English" },
];

export function LanguageSwitcher() {
  const { lang, setLang, t } = useLang();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open ]);

  return (
    <div className="relative" ref={ref}>
      <Button
        variant="ghost"
        size="icon"
        className="text-muted-foreground"
        aria-label={t("header.language")}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Flag lang={lang} className="w-5 h-5" />
      </Button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-2 w-44 z-50 rounded-xl border border-border bg-card shadow-xl overflow-hidden p-1.5"
        >
          {OPTIONS.map((o) => (
            <button
              key={o.value}
              role="menuitemradio"
              aria-checked={lang === o.value}
              onClick={() => {
                setLang(o.value);
                setOpen(false);
              }}
              className={cn(
                "w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
                lang === o.value
                  ? "bg-secondary font-semibold text-foreground"
                  : "text-foreground hover:bg-secondary/70"
              )}
            >
              <Flag lang={o.value} className="w-5 h-5" />
              <span className="flex-1 text-left">{o.label}</span>
              {lang === o.value && <Check className="w-4 h-4 text-primary" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { Globe, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLang, type Lang } from "@/lib/i18n";
import { cn } from "@/lib/utils";

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
        <Globe className="w-4 h-4" />
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
                "w-full flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors",
                lang === o.value
                  ? "bg-secondary font-semibold text-foreground"
                  : "text-foreground hover:bg-secondary/70"
              )}
            >
              {o.label}
              {lang === o.value && <Check className="w-4 h-4 text-primary" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

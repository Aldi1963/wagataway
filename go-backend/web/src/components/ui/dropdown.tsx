import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

interface DropdownOption {
  value: string;
  label: string;
}

interface DropdownProps {
  value: string;
  onChange: (v: string) => void;
  options: DropdownOption[];
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
  onOpen?: () => void;
  disabled?: boolean;
}

// Dropdown custom inline — menu terbuka di bawah tombol (bukan popup OS seperti <select> native).
export function Dropdown({ value, onChange, options, placeholder, className, ariaLabel, onOpen, disabled }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);

  const toggle = () => {
    setOpen((v) => {
      if (!v && onOpen) onOpen();
      return !v;
    });
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open ]);

  return (
    <div ref={rootRef} className={`relative ${className || ""}`}>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={toggle}
        className="flex h-10 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className={`truncate ${selected ? "" : "text-muted-foreground"}`}>
          {selected ? selected.label : placeholder || "Pilih..."}
        </span>
        <ChevronDown className={`w-4 h-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40 bg-transparent"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <ul
            role="listbox"
            className="absolute left-0 right-0 top-full z-50 mt-1 max-h-60 overflow-y-auto rounded-md border border-border bg-card py-1 shadow-lg"
          >
            {options.length === 0 && (
              <li className="px-3 py-2 text-sm text-muted-foreground">Tidak ada pilihan</li>
            )}
            {options.map((o) => {
              const isSel = o.value === value;
              return (
                <li key={o.value}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={isSel}
                    onClick={() => {
                      onChange(o.value);
                      setOpen(false);
                    }}
                    className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground ${
                      isSel ? "text-foreground font-medium" : "text-foreground"
                    }`}
                  >
                    <span className="truncate">{o.label}</span>
                    {isSel && <Check className="w-4 h-4 shrink-0 text-primary" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}

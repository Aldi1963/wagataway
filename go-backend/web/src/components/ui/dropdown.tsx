import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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

// Dropdown custom — menu dirender via portal (fixed) supaya tidak terpotong
// ancestor yang overflow; terbuka di bawah tombol, atau ke atas bila ruang
// di bawah tidak cukup (bukan popup OS seperti <select> native).
export function Dropdown({ value, onChange, options, placeholder, className, ariaLabel, onOpen, disabled }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [menuStyle, setMenuStyle] = useState<{ top: number; left: number; width: number } | null>(null);
  const selected = options.find((o) => o.value === value);

  // Menu dirender via portal (fixed, menempel ke body) supaya tidak
  // terpotong oleh ancestor yang overflow (mis. modal max-h + overflow-y-auto).
  // Posisi diukur dari tombol pemicu; bila ruang di bawah tidak cukup,
  // menu dibuka ke atas.
  const openMenu = () => {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const estH = Math.min(options.length * 37 + 8, 240);
    const spaceBelow = window.innerHeight - r.bottom - 4;
    const openUp = spaceBelow < estH && r.top - 4 > estH;
    setMenuStyle({
      top: openUp ? Math.max(4, r.top - estH - 4) : r.bottom + 4,
      left: r.left,
      width: r.width,
    });
    if (onOpen) onOpen();
    setOpen(true);
  };

  const toggle = () => {
    if (open) setOpen(false);
    else openMenu();
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    // Menu fixed: tutup saat halaman/modal di-scroll atau viewport berubah,
    // supaya menu tidak lepas dari tombolnya.
    const onScroll = () => setOpen(false);
    const onResize = () => setOpen(false);
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={`relative ${className || ""}`}>
      <button
        ref={btnRef}
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

      {open && menuStyle && createPortal(
        <>
          <div
            className="fixed inset-0 z-[60] bg-transparent"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <ul
            role="listbox"
            style={{ top: menuStyle.top, left: menuStyle.left, width: menuStyle.width }}
            className="fixed z-[70] max-h-60 overflow-y-auto rounded-md border border-border bg-card py-1 shadow-lg"
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
        </>,
        document.body
      )}
    </div>
  );
}

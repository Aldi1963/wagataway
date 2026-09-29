import { cn } from "@/lib/utils";

export interface PageTab {
  id: string;
  label: string;
  href: string;
}

interface PageTabsProps {
  tabs: PageTab[];
  active: string;
  onSelect: (tab: PageTab) => void;
}

/** Bilah tab sederhana untuk halaman gabungan. Tab aktif memakai warna primer (navy). */
export function PageTabs({ tabs, active, onSelect }: PageTabsProps) {
  return (
    <div className="inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-lg bg-muted p-1">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onSelect(tab)}
          className={cn(
            "whitespace-nowrap rounded-md px-4 py-2 text-sm font-medium transition-colors",
            active === tab.id
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:bg-accent hover:text-foreground"
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

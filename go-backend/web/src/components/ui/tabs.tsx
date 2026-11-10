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

/** Bilah tab segmented ala Kumo UI. Tab aktif memakai warna brand (navy). */
export function PageTabs({ tabs, active, onSelect }: PageTabsProps) {
  return (
    <div className="inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-lg bg-kumo-tint p-1 ring-1 ring-kumo-line">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onSelect(tab)}
          className={cn(
            "whitespace-nowrap rounded-md px-4 py-2 text-sm font-medium",
            active === tab.id
              ? "bg-kumo-brand text-white shadow-sm"
              : "text-kumo-subtle hover:bg-kumo-fill hover:text-kumo-default"
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

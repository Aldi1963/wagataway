import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  hint?: string;
  actionLabel?: string;
  onAction?: () => void;
}

/**
 * Empty state terstandar: ikon di dalam lingkaran navy tint,
 * judul, hint opsional, dan tombol aksi pill opsional.
 * Semua teks diterima sebagai string (sudah diterjemahkan pemanggil).
 */
export function EmptyState({ icon: Icon, title, hint, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div className="max-w-sm mx-auto text-center py-8">
      <div className="w-14 h-14 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto mb-3">
        <Icon className="w-6 h-6" />
      </div>
      <p className="text-sm font-semibold text-foreground">{title}</p>
      {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
      {actionLabel && onAction && (
        <Button size="sm" onClick={onAction} className="mt-4">
          {actionLabel}
        </Button>
      )}
    </div>
  );
}

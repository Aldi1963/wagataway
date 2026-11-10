import { useEffect, useState } from "react";
import { Link } from "wouter";
import { apiGet } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useLang } from "@/lib/i18n";

interface Usage {
  planName: string;
  quota: number;
  usedThisMonth: number;
  remaining: number;
}

/**
 * Meter kuota paket di sidebar. Sembunyi total bila fetch gagal
 * atau sidebar dalam keadaan collapsed.
 */
export default function QuotaMeter({ collapsed }: { collapsed: boolean }) {
  const { t } = useLang();
  const [usage, setUsage] = useState<Usage | null>(null);

  useEffect(() => {
    apiGet<Usage>("/billing/usage")
      .then(setUsage)
      .catch(() => {
        /* sembunyikan komponen */
      });
  }, []);

  if (!usage || collapsed) return null;

  const pct =
    usage.quota > 0
      ? Math.min(100, (usage.usedThisMonth / usage.quota) * 100)
      : 0;
  const danger = pct > 90;

  return (
    <div className="rounded-lg border border-border bg-muted p-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-foreground">
          {t("quotaMeter.planLabel").replace("{plan}", usage.planName)}
        </p>
        <Link
          href="/billing"
          className="text-[11px] font-medium text-primary hover:text-primary/80"
        >
          Upgrade
        </Link>
      </div>
      <div
        className="mt-2 h-1.5 rounded-full bg-border"
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={cn(
            "h-full rounded-full transition-all",
            danger ? "bg-destructive" : "bg-success"
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-1.5 text-[11px] text-muted-foreground">
        {t("quotaMeter.remaining").replace("{count}", usage.remaining.toLocaleString("id-ID"))}
      </p>
    </div>
  );
}

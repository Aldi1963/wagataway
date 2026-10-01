import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { AlertTriangle, Ban } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { apiGet } from "@/lib/api";
import { useLang } from "@/lib/i18n";

// Status langganan terpusat dari GET /api/quota (Fitur 5: grace period).
// subState: "active" | "grace" | "expired".
export interface GraceInfo {
  subState?: string;
  graceDaysLeft?: number;
  graceUsedToday?: number;
  graceDailyLimit?: number;
}

/**
 * Banner masa tenggang (kuning/amber) + banner expired (merah) untuk
 * status langganan. Dipakai di Dashboard dan halaman Kirim/Blast agar
 * user sadar sebelum mengirim.
 */
export default function GraceBanner() {
  const { t } = useLang();
  const [, navigate] = useLocation();
  const [info, setInfo] = useState<GraceInfo | null>(null);

  useEffect(() => {
    apiGet<GraceInfo>("/quota")
      .then((res) => setInfo(res))
      .catch(() => setInfo(null));
  }, []);

  if (!info) return null;

  if (info.subState === "expired") {
    return (
      <Card className="border-destructive/50 bg-destructive/5">
        <CardContent className="p-4 flex items-start gap-3">
          <Ban className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-destructive">
              {t("graceBanner.expiredTitle")}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t("graceBanner.expiredBody")}
            </p>
            <Button
              size="sm"
              className="mt-2 bg-[#243370] hover:bg-[#1c2a5c] text-white"
              onClick={() => navigate("/billing?perpanjang=1")}
            >
              {t("graceBanner.renewNow")}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (info.subState === "grace") {
    const used = info.graceUsedToday ?? 0;
    const limit = info.graceDailyLimit ?? 20;
    return (
      <Card className="border-amber-500/50 bg-amber-500/5">
        <CardContent className="p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-amber-700 dark:text-amber-500">
              {t("graceBanner.graceTitle")}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t("graceBanner.graceBody")
                .replace("{days}", String(info.graceDaysLeft ?? 0))
                .replace("{limit}", String(limit))
                .replace("{used}", String(used))}
            </p>
            <Button
              size="sm"
              className="mt-2 bg-[#243370] hover:bg-[#1c2a5c] text-white"
              onClick={() => navigate("/billing?perpanjang=1")}
            >
              {t("graceBanner.renewNow")}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return null;
}

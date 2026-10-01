import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { AlertTriangle, Ban } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { apiGet } from "@/lib/api";

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
              Langganan berakhir
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Pengiriman pesan diblokir. Perpanjang paket untuk mengaktifkan kembali layanan.
            </p>
            <Button
              size="sm"
              className="mt-2 bg-[#243370] hover:bg-[#1c2a5c] text-white"
              onClick={() => navigate("/billing?perpanjang=1")}
            >
              Perpanjang Sekarang
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
              Masa tenggang, segera perpanjang
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Sisa {info.graceDaysLeft ?? 0} hari masa tenggang. Selama masa
              tenggang Anda dibatasi {limit} pesan/hari ({used}/{limit} terpakai
              hari ini). Perpanjang sebelum masa tenggang habis agar tidak terblokir.
            </p>
            <Button
              size="sm"
              className="mt-2 bg-[#243370] hover:bg-[#1c2a5c] text-white"
              onClick={() => navigate("/billing?perpanjang=1")}
            >
              Perpanjang Sekarang
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return null;
}

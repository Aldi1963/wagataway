import { useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Ticket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiGet, apiPost } from "@/lib/api";
import { useLang } from "@/lib/i18n";

/** Voucher seperti yang dikembalikan POST /api/billing/voucher/redeem. */
interface RedeemedVoucher {
  id: number;
  code: string;
  type: string;
  planId?: number | null;
  duration: number;
  discount: number;
  maxUses: number;
  usedCount: number;
  isActive: boolean;
  expiresAt?: string | null;
}

interface RedeemResponse {
  message: string;
  voucher: RedeemedVoucher;
  planName: string;
  durationDays: number;
  endsAt: string;
}

/** Satu baris riwayat dari GET /api/billing/voucher/redemptions. */
interface Redemption {
  id: number;
  code: string;
  type: string;
  planName: string;
  duration: number;
  discount: number;
  redeemedAt: string;
}

/**
 * Tab "Tukar Voucher" di Settings: form penukaran kode + riwayat penukaran.
 * Pesan error memakai pesan spesifik dari server (kode tidak ditemukan /
 * kedaluwarsa / sudah dipakai / sudah pernah ditukar), sedangkan sukses
 * menampilkan paket + masa berlaku baru.
 *
 * Dipakai ulang halaman /redeem dengan `initialCode` terisi dari
 * ?code=XXX — tombol tukar langsung difokuskan supaya pengguna tinggal
 * menekan Enter/klik untuk menukar.
 */
export default function VoucherRedeem({ initialCode = "" }: { initialCode?: string }) {
  const { t, lang } = useLang();
  const [code, setCode] = useState(initialCode.trim().toUpperCase());
  const redeemBtnRef = useRef<HTMLButtonElement>(null);

  // Kode dari link redeem: fokuskan tombol tukar (pengguna tinggal konfirmasi).
  useEffect(() => {
    if (initialCode.trim()) redeemBtnRef.current?.focus();
  }, [initialCode]);
  const [redeeming, setRedeeming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<RedeemResponse | null>(null);
  const [history, setHistory] = useState<Redemption[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const locale = lang === "id" ? "id-ID" : "en-US";
  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString(locale, {
      day: "numeric",
      month: "short",
      year: "numeric",
    });

  const typeLabel = (type: string) =>
    type === "trial"
      ? t("settings.voucherTypeTrial")
      : type === "plan"
        ? t("settings.voucherTypePlan")
        : type === "discount"
          ? t("settings.voucherTypeDiscount")
          : type;

  const loadHistory = () => {
    setHistoryLoading(true);
    setHistoryError(null);
    apiGet<{ redemptions: Redemption[] }>("/billing/voucher/redemptions")
      .then((res) => setHistory(res.redemptions || []))
      .catch((e) =>
        setHistoryError(
          e instanceof Error ? e.message : t("settings.voucherHistoryLoadFailed")
        )
      )
      .finally(() => setHistoryLoading(false));
  };

  useEffect(loadHistory, []);

  const handleRedeem = async () => {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed || redeeming) return;
    setRedeeming(true);
    setError(null);
    setSuccess(null);
    try {
      const data = await apiPost<RedeemResponse>("/billing/voucher/redeem", {
        code: trimmed,
      });
      setSuccess(data);
      setCode("");
      loadHistory();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("settings.voucherRedeemFailed"));
    } finally {
      setRedeeming(false);
    }
  };

  return (
    <div className="space-y-10">
      <div>
        <div>
          <h3 className="text-xl font-bold text-foreground">
            {t("settings.voucherTitle")}
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            {t("settings.voucherDesc")}
          </p>
          <div className="border-b border-border mt-3 mb-5" />
        </div>
        <div className="space-y-4">
          {error && (
            <Card className="border-destructive/50 bg-destructive/5">
              <CardContent className="p-4 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
                <p className="text-sm font-medium text-destructive">{error}</p>
              </CardContent>
            </Card>
          )}
          {success && (
            <Card className="border-emerald-500/50 bg-emerald-500/5">
              <CardContent className="p-4 flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-500">
                    {success.message}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {success.voucher.type === "trial"
                      ? t("settings.voucherSuccessTrial")
                          .replace("{days}", String(success.durationDays))
                          .replace("{date}", fmtDate(success.endsAt))
                      : t("settings.voucherSuccessPlan")
                          .replace("{plan}", success.planName)
                          .replace("{days}", String(success.durationDays))
                          .replace("{date}", fmtDate(success.endsAt))}
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
          <div className="space-y-2">
            <label className="text-xs font-medium">
              {t("settings.voucherCodeLabel")}
            </label>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder={t("settings.voucherCodePlaceholder")}
              autoComplete="off"
              maxLength={50}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleRedeem();
              }}
            />
          </div>
          <Button
            ref={redeemBtnRef}
            size="sm"
            onClick={handleRedeem}
            disabled={redeeming || code.trim().length === 0}
          >
            {redeeming ? t("settings.voucherRedeeming") : t("settings.voucherRedeem")}
          </Button>
        </div>
      </div>

      <div>
        <div>
          <h3 className="text-xl font-bold text-foreground">
            {t("settings.voucherHistoryTitle")}
          </h3>
          <div className="border-b border-border mt-3 mb-5" />
        </div>
        {historyLoading ? (
          <p className="text-sm text-muted-foreground">
            {t("settings.voucherHistoryLoading")}
          </p>
        ) : historyError ? (
          <p className="text-sm text-destructive">{historyError}</p>
        ) : history.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("settings.voucherHistoryEmpty")}
          </p>
        ) : (
          <div className="divide-y divide-border border-y border-border">
            {history.map((r) => (
              <div key={r.id} className="py-3 flex items-center gap-3">
                <span className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center shrink-0">
                  <Ticket className="w-4 h-4 text-muted-foreground" />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-mono font-semibold truncate">{r.code}</p>
                  <p className="text-xs text-muted-foreground">
                    {typeLabel(r.type)}
                    {r.planName ? ` · ${r.planName}` : ""}
                    {r.duration > 0
                      ? ` · ${t("settings.voucherDays").replace("{days}", String(r.duration))}`
                      : ""}
                  </p>
                </div>
                <span className="text-xs text-muted-foreground shrink-0">
                  {fmtDate(r.redeemedAt)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

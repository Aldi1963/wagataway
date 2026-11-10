import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Copy, Gift, Wallet, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { apiGet, apiPost } from "@/lib/api";
import { useLang } from "@/lib/i18n";

interface Affiliate {
  id: number;
  code: string;
  commissionRate: number;
}

interface AffiliateStats {
  pending: number;
  paid: number;
  referrals: number;
}

interface Earning {
  id: number;
  referredUserId: number;
  amount: number;
  status: string;
  createdAt: string;
}

function fmtRp(n: number) {
  return "Rp" + n.toLocaleString("id-ID");
}

export default function Affiliate({ embedded = false }: { embedded?: boolean }) {
  const { t } = useLang();
  const [info, setInfo] = useState<Affiliate | null>(null);
  const [stats, setStats] = useState<AffiliateStats>({ pending: 0, paid: 0, referrals: 0 });
  const [earnings, setEarnings] = useState<Earning[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [i, e] = await Promise.all([
        apiGet<{ affiliate: Affiliate | null; stats?: AffiliateStats }>("/affiliate").catch(() => null),
        apiGet<{ earnings: Earning[] } | Earning[]>("/affiliate/earnings")
          .then((r) => (Array.isArray(r) ? r : r.earnings ?? []))
          .catch(() => [] as Earning[]),
      ]);
      setInfo(i?.affiliate ?? null);
      setStats(i?.stats ?? { pending: 0, paid: 0, referrals: 0 });
      setEarnings(e);
    } catch (err: any) {
      toast.error(err.message || t("affiliate.loadFail"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const create = async () => {
    setCreating(true);
    try {
      const r = await apiPost<{ affiliate: Affiliate }>("/affiliate", {});
      setInfo(r.affiliate);
      toast.success(t("affiliate.codeCreated"));
    } catch (e: any) {
      toast.error(e.message || t("affiliate.codeCreateFail"));
    } finally {
      setCreating(false);
    }
  };

  const referralLink = info?.code ? `${window.location.origin}/register?ref=${info.code}` : "";

  const copy = (text: string, label: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text)
      .then(() => toast.success(t("affiliate.copied").replace("{label}", label)))
      .catch(() => toast.error(t("affiliate.copyFail")));
  };

  return (
    <div className="space-y-4">
      {!embedded && (
        <div>
          <h1 className="text-xl font-bold text-foreground">{t("affiliate.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("affiliate.subtitle")}</p>
        </div>
      )}

      {loading ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">{t("affiliate.loading")}</CardContent></Card>
      ) : !info ? (
        <Card>
          <CardContent className="p-8 text-center">
            <EmptyState
              icon={Gift}
              title={t("affiliate.noCode")}
              actionLabel={creating ? t("affiliate.creating") : t("affiliate.createCode")}
              onAction={() => { if (!creating) create(); }}
            />
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="min-w-0">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Gift className="w-4 h-4" /> {t("affiliate.yourCode")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2">
                  <code className="flex-1 min-w-0 rounded-lg bg-muted px-4 py-3 font-mono text-lg font-bold text-center tracking-widest truncate">
                    {info.code}
                  </code>
                  <Button variant="outline" size="icon" className="h-11 w-11 shrink-0" onClick={() => copy(info.code, t("affiliate.codeLabel"))} aria-label={t("affiliate.copyCodeAria")}>
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">{t("affiliate.referralLink")}</label>
                  <div className="mt-1 flex items-center gap-2">
                    <code className="flex-1 min-w-0 truncate rounded-md border border-border bg-background px-3 py-2 font-mono text-xs">
                      {referralLink}
                    </code>
                    <Button variant="outline" size="sm" className="gap-1.5 shrink-0" onClick={() => copy(referralLink, t("affiliate.referralLink"))}>
                      <Copy className="w-3.5 h-3.5" /> {t("affiliate.copy")}
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">{t("affiliate.commissionNote").replace("{rate}", String(Math.round(info.commissionRate * 100)))}</p>
              </CardContent>
            </Card>

            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              <Card>
                <CardContent className="p-3 sm:p-4 flex items-center gap-2.5 sm:gap-3">
                  <span className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-[#243370] flex items-center justify-center shrink-0">
                    <Wallet className="w-5 h-5 text-white" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[10px] sm:text-[11px] uppercase tracking-wide text-muted-foreground truncate">{t("affiliate.totalCommission")}</p>
                    <p className="text-lg sm:text-xl font-bold text-foreground truncate">{fmtRp(stats.pending + stats.paid)}</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3 sm:p-4 flex items-center gap-2.5 sm:gap-3">
                  <span className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-[#243370] flex items-center justify-center shrink-0">
                    <Users className="w-5 h-5 text-white" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[10px] sm:text-[11px] uppercase tracking-wide text-muted-foreground truncate">{t("affiliate.referrals")}</p>
                    <p className="text-lg sm:text-xl font-bold text-foreground truncate">{stats.referrals}</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("affiliate.earningsHistory")}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead>
                    <tr className="border-b border-border text-left">
                      <th className="py-3 px-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t("affiliate.colDate")}</th>
                      <th className="py-3 px-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t("affiliate.colUserId")}</th>
                      <th className="py-3 px-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t("affiliate.colAmount")}</th>
                      <th className="py-3 px-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground text-right">{t("affiliate.colStatus")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {earnings.length === 0 && (
                      <tr><td colSpan={4} className="py-8 text-center">
                        <EmptyState
                          icon={Gift}
                          title={t("affiliate.noEarnings")}
                        />
                      </td></tr>
                    )}
                    {earnings.map((e) => (
                      <tr key={e.id} className="border-b border-border last:border-0">
                        <td className="py-3 px-4 text-xs text-muted-foreground whitespace-nowrap">
                          {new Date(e.createdAt).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })}
                        </td>
                        <td className="py-3 px-4 font-mono text-[13px]">#{e.referredUserId}</td>
                        <td className="py-3 px-4 font-semibold text-emerald-600 dark:text-emerald-400">{fmtRp(e.amount)}</td>
                        <td className="py-3 px-4 text-right">
                          {e.status === "paid" ? <Badge variant="success">{t("affiliate.paid")}</Badge>
                            : e.status === "pending" ? <Badge variant="secondary">{t("affiliate.pending")}</Badge>
                            : <Badge variant="outline">{e.status}</Badge>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Copy, Gift, Wallet, Users, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { apiGet, apiPost } from "@/lib/api";

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
      toast.error(err.message || "Gagal memuat data afiliasi");
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
      toast.success("Kode referral dibuat");
    } catch (e: any) {
      toast.error(e.message || "Gagal membuat kode referral");
    } finally {
      setCreating(false);
    }
  };

  const referralLink = info?.code ? `${window.location.origin}/register?ref=${info.code}` : "";

  const copy = (text: string, label: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text)
      .then(() => toast.success(`${label} disalin`))
      .catch(() => toast.error("Gagal menyalin"));
  };

  return (
    <div className="space-y-4">
      {!embedded && (
        <div>
          <h1 className="text-xl font-bold text-foreground">Afiliasi</h1>
          <p className="text-sm text-muted-foreground">Ajak orang berlangganan dan dapatkan komisi.</p>
        </div>
      )}

      {loading ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">Memuat...</CardContent></Card>
      ) : !info ? (
        <Card>
          <CardContent className="p-8 text-center space-y-4">
            <Gift className="w-10 h-10 mx-auto text-muted-foreground opacity-40" />
            <p className="text-sm text-muted-foreground">Kamu belum punya kode referral. Buat sekarang untuk mulai dapat komisi.</p>
            <Button onClick={create} disabled={creating} className="gap-1.5">
              <Plus className="w-4 h-4" /> {creating ? "Membuat..." : "Buat Kode Referral"}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Gift className="w-4 h-4" /> Kode Referral Kamu
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2">
                  <code className="flex-1 rounded-lg bg-muted px-4 py-3 font-mono text-lg font-bold text-center tracking-widest">
                    {info.code}
                  </code>
                  <Button variant="outline" size="icon" className="h-11 w-11 shrink-0" onClick={() => copy(info.code, "Kode referral")} aria-label="Salin kode">
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Link referral</label>
                  <div className="mt-1 flex items-center gap-2">
                    <code className="flex-1 min-w-0 truncate rounded-md border border-border bg-background px-3 py-2 font-mono text-xs">
                      {referralLink}
                    </code>
                    <Button variant="outline" size="sm" className="gap-1.5 shrink-0" onClick={() => copy(referralLink, "Link referral")}>
                      <Copy className="w-3.5 h-3.5" /> Salin
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">Komisi {Math.round(info.commissionRate * 100)}% dari setiap langganan yang mendaftar lewat link kamu.</p>
              </CardContent>
            </Card>

            <div className="grid grid-cols-2 gap-4">
              <Card>
                <CardContent className="p-4 flex items-center gap-3">
                  <span className="w-11 h-11 rounded-2xl bg-[#243370] flex items-center justify-center shrink-0">
                    <Wallet className="w-5 h-5 text-white" />
                  </span>
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Total Komisi</p>
                    <p className="text-xl font-bold text-foreground">{fmtRp(stats.pending + stats.paid)}</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 flex items-center gap-3">
                  <span className="w-11 h-11 rounded-2xl bg-[#243370] flex items-center justify-center shrink-0">
                    <Users className="w-5 h-5 text-white" />
                  </span>
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Referral</p>
                    <p className="text-xl font-bold text-foreground">{stats.referrals}</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Riwayat Komisi</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead>
                    <tr className="border-b border-border text-left">
                      <th className="py-3 px-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Tanggal</th>
                      <th className="py-3 px-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">User ID</th>
                      <th className="py-3 px-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Jumlah</th>
                      <th className="py-3 px-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {earnings.length === 0 && (
                      <tr><td colSpan={4} className="py-8 text-center text-muted-foreground">Belum ada komisi.</td></tr>
                    )}
                    {earnings.map((e) => (
                      <tr key={e.id} className="border-b border-border last:border-0">
                        <td className="py-3 px-4 text-xs text-muted-foreground whitespace-nowrap">
                          {new Date(e.createdAt).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })}
                        </td>
                        <td className="py-3 px-4 font-mono text-[13px]">#{e.referredUserId}</td>
                        <td className="py-3 px-4 font-semibold text-emerald-600 dark:text-emerald-400">{fmtRp(e.amount)}</td>
                        <td className="py-3 px-4 text-right">
                          {e.status === "paid" ? <Badge variant="success">Dibayar</Badge>
                            : e.status === "pending" ? <Badge variant="secondary">Pending</Badge>
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

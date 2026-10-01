import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { MonitorSmartphone, X } from "lucide-react";
import { toast } from "sonner";
import { apiGet, apiDelete, apiPost } from "@/lib/api";
import { cn } from "@/lib/utils";

interface Session {
  id: number;
  ip: string;
  userAgent: string;
  createdAt: string;
  lastSeen: string;
  current: boolean;
}

function deviceLabel(ua: string): string {
  if (!ua) return "Perangkat tidak dikenal";
  if (/android/i.test(ua)) return "Android";
  if (/iphone|ipad/i.test(ua)) return "iPhone/iPad";
  if (/windows/i.test(ua)) return "Windows";
  if (/macintosh/i.test(ua)) return "Mac";
  if (/linux/i.test(ua)) return "Linux";
  const m = ua.match(/^([^/]+)/);
  return m ? m[1].slice(0, 40) : "Browser";
}

function relTime(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "baru saja";
  if (s < 3600) return `${Math.floor(s / 60)} mnt lalu`;
  if (s < 86400) return `${Math.floor(s / 3600)} jam lalu`;
  return `${Math.floor(s / 86400)} hari lalu`;
}

export default function SessionsSection() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    apiGet<{ sessions: Session[] }>("/sessions")
      .then((d) => setSessions(d.sessions || []))
      .catch(() => toast.error("Gagal memuat sesi"))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const revoke = async (id: number, current: boolean) => {
    if (
      !confirm(
        current
          ? "Cabut sesi ini? Anda akan logout dari perangkat ini."
          : "Cabut sesi ini?"
      )
    )
      return;
    try {
      await apiDelete(`/sessions/${id}`);
      toast.success("Sesi dicabut");
      if (current) {
        localStorage.removeItem("token");
        window.location.href = "/login";
        return;
      }
      load();
    } catch (e: any) {
      toast.error(e.message || "Gagal mencabut sesi");
    }
  };

  const revokeOthers = async () => {
    if (!confirm("Cabut semua sesi lain? Perangkat lain akan logout.")) return;
    try {
      const d = await apiPost<{ revoked: number }>("/sessions/revoke-others");
      toast.success(`${d.revoked || 0} sesi lain dicabut`);
      load();
    } catch (e: any) {
      toast.error(e.message || "Gagal mencabut sesi");
    }
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground">Memuat sesi…</p>;
  }

  return (
    <div className="space-y-3">
      {sessions.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Tidak ada sesi aktif tercatat.
        </p>
      )}
      {sessions.map((s) => (
        <div
          key={s.id}
          className={cn(
            "flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5",
            s.current && "border-[#243370]/40"
          )}
        >
          <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center shrink-0">
            <MonitorSmartphone className="w-4 h-4 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium flex items-center gap-2">
              <span className="truncate">{deviceLabel(s.userAgent)}</span>
              {s.current && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[#243370]/10 text-[#243370] dark:text-blue-300 shrink-0">
                  Perangkat ini
                </span>
              )}
            </p>
            <p className="text-xs text-muted-foreground truncate">
              {s.ip} · aktif {relTime(s.lastSeen)}
            </p>
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="text-red-500 hover:text-red-600 shrink-0"
            onClick={() => revoke(s.id, s.current)}
            title="Cabut sesi"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      ))}
      {sessions.length > 1 && (
        <Button size="sm" variant="outline" onClick={revokeOthers}>
          Cabut semua sesi lain
        </Button>
      )}
    </div>
  );
}

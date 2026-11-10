import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { MonitorSmartphone, X } from "lucide-react";
import { toast } from "sonner";
import { apiGet, apiDelete, apiPost } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useLang, timeAgo } from "@/lib/i18n";

interface Session {
  id: number;
  ip: string;
  userAgent: string;
  createdAt: string;
  lastSeen: string;
  current: boolean;
}

function deviceLabel(t: (k: string) => string, ua: string): string {
  if (!ua) return t("sessionsSection.unknownDevice");
  if (/android/i.test(ua)) return "Android";
  if (/iphone|ipad/i.test(ua)) return "iPhone/iPad";
  if (/windows/i.test(ua)) return "Windows";
  if (/macintosh/i.test(ua)) return "Mac";
  if (/linux/i.test(ua)) return "Linux";
  const m = ua.match(/^([^/]+)/);
  return m ? m[1].slice(0, 40) : "Browser";
}

export default function SessionsSection() {
  const { t, lang } = useLang();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    apiGet<{ sessions: Session[] }>("/sessions")
      .then((d) => setSessions(d.sessions || []))
      .catch(() => toast.error(t("sessionsSection.errLoad")))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const revoke = async (id: number, current: boolean) => {
    if (
      !confirm(
        current
          ? t("sessionsSection.confirmRevokeCurrent")
          : t("sessionsSection.confirmRevoke")
      )
    )
      return;
    try {
      await apiDelete(`/sessions/${id}`);
      toast.success(t("sessionsSection.revoked"));
      if (current) {
        localStorage.removeItem("token");
        window.location.href = "/login";
        return;
      }
      load();
    } catch (e: any) {
      toast.error(e.message || t("sessionsSection.errRevoke"));
    }
  };

  const revokeOthers = async () => {
    if (!confirm(t("sessionsSection.confirmRevokeOthers"))) return;
    try {
      const d = await apiPost<{ revoked: number }>("/sessions/revoke-others");
      toast.success(t("sessionsSection.othersRevoked").replace("{count}", String(d.revoked || 0)));
      load();
    } catch (e: any) {
      toast.error(e.message || t("sessionsSection.errRevoke"));
    }
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground">{t("sessionsSection.loading")}</p>;
  }

  return (
    <div className="space-y-3">
      {sessions.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {t("sessionsSection.empty")}
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
              <span className="truncate">{deviceLabel(t, s.userAgent)}</span>
              {s.current && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[#243370]/10 text-[#243370] dark:text-blue-300 shrink-0">
                  {t("sessionsSection.thisDevice")}
                </span>
              )}
            </p>
            <p className="text-xs text-muted-foreground truncate">
              {s.ip} · {t("sessionsSection.activeAgo").replace("{time}", timeAgo(s.lastSeen, lang))}
            </p>
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="text-red-500 hover:text-red-600 shrink-0"
            onClick={() => revoke(s.id, s.current)}
            title={t("sessionsSection.revokeTitle")}
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      ))}
      {sessions.length > 1 && (
        <Button size="sm" variant="outline" onClick={revokeOthers}>
          {t("sessionsSection.revokeOthers")}
        </Button>
      )}
    </div>
  );
}

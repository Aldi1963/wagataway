import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import {
  Bell,
  Smartphone,
  Send,
  AlertTriangle,
  Info,
  CheckCheck,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiGet, apiPut } from "@/lib/api";
import { useLang, timeAgo } from "@/lib/i18n";
import { cn } from "@/lib/utils";

interface Notification {
  id: number;
  type: string;
  title: string;
  message: string;
  link?: string;
  isRead: boolean;
  createdAt: string;
}

const typeIcon: Record<string, React.ComponentType<{ className?: string }>> = {
  device: Smartphone,
  device_disconnected: Smartphone,
  message: Send,
  message_failed: AlertTriangle,
  warning: AlertTriangle,
  info: Info,
};

export function NotificationDropdown() {
  const [, navigate] = useLocation();
  const { t, lang } = useLang();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  const fetchNotifs = async () => {
    try {
      const d = await apiGet<{ notifications: Notification[]; unreadCount: number }>(
        "/notifications"
      );
      setItems((d.notifications || []).slice(0, 8));
      setUnreadCount(
        typeof d.unreadCount === "number"
          ? d.unreadCount
          : (d.notifications || []).filter((n) => !n.isRead).length
      );
    } catch {
      /* abaikan — badge tetap apa adanya */
    }
  };

  useEffect(() => {
    fetchNotifs();
    const timer = setInterval(fetchNotifs, 60000);
    return () => clearInterval(timer);
  }, []);

  // Tutup saat klik di luar / tekan Escape
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open ]);

  const openPanel = () => {
    setOpen((v) => {
      if (!v) fetchNotifs();
      return !v;
    });
  };

  const markAllRead = async () => {
    try {
      await apiPut("/notifications/read-all");
      setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch {
      /* abaikan */
    }
  };

  const openItem = async (n: Notification) => {
    if (!n.isRead) {
      try {
        await apiPut(`/notifications/${n.id}/read`);
      } catch {
        /* abaikan */
      }
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, isRead: true } : x)));
      setUnreadCount((c) => Math.max(0, c - 1));
    }
    setOpen(false);
    if (n.link) navigate(n.link);
    else navigate("/notifications");
  };

  return (
    <div className="relative" ref={ref}>
      <Button
        variant="ghost"
        size="icon"
        className="text-muted-foreground relative"
        aria-label={t("header.notifications")}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={openPanel}
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-0.5 rounded-full bg-destructive text-destructive-foreground text-[9px] font-semibold flex items-center justify-center">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </Button>

      {open && (
        <div
          role="menu"
          className="fixed top-[3.75rem] right-2 sm:right-4 w-[320px] max-w-[calc(100vw-1rem)] z-50 rounded-xl border border-border bg-card shadow-xl overflow-hidden"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <p className="text-sm font-semibold text-foreground">
              {t("header.notifications")}
            </p>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="text-xs font-medium text-primary hover:underline flex items-center gap-1"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                {t("header.markAllRead")}
              </button>
            )}
          </div>

          <div className="max-h-[380px] overflow-y-auto">
            {items.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <Bell className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm font-medium text-foreground">
                  {t("header.noNotifications")}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {t("header.notifHint")}
                </p>
              </div>
            ) : (
              items.map((n) => {
                const Icon = typeIcon[n.type] || Bell;
                return (
                  <button
                    key={n.id}
                    role="menuitem"
                    onClick={() => openItem(n)}
                    className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-secondary/60 transition-colors border-b border-border/50 last:border-0"
                  >
                    <div
                      className={cn(
                        "w-9 h-9 rounded-lg flex items-center justify-center shrink-0",
                        n.isRead ? "bg-secondary" : "bg-primary/10"
                      )}
                    >
                      <Icon
                        className={cn(
                          "w-4 h-4",
                          n.isRead ? "text-muted-foreground" : "text-primary"
                        )}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-[13px] font-semibold text-foreground truncate">
                          {n.title}
                        </p>
                        {!n.isRead && (
                          <span className="w-2 h-2 rounded-full bg-primary shrink-0" />
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                        {n.message}
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {timeAgo(n.createdAt, lang)}
                      </p>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          <button
            onClick={() => {
              setOpen(false);
              navigate("/notifications");
            }}
            className="w-full flex items-center justify-center gap-1 px-4 py-2.5 text-xs font-semibold text-primary hover:bg-secondary/60 border-t border-border transition-colors"
          >
            {t("common.viewAll")}
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

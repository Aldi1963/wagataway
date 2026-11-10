import { useEffect, useState } from "react";
import { Bell, BellOff, CheckCheck, Trash2, RefreshCw, Smartphone, Send, AlertTriangle, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { apiGet, apiPut, apiDelete } from "@/lib/api";
import { useLang, timeAgo } from "@/lib/i18n";
import { toast } from "sonner";

interface Notification {
  id: number;
  type: string;
  title: string;
  message: string;
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

export default function Notifications() {
  const { t, lang } = useLang();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    apiGet<{ notifications: Notification[] }>("/notifications")
      .then((d) => setNotifications(d.notifications || []))
      .catch((e) => setError(e.message || t("notifications.loadFail")))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const readAll = async () => {
    try {
      await apiPut("/notifications/read-all");
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      toast.success(t("notifications.markedRead"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("notifications.markReadFail"));
    }
  };

  const remove = async (id: number) => {
    try {
      await apiDelete(`/notifications/${id}`);
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      toast.success(t("notifications.deleted"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("notifications.deleteFail"));
    }
  };

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">{t("notifications.title")}</h2>
          <p className="text-sm text-muted-foreground">
            {unreadCount > 0 ? `${unreadCount} ${t("notifications.unread")}` : t("notifications.allRead")}
          </p>
        </div>
        {unreadCount > 0 && (
          <Button size="sm" variant="outline" className="gap-1.5" onClick={readAll}>
            <CheckCheck className="w-3.5 h-3.5" />
            {t("notifications.markAllRead")}
          </Button>
        )}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 rounded-lg bg-secondary animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <Card>
          <CardContent className="p-10 text-center space-y-3">
            <p className="text-sm text-destructive">{error}</p>
            <Button size="sm" variant="outline" onClick={load} className="gap-1.5">
              <RefreshCw className="w-3.5 h-3.5" /> {t("common.retry")}
            </Button>
          </CardContent>
        </Card>
      ) : notifications.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center">
            <BellOff className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
            <p className="font-medium">{t("notifications.empty")}</p>
            <p className="text-sm text-muted-foreground mt-1">
              {t("notifications.emptyHint")}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => {
            const Icon = typeIcon[n.type] || Bell;
            return (
              <Card key={n.id} className={n.isRead ? "opacity-70" : ""}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-md bg-secondary flex items-center justify-center shrink-0">
                      <Icon className="w-4 h-4 text-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-foreground truncate">
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
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
                      onClick={() => remove(n.id)}
                      aria-label={t("notifications.deleteNotif")}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

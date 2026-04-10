import { useState, useEffect, useRef, type ReactNode } from "react";
import { useLocation, Link } from "wouter";
import {
  Bell, Search, ChevronRight, Settings, LogOut, User,
  Wifi, Clock, Info, CheckCircle2, AlertTriangle, XCircle,
  Megaphone, Trash2, CheckCheck, X, BellOff, ExternalLink, Globe,
  Moon, Sun,
} from "lucide-react";
import { Sidebar, MobileSidebar } from "./Sidebar";
import { useAuth } from "@/hooks/use-auth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useTheme } from "@/hooks/use-theme";
import { useSiteConfig } from "@/hooks/use-site-config";
import { useDynamicSEO } from "@/hooks/use-dynamic-seo";
import { format, formatDistanceToNow } from "date-fns";
import { id as localeId } from "date-fns/locale";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Notification {
  id: number;
  type: string;
  title: string;
  message: string;
  link: string | null;
  isRead: boolean;
  createdAt: string;
}

// ─── Notification config ──────────────────────────────────────────────────────

const typeConfig: Record<string, { icon: React.FC<{ className?: string }>; color: string; bg: string }> = {
  trial_expiry: {
    icon: Clock,
    color: "text-amber-600",
    bg: "bg-amber-100 dark:bg-amber-900/30",
  },
  device_disconnected: {
    icon: Wifi,
    color: "text-red-500",
    bg: "bg-red-100 dark:bg-red-900/30",
  },
  system: {
    icon: Megaphone,
    color: "text-purple-600",
    bg: "bg-purple-100 dark:bg-purple-900/30",
  },
  success: {
    icon: CheckCircle2,
    color: "text-green-600",
    bg: "bg-green-100 dark:bg-green-900/30",
  },
  error: {
    icon: XCircle,
    color: "text-red-500",
    bg: "bg-red-100 dark:bg-red-900/30",
  },
  warning: {
    icon: AlertTriangle,
    color: "text-amber-600",
    bg: "bg-amber-100 dark:bg-amber-900/30",
  },
};

function getTypeConfig(type: string) {
  return typeConfig[type] ?? { icon: Info, color: "text-blue-500", bg: "bg-blue-100 dark:bg-blue-900/30" };
}

// ─── Route labels ─────────────────────────────────────────────────────────────

const routeLabels: Record<string, string> = {
  "/": "Dashboard",
  "/devices": "Perangkat",
  "/device-settings": "Pengaturan Perangkat",
  "/send": "Kirim Pesan",
  "/templates": "Template Pesan",
  "/bulk": "Blast Pesan",
  "/schedule": "Jadwal Pesan",
  "/auto-reply": "Auto Reply",
  "/live-chat": "Live Chat",
  "/contacts": "Kontak",
  "/contact-groups": "Grup Kontak",
  "/webhook": "Webhook",
  "/plugins": "Plugin",
  "/api-settings": "Pengaturan API",
  "/api-docs": "Dokumentasi API",
  "/cs-bot": "CS Bot AI",
  "/anti-banned": "Anti-Banned",
  "/analytics": "Analytics",
  "/laporan": "Laporan & Ekspor",
  "/blacklist": "Blacklist / DND",
  "/links": "Link Shortener",
  "/number-checker": "Cek Nomor WhatsApp",
  "/group-message": "Kirim ke Grup WA",
  "/bot-products": "Produk & Pesanan Bot",
  "/billing": "Langganan",
  "/profile": "Profil",
  "/admin/users": "Kelola Pengguna",
  "/admin/packages": "Manajemen Paket",
  "/admin/vouchers": "Voucher & Trial",
  "/admin/notifications": "Manajemen Notifikasi",
  "/admin/landing": "Landing Page",
  "/admin/ai-settings": "Pengaturan AI",
  "/admin/settings": "Pengaturan Website",
  "/admin/server-settings": "Pengaturan Server",
  "/admin/payment-gateway": "Payment Gateway",
  "/admin/update": "Update Sistem",
};

// ─── Notification Detail Dialog ───────────────────────────────────────────────

const typeLabel: Record<string, string> = {
  trial_expiry: "Masa Trial",
  device_disconnected: "Perangkat",
  system: "Pengumuman",
  success: "Sukses",
  error: "Error",
  warning: "Peringatan",
  info: "Informasi",
};

function NotifDetailDialog({
  notif,
  onClose,
  onNavigate,
}: {
  notif: Notification | null;
  onClose: () => void;
  onNavigate: (link: string) => void;
}) {
  if (!notif) return null;
  const cfg = getTypeConfig(notif.type);
  const Icon = cfg.icon;
  const isExternal =
    notif.link &&
    (notif.link.startsWith("http://") || notif.link.startsWith("https://"));

  return (
    <Dialog open={!!notif} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2.5">
            <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0", cfg.bg)}>
              <Icon className={cn("w-4 h-4", cfg.color)} />
            </div>
            <span className="leading-tight">{notif.title}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          {/* Meta */}
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="secondary" className="text-[10px] font-medium px-1.5">
              {typeLabel[notif.type] ?? notif.type}
            </Badge>
            <span>{format(new Date(notif.createdAt), "dd MMM yyyy, HH:mm", { locale: localeId })}</span>
            <span className="ml-auto">
              ({formatDistanceToNow(new Date(notif.createdAt), { addSuffix: true, locale: localeId })})
            </span>
          </div>

          {/* Message body */}
          <div className="rounded-xl bg-muted/50 border border-border/50 p-4">
            <p className="text-sm leading-relaxed whitespace-pre-line">{notif.message}</p>
          </div>

          {/* Link button */}
          {notif.link && (
            <Button
              className="w-full gap-2"
              variant={isExternal ? "outline" : "default"}
              onClick={() => onNavigate(notif.link!)}
            >
              {isExternal ? (
                <><ExternalLink className="w-4 h-4" /> Buka Link Eksternal</>
              ) : (
                <><Globe className="w-4 h-4" /> Pergi ke Halaman</>
              )}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Notification Panel ───────────────────────────────────────────────────────

function NotificationPanel() {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Notification | null>(null);
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const panelRef = useRef<HTMLDivElement>(null);

  const { data, isLoading } = useQuery<{ notifications: Notification[]; unreadCount: number }>({
    queryKey: ["notifications"],
    queryFn: () => apiFetch("/notifications").then((r) => r.json()),
    refetchInterval: 30000,
  });

  const notifications = data?.notifications ?? [];
  const unreadCount = data?.unreadCount ?? 0;

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const markRead = useMutation({
    mutationFn: (id: number) => apiFetch(`/notifications/${id}/read`, { method: "PUT" }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const markAllRead = useMutation({
    mutationFn: () => apiFetch("/notifications/read-all", { method: "PUT" }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const deleteNotif = useMutation({
    mutationFn: (id: number) => apiFetch(`/notifications/${id}`, { method: "DELETE" }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  function handleNotifClick(notif: Notification) {
    if (!notif.isRead) markRead.mutate(notif.id);
    setSelected(notif);
  }

  function handleNavigate(link: string) {
    setSelected(null);
    setOpen(false);
    if (link.startsWith("http://") || link.startsWith("https://")) {
      window.open(link, "_blank", "noopener,noreferrer");
    } else {
      navigate(link);
    }
  }

  return (
    <>
    <NotifDetailDialog
      notif={selected}
      onClose={() => setSelected(null)}
      onNavigate={handleNavigate}
    />
    <div className="relative" ref={panelRef}>
      {/* Bell button */}
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-muted-foreground hover:text-foreground relative"
        onClick={() => setOpen((o) => !o)}
        aria-label="Notifikasi"
      >
        <Bell className={cn("w-4 h-4 transition-transform", unreadCount > 0 && "animate-[wiggle_1s_ease-in-out_1]")} />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 min-w-[16px] h-4 px-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center ring-2 ring-card leading-none">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </Button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-[340px] sm:w-[380px] bg-card border border-border/70 rounded-2xl shadow-xl z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-primary" />
              <span className="font-semibold text-sm">Notifikasi</span>
              {unreadCount > 0 && (
                <Badge className="h-5 px-1.5 text-[10px] bg-red-500 hover:bg-red-500 text-white border-0">
                  {unreadCount} baru
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs gap-1 text-muted-foreground hover:text-foreground"
                  onClick={() => markAllRead.mutate()}
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  Tandai semua
                </Button>
              )}
              <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" onClick={() => setOpen(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* List */}
          <ScrollArea className="max-h-[420px]">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2 text-muted-foreground">
                <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                <p className="text-xs">Memuat notifikasi…</p>
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2 text-muted-foreground">
                <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
                  <BellOff className="w-5 h-5 opacity-50" />
                </div>
                <p className="text-sm font-medium">Tidak ada notifikasi</p>
                <p className="text-xs">Semua informasi penting akan muncul di sini</p>
              </div>
            ) : (
              <div className="divide-y divide-border/40">
                {notifications.map((n) => {
                  const cfg = getTypeConfig(n.type);
                  const Icon = cfg.icon;
                  return (
                    <div
                      key={n.id}
                      className={cn(
                        "flex gap-3 px-4 py-3 transition-colors hover:bg-muted/50 cursor-pointer group",
                        !n.isRead && "bg-primary/[0.03]"
                      )}
                      onClick={() => handleNotifClick(n)}
                    >
                      {/* Icon */}
                      <div className={cn("w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5", cfg.bg)}>
                        <Icon className={cn("w-4 h-4", cfg.color)} />
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className={cn("text-sm leading-snug", !n.isRead && "font-semibold")}>{n.title}</p>
                          {!n.isRead && (
                            <span className="w-2 h-2 rounded-full bg-primary shrink-0 mt-1.5" />
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed line-clamp-2">{n.message}</p>
                        {n.link && (
                          <p className="text-[11px] text-primary/80 mt-1 flex items-center gap-1 truncate">
                            <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                            <span className="truncate">{n.link}</span>
                          </p>
                        )}
                        <p className="text-[11px] text-muted-foreground/70 mt-1">
                          {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true, locale: localeId })}
                        </p>
                      </div>

                      {/* Delete button */}
                      <button
                        className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5 text-muted-foreground hover:text-destructive"
                        onClick={(e) => { e.stopPropagation(); deleteNotif.mutate(n.id); }}
                        title="Hapus"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="border-t border-border/60 px-4 py-2.5 flex items-center justify-between">
              <p className="text-xs text-muted-foreground">{notifications.length} notifikasi</p>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-muted-foreground hover:text-destructive gap-1"
                onClick={() => {
                  notifications.forEach((n) => deleteNotif.mutate(n.id));
                }}
              >
                <Trash2 className="w-3 h-3" />
                Hapus semua
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
    </>
  );
}

// ─── TopBar ───────────────────────────────────────────────────────────────────

function TopBar() {
  const { user, logout } = useAuth();
  const { resolvedTheme, toggleTheme } = useTheme();
  const { siteName } = useSiteConfig();
  const [location] = useLocation();

  const pageLabel = routeLabels[location] ?? "Dashboard";
  const segments = location.split("/").filter(Boolean);

  return (
    <header className="h-14 border-b border-border bg-card/80 backdrop-blur-sm flex items-center px-4 gap-4 shrink-0 sticky top-0 z-30">
      {/* Mobile menu */}
      <div className="md:hidden">
        <MobileSidebar />
      </div>

      {/* Breadcrumb */}
      <div className="hidden md:flex items-center gap-1.5 text-sm flex-1 min-w-0">
        <span className="text-muted-foreground">{siteName}</span>
        {segments.map((seg, i) => {
          const path = "/" + segments.slice(0, i + 1).join("/");
          const label = routeLabels[path] ?? seg.charAt(0).toUpperCase() + seg.slice(1);
          return (
            <span key={path} className="flex items-center gap-1.5">
              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/50 flex-shrink-0" />
              <span className={i === segments.length - 1 ? "font-semibold text-foreground" : "text-muted-foreground"}>
                {label}
              </span>
            </span>
          );
        })}
        {segments.length === 0 && (
          <span className="flex items-center gap-1.5">
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/50" />
            <span className="font-semibold text-foreground">Dashboard</span>
          </span>
        )}
      </div>

      {/* Mobile spacer */}
      <div className="md:hidden flex-1 min-w-0" />

      {/* Right actions */}
      <div className="flex items-center gap-1.5 ml-auto">
        <Button variant="ghost" size="icon" className="h-8 w-8 hidden sm:flex text-muted-foreground hover:text-foreground">
          <Search className="w-4 h-4" />
        </Button>

        {/* Dark mode toggle */}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          onClick={toggleTheme}
          title={resolvedTheme === "dark" ? "Beralih ke mode terang" : "Beralih ke mode gelap"}
        >
          {resolvedTheme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </Button>

        {/* Notification panel */}
        <NotificationPanel />

        {/* User dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 gap-2 px-1.5 hover:bg-secondary rounded-lg">
              <Avatar className="h-7 w-7">
                <AvatarImage src={user?.avatar ?? undefined} />
                <AvatarFallback className="bg-primary text-white text-xs font-semibold">
                  {user?.name?.charAt(0).toUpperCase() ?? "U"}
                </AvatarFallback>
              </Avatar>
              <div className="hidden sm:flex flex-col items-start max-w-[120px]">
                <span className="text-xs font-semibold text-foreground leading-tight truncate max-w-full">{user?.name ?? "Pengguna"}</span>
                <div className="flex items-center gap-1">
                  <Badge variant="secondary" className="text-[10px] h-3.5 px-1 capitalize leading-none">{user?.plan ?? "free"}</Badge>
                  {user?.role === "admin" && (
                    <Badge className="text-[10px] h-3.5 px-1 leading-none bg-amber-500/15 text-amber-700 border-amber-300">Admin</Badge>
                  )}
                </div>
              </div>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-0.5">
                <p className="text-sm font-semibold text-foreground truncate">{user?.name}</p>
                <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/profile" className="flex items-center gap-2 cursor-pointer">
                <User className="w-3.5 h-3.5" />
                Profil Saya
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/api-settings" className="flex items-center gap-2 cursor-pointer">
                <Settings className="w-3.5 h-3.5" />
                Pengaturan API
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive focus:bg-destructive/10 gap-2"
              onClick={logout}
            >
              <LogOut className="w-3.5 h-3.5" />
              Keluar
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

// ─── DashboardLayout ──────────────────────────────────────────────────────────

export function DashboardLayout({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const { siteName, favicon, siteDescription } = useSiteConfig();

  useDynamicSEO({
    title: siteName ? `${siteName} — Dashboard` : undefined,
    description: siteDescription,
    favicon,
  });

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <div className="hidden md:flex">
        <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
      </div>
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <TopBar />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}

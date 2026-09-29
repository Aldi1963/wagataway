import { useEffect, useState } from "react";
import { useLocation, Link } from "wouter";
import {
  Bell,
  Moon,
  Sun,
  Search,
  Menu,
  ChevronDown,
  User,
  Settings,
  LogOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/hooks/use-theme";
import { apiGet } from "@/lib/api";

const routeLabels: Record<string, string> = {
  "/": "Dashboard",
  "/devices": "Perangkat",
  "/send": "Kirim Pesan",
  "/bulk": "Blast Pesan",
  "/schedule": "Jadwal Pesan",
  "/contacts": "Kontak",
  "/auto-reply": "Auto Reply",
  "/live-chat": "Live Chat",
  "/cs-bot": "CS Bot AI",
  "/drip": "Drip Campaign",
  "/links": "Link Shortener",
  "/analytics": "Analytics",
  "/anti-banned": "Anti-Banned",
  "/billing": "Langganan",
  "/settings": "Pengaturan",
  "/profile": "Profil",
  "/templates": "Templates",
  "/contact-groups": "Grup Kontak",
  "/blacklist": "Blacklist",
  "/webhook": "Webhook",
  "/api-docs": "API Developer",
  "/notifications": "Notifikasi",
};

interface TopBarProps {
  onMenu: () => void;
}

function ProfileMenuItem({
  icon: Icon,
  label,
  onClick,
  danger,
}: {
  icon: typeof User;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
        danger
          ? "text-destructive hover:bg-destructive/10"
          : "text-foreground hover:bg-secondary"
      }`}
    >
      <Icon className="w-4 h-4 shrink-0" />
      {label}
    </button>
  );
}

export function TopBar({ onMenu }: TopBarProps) {
  const [location, navigate] = useLocation();
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [unreadCount, setUnreadCount] = useState(0);
  const [profileOpen, setProfileOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const fetchUnread = () => {
      apiGet<{ notifications: { isRead: boolean }[] }>("/notifications")
        .then((d) => {
          if (!cancelled) {
            setUnreadCount((d.notifications || []).filter((n) => !n.isRead).length);
          }
        })
        .catch(() => {});
    };
    fetchUnread();
    const t = setInterval(fetchUnread, 60000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  useEffect(() => {
    if (!profileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setProfileOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [profileOpen]);

  // Tutup popup saat pindah halaman
  useEffect(() => {
    setProfileOpen(false);
  }, [location]);

  const pageLabel = routeLabels[location] || "Dashboard";
  const initials = (user?.name || "U").charAt(0).toUpperCase();

  const go = (path: string) => {
    setProfileOpen(false);
    navigate(path);
  };

  return (
    <header className="h-14 flex items-center justify-between px-4 lg:px-6 border-b border-border bg-background sticky top-0 z-30">
      {/* Page title + mobile menu */}
      <div className="flex items-center gap-1 min-w-0">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Buka menu"
          onClick={onMenu}
          className="lg:hidden -ml-2 text-muted-foreground shrink-0"
        >
          <Menu className="w-5 h-5" />
        </Button>
        <h1 className="text-sm font-semibold text-foreground truncate">{pageLabel}</h1>
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-1 shrink-0">
        {/* Search */}
        <Button variant="ghost" size="icon" className="text-muted-foreground hidden sm:inline-flex">
          <Search className="w-4 h-4" />
        </Button>

        {/* Theme toggle */}
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground"
          onClick={toggleTheme}
        >
          {theme === "dark" ? (
            <Sun className="w-4 h-4" />
          ) : (
            <Moon className="w-4 h-4" />
          )}
        </Button>

        {/* Notifications */}
        <Link href="/notifications">
          <Button variant="ghost" size="icon" className="text-muted-foreground relative" aria-label="Notifikasi">
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-0.5 rounded-full bg-destructive text-destructive-foreground text-[9px] font-semibold flex items-center justify-center">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </Button>
        </Link>

        {/* Profile dropdown */}
        <div className="relative ml-2 pl-2 border-l border-border">
          <button
            onClick={() => setProfileOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={profileOpen}
            aria-label="Menu profil"
            className={`flex items-center gap-2 rounded-full py-1 pl-1 pr-2 transition-colors ${
              profileOpen ? "bg-secondary" : "hover:bg-secondary/70"
            }`}
          >
            <div className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-semibold">
              {initials}
            </div>
            <div className="hidden sm:block text-left">
              <p className="text-xs font-medium text-foreground leading-tight">
                {user?.name || "User"}
              </p>
              <p className="text-[10px] text-muted-foreground leading-tight capitalize">
                {user?.plan || "free"}
              </p>
            </div>
            <ChevronDown
              className={`w-3.5 h-3.5 text-muted-foreground transition-transform duration-150 ${
                profileOpen ? "rotate-180" : ""
              }`}
            />
          </button>

          {profileOpen && (
            <>
              {/* Klik di luar untuk menutup */}
              <div
                className="fixed inset-0 z-40 cursor-default"
                onClick={() => setProfileOpen(false)}
              />
              <div
                role="menu"
                className="absolute right-0 top-full mt-2 w-64 z-50 rounded-xl border border-border bg-card shadow-xl overflow-hidden"
              >
                {/* Identitas */}
                <div className="p-4 flex items-center gap-3 bg-secondary/40">
                  <div className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold shrink-0">
                    {initials}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">
                      {user?.name || "User"}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {user?.email || ""}
                    </p>
                    <p className="text-[10px] text-muted-foreground capitalize mt-0.5">
                      Paket {user?.plan || "free"}
                    </p>
                  </div>
                </div>
                {/* Menu */}
                <div className="p-1.5">
                  <ProfileMenuItem
                    icon={User}
                    label="Profil saya"
                    onClick={() => go("/profile")}
                  />
                  <ProfileMenuItem
                    icon={Settings}
                    label="Pengaturan"
                    onClick={() => go("/settings")}
                  />
                  <div className="my-1.5 border-t border-border" />
                  <ProfileMenuItem
                    icon={LogOut}
                    label="Keluar"
                    danger
                    onClick={() => {
                      setProfileOpen(false);
                      logout();
                    }}
                  />
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

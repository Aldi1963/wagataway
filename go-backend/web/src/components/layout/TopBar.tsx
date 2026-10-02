import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import {
  Moon,
  Sun,
  Search,
  Menu,
  ChevronDown,
  User,
  Settings,
  LogOut,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/hooks/use-theme";
import { useLang } from "@/lib/i18n";
import { NotificationDropdown } from "./NotificationDropdown";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { CommandPalette } from "../CommandPalette";

export const routeTitleKeys: Record<string, string> = {
  "/": "title.dashboard",
  "/send": "title.send",
  "/bulk": "title.bulk",
  "/schedule": "title.schedule",
  "/history": "title.history",
  "/contacts": "title.contacts",
  "/contact-groups": "title.contactGroups",
  "/blacklist": "title.blacklist",
  "/automation": "title.automation",
  "/auto-reply": "title.autoReply",
  "/live-chat": "title.liveChat",
  "/cs-bot": "title.csBot",
  "/drip": "title.drip",
  "/files": "title.files",
  "/links": "title.links",
  "/analytics": "title.analytics",
  "/anti-banned": "title.antiBanned",
  "/billing": "title.billing",
  "/affiliate": "title.affiliate",
  "/settings": "title.settings",
  "/templates": "title.templates",
  "/api-docs": "title.apiDocs",
  "/integrations": "title.integrations",
  "/api-playground": "title.apiPlayground",
  "/webhook-logs": "title.webhookLogs",
  "/notifications": "title.notifications",
  "/admin": "title.admin",
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
  const { t } = useLang();
  const [profileOpen, setProfileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

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

  const pageLabel = t(routeTitleKeys[location] || "title.dashboard");
  const initials = (user?.name || "U").charAt(0).toUpperCase();
  const [avatarOk, setAvatarOk] = useState(true);

  // Avatar kartun default; bila gambar gagal dimuat, fallback ke inisial.
  const AvatarImg = ({ size }: { size: string }) => (
    <div className={`${size} rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-semibold shrink-0 overflow-hidden relative`}>
      {avatarOk ? (
        <img
          src="/illustrations/avatar-cartoon.webp"
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
          onError={() => setAvatarOk(false)}
        />
      ) : (
        initials
      )}
    </div>
  );

  const go = (path: string) => {
    setProfileOpen(false);
    navigate(path);
  };

  return (
    <>
    <header className="h-14 flex items-center justify-between px-4 lg:px-6 border-b border-border bg-background sticky top-0 z-30">
      {/* Page title + mobile menu */}
      <div className="flex items-center gap-1 min-w-0">
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("header.openMenu")}
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
        <Button
          variant="ghost"
          aria-label={t("header.search")}
          onClick={() => setPaletteOpen(true)}
          className="text-muted-foreground hidden sm:inline-flex items-center gap-2 h-9 px-2.5"
        >
          <Search className="w-4 h-4" />
          <kbd className="hidden md:inline-flex text-[10px] border border-border rounded px-1 py-0.5 text-muted-foreground font-sans">
            Ctrl K
          </kbd>
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

        {/* Language switcher */}
        <LanguageSwitcher />

        {/* Notifications dropdown */}
        <NotificationDropdown />

        {/* Profile dropdown */}
        <div className="relative ml-2 pl-2 border-l border-border">
          <button
            onClick={() => setProfileOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={profileOpen}
            aria-label={t("header.profileMenu")}
            className={`flex items-center gap-2 rounded-full py-1 pl-1 pr-2 transition-colors ${
              profileOpen ? "bg-secondary" : "hover:bg-secondary/70"
            }`}
          >
            <AvatarImg size="w-7 h-7" />
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
                  <AvatarImg size="w-10 h-10" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">
                      {user?.name || "User"}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {user?.email || ""}
                    </p>
                    <p className="text-[10px] text-muted-foreground capitalize mt-0.5">
                      {t("header.plan")} {user?.plan || "free"}
                    </p>
                  </div>
                </div>
                {/* Menu */}
                <div className="p-1.5">
                  <ProfileMenuItem
                    icon={Settings}
                    label={t("header.settings")}
                    onClick={() => go("/settings")}
                  />
                  {user?.role === "admin" && (
                    <ProfileMenuItem
                      icon={ShieldCheck}
                      label={t("header.adminDashboard")}
                      onClick={() => go("/admin")}
                    />
                  )}
                  <div className="my-1.5 border-t border-border" />
                  <ProfileMenuItem
                    icon={LogOut}
                    label={t("header.logout")}
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
    <CommandPalette
      open={paletteOpen}
      onClose={() => setPaletteOpen(false)}
      onOpen={() => setPaletteOpen(true)}
    />
    </>
  );
}

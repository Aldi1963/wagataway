import { useLocation } from "wouter";
import { Bell, Moon, Sun, Search, LogOut, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/hooks/use-theme";

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
};

interface TopBarProps {
  onMenu: () => void;
}

export function TopBar({ onMenu }: TopBarProps) {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const pageLabel = routeLabels[location] || "Dashboard";

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
        <Button variant="ghost" size="icon" className="text-muted-foreground relative">
          <Bell className="w-4 h-4" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-foreground rounded-full" />
        </Button>

        {/* User */}
        <div className="flex items-center gap-2 ml-2 pl-2 border-l border-border">
          <div className="w-7 h-7 rounded-full bg-foreground text-background flex items-center justify-center text-xs font-semibold">
            {user?.name?.charAt(0).toUpperCase() || "U"}
          </div>
          <div className="hidden sm:block">
            <p className="text-xs font-medium text-foreground leading-tight">
              {user?.name || "User"}
            </p>
            <p className="text-[10px] text-muted-foreground leading-tight">
              {user?.plan || "free"}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground ml-1"
            onClick={logout}
          >
            <LogOut className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    </header>
  );
}

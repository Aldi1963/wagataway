import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { apiGet } from "@/lib/api";
import {
  LayoutDashboard,
  Send,
  Users,
  UsersRound,
  MessageSquare,
  MessagesSquare,
  Clock,
  Link2,
  Webhook,
  BarChart3,
  CreditCard,
  Ban,
  Zap,
  Mail,
  LayoutTemplate,
  UserRound,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  X,
  KeyRound,
} from "lucide-react";

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen: boolean;
  onClose: () => void;
}

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface NavSection {
  label: string;
  items: NavItem[];
}

const sections: NavSection[] = [
  {
    label: "Utama",
    items: [
      { label: "Dashboard", href: "/", icon: LayoutDashboard },
      { label: "Analytics", href: "/analytics", icon: BarChart3 },
    ],
  },
  {
    label: "Pesan",
    items: [
      { label: "Kirim Pesan", href: "/send", icon: Send },
      { label: "Blast Pesan", href: "/bulk", icon: Mail },
      { label: "Jadwal", href: "/schedule", icon: Clock },
      { label: "Drip Campaign", href: "/drip", icon: Zap },
      { label: "Templates", href: "/templates", icon: LayoutTemplate },
      { label: "Auto Reply", href: "/auto-reply", icon: MessageSquare },
      { label: "Live Chat", href: "/live-chat", icon: MessagesSquare },
    ],
  },
  {
    label: "Kontak",
    items: [
      { label: "Kontak", href: "/contacts", icon: Users },
      { label: "Grup Kontak", href: "/contact-groups", icon: UsersRound },
      { label: "Blacklist", href: "/blacklist", icon: Ban },
    ],
  },
  {
    label: "Integrasi",
    items: [
      { label: "Links", href: "/links", icon: Link2 },
      { label: "Webhook", href: "/webhook", icon: Webhook },
      { label: "API Developer", href: "/api-docs", icon: KeyRound },
    ],
  },
  {
    label: "Akun",
    items: [
      { label: "Langganan", href: "/billing", icon: CreditCard },
      { label: "Profil", href: "/profile", icon: UserRound },
    ],
  },
];

const STORAGE_KEY = "wag-sidebar-sections";

function isItemActive(location: string, href: string) {
  return location === href || (href !== "/" && location.startsWith(href));
}

function loadOpenSections(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter((x) => typeof x === "string");
      }
    }
  } catch {
    // abaikan, pakai default
  }
  // Default: semua section terbuka (perilaku lama)
  return sections.map((s) => s.label);
}

function badgeColorFor(href: string): string {
  // Chat belum dibaca = merah; peringatan lain = oranye
  return href === "/live-chat"
    ? "bg-destructive text-destructive-foreground"
    : "bg-orange-500 text-white";
}

export function Sidebar({ collapsed, onToggle, mobileOpen, onClose }: SidebarProps) {
  const [location] = useLocation();
  const [openSections, setOpenSections] = useState<string[]>(loadOpenSections);
  const [badges, setBadges] = useState<Record<string, number>>({});

  // Simpan state buka/tutup ke localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(openSections));
    } catch {
      // abaikan
    }
  }, [openSections]);

  // Section yang memuat route aktif otomatis terbuka saat navigasi
  useEffect(() => {
    const active = sections.find((s) =>
      s.items.some((item) => isItemActive(location, item.href))
    );
    if (active) {
      setOpenSections((prev) =>
        prev.includes(active.label) ? prev : [...prev, active.label]
      );
    }
  }, [location]);

  // Fetch badge counter + status perangkat sekali saat mount; gagal = diam
  useEffect(() => {
    let cancelled = false;

    apiGet<{ schedules: { sendAt?: string; status?: string }[] }>("/schedule")
      .then((d) => {
        if (cancelled) return;
        const now = new Date();
        const n = (d.schedules || []).filter((s) => {
          if (s.status !== "pending" || !s.sendAt) return false;
          const dt = new Date(s.sendAt);
          return (
            dt.getFullYear() === now.getFullYear() &&
            dt.getMonth() === now.getMonth() &&
            dt.getDate() === now.getDate()
          );
        }).length;
        setBadges((p) => ({ ...p, "/schedule": n }));
      })
      .catch(() => {});

    apiGet<{ conversations: { unreadCount?: number }[] }>("/chat/conversations")
      .then((d) => {
        if (cancelled) return;
        const n = (d.conversations || []).reduce(
          (a, c) => a + (c.unreadCount || 0),
          0
        );
        setBadges((p) => ({ ...p, "/live-chat": n }));
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  const toggleSection = (label: string) => {
    setOpenSections((prev) =>
      prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label]
    );
  };

  const renderItem = (item: NavItem, hideLabelOnCollapsed: boolean) => {
    const isActive = isItemActive(location, item.href);
    const badge = badges[item.href] || 0;
    return (
      <Link
        key={item.href}
        href={item.href}
        className={cn(
          "relative flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
          isActive
            ? "bg-accent text-accent-foreground font-semibold"
            : "text-muted-foreground hover:text-foreground hover:bg-accent"
        )}
      >
        {isActive && (
          <span
            aria-hidden
            className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-1 rounded-r-full bg-primary"
          />
        )}
        <item.icon className="w-4 h-4 shrink-0" />
        <span className={cn(hideLabelOnCollapsed && collapsed && "lg:hidden")}>
          {item.label}
        </span>
        {badge > 0 && !hideLabelOnCollapsed && (
          <span
            className={cn(
              "ml-auto flex min-w-[20px] h-5 px-1.5 items-center justify-center rounded-full text-[10px] font-bold",
              badgeColorFor(item.href)
            )}
          >
            {badge > 99 ? "99+" : badge}
          </span>
        )}
        {badge > 0 && hideLabelOnCollapsed && (
          <span
            className={cn(
              "absolute -top-1 -right-1 flex min-w-[16px] h-4 px-1 items-center justify-center rounded-full text-[9px] font-bold",
              badgeColorFor(item.href)
            )}
          >
            {badge > 9 ? "9+" : badge}
          </span>
        )}
      </Link>
    );
  };


  return (
    <aside
      className={cn(
        "flex h-screen flex-col bg-card text-foreground border-r border-border",
        // Mobile: slide-over drawer
        "fixed inset-y-0 left-0 z-50 w-72 transition-transform duration-200",
        mobileOpen ? "translate-x-0" : "-translate-x-full",
        // Safe-area bawah agar tidak tertutup tombol navigasi HP; desktop tidak berubah
        "pb-[max(1.5rem,env(safe-area-inset-bottom))] lg:pb-0",
        // Desktop: static sidebar, collapsible
        "lg:static lg:z-auto lg:translate-x-0",
        collapsed ? "lg:w-16" : "lg:w-60"
      )}
    >
      {/* Logo */}
      <div className="h-14 flex items-center px-4 border-b border-border shrink-0">
        <span
          className={cn(
            "text-base font-semibold tracking-tight text-foreground",
            collapsed && "lg:hidden"
          )}
        >
          WaGataway
        </span>
        {collapsed && (
          <span className="hidden lg:block text-base font-bold text-foreground mx-auto">W</span>
        )}
        {/* Close button — mobile only */}
        <button
          onClick={onClose}
          aria-label="Tutup menu"
          className="ml-auto p-2 -mr-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent lg:hidden"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-4" onClick={onClose}>
        {collapsed ? (
          // Mode collapsed (ikon saja): tampilkan semua item langsung, tanpa accordion
          sections.map((section) => (
            <div key={section.label}>
              <p
                className={cn(
                  "px-3 mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60",
                  "lg:hidden"
                )}
              >
                {section.label}
              </p>
              <div className="space-y-0.5">
                {section.items.map((item) => renderItem(item, true))}
              </div>
            </div>
          ))
        ) : (
          // Mode normal: accordion collapsible per section
          <>
            {sections.map((section) => {
              const isOpen = openSections.includes(section.label);
              return (
                <div key={section.label}>
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    onClick={(e) => {
                      // Jangan tutup drawer mobile saat toggle section
                      e.stopPropagation();
                      toggleSection(section.label);
                    }}
                    className="w-full flex items-center justify-between px-3 py-1.5 mb-1 rounded-md text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 hover:text-foreground hover:bg-accent transition-colors"
                  >
                    <span>{section.label}</span>
                    <ChevronDown
                      className={cn(
                        "w-3.5 h-3.5 shrink-0 transition-transform duration-200",
                        isOpen && "rotate-180"
                      )}
                    />
                  </button>
                  {isOpen && (
                    <div className="space-y-0.5">
                      {section.items.map((item) => renderItem(item, false))}
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}
      </nav>

      {/* Collapse Toggle — desktop only */}
      <div className="p-2 border-t border-border hidden lg:block">
        <button
          onClick={onToggle}
          aria-label={collapsed ? "Buka sidebar" : "Tutup sidebar"}
          className="w-full flex items-center justify-center py-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          {collapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <ChevronLeft className="w-4 h-4" />
          )}
        </button>
      </div>
    </aside>
  );
}

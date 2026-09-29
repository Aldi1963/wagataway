import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import QuotaMeter from "@/components/QuotaMeter";
import { useAuth } from "@/hooks/use-auth";
import { apiGet } from "@/lib/api";
import {
  LayoutDashboard,
  Smartphone,
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
  History,
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
      { label: "Perangkat", href: "/devices", icon: Smartphone },
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

const allItems: NavItem[] = sections.flatMap((s) => s.items);

const STORAGE_KEY = "wag-sidebar-sections";
const FREQ_KEY = "wag-sidebar-freq";

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

interface FreqEntry {
  count: number;
  last: number;
}

function loadFreq(): Record<string, FreqEntry> {
  try {
    const raw = localStorage.getItem(FREQ_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") return parsed;
    }
  } catch {
    // abaikan
  }
  return {};
}

function topFreqItems(): NavItem[] {
  const freq = loadFreq();
  return Object.entries(freq)
    .filter(([href]) => href !== "/" && allItems.some((i) => i.href === href))
    .sort((a, b) => b[1].count - a[1].count || b[1].last - a[1].last)
    .slice(0, 3)
    .map(([href]) => allItems.find((i) => i.href === href))
    .filter((i): i is NavItem => Boolean(i));
}

function badgeColorFor(href: string): string {
  // Chat belum dibaca = merah; peringatan lain = oranye
  return href === "/live-chat"
    ? "bg-destructive text-destructive-foreground"
    : "bg-orange-500 text-white";
}

export function Sidebar({ collapsed, onToggle, mobileOpen, onClose }: SidebarProps) {
  const [location] = useLocation();
  const { user } = useAuth();
  const [openSections, setOpenSections] = useState<string[]>(loadOpenSections);
  const [badges, setBadges] = useState<Record<string, number>>({});
  const [connectedCount, setConnectedCount] = useState(0);
  const [devicesLoaded, setDevicesLoaded] = useState(false);
  const [freqItems, setFreqItems] = useState<NavItem[]>([]);

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

  // Muat menu "Sering dibuka" sekali saat mount
  useEffect(() => {
    setFreqItems(topFreqItems());
  }, []);

  // Fetch badge counter + status perangkat sekali saat mount; gagal = diam
  useEffect(() => {
    let cancelled = false;

    apiGet<{ devices: { status?: string }[] }>("/devices")
      .then((d) => {
        if (cancelled) return;
        const devs = d.devices || [];
        setBadges((p) => ({
          ...p,
          "/devices": devs.filter((x) => x.status !== "connected").length,
        }));
        setConnectedCount(devs.filter((x) => x.status === "connected").length);
        setDevicesLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setDevicesLoaded(true);
      });

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

  const trackVisit = (href: string) => {
    try {
      const freq = loadFreq();
      const e = freq[href] || { count: 0, last: 0 };
      e.count += 1;
      e.last = Date.now();
      freq[href] = e;
      localStorage.setItem(FREQ_KEY, JSON.stringify(freq));
      setFreqItems(topFreqItems());
    } catch {
      // abaikan
    }
  };

  const renderItem = (item: NavItem, hideLabelOnCollapsed: boolean) => {
    const isActive = isItemActive(location, item.href);
    const badge = badges[item.href] || 0;
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={() => trackVisit(item.href)}
        className={cn(
          "relative flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
          isActive
            ? "bg-white/10 text-white font-semibold"
            : "text-white/60 hover:text-white hover:bg-white/5"
        )}
      >
        {isActive && (
          <span
            aria-hidden
            className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-1 rounded-r-full bg-white"
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

  const initials = (user?.name || "U").charAt(0).toUpperCase();

  return (
    <aside
      className={cn(
        "flex h-screen flex-col bg-sidebar-bg text-sidebar-foreground border-r border-sidebar-border",
        // Mobile: slide-over drawer
        "fixed inset-y-0 left-0 z-50 w-72 transition-transform duration-200",
        mobileOpen ? "translate-x-0" : "-translate-x-full",
        // Desktop: static sidebar, collapsible
        "lg:static lg:z-auto lg:translate-x-0",
        collapsed ? "lg:w-16" : "lg:w-60"
      )}
    >
      {/* Logo */}
      <div className="h-14 flex items-center px-4 border-b border-sidebar-border shrink-0">
        <span
          className={cn(
            "text-base font-semibold tracking-tight text-white",
            collapsed && "lg:hidden"
          )}
        >
          WaGataway
        </span>
        {collapsed && (
          <span className="hidden lg:block text-base font-bold text-white mx-auto">W</span>
        )}
        {/* Close button — mobile only */}
        <button
          onClick={onClose}
          aria-label="Tutup menu"
          className="ml-auto p-2 -mr-2 rounded-md text-white/60 hover:text-white hover:bg-white/5 lg:hidden"
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
                  "px-3 mb-1 text-[10px] font-semibold uppercase tracking-wider text-white/30",
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
          // Mode normal: grup "Sering dibuka" + accordion collapsible per section
          <>
            {freqItems.length > 0 && (
              <div>
                <p className="px-3 mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/30">
                  <History className="w-3 h-3" />
                  Sering dibuka
                </p>
                <div className="space-y-0.5">
                  {freqItems.map((item) => renderItem(item, false))}
                </div>
              </div>
            )}
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
                    className="w-full flex items-center justify-between px-3 py-1.5 mb-1 rounded-md text-[10px] font-semibold uppercase tracking-wider text-white/30 hover:text-white/60 hover:bg-white/5 transition-colors"
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

      {/* Status perangkat mini + profil — sembunyi saat collapsed kecuali avatar */}
      <div className="shrink-0 border-t border-sidebar-border px-2 pt-2 pb-1 space-y-1">
        {devicesLoaded && !collapsed && (
          <Link
            href="/devices"
            onClick={() => {
              trackVisit("/devices");
              onClose();
            }}
            className="flex items-center gap-2.5 rounded-lg bg-white/5 px-3 py-2.5 transition-colors hover:bg-white/10"
          >
            <span
              className={cn(
                "h-2 w-2 shrink-0 rounded-full",
                connectedCount > 0 ? "bg-green-500" : "bg-red-500"
              )}
            />
            <span className="min-w-0">
              <span className="block truncate text-xs font-medium text-white">
                {connectedCount > 0
                  ? `${connectedCount} terhubung`
                  : "Tidak ada yang terhubung"}
              </span>
              <span className="block text-[10px] text-white/40">
                Perangkat WhatsApp
              </span>
            </span>
          </Link>
        )}
        <Link
          href="/profile"
          aria-label="Profil saya"
          onClick={() => {
            trackVisit("/profile");
            onClose();
          }}
          className={cn(
            "flex items-center gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-white/5",
            collapsed && "justify-center"
          )}
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-xs font-bold text-black">
            {initials}
          </span>
          {!collapsed && (
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-medium text-white">
                {user?.name || "User"}
              </span>
              <span className="mt-0.5 inline-block rounded-full bg-white/10 px-1.5 py-px text-[10px] capitalize text-white/70">
                {user?.plan || "free"}
              </span>
            </span>
          )}
        </Link>
      </div>

      {/* Meter kuota — desktop/mobile, sembunyi saat collapsed */}
      {!collapsed && (
        <div className="p-2 border-t border-sidebar-border shrink-0">
          <QuotaMeter collapsed={false} />
        </div>
      )}

      {/* Collapse Toggle — desktop only */}
      <div className="p-2 border-t border-sidebar-border hidden lg:block">
        <button
          onClick={onToggle}
          aria-label={collapsed ? "Buka sidebar" : "Tutup sidebar"}
          className="w-full flex items-center justify-center py-2 rounded-md text-white/40 hover:text-white hover:bg-white/5 transition-colors"
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

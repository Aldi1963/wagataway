import { useEffect, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { cn } from "@/lib/utils";
import { apiGet } from "@/lib/api";
import { useActiveDevice, type ActiveDevice } from "@/hooks/use-active-device";
import { Dropdown } from "@/components/ui/dropdown";
import { useAuth } from "@/hooks/use-auth";
import {
  LayoutGrid,
  Send,
  Users,
  MessagesSquare,
  Clock,
  Link2,
  BarChart3,
  Settings,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  X,
  CodeXml,
  PlugZap,
  FolderOpen,
  LogOut,
  Smartphone,
  LayoutDashboard,
  Package,
  Ticket,
  ReceiptText,
  ScrollText,
  HeartPulse,
  BellRing,
  ArrowLeft,
  Bot,
  FlaskConical,
  Webhook,
  CreditCard,
  Gift,
  History,
} from "lucide-react";
import { useLang } from "@/lib/i18n";

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen: boolean;
  onClose: () => void;
}

interface NavItem {
  labelKey: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface NavSection {
  key: string;
  items: NavItem[];
}

// Urutan: Dashboard, Pesan dulu, lalu alur kerja, Developer grup sendiri, Akun di bawah
// labelKey merujuk ke kamus t("nav.<labelKey>") — stabil antar bahasa.
const topItems: NavItem[] = [
  { labelKey: "dashboard", href: "/", icon: LayoutGrid },
  { labelKey: "schedule", href: "/schedule", icon: Clock },
  { labelKey: "automation", href: "/automation", icon: Bot },
  { labelKey: "liveChat", href: "/live-chat", icon: MessagesSquare },
  { labelKey: "contacts", href: "/contacts", icon: Users },
  { labelKey: "billing", href: "/billing", icon: CreditCard },
  { labelKey: "affiliate", href: "/affiliate", icon: Gift },
];

const sections: NavSection[] = [
  {
    key: "messages",
    items: [
      { labelKey: "send", href: "/send", icon: Send },
      { labelKey: "messageHistory", href: "/history", icon: History },
      { labelKey: "fileManager", href: "/files", icon: FolderOpen },
    ],
  },
  {
    key: "reports",
    items: [
      { labelKey: "report", href: "/reports", icon: BarChart3 },
      { labelKey: "links", href: "/links", icon: Link2 },
    ],
  },
  {
    key: "developer",
    items: [
      { labelKey: "apiDocs", href: "/api-docs", icon: CodeXml },
      { labelKey: "integrations", href: "/integrations", icon: PlugZap },
      { labelKey: "playground", href: "/api-playground", icon: FlaskConical },
      { labelKey: "webhookLogs", href: "/webhook-logs", icon: Webhook },
    ],
  },
];

const STORAGE_KEY = "wag-sidebar-sections";

// ── Navigasi admin: tampil menggantikan sidebar user saat di halaman /admin ──
interface AdminNavItem extends NavItem {
  tab: string;
}

const adminTopItems: AdminNavItem[] = [
  { labelKey: "overview", href: "/admin?tab=ringkasan", icon: LayoutDashboard, tab: "ringkasan" },
];

interface AdminNavSection {
  key: string;
  items: AdminNavItem[];
}

const adminSections: AdminNavSection[] = [
  {
    key: "management",
    items: [
      { labelKey: "users", href: "/admin?tab=pengguna", icon: Users, tab: "pengguna" },
      { labelKey: "packages", href: "/admin?tab=paket", icon: Package, tab: "paket" },
      { labelKey: "vouchers", href: "/admin?tab=voucher", icon: Ticket, tab: "voucher" },
      { labelKey: "transactions", href: "/admin?tab=transaksi", icon: ReceiptText, tab: "transaksi" },
    ],
  },
  {
    key: "system",
    items: [
      { labelKey: "activityLog", href: "/admin?tab=log", icon: ScrollText, tab: "log" },
      { labelKey: "systemHealth", href: "/admin?tab=kesehatan", icon: HeartPulse, tab: "kesehatan" },
      { labelKey: "settings", href: "/admin?tab=pengaturan", icon: Settings, tab: "pengaturan" },
    ],
  },
  {
    key: "communication",
    items: [
      { labelKey: "notifications", href: "/admin?tab=notifikasi", icon: BellRing, tab: "notifikasi" },
    ],
  },
];

const ADMIN_STORAGE_KEY = "wag-sidebar-admin-sections";

function loadOpenAdminSections(): string[] {
  try {
    const raw = localStorage.getItem(ADMIN_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const valid = new Set(adminSections.map((s) => s.key));
        const filtered = parsed.filter((x) => typeof x === "string" && valid.has(x));
        if (filtered.length > 0) return filtered;
      }
    }
  } catch {
    // abaikan, pakai default
  }
  return adminSections.map((s) => s.key);
}

// URL lama tetap valid dan menandai menu gabungan sebagai aktif
const ACTIVE_ALIASES: Record<string, string[]> = {
  "/send": ["/send", "/bulk", "/followups", "/templates", "/canned-responses"],
  "/contacts": ["/contacts", "/contact-groups", "/blacklist"],
  "/schedule": ["/schedule", "/drip", "/recurring"],
  "/automation": ["/automation", "/auto-reply", "/ai-reply", "/group-rules"],
  "/live-chat": ["/live-chat", "/chat-labels"],
  "/reports": ["/reports", "/analytics"],
  "/developer": ["/developer", "/api-docs", "/integrations", "/api-playground", "/webhook-logs"],
  "/settings": ["/settings", "/team", "/profile"],
};

function isItemActive(location: string, href: string) {
  if (location === href) return true;
  const aliases = ACTIVE_ALIASES[href];
  if (aliases && aliases.includes(location)) return true;
  return href !== "/" && location.startsWith(href);
}

function loadOpenSections(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const valid = new Set(sections.map((s) => s.key));
        const filtered = parsed.filter((x) => typeof x === "string" && valid.has(x));
        if (filtered.length > 0) return filtered;
      }
    }
  } catch {
    // abaikan, pakai default
  }
  return sections.map((s) => s.key);
}

function badgeColorFor(href: string): string {
  return href === "/live-chat" ? "bg-red-500 text-white" : "bg-orange-500 text-white";
}

// ── Active Device selector (ala MPWA), tema navy ─────────────────────────────
function ActiveDeviceSelector({ collapsed }: { collapsed: boolean }) {
  const { activeDevice, setActiveDevice } = useActiveDevice();
  const { t } = useLang();
  const [devices, setDevices] = useState<ActiveDevice[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiGet<{ devices: ActiveDevice[] }>("/devices");
        const list = res.devices ?? [];
        setDevices(list);
        if (activeDevice) {
          const fresh = list.find((d) => d.id === activeDevice.id);
          if (fresh && JSON.stringify(fresh) !== JSON.stringify(activeDevice)) {
            setActiveDevice(fresh);
          } else if (!fresh) {
            setActiveDevice(null);
          }
        }
      } catch {
        // gagal dimuat — biarkan kosong
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (collapsed) return null;

  return (
    <div className="px-4 pb-3">
      <p className="px-1 mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        {t("nav.activeDevice")}
      </p>
      <div className="relative">
        <Dropdown
          value={activeDevice ? String(activeDevice.id) : ""}
          onChange={(v) => {
            const id = Number(v);
            setActiveDevice(devices.find((d) => d.id === id) ?? null);
          }}
          options={devices.map((d) => ({
            value: String(d.id),
            label: `${d.name}${d.phone ? ` (${d.phone})` : ""}${d.status !== "connected" ? ` — ${d.status}` : ""}`,
          }))}
          placeholder={t("nav.selectDevice")}
          ariaLabel={t("nav.selectDeviceAria")}
          className="[&_button]:rounded-full [&_button]:pl-9"
        />
        <Smartphone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
      </div>
    </div>
  );
}

// ── Kartu user bawah (ala merchant portal) ───────────────────────────────────
function UserCard({ collapsed }: { collapsed: boolean }) {
  const { user, logout } = useAuth();
  const { t } = useLang();
  if (collapsed || !user) return null;
  const initial = (user.name || user.email || "?").charAt(0).toUpperCase();
  return (
    <div className="px-4 py-3 border-t border-slate-200 dark:border-white/10">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#243370] text-base font-bold text-white">
          {initial}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-slate-900 dark:text-white">
            {user.name || user.email}
          </span>
          <span className="block truncate text-xs text-slate-400 dark:text-slate-500 capitalize">
            {user.plan || user.role || "Member"}
          </span>
        </span>
        <button
          onClick={logout}
          aria-label={t("nav.logout")}
          title={t("nav.logout")}
          className="p-2 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:text-slate-500 dark:hover:text-white dark:hover:bg-white/10 transition-colors"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

export function Sidebar({ collapsed, onToggle, mobileOpen, onClose }: SidebarProps) {
  const [location] = useLocation();
  const search = useSearch();
  const { t } = useLang();
  const [openSections, setOpenSections] = useState<string[]>(loadOpenSections);
  const [badges, setBadges] = useState<Record<string, number>>({});

  // Di halaman admin, sidebar user diganti navigasi admin
  const isAdminArea = location === "/admin";
  const activeTab = new URLSearchParams(search).get("tab") || "ringkasan";
  const [openAdminSections, setOpenAdminSections] = useState<string[]>(loadOpenAdminSections);

  // Buka section admin yang memuat tab aktif
  useEffect(() => {
    if (!isAdminArea) return;
    const active = adminSections.find((s) => s.items.some((i) => i.tab === activeTab));
    if (active) {
      setOpenAdminSections((prev) =>
        prev.includes(active.key) ? prev : [...prev, active.key]
      );
    }
  }, [isAdminArea, activeTab]);

  useEffect(() => {
    try {
      localStorage.setItem(ADMIN_STORAGE_KEY, JSON.stringify(openAdminSections));
    } catch {
      // abaikan
    }
  }, [openAdminSections ]);

  const toggleAdminSection = (label: string) => {
    setOpenAdminSections((prev) =>
      prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label]
    );
  };

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(openSections));
    } catch {
      // abaikan
    }
  }, [openSections]);

  useEffect(() => {
    const active = sections.find((s) =>
      s.items.some((item) => isItemActive(location, item.href))
    );
    if (active) {
      setOpenSections((prev) =>
        prev.includes(active.key) ? prev : [...prev, active.key]
      );
    }
  }, [location]);

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

  const renderItem = (item: NavItem) => {
    const isActive = isItemActive(location, item.href);
    const badge = badges[item.href] || 0;
    const label = t(`nav.${item.labelKey}`);
    return (
      <Link
        key={item.href}
        href={item.href}
        className={cn(
          "relative flex items-center gap-3 px-4 py-2.5 text-sm transition-colors",
          isActive
            ? "rounded-full bg-[#243370] text-white font-semibold shadow-[0_4px_14px_rgba(36,51,112,0.4)]"
            : "rounded-full text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-white/5",
          collapsed && "lg:justify-center lg:px-0"
        )}
        title={collapsed ? label : undefined}
      >
        <item.icon className="w-[18px] h-[18px] shrink-0" />
        <span className={cn(collapsed && "lg:hidden")}>{label}</span>
        {badge > 0 && (
          <span
            className={cn(
              "ml-auto flex min-w-[20px] h-5 px-1.5 items-center justify-center rounded-full text-[10px] font-bold",
              badgeColorFor(item.href),
              collapsed && "lg:hidden"
            )}
          >
            {badge > 99 ? "99+" : badge}
          </span>
        )}
      </Link>
    );
  };

  const renderAdminItem = (item: AdminNavItem) => {
    const isActive = activeTab === item.tab;
    const label = t(`nav.${item.labelKey}`);
    return (
      <Link
        key={item.tab}
        href={item.href}
        className={cn(
          "relative flex items-center gap-3 px-4 py-2.5 text-sm transition-colors",
          isActive
            ? "rounded-full bg-[#243370] text-white font-semibold shadow-[0_4px_14px_rgba(36,51,112,0.4)]"
            : "rounded-full text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-white/5",
          collapsed && "lg:justify-center lg:px-0"
        )}
        title={collapsed ? label : undefined}
      >
        <item.icon className="w-[18px] h-[18px] shrink-0" />
        <span className={cn(collapsed && "lg:hidden")}>{label}</span>
      </Link>
    );
  };

  return (
    <aside
      className={cn(
        "flex h-screen h-dvh flex-col border-r border-slate-200 bg-white text-slate-700 dark:border-white/10 dark:bg-[#0a1030] dark:text-slate-200",
        "fixed inset-y-0 left-0 z-50 w-72 transition-transform duration-200",
        mobileOpen ? "translate-x-0" : "-translate-x-full",
        "pb-[max(1.5rem,env(safe-area-inset-bottom))] lg:pb-0",
        "lg:static lg:z-auto lg:translate-x-0",
        collapsed ? "lg:w-[72px]" : "lg:w-64"
      )}
    >
      {/* Logo + badge + close */}
      <div className="flex items-center gap-3 px-4 h-16 shrink-0 border-b border-slate-200 dark:border-white/10">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#243370]">
          <Send className="w-5 h-5 text-white" />
        </span>
        <span className={cn("min-w-0", collapsed && "lg:hidden")}>
          <span className="block text-[17px] font-bold tracking-tight text-slate-900 dark:text-white leading-tight">
            WaGataway
          </span>
        </span>
        <button
          onClick={onClose}
          aria-label={t("nav.closeMenu")}
          className={cn(
            "ml-auto p-2 -mr-2 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:text-slate-500 dark:hover:text-white dark:hover:bg-white/10 lg:hidden"
          )}
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Navigation */}
      <nav
        className={cn(
          "flex-1 min-h-0 overflow-y-auto py-2 space-y-1",
          collapsed ? "lg:px-2" : "px-3"
        )}
        onClick={onClose}
      >
        {isAdminArea ? (
          <>
            {adminTopItems.map(renderAdminItem)}

            {adminSections.map((section) => {
              if (collapsed) {
                return (
                  <div key={section.key} className="space-y-1 pt-1 hidden lg:block">
                    {section.items.map(renderAdminItem)}
                  </div>
                );
              }
              const isOpen = openAdminSections.includes(section.key);
              return (
                <div key={section.key} className="pt-1">
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleAdminSection(section.key);
                    }}
                    className="w-full flex items-center justify-between px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 transition-colors"
                  >
                    <span>{t(`nav.${section.key}`)}</span>
                    <ChevronDown
                      className={cn(
                        "w-3.5 h-3.5 shrink-0 transition-transform duration-200",
                        isOpen && "rotate-180"
                      )}
                    />
                  </button>
                  {isOpen && (
                    <div className="space-y-1">
                      {section.items.map(renderAdminItem)}
                    </div>
                  )}
                </div>
              );
            })}
            <div className="pt-2">
              <Link
                href="/"
                className={cn(
                  "relative flex items-center gap-3 px-4 py-2.5 text-sm transition-colors rounded-full text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-white/5",
                  collapsed && "lg:justify-center lg:px-0"
                )}
                title={collapsed ? t("nav.backToDashboard") : undefined}
              >
                <ArrowLeft className="w-[18px] h-[18px] shrink-0" />
                <span className={cn(collapsed && "lg:hidden")}>
                  {t("nav.backToDashboard")}
                </span>
              </Link>
            </div>
          </>
        ) : (
          <>
            {topItems.map(renderItem)}

            {sections.map((section) => {
          if (collapsed) {
            return (
              <div key={section.key} className="space-y-1 pt-1 hidden lg:block">
                {section.items.map(renderItem)}
              </div>
            );
          }
          const isOpen = openSections.includes(section.key);
          return (
            <div key={section.key} className="pt-1">
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleSection(section.key);
                }}
                className="w-full flex items-center justify-between px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 transition-colors"
              >
                <span>{t(`nav.${section.key}`)}</span>
                <ChevronDown
                  className={cn(
                    "w-3.5 h-3.5 shrink-0 transition-transform duration-200",
                    isOpen && "rotate-180"
                  )}
                />
              </button>
              {isOpen && (
                <div className="space-y-1">
                  {section.items.map(renderItem)}
                </div>
              )}
            </div>
          );
        })}
          </>
        )}
      </nav>

      {/* Active Device — global (disembunyikan di area admin) */}
      {!isAdminArea && <ActiveDeviceSelector collapsed={collapsed} />}

      {/* Kartu user */}
      <UserCard collapsed={collapsed} />

      {/* Collapse Toggle — desktop only */}
      <div className="px-4 py-2 border-t border-white/10 hidden lg:block">
        <button
          onClick={onToggle}
          aria-label={collapsed ? t("nav.openSidebar") : t("nav.closeSidebar")}
          className="w-full flex items-center justify-center py-2 rounded-full text-slate-500 hover:text-white hover:bg-white/10 transition-colors"
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

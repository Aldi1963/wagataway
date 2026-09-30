import { useEffect, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { cn } from "@/lib/utils";
import { apiGet } from "@/lib/api";
import { useActiveDevice, type ActiveDevice } from "@/hooks/use-active-device";
import { useAuth } from "@/hooks/use-auth";
import {
  LayoutGrid,
  Send,
  Users,
  MessageSquare,
  MessagesSquare,
  Clock,
  Link2,
  BarChart3,
  CreditCard,
  LayoutTemplate,
  Settings,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  X,
  CodeXml,
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
  Tags,
  Zap,
  FileBarChart,
  Repeat,
  ShieldCheck,
  Timer,
  Webhook,
  FlaskConical,
  UserPlus,
  Gift,
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

// Urutan: Dashboard di atas (tanpa section), lalu grup sub-menu collapsible
const topItems: NavItem[] = [
  { label: "Dashboard", href: "/", icon: LayoutGrid },
];

const sections: NavSection[] = [
  {
    label: "Pesan",
    items: [
      { label: "Kirim Pesan", href: "/send", icon: Send },
      { label: "Jadwal", href: "/schedule", icon: Clock },
      { label: "Jadwal Berulang", href: "/recurring", icon: Repeat },
      { label: "Follow-up", href: "/followups", icon: Timer },
      { label: "Templates", href: "/templates", icon: LayoutTemplate },
      { label: "Canned Responses", href: "/canned-responses", icon: Zap },
      { label: "Auto Reply", href: "/auto-reply", icon: MessageSquare },
      { label: "Live Chat", href: "/live-chat", icon: MessagesSquare },
      { label: "Label & Assign", href: "/chat-labels", icon: Tags },
      { label: "Aturan Grup", href: "/group-rules", icon: ShieldCheck },
      { label: "File Manager", href: "/files", icon: FolderOpen },
    ],
  },
  {
    label: "Kontak",
    items: [{ label: "Kontak", href: "/contacts", icon: Users }],
  },
  {
    label: "Data",
    items: [
      { label: "Analytics", href: "/analytics", icon: BarChart3 },
      { label: "Laporan Broadcast", href: "/reports", icon: FileBarChart },
      { label: "Links", href: "/links", icon: Link2 },
    ],
  },
  {
    label: "Pengembang",
    items: [
      { label: "API Developer", href: "/api-docs", icon: CodeXml },
      { label: "API Playground", href: "/api-playground", icon: FlaskConical },
      { label: "Webhook Logs", href: "/webhook-logs", icon: Webhook },
    ],
  },
  {
    label: "Akun",
    items: [
      { label: "Langganan", href: "/billing", icon: CreditCard },
      { label: "Tim", href: "/team", icon: UserPlus },
      { label: "Afiliasi", href: "/affiliate", icon: Gift },
      { label: "Setting", href: "/settings", icon: Settings },
    ],
  },
];

const STORAGE_KEY = "wag-sidebar-sections";

// ── Navigasi admin: tampil menggantikan sidebar user saat di halaman /admin ──
interface AdminNavItem extends NavItem {
  tab: string;
}

const adminTopItems: AdminNavItem[] = [
  { label: "Ringkasan", href: "/admin?tab=ringkasan", icon: LayoutDashboard, tab: "ringkasan" },
];

interface AdminNavSection {
  label: string;
  items: AdminNavItem[];
}

const adminSections: AdminNavSection[] = [
  {
    label: "Manajemen",
    items: [
      { label: "Pengguna", href: "/admin?tab=pengguna", icon: Users, tab: "pengguna" },
      { label: "Paket", href: "/admin?tab=paket", icon: Package, tab: "paket" },
      { label: "Voucher", href: "/admin?tab=voucher", icon: Ticket, tab: "voucher" },
      { label: "Transaksi", href: "/admin?tab=transaksi", icon: ReceiptText, tab: "transaksi" },
    ],
  },
  {
    label: "Sistem",
    items: [
      { label: "Log Aktivitas", href: "/admin?tab=log", icon: ScrollText, tab: "log" },
      { label: "Kesehatan Sistem", href: "/admin?tab=kesehatan", icon: HeartPulse, tab: "kesehatan" },
      { label: "Pengaturan", href: "/admin?tab=pengaturan", icon: Settings, tab: "pengaturan" },
    ],
  },
  {
    label: "Komunikasi",
    items: [
      { label: "Notifikasi", href: "/admin?tab=notifikasi", icon: BellRing, tab: "notifikasi" },
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
        return parsed.filter((x) => typeof x === "string");
      }
    }
  } catch {
    // abaikan, pakai default
  }
  return adminSections.map((s) => s.label);
}

// URL lama tetap valid dan menandai menu gabungan sebagai aktif
const ACTIVE_ALIASES: Record<string, string[]> = {
  "/send": ["/send", "/bulk"],
  "/contacts": ["/contacts", "/contact-groups", "/blacklist"],
  "/schedule": ["/schedule", "/drip"],
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
        return parsed.filter((x) => typeof x === "string");
      }
    }
  } catch {
    // abaikan, pakai default
  }
  return sections.map((s) => s.label);
}

function badgeColorFor(href: string): string {
  return href === "/live-chat" ? "bg-red-500 text-white" : "bg-orange-500 text-white";
}

// ── Active Device selector (ala MPWA), tema navy ─────────────────────────────
function ActiveDeviceSelector({ collapsed }: { collapsed: boolean }) {
  const { activeDevice, setActiveDevice } = useActiveDevice();
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
        Active Device
      </p>
      <div className="relative">
        <Smartphone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
        <select
          aria-label="Pilih device aktif"
          value={activeDevice?.id ?? ""}
          onChange={(e) => {
            const id = Number(e.target.value);
            setActiveDevice(devices.find((d) => d.id === id) ?? null);
          }}
          className="flex h-10 w-full rounded-full border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none dark:border-white/10 dark:bg-white/5 dark:text-slate-200"
        >
          <option value="" className="bg-white dark:bg-[#0a1030]">Select Device</option>
          {devices.map((d) => (
            <option key={d.id} value={d.id} className="bg-white dark:bg-[#0a1030]">
              {d.name}
              {d.phone ? ` (${d.phone})` : ""}
              {d.status !== "connected" ? ` — ${d.status}` : ""}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

// ── Kartu user bawah (ala merchant portal) ───────────────────────────────────
function UserCard({ collapsed }: { collapsed: boolean }) {
  const { user, logout } = useAuth();
  if (collapsed || !user) return null;
  const initial = (user.name || user.email || "?").charAt(0).toUpperCase();
  return (
    <div className="px-4 py-3 border-t border-slate-200 dark:border-white/10">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-600 text-base font-bold text-white">
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
          aria-label="Keluar"
          title="Keluar"
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
        prev.includes(active.label) ? prev : [...prev, active.label]
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
        prev.includes(active.label) ? prev : [...prev, active.label]
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
    return (
      <Link
        key={item.href}
        href={item.href}
        className={cn(
          "relative flex items-center gap-3 px-4 py-2.5 text-sm transition-colors",
          isActive
            ? "rounded-full bg-blue-600 text-white font-semibold shadow-[0_4px_14px_rgba(37,99,235,0.4)]"
            : "rounded-full text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-white/5",
          collapsed && "lg:justify-center lg:px-0"
        )}
        title={collapsed ? item.label : undefined}
      >
        <item.icon className="w-[18px] h-[18px] shrink-0" />
        <span className={cn(collapsed && "lg:hidden")}>{item.label}</span>
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
    return (
      <Link
        key={item.tab}
        href={item.href}
        className={cn(
          "relative flex items-center gap-3 px-4 py-2.5 text-sm transition-colors",
          isActive
            ? "rounded-full bg-blue-600 text-white font-semibold shadow-[0_4px_14px_rgba(37,99,235,0.4)]"
            : "rounded-full text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-white/5",
          collapsed && "lg:justify-center lg:px-0"
        )}
        title={collapsed ? item.label : undefined}
      >
        <item.icon className="w-[18px] h-[18px] shrink-0" />
        <span className={cn(collapsed && "lg:hidden")}>{item.label}</span>
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
      <div className="flex items-center gap-3 px-4 h-16 shrink-0">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-600">
          <Send className="w-5 h-5 text-white" />
        </span>
        <span className={cn("min-w-0", collapsed && "lg:hidden")}>
          <span className="block text-[17px] font-bold tracking-tight text-slate-900 dark:text-white leading-tight">
            WaGataway
          </span>
          <span className="mt-0.5 inline-block rounded-full bg-green-500/15 px-2 py-px text-[10px] font-bold tracking-wider text-green-400">
            GATEWAY
          </span>
        </span>
        <button
          onClick={onClose}
          aria-label="Tutup menu"
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
                  <div key={section.label} className="space-y-1 pt-1 hidden lg:block">
                    {section.items.map(renderAdminItem)}
                  </div>
                );
              }
              const isOpen = openAdminSections.includes(section.label);
              return (
                <div key={section.label} className="pt-1">
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleAdminSection(section.label);
                    }}
                    className="w-full flex items-center justify-between px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 transition-colors"
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
                title={collapsed ? "Kembali ke Dashboard" : undefined}
              >
                <ArrowLeft className="w-[18px] h-[18px] shrink-0" />
                <span className={cn(collapsed && "lg:hidden")}>
                  Kembali ke Dashboard
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
              <div key={section.label} className="space-y-1 pt-1 hidden lg:block">
                {section.items.map(renderItem)}
              </div>
            );
          }
          const isOpen = openSections.includes(section.label);
          return (
            <div key={section.label} className="pt-1">
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleSection(section.label);
                }}
                className="w-full flex items-center justify-between px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 transition-colors"
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
          aria-label={collapsed ? "Buka sidebar" : "Tutup sidebar"}
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

import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  Smartphone,
  Send,
  MessageSquare,
  Repeat2,
  CalendarClock,
  Users,
  Webhook,
  Puzzle,
  BookOpen,
  CreditCard,
  UserCircle,
  LogOut,
  Zap,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Menu,
  Server,
  Users2,
  ShieldCheck,
  MessagesSquare,
  Database,
  Code2,
  Package,
  Bot,
  ShieldAlert,
  ShieldOff,
  Link2,
  MessageSquareDot,
  Ticket,
  Bell,
  BarChart3,
  BarChart2,
  Receipt,
  FileText,
  Tag,
  TrendingUp,
  Globe,
  Network,
  ShoppingBag,
  Phone,
} from "lucide-react";
import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/hooks/use-auth";
import { useSiteConfig } from "@/hooks/use-site-config";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";


// ── Types ────────────────────────────────────────────────────────────────────

interface NavItem {
  icon: React.ElementType;
  label: string;
  href: string;
}

interface NavGroup {
  icon: React.ElementType;
  label: string;
  items: NavItem[];
}

type NavEntry = NavItem | NavGroup;

function isGroup(entry: NavEntry): entry is NavGroup {
  return "items" in entry;
}

// ── Nav structure ────────────────────────────────────────────────────────────

const navEntries: NavEntry[] = [
  { icon: LayoutDashboard, label: "Dashboard", href: "/" },
  { icon: Smartphone, label: "Perangkat", href: "/devices" },
  {
    icon: MessagesSquare,
    label: "Pesan",
    items: [
      { icon: Send, label: "Kirim Pesan", href: "/send" },
      { icon: Phone, label: "Cek Nomor WA", href: "/number-checker" },
      { icon: Users, label: "Kirim ke Grup", href: "/group-message" },
      { icon: ShoppingBag, label: "Produk & Pesanan Bot", href: "/bot-products" },
      { icon: FileText, label: "Template Pesan", href: "/templates" },
      { icon: MessageSquare, label: "Bulk Messages", href: "/bulk" },
      { icon: Zap, label: "Drip Campaign", href: "/drip" },
      { icon: CalendarClock, label: "Jadwal Pesan", href: "/schedule" },
      { icon: Repeat2, label: "Auto Reply", href: "/auto-reply" },
      { icon: Bot, label: "CS Bot", href: "/cs-bot" },
      { icon: ShieldAlert, label: "Anti-Banned", href: "/anti-banned" },
      { icon: MessageSquareDot, label: "Live Chat", href: "/live-chat" },
    ],
  },
  {
    icon: Database,
    label: "Data",
    items: [
      { icon: Users, label: "Kontak", href: "/contacts" },
      { icon: Tag, label: "Grup Kontak", href: "/contact-groups" },
      { icon: ShieldOff, label: "Blacklist / DND", href: "/blacklist" },
      { icon: Link2, label: "Link Shortener", href: "/links" },
      { icon: Webhook, label: "Webhook", href: "/webhook" },
    ],
  },
  {
    icon: Code2,
    label: "Developer",
    items: [
      { icon: Puzzle, label: "Plugin", href: "/plugins" },
      { icon: BookOpen, label: "Dokumentasi API", href: "/api-docs" },
    ],
  },
  { icon: TrendingUp, label: "Analytics", href: "/analytics" },
  { icon: BarChart3, label: "Laporan", href: "/laporan" },
  { icon: Network, label: "Reseller", href: "/reseller" },
  { icon: CreditCard, label: "Billing", href: "/billing" },
  { icon: UserCircle, label: "Profil", href: "/profile" },
];

const adminItems: NavItem[] = [
  { icon: Bot, label: "WA Center Bot", href: "/admin/wa-bot-center" },
  { icon: BarChart2, label: "Analytics Platform", href: "/admin/analytics" },
  { icon: Receipt, label: "Riwayat Transaksi", href: "/admin/transactions" },
  { icon: Users2, label: "Kelola Pengguna", href: "/admin/users" },
  { icon: Package, label: "Manajemen Paket", href: "/admin/packages" },
  { icon: Ticket, label: "Voucher & Trial", href: "/admin/vouchers" },
  { icon: Bell, label: "Notifikasi", href: "/admin/notifications" },
  { icon: Globe, label: "Landing Page", href: "/admin/landing" },
  { icon: Server, label: "Pengaturan Website", href: "/admin/settings" },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function useIsActive(href: string) {
  const [location] = useLocation();
  return href === "/" ? location === "/" : location.startsWith(href);
}

function groupIsActive(items: NavItem[], location: string) {
  return items.some((i) => (i.href === "/" ? location === "/" : location.startsWith(i.href)));
}

// ── Single nav link ──────────────────────────────────────────────────────────

function NavLink({
  item,
  collapsed,
  onClick,
  sub = false,
}: {
  item: NavItem;
  collapsed: boolean;
  onClick?: () => void;
  sub?: boolean;
}) {
  const active = useIsActive(item.href);

  return (
    <Link href={item.href}>
      <div
        onClick={onClick}
        className={cn(
          "flex items-center gap-3 rounded-lg cursor-pointer transition-colors text-sm font-medium",
          sub ? "px-2 py-2" : "px-3 py-2.5",
          active
            ? sub
              ? "text-primary font-semibold"
              : "bg-primary text-white"
            : "text-muted-foreground hover:bg-secondary hover:text-foreground"
        )}
      >
        {sub ? (
          <div className={cn(
            "w-1.5 h-1.5 rounded-full border flex-shrink-0",
            active ? "bg-primary border-primary" : "border-muted-foreground/60"
          )} />
        ) : (
          <item.icon className={cn("flex-shrink-0", collapsed ? "w-5 h-5" : "w-4 h-4")} />
        )}
        {!collapsed && <span>{item.label}</span>}
      </div>
    </Link>
  );
}

// ── Collapsible group ────────────────────────────────────────────────────────

function NavGroupItem({
  group,
  collapsed,
  onClick,
}: {
  group: NavGroup;
  collapsed: boolean;
  onClick?: () => void;
}) {
  const [location] = useLocation();
  const active = groupIsActive(group.items, location);
  const [open, setOpen] = useState(active);

  if (collapsed) {
    return (
      <>
        {group.items.map((item) => (
          <NavLink key={item.href} item={item} collapsed={true} onClick={onClick} />
        ))}
      </>
    );
  }

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-sm font-medium",
          active
            ? "bg-primary/10 text-primary"
            : "text-muted-foreground hover:bg-secondary hover:text-foreground"
        )}
      >
        <group.icon className="w-4 h-4 flex-shrink-0" />
        <span className="flex-1 text-left">{group.label}</span>
        <ChevronDown className={cn("w-3.5 h-3.5 transition-transform duration-200", open && "rotate-180")} />
      </button>
      {open && (
        <div className="mt-0.5 ml-3 pl-3 border-l border-border space-y-0.5">
          {group.items.map((item) => (
            <NavLink key={item.href} item={item} collapsed={false} onClick={onClick} sub />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Admin group ──────────────────────────────────────────────────────────────

function AdminGroup({ collapsed, onItemClick }: { collapsed: boolean; onItemClick?: () => void }) {
  const [location] = useLocation();
  const active = groupIsActive(adminItems, location);
  const [open, setOpen] = useState(active);

  if (collapsed) {
    return (
      <>
        {adminItems.map((item) => (
          <NavLink key={item.href} item={item} collapsed={true} onClick={onItemClick} />
        ))}
      </>
    );
  }

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-sm font-medium",
          active
            ? "bg-primary/10 text-primary"
            : "text-muted-foreground hover:bg-secondary hover:text-foreground"
        )}
      >
        <ShieldCheck className="w-4 h-4 flex-shrink-0" />
        <span className="flex-1 text-left">Admin</span>
        <ChevronDown className={cn("w-3.5 h-3.5 transition-transform duration-200", open && "rotate-180")} />
      </button>
      {open && (
        <div className="mt-0.5 ml-3 pl-3 border-l border-border space-y-0.5">
          {adminItems.map((item) => (
            <NavLink key={item.href} item={item} collapsed={false} onClick={onItemClick} sub />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Sidebar content (shared) ─────────────────────────────────────────────────

function SidebarContent({
  collapsed,
  onItemClick,
}: {
  collapsed: boolean;
  onItemClick?: () => void;
}) {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  return (
    <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
      {navEntries.map((entry) =>
        isGroup(entry) ? (
          <NavGroupItem
            key={entry.label}
            group={entry}
            collapsed={collapsed}
            onClick={onItemClick}
          />
        ) : (
          <NavLink key={entry.href} item={entry} collapsed={collapsed} onClick={onItemClick} />
        )
      )}

      {/* Admin section — only visible to admins */}
      {isAdmin && (
        <div className={cn("pt-1 mt-1 border-t border-border")}>
          {!collapsed && (
            <p className="text-[10px] font-semibold uppercase text-muted-foreground/50 px-3 py-1.5 tracking-wider">
              Administrator
            </p>
          )}
          <AdminGroup collapsed={collapsed} onItemClick={onItemClick} />
        </div>
      )}
    </nav>
  );
}

// ── Desktop sidebar ──────────────────────────────────────────────────────────

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const { user, logout } = useAuth();
  const { siteName, siteLogo } = useSiteConfig();

  return (
    <aside
      className={cn(
        "flex flex-col h-full bg-card border-r border-border transition-all duration-300 overflow-hidden",
        collapsed ? "w-16" : "w-56"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
        {collapsed ? (
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center mx-auto text-base leading-none overflow-hidden">
            {siteLogo ? (
              siteLogo.startsWith("/") || siteLogo.startsWith("http") ? (
                <img src={siteLogo} alt="Logo" className="w-full h-full object-cover" />
              ) : (
                siteLogo
              )
            ) : (
              <Zap className="w-4 h-4 text-white" />
            )}
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-base leading-none overflow-hidden">
                {siteLogo ? (
                  siteLogo.startsWith("/") || siteLogo.startsWith("http") ? (
                    <img src={siteLogo} alt="Logo" className="w-full h-full object-cover" />
                  ) : (
                    siteLogo
                  )
                ) : (
                  <Zap className="w-4 h-4 text-white" />
                )}
              </div>
              <span className="font-bold text-sm text-foreground">{siteName}</span>
            </div>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onToggle}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
          </>
        )}
      </div>

      {collapsed && (
        <div className="flex justify-center p-2 shrink-0">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onToggle}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      )}

      <SidebarContent collapsed={collapsed} />

      {/* Footer */}
      <div className="border-t border-border p-3 shrink-0">
        {!collapsed && user && (
          <div className="flex items-center gap-3 mb-3 px-1">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="bg-primary text-white text-xs">
                {user.name?.charAt(0).toUpperCase() ?? "U"}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{user.name}</p>
              <div className="flex items-center gap-1 flex-wrap">
                <Badge variant="secondary" className="text-xs capitalize">{user.plan ?? "free"}</Badge>
                {user.role === "admin" && (
                  <Badge className="text-xs bg-amber-500/15 text-amber-700 border-amber-300 dark:text-amber-400 dark:border-amber-700">Admin</Badge>
                )}
              </div>
            </div>
          </div>
        )}
        <Button
          variant="ghost"
          size={collapsed ? "icon" : "sm"}
          className={cn(
            "text-destructive hover:text-destructive hover:bg-destructive/10",
            collapsed ? "w-full" : "w-full justify-start gap-2"
          )}
          onClick={logout}
        >
          <LogOut className="w-4 h-4" />
          {!collapsed && "Logout"}
        </Button>
      </div>
    </aside>
  );
}

// ── Mobile sidebar ───────────────────────────────────────────────────────────

export function MobileSidebar() {
  const [open, setOpen] = useState(false);
  const { user, logout } = useAuth();
  const { siteName, siteLogo } = useSiteConfig();
  const close = () => setOpen(false);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  const overlay = open ? (
    <div className="fixed inset-0 z-[200]" style={{ position: "fixed", inset: 0, zIndex: 200 }}>
      <div
        className="absolute inset-0 bg-black/50"
        onClick={close}
        style={{ position: "absolute", inset: 0 }}
      />
      <div
        className="absolute left-0 top-0 bottom-0 w-60 bg-card border-r border-border flex flex-col"
        style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 240 }}
      >
        <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-base leading-none overflow-hidden">
              {siteLogo ? (
                siteLogo.startsWith("/") || siteLogo.startsWith("http") ? (
                  <img src={siteLogo} alt="Logo" className="w-full h-full object-cover" />
                ) : (
                  siteLogo
                )
              ) : (
                <Zap className="w-4 h-4 text-white" />
              )}
            </div>
            <span className="font-bold text-sm">{siteName}</span>
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={close}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
        </div>

        <SidebarContent collapsed={false} onItemClick={close} />

        <div className="border-t border-border p-3 shrink-0">
          {user && (
            <div className="flex items-center gap-3 mb-3 px-1">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-primary text-white text-xs">
                  {user.name?.charAt(0).toUpperCase() ?? "U"}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{user.name}</p>
                <div className="flex items-center gap-1 flex-wrap">
                  <Badge variant="secondary" className="text-xs capitalize">{user.plan ?? "free"}</Badge>
                  {user.role === "admin" && (
                    <Badge className="text-xs bg-amber-500/15 text-amber-700 border-amber-300 dark:text-amber-400 dark:border-amber-700">Admin</Badge>
                  )}
                </div>
              </div>
            </div>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2 text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={logout}
          >
            <LogOut className="w-4 h-4" />
            Logout
          </Button>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <>
      <Button variant="ghost" size="icon" onClick={() => setOpen(true)} className="md:hidden">
        <Menu className="w-5 h-5" />
      </Button>
      {typeof document !== "undefined" ? createPortal(overlay, document.body) : null}
    </>
  );
}

import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Smartphone,
  Send,
  Users,
  MessageSquare,
  Bot,
  Clock,
  Link2,
  BarChart3,
  Settings,
  CreditCard,
  Shield,
  Zap,
  Mail,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

const navigation = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "Perangkat", href: "/devices", icon: Smartphone },
  { label: "Kirim Pesan", href: "/send", icon: Send },
  { label: "Blast Pesan", href: "/bulk", icon: Mail },
  { label: "Jadwal", href: "/schedule", icon: Clock },
  { label: "Kontak", href: "/contacts", icon: Users },
  { label: "Auto Reply", href: "/auto-reply", icon: MessageSquare },
  { label: "Live Chat", href: "/live-chat", icon: MessageSquare },
  { label: "CS Bot AI", href: "/cs-bot", icon: Bot },
  { label: "Drip Campaign", href: "/drip", icon: Zap },
  { label: "Links", href: "/links", icon: Link2 },
  { label: "Analytics", href: "/analytics", icon: BarChart3 },
  { label: "Anti-Banned", href: "/anti-banned", icon: Shield },
  { label: "Langganan", href: "/billing", icon: CreditCard },
  { label: "Pengaturan", href: "/settings", icon: Settings },
];

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const [location] = useLocation();

  return (
    <aside
      className={cn(
        "h-screen flex flex-col bg-sidebar-bg text-sidebar-foreground border-r border-sidebar-border transition-all duration-200",
        collapsed ? "w-16" : "w-60"
      )}
    >
      {/* Logo */}
      <div className="h-14 flex items-center px-4 border-b border-sidebar-border">
        {!collapsed && (
          <span className="text-base font-semibold tracking-tight text-white">
            WaGataway
          </span>
        )}
        {collapsed && (
          <span className="text-base font-bold text-white mx-auto">W</span>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {navigation.map((item) => {
          const isActive =
            location === item.href ||
            (item.href !== "/" && location.startsWith(item.href));

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                isActive
                  ? "bg-white/10 text-white font-medium"
                  : "text-white/60 hover:text-white hover:bg-white/5"
              )}
            >
              <item.icon className="w-4 h-4 shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Collapse Toggle */}
      <div className="p-2 border-t border-sidebar-border">
        <button
          onClick={onToggle}
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

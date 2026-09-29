import { useState, type ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { cn } from "@/lib/utils";

interface DashboardLayoutProps {
  children: ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Mobile backdrop */}
      <div
        aria-hidden
        onClick={() => setMobileOpen(false)}
        className={cn(
          "fixed inset-0 z-40 bg-black/50 transition-opacity duration-200 lg:hidden",
          mobileOpen ? "opacity-100" : "pointer-events-none opacity-0"
        )}
      />

      {/* Sidebar: slide-over drawer on mobile, static on desktop */}
      <Sidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed((c) => !c)}
        mobileOpen={mobileOpen}
        onClose={() => setMobileOpen(false)}
      />

      {/* Main content area */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <TopBar onMenu={() => setMobileOpen(true)} />
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}

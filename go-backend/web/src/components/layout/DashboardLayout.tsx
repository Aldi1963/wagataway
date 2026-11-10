import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { PageTransitionLoader } from "@/components/ui/page-transition";
import { cn } from "@/lib/utils";

interface DashboardLayoutProps {
  children: ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [location] = useLocation();
  const [transitioning, setTransitioning] = useState(false);
  const firstRender = useRef(true);

  // Animasi loading cantik tiap ganti halaman
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    setTransitioning(true);
    const t = setTimeout(() => setTransitioning(false), 650);
    return () => clearTimeout(t);
  }, [location]);

  return (
    <div
      // h-dvh bukan h-screen: 100vh di Chrome Android melebihi viewport
      // terlihat saat address bar muncul -> window bisa ke-scroll dan
      // header ikut kegeser hilang. dvh mengikuti tinggi viewport aktual.
      className="flex h-screen supports-[height:100dvh]:h-dvh overflow-hidden bg-background"
    >
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
        <main className="relative flex-1 overflow-y-auto overflow-x-clip p-4 sm:p-6">
          {children}
          {/* Overlay animasi transisi halaman */}
          <div
            aria-hidden={!transitioning}
            className={cn(
              "absolute inset-0 z-30 flex items-center justify-center bg-background/80 backdrop-blur-sm transition-opacity duration-200",
              transitioning ? "opacity-100" : "pointer-events-none opacity-0"
            )}
          >
            <PageTransitionLoader />
          </div>
        </main>
      </div>
    </div>
  );
}

import { useLocation } from "wouter";
import Analytics from "./Analytics";
import Reports from "./Reports";
import { PageTabs } from "@/components/ui/tabs";

const TABS = [
  { id: "analytics", label: "Analytics", href: "/analytics" },
  { id: "broadcast", label: "Broadcast", href: "/reports" },
];

/** Halaman gabungan "Laporan": Analytics + Laporan Broadcast. */
export default function ReportHub() {
  const [location, navigate] = useLocation();
  const active = location === "/analytics" ? "analytics" : "broadcast";

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold">Laporan</h1>
        <p className="text-sm text-muted-foreground">
          Statistik penggunaan dan laporan pengiriman broadcast
        </p>
      </div>
      <PageTabs tabs={TABS} active={active} onSelect={(tab) => navigate(tab.href)} />
      {active === "analytics" ? <Analytics embedded /> : <Reports embedded />}
    </div>
  );
}

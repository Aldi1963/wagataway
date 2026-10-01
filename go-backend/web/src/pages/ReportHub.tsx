import { useLocation } from "wouter";
import Analytics from "./Analytics";
import Reports from "./Reports";
import { PageTabs } from "@/components/ui/tabs";
import { useLang } from "@/lib/i18n";

const TABS = [
  { id: "analytics", label: "Analytics", href: "/analytics" },
  { id: "broadcast", label: "Broadcast", href: "/reports" },
];

/** Halaman gabungan "Laporan": Analytics + Laporan Broadcast. */
export default function ReportHub() {
  const { t } = useLang();
  const [location, navigate] = useLocation();
  const active = location === "/analytics" ? "analytics" : "broadcast";

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold">{t("reportHub.title")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("reportHub.subtitle")}
        </p>
      </div>
      <PageTabs tabs={TABS} active={active} onSelect={(tab) => navigate(tab.href)} />
      {active === "analytics" ? <Analytics embedded /> : <Reports embedded />}
    </div>
  );
}

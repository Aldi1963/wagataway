import { useState } from "react";
import { useLocation } from "wouter";
import Schedule from "./Schedule";
import DripCampaign from "./DripCampaign";
import RecurringSchedules from "./RecurringSchedules";
import { PageTabs } from "@/components/ui/tabs";

const TABS = [
  { id: "terjadwal", label: "Terjadwal", href: "/schedule" },
  { id: "kalender", label: "Kalender", href: "/schedule" },
  { id: "drip", label: "Drip Campaign", href: "/drip" },
  { id: "berulang", label: "Berulang", href: "/recurring" },
];

/**
 * Halaman gabungan "Jadwal" — satu lapis tab: Terjadwal, Kalender, Drip Campaign, Berulang.
 * Tab Kalender memakai ulang tampilan kalender dari Schedule tanpa toggle kedua.
 * URL lama (/schedule, /drip, /recurring) tetap valid.
 */
export default function ScheduleHub() {
  const [location, navigate] = useLocation();
  const [tab, setTab] = useState<"terjadwal" | "kalender">("terjadwal");
  const active =
    location === "/drip" ? "drip" : location === "/recurring" ? "berulang" : tab;

  const select = (id: string) => {
    if (id === "drip") {
      navigate("/drip");
      return;
    }
    if (id === "berulang") {
      navigate("/recurring");
      return;
    }
    if (location === "/drip" || location === "/recurring") navigate("/schedule");
    setTab(id as "terjadwal" | "kalender");
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold">Jadwal</h1>
        <p className="text-sm text-muted-foreground">
          Pesan terjadwal, berulang, dan drip campaign otomatis
        </p>
      </div>
      <PageTabs tabs={TABS} active={active} onSelect={(t) => select(t.id)} />
      {active === "drip" ? (
        <DripCampaign embedded />
      ) : active === "berulang" ? (
        <RecurringSchedules embedded />
      ) : (
        <Schedule embedded forcedView={active === "kalender" ? "calendar" : "list"} />
      )}
    </div>
  );
}

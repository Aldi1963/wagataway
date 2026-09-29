import { useLocation } from "wouter";
import Schedule from "./Schedule";
import DripCampaign from "./DripCampaign";
import { PageTabs } from "@/components/ui/tabs";

const TABS = [
  { id: "terjadwal", label: "Terjadwal", href: "/schedule" },
  { id: "drip", label: "Drip Campaign", href: "/drip" },
];

/** Halaman gabungan "Jadwal": tab Terjadwal + Drip Campaign. URL lama tetap valid. */
export default function ScheduleHub() {
  const [location, navigate] = useLocation();
  const active = location === "/drip" ? "drip" : "terjadwal";

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold">Jadwal</h1>
        <p className="text-sm text-muted-foreground">
          Pesan terjadwal dan drip campaign otomatis
        </p>
      </div>
      <PageTabs tabs={TABS} active={active} onSelect={(tab) => navigate(tab.href)} />
      {active === "drip" ? <DripCampaign embedded /> : <Schedule embedded />}
    </div>
  );
}

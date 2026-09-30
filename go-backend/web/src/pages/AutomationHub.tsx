import { useLocation } from "wouter";
import AutoReply from "./AutoReply";
import AIReply from "./AIReply";
import GroupRules from "./GroupRules";
import { PageTabs } from "@/components/ui/tabs";

const TABS = [
  { id: "auto-reply", label: "Auto Reply", href: "/auto-reply" },
  { id: "ai-reply", label: "AI Reply", href: "/ai-reply" },
  { id: "group-rules", label: "Aturan Grup", href: "/group-rules" },
];

/** Halaman gabungan "Otomatisasi": Auto Reply + AI Reply + Aturan Grup. */
export default function AutomationHub() {
  const [location, navigate] = useLocation();
  const active =
    location === "/ai-reply"
      ? "ai-reply"
      : location === "/group-rules"
        ? "group-rules"
        : "auto-reply";

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold">Otomatisasi</h1>
        <p className="text-sm text-muted-foreground">
          Balasan otomatis dan aturan grup
        </p>
      </div>
      <PageTabs tabs={TABS} active={active} onSelect={(tab) => navigate(tab.href)} />
      {active === "ai-reply" ? (
        <AIReply embedded />
      ) : active === "group-rules" ? (
        <GroupRules embedded />
      ) : (
        <AutoReply embedded />
      )}
    </div>
  );
}

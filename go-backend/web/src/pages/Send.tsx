import { useLocation } from "wouter";
import SendMessage from "./SendMessage";
import BulkMessages from "./BulkMessages";
import Followups from "./Followups";
import TemplateHub from "./TemplateHub";
import Polls from "./Polls";
import { PageTabs } from "@/components/ui/tabs";
import GraceBanner from "@/components/GraceBanner";

const TABS = [
  { id: "kirim", label: "Kirim", href: "/send" },
  { id: "blast", label: "Blast", href: "/bulk" },
  { id: "polling", label: "Polling", href: "/polls" },
  { id: "followup", label: "Follow-up", href: "/followups" },
  { id: "template", label: "Template", href: "/templates" },
];

/** Halaman gabungan "Kirim Pesan": Kirim + Blast + Follow-up + Template. */
export default function Send() {
  const [location, navigate] = useLocation();
  const active =
    location === "/bulk"
      ? "blast"
      : location === "/polls"
        ? "polling"
        : location === "/followups"
          ? "followup"
          : location === "/templates" || location === "/canned-responses"
            ? "template"
            : "kirim";

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold">Kirim Pesan</h1>
        <p className="text-sm text-muted-foreground">
          Kirim pesan satuan, blast, polling, follow-up, atau pakai template
        </p>
      </div>
      <PageTabs tabs={TABS} active={active} onSelect={(tab) => navigate(tab.href)} />
      {/* Banner grace period / expired langganan (Fitur 5): tampil sebelum user kirim */}
      <GraceBanner />
      {active === "blast" ? (
        <BulkMessages embedded />
      ) : active === "polling" ? (
        <Polls embedded />
      ) : active === "followup" ? (
        <Followups embedded />
      ) : active === "template" ? (
        <TemplateHub embedded />
      ) : (
        <SendMessage embedded />
      )}
    </div>
  );
}

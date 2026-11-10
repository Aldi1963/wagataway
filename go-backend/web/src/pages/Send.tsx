import { useLocation } from "wouter";
import SendMessage from "./SendMessage";
import BulkMessages from "./BulkMessages";
import Followups from "./Followups";
import TemplateHub from "./TemplateHub";
import Polls from "./Polls";
import { PageTabs } from "@/components/ui/tabs";
import GraceBanner from "@/components/GraceBanner";
import { useLang } from "@/lib/i18n";

/** Halaman gabungan "Kirim Pesan": Kirim + Blast + Follow-up + Template. */
export default function Send() {
  const { t } = useLang();
  const [location, navigate] = useLocation();

  const TABS = [
    { id: "kirim", label: t("send.tabKirim"), href: "/send" },
    { id: "blast", label: t("send.tabBlast"), href: "/bulk" },
    { id: "polling", label: t("send.tabPolling"), href: "/polls" },
    { id: "followup", label: t("send.tabFollowup"), href: "/followups" },
    { id: "template", label: t("send.tabTemplate"), href: "/templates" },
  ];

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
        <h1 className="text-xl sm:text-2xl font-bold">{t("send.title")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("send.subtitle")}
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

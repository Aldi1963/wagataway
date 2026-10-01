import { useLocation } from "wouter";
import ApiDocs from "./ApiDocs";
import ApiPlayground from "./ApiPlayground";
import WebhookLogs from "./WebhookLogs";
import BotDeliveryLogs from "./BotDeliveryLogs";
import Integrations from "./Integrations";
import { PageTabs } from "@/components/ui/tabs";
import { useLang } from "@/lib/i18n";

/** Halaman gabungan "Developer": dokumentasi API, integration hub, playground, dan log webhook. */
export default function DeveloperHub() {
  const [location, navigate] = useLocation();
  const { t } = useLang();
  const TABS = [
    { id: "api-docs", label: "API Docs", href: "/developer" },
    { id: "integrations", label: t("developerHub.tabIntegrations"), href: "/integrations" },
    { id: "playground", label: "Playground", href: "/api-playground" },
    { id: "webhook-logs", label: "Webhook Logs", href: "/webhook-logs" },
    { id: "bot-logs", label: t("developerHub.tabBotHistory"), href: "/bot-logs" },
  ];
  const active =
    location === "/integrations"
      ? "integrations"
      : location === "/api-playground"
        ? "playground"
        : location === "/webhook-logs"
          ? "webhook-logs"
          : location === "/bot-logs"
            ? "bot-logs"
            : "api-docs";

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold">Developer</h1>
        <p className="text-sm text-muted-foreground">
          {t("developerHub.subtitle")}
        </p>
      </div>
      <PageTabs tabs={TABS} active={active} onSelect={(tab) => navigate(tab.href)} />
      {active === "integrations" ? (
        <Integrations embedded />
      ) : active === "playground" ? (
        <ApiPlayground embedded />
      ) : active === "webhook-logs" ? (
        <WebhookLogs embedded />
      ) : active === "bot-logs" ? (
        <BotDeliveryLogs embedded />
      ) : (
        <ApiDocs embedded />
      )}
    </div>
  );
}

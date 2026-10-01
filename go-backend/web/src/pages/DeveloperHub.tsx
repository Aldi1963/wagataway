import { useLocation } from "wouter";
import ApiDocs from "./ApiDocs";
import ApiPlayground from "./ApiPlayground";
import WebhookLogs from "./WebhookLogs";
import BotDeliveryLogs from "./BotDeliveryLogs";
import { PageTabs } from "@/components/ui/tabs";

const TABS = [
  { id: "api-docs", label: "API Docs", href: "/developer" },
  { id: "playground", label: "Playground", href: "/api-playground" },
  { id: "webhook-logs", label: "Webhook Logs", href: "/webhook-logs" },
  { id: "bot-logs", label: "Riwayat Bot", href: "/bot-logs" },
];

/** Halaman gabungan "Developer": dokumentasi API, playground, dan log webhook. */
export default function DeveloperHub() {
  const [location, navigate] = useLocation();
  const active =
    location === "/api-playground"
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
          Dokumentasi API, coba endpoint, dan pantau webhook
        </p>
      </div>
      <PageTabs tabs={TABS} active={active} onSelect={(tab) => navigate(tab.href)} />
      {active === "playground" ? (
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

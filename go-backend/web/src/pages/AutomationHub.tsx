import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Info } from "lucide-react";
import { useLang } from "@/lib/i18n";
import AutoReply from "./AutoReply";
import AIReply from "./AIReply";
import GroupRules from "./GroupRules";
import MenuBot from "./MenuBot";
import { PageTabs } from "@/components/ui/tabs";
import { apiGet } from "@/lib/api";
import { useActiveDevice } from "@/hooks/use-active-device";

/** Ringkasan jumlah otomatisasi yang aktif untuk perangkat aktif. */
function useAutomationSummary(tabKey: string) {
  const { activeDeviceId } = useActiveDevice();
  const [summary, setSummary] = useState({ autoReply: 0, menuBot: 0, aiReply: 0, groupRules: 0 });

  useEffect(() => {
    if (activeDeviceId == null) {
      setSummary({ autoReply: 0, menuBot: 0, aiReply: 0, groupRules: 0 });
      return;
    }
    let alive = true;
    Promise.allSettled([
      apiGet<{ rules: { deviceId: number | null; isActive: boolean }[] }>("/auto-reply"),
      apiGet<{ menuBots: { bot: { deviceId: number | null; isActive: boolean } }[] }>("/menu-bots"),
      apiGet<{ configs: { deviceId: number; isEnabled: boolean }[] }>("/ai-reply"),
      apiGet<{ rules: { deviceId: number; isActive: boolean }[] } | { deviceId: number; isActive: boolean }[]>("/group-rules"),
    ]).then(([ar, mb, ai, gr]) => {
      if (!alive) return;
      const rules = ar.status === "fulfilled" ? (ar.value.rules ?? []) : [];
      const bots = mb.status === "fulfilled" ? (mb.value.menuBots ?? []) : [];
      const cfgs = ai.status === "fulfilled" ? (ai.value.configs ?? []) : [];
      const grVal = gr.status === "fulfilled" ? gr.value : [];
      const grules = Array.isArray(grVal) ? grVal : (grVal.rules ?? []);
      setSummary({
        autoReply: rules.filter((r) => r.deviceId === activeDeviceId && r.isActive).length,
        menuBot: bots.filter((e) => e.bot.deviceId === activeDeviceId && e.bot.isActive).length,
        aiReply: cfgs.filter((c) => c.deviceId === activeDeviceId && c.isEnabled).length,
        groupRules: grules.filter((g) => g.deviceId === activeDeviceId && g.isActive).length,
      });
    });
    return () => {
      alive = false;
    };
  }, [activeDeviceId, tabKey]);

  return summary;
}

/** Halaman gabungan "Otomatisasi": Auto Reply + Menu Bot + AI Reply + Aturan Grup. */
export default function AutomationHub() {
  const { t } = useLang();
  const [location, navigate] = useLocation();
  const TABS = [
    { id: "auto-reply", label: "Auto Reply", href: "/auto-reply" },
    { id: "menu-bot", label: "Menu Bot", href: "/menu-bot" },
    { id: "ai-reply", label: "AI Reply", href: "/ai-reply" },
    { id: "group-rules", label: t("automationHub.groupRulesTab"), href: "/group-rules" },
  ];
  const active =
    location === "/menu-bot"
      ? "menu-bot"
      : location === "/ai-reply"
        ? "ai-reply"
        : location === "/group-rules"
          ? "group-rules"
          : "auto-reply";
  const { activeDevice, activeDeviceId } = useActiveDevice();
  const summary = useAutomationSummary(active);

  const stats = [
    { label: "Auto Reply", value: summary.autoReply },
    { label: "Menu Bot", value: summary.menuBot },
    { label: "AI Reply", value: summary.aiReply },
    { label: t("automationHub.groupRulesTab"), value: summary.groupRules },
  ];

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold">{t("automationHub.title")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("automationHub.subtitle")}
        </p>
      </div>

      {activeDeviceId != null && (
        <div className="rounded-lg border border-border px-4 py-3">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs">
            <span className="text-muted-foreground">
              {t("automationHub.activeOnPrefix")}{" "}
              <span className="font-medium text-foreground">{activeDevice?.name || `#${activeDeviceId}`}</span>
              {t("automationHub.activeOnSuffix")}
            </span>
            {stats.map((s) => (
              <span key={s.label} className="inline-flex items-center gap-1.5">
                <span
                  className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold ${
                    s.value > 0 ? "bg-[#243370] text-white" : "bg-muted text-muted-foreground"
                  }`}
                >
                  {s.value}
                </span>
                <span className="text-muted-foreground">{s.label}</span>
              </span>
            ))}
          </div>
          <p className="mt-2 flex items-start gap-1.5 text-[11px] text-muted-foreground">
            <Info className="w-3.5 h-3.5 mt-px shrink-0" />
            <span>
              {t("automationHub.orderHint")}
            </span>
          </p>
        </div>
      )}

      <PageTabs tabs={TABS} active={active} onSelect={(tab) => navigate(tab.href)} />
      {active === "menu-bot" ? (
        <MenuBot embedded />
      ) : active === "ai-reply" ? (
        <AIReply embedded />
      ) : active === "group-rules" ? (
        <GroupRules embedded />
      ) : (
        <AutoReply embedded />
      )}
    </div>
  );
}

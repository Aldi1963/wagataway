import { useLocation } from "wouter";
import LiveChat from "./LiveChat";
import ChatLabels from "./ChatLabels";
import { PageTabs } from "@/components/ui/tabs";
import { useLang } from "@/lib/i18n";

/** Halaman gabungan "Live Chat": daftar chat + label & assign. */
export default function LiveChatHub() {
  const { t } = useLang();
  const [location, navigate] = useLocation();
  const active = location === "/chat-labels" ? "labels" : "chat";
  const TABS = [
    { id: "chat", label: t("liveChatHub.tabChat"), href: "/live-chat" },
    { id: "labels", label: t("liveChatHub.tabLabelsAssign"), href: "/chat-labels" },
  ];

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold">Live Chat</h1>
        <p className="text-sm text-muted-foreground">{t("liveChatHub.subtitle")}</p>
      </div>
      <PageTabs tabs={TABS} active={active} onSelect={(tab) => navigate(tab.href)} />
      {active === "labels" ? <ChatLabels embedded /> : <LiveChat embedded />}
    </div>
  );
}

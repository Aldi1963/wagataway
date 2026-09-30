import { useLocation } from "wouter";
import LiveChat from "./LiveChat";
import ChatLabels from "./ChatLabels";
import { PageTabs } from "@/components/ui/tabs";

const TABS = [
  { id: "chat", label: "Chat", href: "/live-chat" },
  { id: "labels", label: "Label & Assign", href: "/chat-labels" },
];

/** Halaman gabungan "Live Chat": daftar chat + label & assign. */
export default function LiveChatHub() {
  const [location, navigate] = useLocation();
  const active = location === "/chat-labels" ? "labels" : "chat";

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold">Live Chat</h1>
        <p className="text-sm text-muted-foreground">
          Balas chat pelanggan dan kelola label
        </p>
      </div>
      <PageTabs tabs={TABS} active={active} onSelect={(tab) => navigate(tab.href)} />
      {active === "labels" ? <ChatLabels embedded /> : <LiveChat embedded />}
    </div>
  );
}

import { useState, useEffect, useRef } from "react";
import { Send, Bot, User, Wifi, Search, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { apiGet, apiPost } from "@/lib/api";

interface Conversation {
  id: number;
  phone: string;
  contactName: string;
  lastMessage: string;
  unreadCount: number;
  lastActivity: string;
}

interface ChatMsg {
  id: number;
  phone: string;
  content: string;
  type: string;
  direction: "in" | "out";
  isRead: boolean;
  createdAt: string;
}

export default function LiveChat() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activePhone, setActivePhone] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [aiMode, setAiMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load conversations
  useEffect(() => {
    apiGet<{ conversations: Conversation[] }>("/chat/conversations")
      .then((d) => setConversations(d.conversations || []))
      .catch(() => {});
  }, []);

  // Load messages when active phone changes
  useEffect(() => {
    if (!activePhone) return;
    apiGet<{ messages: ChatMsg[] }>(`/chat/messages/${activePhone}`)
      .then((d) => setMessages(d.messages || []))
      .catch(() => {});
    // Mark as read
    apiPost(`/chat/conversations/${activePhone}/read`).catch(() => {});
  }, [activePhone]);

  // SSE for real-time messages
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;
    const es = new EventSource(`/api/stream?token=${token}`);
    es.addEventListener("chat:message", (e) => {
      const data = JSON.parse(e.data);
      if (data.phone === activePhone) {
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now(),
            phone: data.phone,
            content: data.content,
            type: data.type || "text",
            direction: data.direction,
            isRead: true,
            createdAt: new Date().toISOString(),
          },
        ]);
      }
      // Update conversation list
      setConversations((prev) =>
        prev.map((c) =>
          c.phone === data.phone
            ? { ...c, lastMessage: data.content, lastActivity: new Date().toISOString() }
            : c
        )
      );
    });
    return () => es.close();
  }, [activePhone]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || !activePhone) return;
    setLoading(true);
    try {
      if (aiMode) {
        await apiPost("/chat/ai-reply", {
          deviceId: 1,
          phone: activePhone,
        });
      } else {
        await apiPost("/chat/send", {
          deviceId: 1,
          phone: activePhone,
          content: input,
          type: "text",
        });
      }
      setInput("");
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleAIReply = async () => {
    if (!activePhone) return;
    setLoading(true);
    try {
      await apiPost("/chat/ai-reply", {
        deviceId: 1,
        phone: activePhone,
      });
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const filteredConvos = conversations.filter(
    (c) =>
      c.phone.includes(search) ||
      c.contactName?.toLowerCase().includes(search.toLowerCase())
  );

  const activeConvo = conversations.find((c) => c.phone === activePhone);

  return (
    <div className="flex h-[calc(100vh-7rem)] border border-border rounded-lg overflow-hidden">
      {/* ── Conversation List ─────────────────────────── */}
      <div className="w-80 border-r border-border flex flex-col bg-card">
        {/* Search */}
        <div className="p-3 border-b border-border">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              placeholder="Cari percakapan..."
              className="pl-8 h-8 text-xs"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {filteredConvos.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground">
              Belum ada percakapan
            </div>
          ) : (
            filteredConvos.map((convo) => (
              <button
                key={convo.phone}
                onClick={() => setActivePhone(convo.phone)}
                className={cn(
                  "w-full flex items-start gap-3 px-3 py-3 border-b border-border text-left transition-colors",
                  activePhone === convo.phone
                    ? "bg-secondary"
                    : "hover:bg-secondary/50"
                )}
              >
                <div className="w-8 h-8 rounded-full bg-foreground text-background flex items-center justify-center text-xs font-semibold shrink-0">
                  {(convo.contactName || convo.phone).charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-foreground truncate">
                      {convo.contactName || convo.phone}
                    </span>
                    {convo.unreadCount > 0 && (
                      <Badge className="h-4 px-1.5 text-[9px]">
                        {convo.unreadCount}
                      </Badge>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                    {convo.lastMessage}
                  </p>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* ── Chat Area ────────────────────────────────── */}
      <div className="flex-1 flex flex-col">
        {activePhone ? (
          <>
            {/* Chat Header */}
            <div className="h-12 flex items-center justify-between px-4 border-b border-border bg-card">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-foreground text-background flex items-center justify-center text-xs font-semibold">
                  {(activeConvo?.contactName || activePhone).charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-xs font-semibold text-foreground">
                    {activeConvo?.contactName || activePhone}
                  </p>
                  <p className="text-[10px] text-muted-foreground font-mono">
                    {activePhone}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                {/* AI Toggle */}
                <Button
                  variant={aiMode ? "default" : "outline"}
                  size="sm"
                  className="h-7 text-[10px] gap-1"
                  onClick={() => setAiMode(!aiMode)}
                >
                  <Bot className="w-3 h-3" />
                  {aiMode ? "AI Aktif" : "AI Mati"}
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7">
                  <MoreHorizontal className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-background">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={cn(
                    "flex",
                    msg.direction === "out" ? "justify-end" : "justify-start"
                  )}
                >
                  <div
                    className={cn(
                      "max-w-[70%] rounded-lg px-3 py-2 text-sm",
                      msg.direction === "out"
                        ? "bg-foreground text-background"
                        : "bg-secondary text-foreground border border-border"
                    )}
                  >
                    <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                    <p
                      className={cn(
                        "text-[9px] mt-1",
                        msg.direction === "out"
                          ? "text-background/60"
                          : "text-muted-foreground"
                      )}
                    >
                      {new Date(msg.createdAt).toLocaleTimeString("id-ID", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="p-3 border-t border-border bg-card flex items-center gap-2">
              {aiMode ? (
                <Button
                  onClick={handleAIReply}
                  disabled={loading}
                  className="flex-1 gap-2"
                >
                  <Bot className="w-4 h-4" />
                  {loading ? "Generating..." : "Generate AI Reply"}
                </Button>
              ) : (
                <>
                  <Input
                    placeholder="Ketik pesan..."
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
                    className="flex-1 h-9"
                    disabled={loading}
                  />
                  <Button
                    size="icon"
                    onClick={handleSend}
                    disabled={!input.trim() || loading}
                  >
                    <Send className="w-4 h-4" />
                  </Button>
                </>
              )}
            </div>
          </>
        ) : (
          /* Empty State */
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center mx-auto mb-3">
                <Wifi className="w-5 h-5 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-foreground">Live Chat</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-[200px]">
                Pilih percakapan di sebelah kiri untuk mulai membalas
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

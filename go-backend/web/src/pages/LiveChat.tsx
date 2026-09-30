import { useState, useEffect, useRef } from "react";
import { Send, Bot, Wifi, Search, MoreHorizontal, ArrowLeft, Zap, X, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { apiGet, apiPost } from "@/lib/api";
import { toast } from "sonner";

interface Template {
  id: number;
  name: string;
  category: string;
  content: string;
}

interface Conversation {
  id: number;
  phone: string;
  contactName: string;
  lastMessage: string;
  unreadCount: number;
  lastActivity: string;
  deviceId: number;
}

interface Device {
  id: number;
  name: string;
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
  const [devices, setDevices] = useState<Device[]>([]);
  const [deviceFilter, setDeviceFilter] = useState<number | null>(null);
  const [devicesFailed, setDevicesFailed] = useState(false);
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  /** Bunyi beep sederhana via Web Audio API (tanpa file eksternal). */
  const playNotificationSound = () => {
    // Hanya bunyi bila tab sedang terlihat — browser pun memblokir audio saat tab tersembunyi.
    if (document.visibilityState !== "visible") return;
    try {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      if (!audioCtxRef.current) audioCtxRef.current = new AC();
      const ctx = audioCtxRef.current;
      if (ctx.state === "suspended") void ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.value = 880;
      const t = ctx.currentTime;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.4, t + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      osc.start(t);
      osc.stop(t + 0.4);
    } catch {
      /* abaikan: audio tidak tersedia */
    }
  };

  const toggleQuickReplies = () => {
    const next = !showQuickReplies;
    setShowQuickReplies(next);
    if (next && templates.length === 0) {
      setLoadingTemplates(true);
      apiGet<{ templates: Template[] }>("/templates")
        .then((d) => setTemplates(d.templates || []))
        .catch(() => {})
        .finally(() => setLoadingTemplates(false));
    }
  };

  const insertTemplate = (t: Template) => {
    setInput((prev) => (prev ? prev + "\n" + t.content : t.content));
    setShowQuickReplies(false);
  };

  const loadConversations = (devId: number | null) => {
    const q = devId != null ? `?deviceId=${devId}` : "";
    apiGet<{ conversations: Conversation[] }>(`/chat/conversations${q}`)
      .then((d) => setConversations(d.conversations || []))
      .catch(() => {});
  };

  // Load conversations (awal: semua perangkat)
  useEffect(() => {
    loadConversations(null);
  }, []);

  // Load daftar device untuk filter per-perangkat
  useEffect(() => {
    apiGet<{ devices: Device[] }>("/devices")
      .then((d) => setDevices(d.devices || []))
      .catch(() => setDevicesFailed(true));
  }, []);

  const handleDeviceChange = (val: string) => {
    const devId = val === "all" ? null : Number(val);
    setDeviceFilter(devId);
    loadConversations(devId);
  };

  const deviceName = (id: number) => devices.find((d) => d.id === id)?.name;

  // Load messages when active phone changes
  useEffect(() => {
    if (!activePhone) return;
    apiGet<{ messages: ChatMsg[] }>(`/chat/messages/${activePhone}`)
      .then((d) => setMessages(d.messages || []))
      .catch(() => {});
    // Mark as read
    apiPost(`/chat/conversations/${activePhone}/read`).catch(() => {});
    setConversations((prev) =>
      prev.map((c) => (c.phone === activePhone ? { ...c, unreadCount: 0 } : c))
    );
  }, [activePhone]);

  // SSE for real-time messages (auth via single-use ticket, bukan JWT di URL)
  useEffect(() => {
    let es: EventSource | null = null;
    let cancelled = false;
    let gotMessage = false;
    apiPost<{ ticket: string }>("/sse/ticket")
      .then(({ ticket }) => {
        if (cancelled) return;
        es = new EventSource(`/api/stream?ticket=${ticket}`);
        es.onerror = () => {
          // Ticket salah/kedaluwarsa: jangan retry berulang
          if (!gotMessage) es?.close();
        };
        es.addEventListener("chat:message", (e) => {
      const data = JSON.parse(e.data);
      const isActiveConvo = data.phone === activePhone;
      if (isActiveConvo) {
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
      // Update conversation list; naikkan badge unread untuk pesan masuk di percakapan lain
      setConversations((prev) =>
        prev.map((c) =>
          c.phone === data.phone
            ? {
                ...c,
                lastMessage: data.content,
                lastActivity: new Date().toISOString(),
                unreadCount:
                  !isActiveConvo && data.direction === "in"
                    ? c.unreadCount + 1
                    : c.unreadCount,
              }
            : c
        )
      );
      if (data.direction === "in") playNotificationSound();
        gotMessage = true;
      });
      })
      .catch(() => {
        if (!cancelled) toast.error("Gagal membuka koneksi real-time");
      });
    return () => {
      cancelled = true;
      es?.close();
    };
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
      <div className={cn(
        "border-r border-border flex-col bg-card",
        activePhone ? "hidden md:flex md:w-80" : "flex w-full md:w-80"
      )}>
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
          {!devicesFailed && devices.length > 0 && (
            <select
              aria-label="Filter perangkat"
              value={deviceFilter == null ? "all" : String(deviceFilter)}
              onChange={(e) => handleDeviceChange(e.target.value)}
              className="mt-2 w-full h-8 text-xs rounded-md border border-input bg-background px-2 text-foreground"
            >
              <option value="all">Semua Perangkat</option>
              {devices.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          )}
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
                  {deviceName(convo.deviceId) && (
                    <p className="text-[9px] text-muted-foreground/80 truncate mt-0.5 flex items-center gap-1">
                      <Smartphone className="w-2.5 h-2.5 shrink-0" />
                      {deviceName(convo.deviceId)}
                    </p>
                  )}
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* ── Chat Area ────────────────────────────────── */}
      <div className={cn("flex-1 flex-col", activePhone ? "flex" : "hidden md:flex")}>
        {activePhone ? (
          <>
            {/* Chat Header */}
            <div className="h-12 flex items-center justify-between px-4 border-b border-border bg-card">
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Kembali"
                  onClick={() => setActivePhone(null)}
                  className="md:hidden -ml-2 h-8 w-8 shrink-0"
                >
                  <ArrowLeft className="w-4 h-4" />
                </Button>
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
            <div className="p-3 border-t border-border bg-card relative">
              {/* Quick replies popover */}
              {showQuickReplies && (
                <div className="absolute left-3 right-3 bottom-full mb-2 z-20 rounded-lg border border-border bg-card shadow-xl max-h-64 overflow-y-auto">
                  <div className="flex items-center justify-between px-3 py-2 border-b border-border sticky top-0 bg-card">
                    <p className="text-xs font-semibold text-foreground">Balasan cepat</p>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => setShowQuickReplies(false)}
                      aria-label="Tutup balasan cepat"
                    >
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                  {loadingTemplates ? (
                    <div className="p-3 space-y-2">
                      {[0, 1].map((i) => (
                        <div key={i} className="h-10 rounded bg-secondary animate-pulse" />
                      ))}
                    </div>
                  ) : templates.length === 0 ? (
                    <p className="p-4 text-xs text-muted-foreground text-center">
                      Belum ada template. Buat di menu Templates.
                    </p>
                  ) : (
                    <div className="p-1.5">
                      {templates.map((t) => (
                        <button
                          key={t.id}
                          onClick={() => insertTemplate(t)}
                          className="w-full text-left px-2.5 py-2 rounded-md hover:bg-secondary transition-colors"
                        >
                          <p className="text-xs font-medium text-foreground">{t.name}</p>
                          <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                            {t.content}
                          </p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <div className="flex items-center gap-2">
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
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 shrink-0"
                    onClick={toggleQuickReplies}
                    aria-label="Balasan cepat"
                    title="Balasan cepat"
                  >
                    <Zap className="w-4 h-4" />
                  </Button>
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

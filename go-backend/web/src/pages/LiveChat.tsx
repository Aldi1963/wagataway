import { useState, useEffect, useRef } from "react";
import { Send, Bot, Wifi, Search, MoreHorizontal, ArrowLeft, Zap, X, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { apiGet, apiPatch, apiPost, apiFetch } from "@/lib/api";
import { toast } from "sonner";
import { useActiveDevice } from "@/hooks/use-active-device";

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

interface ChatMsg {
  id: number;
  phone: string;
  content: string;
  type: string;
  direction: "in" | "out";
  isRead: boolean;
  createdAt: string;
}

// Avatar kontak: coba foto profil WA asli, fallback ke inisial nama.
// Cache foto profil per device+phone + antrean max 3 fetch bersamaan
// (daftar percakapan bisa puluhan baris; jangan hantam WhatsApp sekaligus).
const photoCache = new Map<string, string | null>();
const photoQueue: (() => void)[] = [];
let photoQueueRunning = 0;
function pumpPhotoQueue() {
  while (photoQueueRunning < 3 && photoQueue.length > 0) {
    const job = photoQueue.shift()!;
    photoQueueRunning++;
    job();
  }
}

function ChatAvatar({
  deviceId,
  phone,
  name,
  size = "w-8 h-8",
  textSize = "text-xs",
}: {
  deviceId: number | null;
  phone: string;
  name: string;
  size?: string;
  textSize?: string;
}) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  useEffect(() => {
    if (deviceId == null || !phone) {
      setPhotoUrl(null);
      return;
    }
    const key = `${deviceId}:${phone}`;
    if (photoCache.has(key)) {
      setPhotoUrl(photoCache.get(key) ?? null);
      return;
    }
    let alive = true;
    const ctrl = new AbortController();
    const run = async () => {
      try {
        const res = await apiFetch(
          `/chat/profile-pic?deviceId=${deviceId}&phone=${encodeURIComponent(phone)}`,
          { signal: ctrl.signal }
        );
        if (!res.ok) {
          photoCache.set(key, null);
          return;
        }
        const blob = await res.blob();
        if (alive && blob.size > 0) {
          const url = URL.createObjectURL(blob);
          photoCache.set(key, url);
          setPhotoUrl(url);
        } else {
          photoCache.set(key, null);
        }
      } catch {
        photoCache.set(key, null);
      } finally {
        photoQueueRunning--;
        pumpPhotoQueue();
      }
    };
    photoQueue.push(run);
    pumpPhotoQueue();
    return () => {
      alive = false;
      ctrl.abort();
      const i = photoQueue.indexOf(run);
      if (i >= 0) photoQueue.splice(i, 1);
    };
  }, [deviceId, phone]);
  useEffect(() => {
    return () => {
      if (photoUrl) URL.revokeObjectURL(photoUrl);
    };
  }, [photoUrl]);

  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt={name}
        className={cn(size, "rounded-full object-cover shrink-0")}
      />
    );
  }
  return (
    <div
      className={cn(
        size,
        "rounded-full bg-[#243370] dark:bg-[#4c63d2] text-white flex items-center justify-center font-semibold shrink-0",
        textSize
      )}
    >
      {(name || phone).charAt(0).toUpperCase()}
    </div>
  );
}

export default function LiveChat({ embedded: _embedded = false }: { embedded?: boolean }) {
  const { activeDeviceId } = useActiveDevice();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activePhone, setActivePhone] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [aiMode, setAiMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [copied, setCopied] = useState(false);
  const infoRef = useRef<HTMLDivElement>(null);
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

  // Conversations selalu mengikuti perangkat aktif di sidebar
  useEffect(() => {
    setActivePhone(null);
    setMessages([]);
    if (activeDeviceId == null) {
      setConversations([]);
      return;
    }
    apiGet<{ conversations: Conversation[] }>(`/chat/conversations?deviceId=${activeDeviceId}`)
      .then((d) => setConversations(d.conversations || []))
      .catch(() => {});
  }, [activeDeviceId]);

  // Load messages when active phone changes
  useEffect(() => {
    if (!activePhone) return;
    apiGet<{ messages: ChatMsg[] }>(`/chat/messages/${activePhone}`)
      .then((d) => setMessages(d.messages || []))
      .catch(() => {});
    // Mark as read (backend: PATCH)
    apiPatch(`/chat/conversations/${activePhone}/read`).catch(() => {});
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

  // Panel info kontak: tutup saat klik di luar & saat ganti percakapan
  useEffect(() => {
    setShowInfo(false);
    setCopied(false);
  }, [activePhone]);
  useEffect(() => {
    if (!showInfo) return;
    const onDown = (e: MouseEvent) => {
      if (infoRef.current && !infoRef.current.contains(e.target as Node)) setShowInfo(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [showInfo]);

  const copyPhone = async () => {
    if (!activePhone) return;
    try {
      await navigator.clipboard.writeText(activePhone);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Gagal menyalin nomor");
    }
  };

  const handleSend = async () => {
    if (!input.trim() || !activePhone) return;
    if (activeDeviceId == null) {
      toast.error("Pilih perangkat aktif di sidebar dulu");
      return;
    }
    setLoading(true);
    try {
      if (aiMode) {
        await apiPost("/chat/ai-reply", {
          deviceId: activeDeviceId,
          phone: activePhone,
        });
      } else {
        await apiPost("/chat/send", {
          deviceId: activeDeviceId,
          phone: activePhone,
          content: input,
          type: "text",
        });
      }
      setInput("");
    } catch (err: any) {
      toast.error(err?.message || "Gagal mengirim pesan");
    } finally {
      setLoading(false);
    }
  };

  const handleAIReply = async () => {
    if (!activePhone) return;
    if (activeDeviceId == null) {
      toast.error("Pilih perangkat aktif di sidebar dulu");
      return;
    }
    setLoading(true);
    try {
      await apiPost("/chat/ai-reply", {
        deviceId: activeDeviceId,
        phone: activePhone,
      });
    } catch (err: any) {
      toast.error(err?.message || "Gagal meminta balasan AI");
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
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {activeDeviceId == null ? (
            <div className="p-6 text-center text-xs text-muted-foreground">
              Pilih perangkat aktif di sidebar dulu
            </div>
          ) : filteredConvos.length === 0 ? (
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
                <ChatAvatar
                  deviceId={activeDeviceId}
                  phone={convo.phone}
                  name={convo.contactName || convo.phone}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-foreground truncate">
                      {convo.contactName || convo.phone}
                    </span>
                    {convo.unreadCount > 0 && (
                      <Badge className="h-4 px-1.5 text-[9px] bg-[#243370] dark:bg-[#4c63d2] text-white border-transparent">
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
      <div className={cn("flex-1 flex-col min-w-0", activePhone ? "flex" : "hidden md:flex")}>
        {activePhone ? (
          <>
            {/* Chat Header */}
            <div className="min-h-12 flex items-center justify-between gap-2 px-4 py-1.5 border-b border-border bg-card">
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Kembali"
                  onClick={() => setActivePhone(null)}
                  className="md:hidden -ml-2 h-8 w-8 shrink-0"
                >
                  <ArrowLeft className="w-4 h-4" />
                </Button>
                <ChatAvatar
                  deviceId={activeDeviceId}
                  phone={activePhone}
                  name={activeConvo?.contactName || activePhone}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground truncate leading-tight">
                    {activeConvo?.contactName || activePhone}
                  </p>
                  <p className="text-[11px] text-muted-foreground font-mono truncate">
                    {activePhone}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
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
                <div className="relative" ref={infoRef}>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    aria-label="Info kontak"
                    title="Info kontak"
                    onClick={() => setShowInfo((v) => !v)}
                  >
                    <MoreHorizontal className="w-4 h-4" />
                  </Button>
                  {showInfo && (
                    <div className="absolute right-0 top-full mt-2 w-64 rounded-lg border border-border bg-card shadow-xl z-30 p-4">
                      <div className="flex flex-col items-center text-center">
                        <ChatAvatar
                          deviceId={activeDeviceId}
                          phone={activePhone}
                          name={activeConvo?.contactName || activePhone}
                          size="w-16 h-16"
                          textSize="text-xl"
                        />
                        <p className="mt-2.5 text-sm font-semibold text-foreground break-words">
                          {activeConvo?.contactName || activePhone}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground font-mono">
                          {activePhone}
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-3 h-7 text-[11px] gap-1.5"
                          onClick={copyPhone}
                        >
                          {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                          {copied ? "Tersalin" : "Salin nomor"}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
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

import { useState, useEffect, useRef } from "react";
import { Send, Bot, Search, MessageCircle, MoreHorizontal, ArrowLeft, Zap, X, Copy, Check, Pin, PinOff, Archive, ArchiveRestore, CircleCheck, Circle, Tag, ChevronUp, ChevronDown, Camera, Video, Mic, FileText, Smile } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { apiGet, apiPatch, apiPost, apiDelete, apiFetch } from "@/lib/api";
import { toast } from "sonner";
import { useActiveDevice } from "@/hooks/use-active-device";
import { useLang } from "@/lib/i18n";

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
  lastMessageType?: string;
  isPinned?: boolean;
  status?: string;
  unreadCount: number;
  lastActivity: string;
  deviceId: number;
}

interface ChatLabel {
  id: number;
  name: string;
  color: string;
}

interface ChatAssignment {
  id: number;
  chatJid: string;
  labelId?: number | null;
  label?: ChatLabel | null;
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

// Waktu relatif: "baru saja", "5 mnt lalu", dst.
function timeAgo(iso: string, t: (k: string) => string): string {
  const d = new Date(iso).getTime();
  if (isNaN(d)) return "";
  const s = Math.max(0, Math.floor((Date.now() - d) / 1000));
  if (s < 60) return t("liveChat.justNow");
  const m = Math.floor(s / 60);
  if (m < 60) return t("liveChat.minutesAgo").replace("{n}", String(m));
  const h = Math.floor(m / 60);
  if (h < 24) return t("liveChat.hoursAgo").replace("{n}", String(h));
  const days = Math.floor(h / 24);
  if (days === 1) return t("liveChat.yesterday");
  if (days < 7) return t("liveChat.daysAgo").replace("{n}", String(days));
  return new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "short" });
}

// Samakan nomor: buang semua non-digit agar chatJid label cocok dengan phone.
function normPhone(p: string): string {
  return (p || "").replace(/\D/g, "");
}

// Preview pesan terakhir yang sadar media: "📷 Foto" dsb.
function MediaPreview({ type, text, t }: { type?: string; text: string; t: (k: string) => string }) {
  if (!type || type === "text") {
    return <>{text}</>;
  }
  const map: Record<string, { icon: React.ReactNode; label: string }> = {
    image: { icon: <Camera className="w-3 h-3" />, label: t("liveChat.msgImage") },
    video: { icon: <Video className="w-3 h-3" />, label: t("liveChat.msgVideo") },
    audio: { icon: <Mic className="w-3 h-3" />, label: t("liveChat.msgAudio") },
    document: { icon: <FileText className="w-3 h-3" />, label: t("liveChat.msgDocument") },
    sticker: { icon: <Smile className="w-3 h-3" />, label: t("liveChat.msgSticker") },
  };
  const m = map[type];
  if (!m) return <>{text}</>;
  return (
    <span className="inline-flex items-center gap-1">
      {m.icon}
      <span className="italic">{m.label}</span>
      {text ? <span className="not-italic"> · {text}</span> : null}
    </span>
  );
}

export default function LiveChat({ embedded: _embedded = false }: { embedded?: boolean }) {
  const { activeDeviceId } = useActiveDevice();
  const { t } = useLang();
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
  // Fitur batch: filter status, label, semat, cari dalam percakapan
  const [statusFilter, setStatusFilter] = useState<"open" | "done" | "archived">("open");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [labels, setLabels] = useState<ChatLabel[]>([]);
  const [assignments, setAssignments] = useState<ChatAssignment[]>([]);
  const [msgSearchOpen, setMsgSearchOpen] = useState(false);
  const [msgQuery, setMsgQuery] = useState("");
  const [msgMatchIdx, setMsgMatchIdx] = useState(0);
  const msgRefs = useRef<Map<number, HTMLDivElement>>(new Map());
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

  // Conversations selalu mengikuti perangkat aktif di sidebar + filter status
  const loadConversations = (status: string, deviceId: number | null) => {
    if (deviceId == null) {
      setConversations([]);
      return;
    }
    apiGet<{ conversations: Conversation[] }>(
      `/chat/conversations?deviceId=${deviceId}&status=${status}`
    )
      .then((d) => setConversations(d.conversations || []))
      .catch(() => {});
  };

  useEffect(() => {
    setActivePhone(null);
    setMessages([]);
    loadConversations(statusFilter, activeDeviceId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDeviceId, statusFilter]);

  // Label + assignment untuk badge terlihat di daftar
  useEffect(() => {
    apiGet<{ labels: ChatLabel[] }>("/chat-labels")
      .then((d) => setLabels(d.labels || []))
      .catch(() => {});
    apiGet<{ assignments: ChatAssignment[] }>("/chat-assignments?limit=200")
      .then((d) => setAssignments(d.assignments || []))
      .catch(() => {});
  }, []);

  const reloadAssignments = () => {
    apiGet<{ assignments: ChatAssignment[] }>("/chat-assignments?limit=200")
      .then((d) => setAssignments(d.assignments || []))
      .catch(() => {});
  };

  const labelsForPhone = (phone: string): ChatLabel[] => {
    const np = normPhone(phone);
    const out: ChatLabel[] = [];
    for (const a of assignments) {
      if (normPhone(a.chatJid) !== np) continue;
      if (a.label) out.push(a.label);
      else if (a.labelId) {
        const l = labels.find((x) => x.id === a.labelId);
        if (l) out.push(l);
      }
    }
    return out;
  };

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
                lastMessageType: data.type || "text",
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
        if (!cancelled) toast.error(t("liveChat.realtimeError"));
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
      toast.error(t("liveChat.copyError"));
    }
  };

  // ── Aksi percakapan: semat, status, label ──
  const togglePin = async () => {
    if (!activePhone || !activeConvo) return;
    const next = !activeConvo.isPinned;
    try {
      await apiPatch(`/chat/conversations/${activePhone}/pin`, { pinned: next });
      setConversations((prev) =>
        prev
          .map((c) => (c.phone === activePhone ? { ...c, isPinned: next } : c))
          .sort((a, b) => Number(b.isPinned || false) - Number(a.isPinned || false))
      );
      toast.success(next ? t("liveChat.pinned") : t("liveChat.unpinned"));
    } catch (e: any) {
      toast.error(e?.message || t("liveChat.actionFailed"));
    }
  };

  const changeStatus = async (status: "open" | "done" | "archived") => {
    if (!activePhone) return;
    try {
      await apiPatch(`/chat/conversations/${activePhone}/status`, { status });
      // Hilang dari daftar saat ini (kecuali dibuka lagi)
      setConversations((prev) => prev.filter((c) => c.phone !== activePhone));
      setActivePhone(null);
      toast.success(t("liveChat.statusChanged"));
    } catch (e: any) {
      toast.error(e?.message || t("liveChat.actionFailed"));
    }
  };

  const toggleLabel = async (label: ChatLabel) => {
    if (!activePhone) return;
    const np = normPhone(activePhone);
    const existing = assignments.find(
      (a) => normPhone(a.chatJid) === np && (a.labelId === label.id || a.label?.id === label.id)
    );
    try {
      if (existing) {
        await apiDelete(`/chat-assignments/${existing.id}`);
      } else {
        await apiPost("/chat-assignments", { chatJid: activePhone, labelId: label.id });
      }
      reloadAssignments();
    } catch (e: any) {
      toast.error(e?.message || t("liveChat.actionFailed"));
    }
  };

  const handleSend = async () => {
    if (!input.trim() || !activePhone) return;
    if (activeDeviceId == null) {
      toast.error(t("liveChat.selectDeviceFirst"));
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
      toast.error(err?.message || t("liveChat.sendError"));
    } finally {
      setLoading(false);
    }
  };

  const handleAIReply = async () => {
    if (!activePhone) return;
    if (activeDeviceId == null) {
      toast.error(t("liveChat.selectDeviceFirst"));
      return;
    }
    setLoading(true);
    try {
      await apiPost("/chat/ai-reply", {
        deviceId: activeDeviceId,
        phone: activePhone,
      });
    } catch (err: any) {
      toast.error(err?.message || t("liveChat.aiReplyError"));
    } finally {
      setLoading(false);
    }
  };

  const filteredConvos = conversations.filter((c) => {
    if (unreadOnly && !(c.unreadCount > 0)) return false;
    if (!search) return true;
    return (
      c.phone.includes(search) ||
      c.contactName?.toLowerCase().includes(search.toLowerCase())
    );
  });

  const activeConvo = conversations.find((c) => c.phone === activePhone);

  // Pencarian dalam percakapan aktif: daftar index pesan yang cocok
  const msgMatches = msgQuery.trim()
    ? messages
        .map((m, i) => ({ m, i }))
        .filter(({ m }) => m.content.toLowerCase().includes(msgQuery.trim().toLowerCase()))
    : [];
  const scrollToMatch = (idx: number) => {
    if (msgMatches.length === 0) return;
    const safe = ((idx % msgMatches.length) + msgMatches.length) % msgMatches.length;
    setMsgMatchIdx(safe);
    const el = msgRefs.current.get(msgMatches[safe].i);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  };
  useEffect(() => {
    setMsgMatchIdx(0);
  }, [msgQuery, activePhone]);

  const highlight = (text: string, q: string) => {
    const query = q.trim();
    if (!query) return text;
    const lower = text.toLowerCase();
    const lq = query.toLowerCase();
    const parts: React.ReactNode[] = [];
    let pos = 0;
    let key = 0;
    while (true) {
      const idx = lower.indexOf(lq, pos);
      if (idx < 0) {
        parts.push(text.slice(pos));
        break;
      }
      parts.push(text.slice(pos, idx));
      parts.push(
        <mark key={key++} className="bg-yellow-300 dark:bg-yellow-600 rounded-sm px-0.5">
          {text.slice(idx, idx + query.length)}
        </mark>
      );
      pos = idx + query.length;
    }
    return <>{parts}</>;
  };

  return (
    <div className="flex h-[calc(100vh-7rem)] border border-border rounded-lg overflow-hidden">
      {/* ── Conversation List ─────────────────────────── */}
      <div className={cn(
        "border-r border-border flex-col bg-card",
        activePhone ? "hidden md:flex md:w-80" : "flex w-full md:w-80"
      )}>
        {/* Search */}
        <div className="p-3 border-b border-border space-y-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              placeholder={t("liveChat.searchPlaceholder")}
              className="pl-8 h-8 text-xs"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {/* Filter: status + belum dibaca */}
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                { id: "open", label: t("liveChat.filterAll") },
                { id: "done", label: t("liveChat.filterDone") },
                { id: "archived", label: t("liveChat.filterArchived") },
              ] as const
            ).map((f) => (
              <button
                key={f.id}
                onClick={() => setStatusFilter(f.id)}
                className={cn(
                  "h-6 px-2.5 rounded-full text-[10px] font-medium transition-colors",
                  statusFilter === f.id
                    ? "bg-[#243370] dark:bg-[#4c63d2] text-white"
                    : "bg-secondary text-muted-foreground hover:text-foreground"
                )}
              >
                {f.label}
              </button>
            ))}
            <button
              onClick={() => setUnreadOnly((v) => !v)}
              className={cn(
                "h-6 px-2.5 rounded-full text-[10px] font-medium transition-colors",
                unreadOnly
                  ? "bg-[#243370] dark:bg-[#4c63d2] text-white"
                  : "bg-secondary text-muted-foreground hover:text-foreground"
              )}
            >
              {t("liveChat.filterUnread")}
            </button>
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {activeDeviceId == null ? (
            <div className="p-6 text-center text-xs text-muted-foreground">{t("liveChat.selectDeviceFirst")}</div>
          ) : filteredConvos.length === 0 ? (
            <EmptyState
              icon={MessageCircle}
              title={t("liveChat.noConversations")}
            />
          ) : (
            filteredConvos.map((convo) => {
              const rowLabels = labelsForPhone(convo.phone);
              return (
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
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-foreground truncate flex items-center gap-1 min-w-0">
                      {convo.isPinned && (
                        <Pin className="w-3 h-3 text-[#243370] dark:text-[#8b9cf0] shrink-0" />
                      )}
                      <span className="truncate">{convo.contactName || convo.phone}</span>
                    </span>
                    <span className="flex items-center gap-1.5 shrink-0">
                      <span className="text-[10px] text-muted-foreground">
                        {timeAgo(convo.lastActivity, t)}
                      </span>
                      {convo.unreadCount > 0 && (
                        <Badge className="h-4 px-1.5 text-[9px] bg-[#243370] dark:bg-[#4c63d2] text-white border-transparent">
                          {convo.unreadCount}
                        </Badge>
                      )}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                    <MediaPreview type={convo.lastMessageType} text={convo.lastMessage} t={t} />
                  </p>
                  {rowLabels.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {rowLabels.slice(0, 3).map((l) => (
                        <span
                          key={l.id}
                          className="inline-flex items-center gap-1 text-[9px] px-1.5 py-px rounded-full border"
                          style={{ borderColor: l.color, color: l.color }}
                        >
                          <span
                            className="w-1.5 h-1.5 rounded-full"
                            style={{ backgroundColor: l.color }}
                          />
                          {l.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </button>
              );
            })
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
                  aria-label={t("liveChat.back")}
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
                {/* Cari dalam percakapan */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  aria-label={t("liveChat.searchInChat")}
                  title={t("liveChat.searchInChat")}
                  onClick={() => {
                    setMsgSearchOpen((v) => !v);
                    setMsgQuery("");
                  }}
                >
                  <Search className="w-4 h-4" />
                </Button>
                {/* AI Toggle */}
                <Button
                  variant={aiMode ? "default" : "outline"}
                  size="sm"
                  className="h-7 text-[10px] gap-1"
                  onClick={() => setAiMode(!aiMode)}
                >
                  <Bot className="w-3 h-3" />
                  {aiMode ? t("liveChat.aiOn") : t("liveChat.aiOff")}
                </Button>
                <div className="relative" ref={infoRef}>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    aria-label={t("liveChat.contactInfo")}
                    title={t("liveChat.contactInfo")}
                    onClick={() => setShowInfo((v) => !v)}
                  >
                    <MoreHorizontal className="w-4 h-4" />
                  </Button>
                  {showInfo && activePhone && (
                    <div className="absolute right-0 top-full mt-2 w-72 rounded-lg border border-border bg-card shadow-xl z-30 p-4 max-h-[70vh] overflow-y-auto">
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
                          {copied ? t("liveChat.copied") : t("liveChat.copyNumber")}
                        </Button>
                      </div>

                      {/* Label */}
                      <div className="mt-4 pt-3 border-t border-border">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                          <Tag className="w-3 h-3" />
                          {t("liveChat.labels")}
                        </p>
                        {labels.length === 0 ? (
                          <p className="mt-1.5 text-[11px] text-muted-foreground">
                            {t("liveChat.noLabelsHint")}
                          </p>
                        ) : (
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            {labels.map((l) => {
                              const has = labelsForPhone(activePhone).some((x) => x.id === l.id);
                              return (
                                <button
                                  key={l.id}
                                  onClick={() => toggleLabel(l)}
                                  className={cn(
                                    "inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-full border transition-colors",
                                    has
                                      ? "text-white border-transparent"
                                      : "text-muted-foreground hover:text-foreground"
                                  )}
                                  style={
                                    has
                                      ? { backgroundColor: l.color }
                                      : { borderColor: l.color }
                                  }
                                >
                                  <span
                                    className="w-2 h-2 rounded-full"
                                    style={{ backgroundColor: has ? "#fff" : l.color }}
                                  />
                                  {l.name}
                                  {has && <Check className="w-3 h-3" />}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* Aksi percakapan */}
                      <div className="mt-3 pt-3 border-t border-border grid grid-cols-1 gap-1.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 justify-start text-xs gap-2"
                          onClick={togglePin}
                        >
                          {activeConvo?.isPinned ? (
                            <PinOff className="w-3.5 h-3.5" />
                          ) : (
                            <Pin className="w-3.5 h-3.5" />
                          )}
                          {activeConvo?.isPinned ? t("liveChat.unpin") : t("liveChat.pin")}
                        </Button>
                        {statusFilter !== "done" ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 justify-start text-xs gap-2"
                            onClick={() => changeStatus("done")}
                          >
                            <CircleCheck className="w-3.5 h-3.5" />
                            {t("liveChat.markDone")}
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 justify-start text-xs gap-2"
                            onClick={() => changeStatus("open")}
                          >
                            <Circle className="w-3.5 h-3.5" />
                            {t("liveChat.reopen")}
                          </Button>
                        )}
                        {statusFilter !== "archived" ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 justify-start text-xs gap-2"
                            onClick={() => changeStatus("archived")}
                          >
                            <Archive className="w-3.5 h-3.5" />
                            {t("liveChat.archive")}
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 justify-start text-xs gap-2"
                            onClick={() => changeStatus("open")}
                          >
                            <ArchiveRestore className="w-3.5 h-3.5" />
                            {t("liveChat.unarchive")}
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Messages */}
            {msgSearchOpen && (
              <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-card">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <Input
                    autoFocus
                    placeholder={t("liveChat.searchInChatPlaceholder")}
                    className="pl-8 h-8 text-xs"
                    value={msgQuery}
                    onChange={(e) => setMsgQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") scrollToMatch(msgMatchIdx + 1);
                    }}
                  />
                </div>
                {msgQuery.trim() && (
                  <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                    {msgMatches.length === 0
                      ? t("liveChat.noMatch")
                      : `${msgMatchIdx + 1}/${msgMatches.length}`}
                  </span>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  disabled={msgMatches.length === 0}
                  onClick={() => scrollToMatch(msgMatchIdx - 1)}
                  aria-label={t("liveChat.prevMatch")}
                >
                  <ChevronUp className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  disabled={msgMatches.length === 0}
                  onClick={() => scrollToMatch(msgMatchIdx + 1)}
                  aria-label={t("liveChat.nextMatch")}
                >
                  <ChevronDown className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => {
                    setMsgSearchOpen(false);
                    setMsgQuery("");
                  }}
                  aria-label={t("liveChat.closeSearch")}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            )}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-background">
              {messages.map((msg, i) => (
                <div
                  key={msg.id}
                  ref={(el) => {
                    if (el) msgRefs.current.set(i, el);
                    else msgRefs.current.delete(i);
                  }}
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
                    <p className="whitespace-pre-wrap break-words">
                      {msgQuery.trim() ? highlight(msg.content, msgQuery) : msg.content}
                    </p>
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
                    <p className="text-xs font-semibold text-foreground">{t("liveChat.quickReplies")}</p>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => setShowQuickReplies(false)}
                      aria-label={t("liveChat.closeQuickReplies")}
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
                    <p className="p-4 text-xs text-muted-foreground text-center">{t("liveChat.noTemplates")}</p>
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
                  {loading ? t("liveChat.generating") : t("liveChat.generateAiReply")}
                </Button>
              ) : (
                <>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 shrink-0"
                    onClick={toggleQuickReplies}
                    aria-label={t("liveChat.quickReplies")}
                    title={t("liveChat.quickReplies")}
                  >
                    <Zap className="w-4 h-4" />
                  </Button>
                  <Input
                    placeholder={t("liveChat.typeMessage")}
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
            <EmptyState
              icon={MessageCircle}
              title="Live Chat"
              hint={t("liveChat.emptyHint")}
            />
          </div>
        )}
      </div>
    </div>
  );
}

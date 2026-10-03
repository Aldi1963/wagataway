import { useState, useEffect, useRef } from "react";
import { Send, Bot, Search, MessageCircle, MoreHorizontal, ArrowLeft, Zap, X, Copy, Check, Pin, PinOff, Archive, ArchiveRestore, CircleCheck, Circle, Tag, ChevronUp, ChevronDown, Camera, Video, Mic, FileText, Smile, Download, BellRing, Trash2, Paperclip, Undo2, Forward, Square, Loader2, Link as LinkIcon } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { apiGet, apiPatch, apiPost, apiDelete, apiFetch } from "@/lib/api";
import { toast } from "sonner";
import { useActiveDevice } from "@/hooks/use-active-device";
import { useLang } from "@/lib/i18n";
import { DateTimePicker } from "@/components/DateTimePicker";

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

interface ChatReminder {
  id: number;
  deviceId: number;
  phone: string;
  note: string;
  remindAt: string;
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
  waMessageId?: string;
  mediaUrl?: string;
  fileName?: string;
  replyTo?: string;
  replyContent?: string;
  isDeleted?: boolean;
  reactions?: ChatReaction[];
}

interface ChatReaction {
  emoji: string;
  fromMe: boolean;
}

interface ChatMediaItem {
  id: number;
  type: string;
  mediaUrl: string;
  content: string;
  createdAt: string;
}

// reactions bisa berupa array objek atau JSON string — parse defensif.
function parseReactions(r: unknown): ChatReaction[] {
  if (Array.isArray(r)) {
    return r
      .filter((x) => x && typeof (x as ChatReaction).emoji === "string")
      .map((x) => ({ emoji: (x as ChatReaction).emoji, fromMe: !!(x as ChatReaction).fromMe }));
  }
  if (typeof r === "string" && r.trim()) {
    try {
      return parseReactions(JSON.parse(r));
    } catch {
      return [];
    }
  }
  return [];
}

// Normalisasi satu pesan dari backend/SSE ke bentuk ChatMsg penuh.
function normalizeMsg(m: any): ChatMsg {
  return {
    id: typeof m.id === "number" ? m.id : Date.now() + Math.random(),
    phone: m.phone,
    content: m.content ?? "",
    type: m.type || "text",
    direction: m.direction,
    isRead: !!m.isRead,
    createdAt: m.createdAt || new Date().toISOString(),
    waMessageId: m.waMessageId,
    mediaUrl: m.mediaUrl,
    fileName: m.fileName,
    replyTo: m.replyTo,
    replyContent: m.replyContent,
    isDeleted: !!m.isDeleted,
    reactions: parseReactions(m.reactions),
  };
}

// Label pemisah tanggal ala WA: "HARI INI" / "KEMARIN" / "12 Sep 2026".
function dayKeyOf(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}
function dayChipLabel(iso: string, today: string, yesterday: string, locale: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const now = new Date();
  const y = new Date();
  y.setDate(y.getDate() - 1);
  if (dayKeyOf(d) === dayKeyOf(now)) return today;
  if (dayKeyOf(d) === dayKeyOf(y)) return yesterday;
  return d.toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });
}

// ── Tema ala WhatsApp Web ───────────────────────────────────────────────────
interface DeviceLite {
  id: number;
  name: string;
  phone?: string;
  status?: string;
}
// Doodle background khas WA (SVG ringan, di-tile).
const WA_DOODLE_LIGHT =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140' viewBox='0 0 140 140'%3E%3Cg fill='none' stroke='%23111b21' stroke-opacity='0.05' stroke-width='1.6'%3E%3Ccircle cx='22' cy='24' r='9'/%3E%3Cpath d='M68 12 q11 11 0 22 q-11 11 0 22'/%3E%3Crect x='104' y='70' width='18' height='18' rx='4'/%3E%3Cpath d='M14 104 l16 16 M30 104 l-16 16'/%3E%3Ccircle cx='116' cy='24' r='3.5'/%3E%3Cpath d='M52 96 q8 -8 16 0 q-8 8 -16 0'/%3E%3C/g%3E%3C/svg%3E\")";
const WA_DOODLE_DARK =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140' viewBox='0 0 140 140'%3E%3Cg fill='none' stroke='%23e9edef' stroke-opacity='0.045' stroke-width='1.6'%3E%3Ccircle cx='22' cy='24' r='9'/%3E%3Cpath d='M68 12 q11 11 0 22 q-11 11 0 22'/%3E%3Crect x='104' y='70' width='18' height='18' rx='4'/%3E%3Cpath d='M14 104 l16 16 M30 104 l-16 16'/%3E%3Ccircle cx='116' cy='24' r='3.5'/%3E%3Cpath d='M52 96 q8 -8 16 0 q-8 8 -16 0'/%3E%3C/g%3E%3C/svg%3E\")";

// Ekor bubble khas WA.
function BubbleTail({ out }: { out: boolean }) {
  return out ? (
    <svg viewBox="0 0 8 13" className="absolute -right-[7px] top-0 w-2 h-[13px] fill-[#d9fdd3] dark:fill-[#005c4b]">
      <path d="M0 0 L8 0 L0 13 Z" />
    </svg>
  ) : (
    <svg viewBox="0 0 8 13" className="absolute -left-[7px] top-0 w-2 h-[13px] fill-white dark:fill-[#1f2c34]">
      <path d="M8 0 L0 0 L8 13 Z" />
    </svg>
  );
}

// Centang ganda ala WA untuk pesan keluar.
function Ticks({ read }: { read: boolean }) {
  return (
    <svg
      viewBox="0 0 18 14"
      className={cn("w-4 h-3.5 shrink-0", read ? "text-[#53bdeb]" : "text-[#8696a0]")}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M1 7.5 4 10.5 11 3" />
      <path d="M7 7.5 10 10.5 17 3" />
    </svg>
  );
}

// Avatar kontak: coba foto profil WA asli, fallback ke inisial nama.
// Cache foto profil per device+phone + antrean max 3 fetch bersamaan
// (daftar percakapan bisa puluhan baris; jangan hantam WhatsApp sekaligus).
const photoCache = new Map<string, { url: string | null; exp: number }>();
// Hasil gagal (null) hanya di-cache 60 detik agar kegagalan sementara
// (server restart, device reconnect, dsb.) pulih sendiri tanpa reload halaman.
const PHOTO_NEG_TTL = 60_000;
function photoCacheGet(key: string): string | null | undefined {
  const e = photoCache.get(key);
  if (!e) return undefined;
  if (e.url == null && Date.now() > e.exp) {
    photoCache.delete(key);
    return undefined;
  }
  return e.url;
}
function photoCacheSet(key: string, url: string | null) {
  photoCache.set(key, { url, exp: url == null ? Date.now() + PHOTO_NEG_TTL : Infinity });
}
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
    const cached = photoCacheGet(key);
    if (cached !== undefined) {
      setPhotoUrl(cached);
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
          photoCacheSet(key, null);
          return;
        }
        const blob = await res.blob();
        if (alive && blob.size > 0) {
          const url = URL.createObjectURL(blob);
          photoCacheSet(key, url);
          setPhotoUrl(url);
        } else {
          photoCacheSet(key, null);
        }
      } catch {
        photoCacheSet(key, null);
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
    voicenote: { icon: <Mic className="w-3 h-3" />, label: t("liveChat.msgAudio") },
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
  const { activeDeviceId, activeDevice, setActiveDevice } = useActiveDevice();
  const { t, lang } = useLang();
  const dateLocale = lang === "id" ? "id-ID" : "en-US";
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [devices, setDevices] = useState<DeviceLite[]>([]);
  const [deviceMenuOpen, setDeviceMenuOpen] = useState(false);
  const deviceMenuRef = useRef<HTMLDivElement>(null);
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
  // Ekspor chat & pengingat follow-up
  const [exporting, setExporting] = useState(false);
  const [reminders, setReminders] = useState<ChatReminder[]>([]);
  const [reminderAt, setReminderAt] = useState("");
  const [reminderNote, setReminderNote] = useState("");
  const [savingReminder, setSavingReminder] = useState(false);
  // Balas/quote
  const [replyTo, setReplyTo] = useState<{ waMessageId: string; content: string; name: string } | null>(null);
  // Hover/tap toolbar di atas bubble + popover reaksi
  const [toolbarMsg, setToolbarMsg] = useState<number | null>(null);
  const [reactionFor, setReactionFor] = useState<number | null>(null);
  // Teruskan pesan
  const [forwardMsg, setForwardMsg] = useState<ChatMsg | null>(null);
  const [forwarding, setForwarding] = useState(false);
  // Kirim media (paperclip)
  const [attachOpen, setAttachOpen] = useState(false);
  const attachMenuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const attachKindRef = useRef<"image" | "video" | "document">("image");
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaKind, setMediaKind] = useState<"image" | "video" | "document">("image");
  const [mediaPreviewUrl, setMediaPreviewUrl] = useState<string | null>(null);
  const [mediaCaption, setMediaCaption] = useState("");
  const [uploading, setUploading] = useState(false);
  // Voice note
  const [recording, setRecording] = useState(false);
  const [recSecs, setRecSecs] = useState(0);
  const recTimerRef = useRef<number | null>(null);
  const mediaRecRef = useRef<MediaRecorder | null>(null);
  const recChunksRef = useRef<Blob[]>([]);
  const recStreamRef = useRef<MediaStream | null>(null);
  const [sendingVoice, setSendingVoice] = useState(false);
  // Online/mengetik
  const [presence, setPresence] = useState<{ online: boolean; typing: boolean } | null>(null);
  // Tab info kontak: info | media | dokumen | tautan
  const [infoTab, setInfoTab] = useState<"info" | "media" | "documents" | "links">("info");
  const [tabItems, setTabItems] = useState<ChatMediaItem[] | null>(null);
  const [tabLoading, setTabLoading] = useState(false);

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
    apiGet<{ messages: any[] }>(`/chat/messages/${activePhone}`)
      .then((d) => setMessages((d.messages || []).map(normalizeMsg)))
      .catch(() => {});
    // Mark as read (backend: PATCH)
    apiPatch(`/chat/conversations/${activePhone}/read`).catch(() => {});
    setConversations((prev) =>
      prev.map((c) => (c.phone === activePhone ? { ...c, unreadCount: 0 } : c))
    );
  }, [activePhone]);

  // Online/mengetik: subscribe + ambil status awal saat percakapan aktif berubah
  useEffect(() => {
    setPresence(null);
    if (!activePhone || activeDeviceId == null) return;
    apiPost("/chat/presence/subscribe", { deviceId: activeDeviceId, phone: activePhone }).catch(
      () => {}
    );
    apiGet<{ online: boolean; typing: boolean }>(
      `/chat/presence?deviceId=${activeDeviceId}&phone=${encodeURIComponent(activePhone)}`
    )
      .then((d) => setPresence({ online: !!d.online, typing: !!d.typing }))
      .catch(() => {});
  }, [activePhone, activeDeviceId]);

  // Tutup menu paperclip saat klik di luar
  useEffect(() => {
    if (!attachOpen) return;
    const onDown = (e: MouseEvent) => {
      if (attachMenuRef.current && !attachMenuRef.current.contains(e.target as Node)) {
        setAttachOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [attachOpen]);

  // Bersihkan object URL preview media saat diganti/dilepas
  useEffect(() => {
    return () => {
      if (mediaPreviewUrl) URL.revokeObjectURL(mediaPreviewUrl);
    };
  }, [mediaPreviewUrl]);

  // Hentikan rekaman bila komponen dilepas
  useEffect(() => {
    return () => {
      if (recTimerRef.current) window.clearInterval(recTimerRef.current);
      try {
        mediaRecRef.current?.stop();
      } catch {
        /* abaikan */
      }
      recStreamRef.current?.getTracks().forEach((tr) => tr.stop());
    };
  }, []);

  // Daftar device untuk header akun ala WA
  useEffect(() => {
    apiGet<{ devices: DeviceLite[] }>("/devices")
      .then((d) => setDevices(d.devices ?? []))
      .catch(() => {});
  }, []);

  // Tutup dropdown device saat klik di luar
  useEffect(() => {
    if (!deviceMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (deviceMenuRef.current && !deviceMenuRef.current.contains(e.target as Node)) {
        setDeviceMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [deviceMenuOpen]);

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
            const incoming = normalizeMsg(data);
            setMessages((prev) => {
              // Hindari duplikat: backend kadang meng-echo pesan yang baru dikirim
              const dup = prev.some(
                (m) =>
                  (incoming.waMessageId && m.waMessageId === incoming.waMessageId) ||
                  (incoming.id && m.id === incoming.id)
              );
              return dup ? prev : [...prev, incoming];
            });
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
        // Online/mengetik lawan bicara
        es.addEventListener("chat:presence", (e) => {
          try {
            const data = JSON.parse(e.data);
            if (data.phone === activePhone) {
              setPresence({ online: !!data.online, typing: !!data.typing });
            }
          } catch {
            /* abaikan payload rusak */
          }
        });
        // Reaksi emoji masuk
        es.addEventListener("chat:reaction", (e) => {
          try {
            const data = JSON.parse(e.data);
            if (data.phone !== activePhone || !data.waMessageId) return;
            setMessages((prev) =>
              prev.map((m) => {
                if (m.waMessageId !== data.waMessageId) return m;
                const cur = m.reactions ?? [];
                if (!data.emoji) {
                  // hapus reaksi dari sisi pengirim event
                  return {
                    ...m,
                    reactions: cur.filter((r) => r.fromMe !== !!data.fromMe),
                  };
                }
                const exists = cur.some(
                  (r) => r.emoji === data.emoji && r.fromMe === !!data.fromMe
                );
                if (exists) return m;
                return {
                  ...m,
                  reactions: [...cur, { emoji: data.emoji, fromMe: !!data.fromMe }],
                };
              })
            );
          } catch {
            /* abaikan payload rusak */
          }
        });
        // Pesan dihapus untuk semua
        es.addEventListener("chat:delete", (e) => {
          try {
            const data = JSON.parse(e.data);
            if (data.phone !== activePhone) return;
            setMessages((prev) =>
              prev.map((m) =>
                (data.waMessageId && m.waMessageId === data.waMessageId) ||
                (data.id && m.id === data.id)
                  ? { ...m, isDeleted: true }
                  : m
              )
            );
          } catch {
            /* abaikan payload rusak */
          }
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
    setInfoTab("info");
    setReplyTo(null);
    clearMedia();
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

  // ── Ekspor riwayat chat (TXT/CSV) ──
  const exportChat = async (format: "txt" | "csv") => {
    if (!activePhone || !activeDeviceId || exporting) return;
    setExporting(true);
    try {
      const res = await apiFetch(
        `/chat/export?deviceId=${activeDeviceId}&phone=${encodeURIComponent(activePhone)}&format=${format}`
      );
      if (!res.ok) throw new Error(t("liveChat.exportFailed"));
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `chat-${activePhone}.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(t("liveChat.exported"));
    } catch (e: any) {
      toast.error(e?.message || t("liveChat.exportFailed"));
    } finally {
      setExporting(false);
    }
  };

  // ── Pengingat follow-up ──
  const loadReminders = async () => {
    if (!activeDeviceId) return;
    try {
      const res = await apiGet<{ reminders: ChatReminder[] }>(
        `/chat/reminders?deviceId=${activeDeviceId}`
      );
      setReminders(res.reminders ?? []);
    } catch {
      // opsional
    }
  };

  useEffect(() => {
    if (showInfo && activePhone) {
      loadReminders();
      setReminderAt("");
      setReminderNote("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showInfo, activePhone]);

  const saveReminder = async () => {
    if (!activePhone || !activeDeviceId || !reminderAt) {
      toast.error(t("liveChat.reminderNeedTime"));
      return;
    }
    setSavingReminder(true);
    try {
      await apiPost("/chat/reminders", {
        deviceId: activeDeviceId,
        phone: activePhone,
        remindAt: reminderAt,
        note: reminderNote.trim(),
      });
      toast.success(t("liveChat.reminderSaved"));
      setReminderAt("");
      setReminderNote("");
      loadReminders();
    } catch (e: any) {
      toast.error(e?.message || t("liveChat.actionFailed"));
    } finally {
      setSavingReminder(false);
    }
  };

  const deleteReminder = async (id: number) => {
    try {
      await apiDelete(`/chat/reminders/${id}`);
      setReminders((prev) => prev.filter((r) => r.id !== id));
      toast.success(t("liveChat.reminderDeleted"));
    } catch (e: any) {
      toast.error(e?.message || t("liveChat.actionFailed"));
    }
  };

  const reminderForPhone = activePhone
    ? reminders.find((r) => r.phone === activePhone)
    : undefined;

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
          ...(replyTo ? { replyTo: replyTo.waMessageId } : {}),
        });
      }
      setInput("");
      setReplyTo(null);
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

  // ── Balas / quote ──
  const startReply = (msg: ChatMsg) => {
    if (!msg.waMessageId) {
      toast.error(t("liveChat.replyOldNotSupported"));
      return;
    }
    const name =
      msg.direction === "out" ? t("liveChat.you") : activeConvo?.contactName || activePhone || "";
    setReplyTo({
      waMessageId: msg.waMessageId,
      content: msg.content || (msg.type !== "text" ? t("liveChat.msgMediaGeneric") : ""),
      name,
    });
    setToolbarMsg(null);
  };

  // ── Upload file chat (multipart; Content-Type dibiarkan browser agar boundary benar) ──
  const uploadChatFile = async (file: File): Promise<{ url: string; mime: string; size: number }> => {
    const token = localStorage.getItem("token");
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/chat/upload", {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: fd,
    });
    if (res.status === 401) {
      localStorage.removeItem("token");
      window.location.href = "/login";
      throw new Error(t("liveChat.sessionExpired"));
    }
    if (!res.ok) throw new Error(t("liveChat.uploadFailed"));
    return res.json();
  };

  const openAttach = (kind: "image" | "video" | "document") => {
    attachKindRef.current = kind;
    setAttachOpen(false);
    const el = fileInputRef.current;
    if (el) {
      el.accept =
        kind === "document"
          ? ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip"
          : "image/*,video/*";
      el.click();
    }
  };

  const onAttachFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (mediaPreviewUrl) URL.revokeObjectURL(mediaPreviewUrl);
    setMediaFile(f);
    setMediaKind(f.type.startsWith("video/") ? "video" : attachKindRef.current);
    setMediaPreviewUrl(f.type.startsWith("image/") ? URL.createObjectURL(f) : null);
    setMediaCaption("");
  };

  const clearMedia = () => {
    if (mediaPreviewUrl) URL.revokeObjectURL(mediaPreviewUrl);
    setMediaPreviewUrl(null);
    setMediaFile(null);
    setMediaCaption("");
  };

  const sendMedia = async () => {
    if (!mediaFile || !activePhone || uploading) return;
    if (activeDeviceId == null) {
      toast.error(t("liveChat.selectDeviceFirst"));
      return;
    }
    setUploading(true);
    try {
      const up = await uploadChatFile(mediaFile);
      await apiPost("/chat/send", {
        deviceId: activeDeviceId,
        phone: activePhone,
        content: mediaCaption.trim(),
        type: mediaKind,
        mediaUrl: up.url,
        fileName: mediaFile.name,
        ...(replyTo ? { replyTo: replyTo.waMessageId } : {}),
      });
      clearMedia();
      setReplyTo(null);
    } catch (err: any) {
      toast.error(err?.message || t("liveChat.sendError"));
    } finally {
      setUploading(false);
    }
  };

  // ── Teruskan pesan ──
  const doForward = async (targetPhone: string) => {
    if (!forwardMsg || !targetPhone || forwarding) return;
    if (activeDeviceId == null) {
      toast.error(t("liveChat.selectDeviceFirst"));
      return;
    }
    setForwarding(true);
    try {
      await apiPost("/chat/send", {
        deviceId: activeDeviceId,
        phone: targetPhone,
        content: forwardMsg.content,
        type: forwardMsg.type,
        ...(forwardMsg.mediaUrl ? { mediaUrl: forwardMsg.mediaUrl } : {}),
        ...(forwardMsg.fileName ? { fileName: forwardMsg.fileName } : {}),
      });
      toast.success(t("liveChat.forwardSuccess"));
      setForwardMsg(null);
    } catch (err: any) {
      toast.error(err?.message || t("liveChat.sendError"));
    } finally {
      setForwarding(false);
    }
  };

  // ── Hapus untuk semua (pesan keluar) ──
  const deleteMessage = async (msg: ChatMsg) => {
    setToolbarMsg(null);
    if (!window.confirm(t("liveChat.deleteConfirm"))) return;
    try {
      await apiDelete(`/chat/messages/${msg.id}`);
      setMessages((prev) =>
        prev.map((m) => (m.id === msg.id ? { ...m, isDeleted: true } : m))
      );
    } catch (err: any) {
      toast.error(err?.message || t("liveChat.deleteError"));
    }
  };

  // ── Reaksi emoji ──
  const QUICK_EMOJIS = ["❤️", "👍", "😂", "😮", "😢", "🙏"];
  const reactTo = async (msg: ChatMsg, emoji: string) => {
    setReactionFor(null);
    setToolbarMsg(null);
    if (!msg.waMessageId) {
      toast.error(t("liveChat.reactOldNotSupported"));
      return;
    }
    if (activeDeviceId == null || !activePhone) return;
    try {
      await apiPost("/chat/react", {
        deviceId: activeDeviceId,
        phone: activePhone,
        waMessageId: msg.waMessageId,
        emoji,
      });
      // Optimistic: tampilkan reaksi sendiri langsung
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== msg.id) return m;
          const cur = m.reactions ?? [];
          if (!emoji) return { ...m, reactions: cur.filter((r) => !r.fromMe) };
          const exists = cur.some((r) => r.emoji === emoji && r.fromMe);
          if (exists) return m;
          return { ...m, reactions: [...cur.filter((r) => !r.fromMe), { emoji, fromMe: true }] };
        })
      );
    } catch (err: any) {
      toast.error(err?.message || t("liveChat.actionFailed"));
    }
  };

  // ── Voice note ──
  const fmtRecSecs = (s: number) => {
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${String(r).padStart(2, "0")}`;
  };

  const startRecording = async () => {
    if (recording || sendingVoice) return;
    try {
      if (!window.MediaRecorder) throw new Error("unsupported");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime =
        ["audio/ogg;codecs=opus", "audio/webm;codecs=opus"].find((mt) =>
          MediaRecorder.isTypeSupported(mt)
        ) || "";
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      recChunksRef.current = [];
      recStreamRef.current = stream;
      rec.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) recChunksRef.current.push(ev.data);
      };
      rec.onstop = () => {
        stream.getTracks().forEach((tr) => tr.stop());
      };
      rec.start();
      mediaRecRef.current = rec;
      setRecSecs(0);
      setRecording(true);
      recTimerRef.current = window.setInterval(() => setRecSecs((s) => s + 1), 1000);
    } catch {
      toast.error(t("liveChat.micDenied"));
    }
  };

  const stopRecording = (cancel: boolean) => {
    if (!recording) return;
    if (recTimerRef.current) {
      window.clearInterval(recTimerRef.current);
      recTimerRef.current = null;
    }
    const rec = mediaRecRef.current;
    mediaRecRef.current = null;
    setRecording(false);
    if (cancel) {
      try {
        rec?.stop();
      } catch {
        /* abaikan */
      }
      recChunksRef.current = [];
      recStreamRef.current?.getTracks().forEach((tr) => tr.stop());
      recStreamRef.current = null;
      return;
    }
    if (!rec) return;
    rec.onstop = () => {
      recStreamRef.current?.getTracks().forEach((tr) => tr.stop());
      recStreamRef.current = null;
      const chunks = recChunksRef.current;
      recChunksRef.current = [];
      if (chunks.length === 0) return;
      const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
      void sendVoiceNote(blob);
    };
    try {
      rec.stop();
    } catch {
      /* abaikan */
    }
  };

  const sendVoiceNote = async (blob: Blob) => {
    if (!activePhone || sendingVoice) return;
    if (activeDeviceId == null) {
      toast.error(t("liveChat.selectDeviceFirst"));
      return;
    }
    setSendingVoice(true);
    try {
      const ext = blob.type.includes("ogg") ? "ogg" : "webm";
      const file = new File([blob], `voice-note.${ext}`, { type: blob.type });
      const up = await uploadChatFile(file);
      await apiPost("/chat/send", {
        deviceId: activeDeviceId,
        phone: activePhone,
        content: "",
        type: "voicenote",
        mediaUrl: up.url,
        fileName: file.name,
      });
    } catch (err: any) {
      toast.error(err?.message || t("liveChat.sendError"));
    } finally {
      setSendingVoice(false);
    }
  };

  // ── Tab Media/Dokumen di info kontak ──
  const loadTabMedia = (kind: "image" | "document") => {
    if (!activePhone || activeDeviceId == null) return;
    setTabLoading(true);
    setTabItems(null);
    apiGet<{ items: ChatMediaItem[] }>(
      `/chat/media?deviceId=${activeDeviceId}&phone=${encodeURIComponent(activePhone)}&type=${kind}`
    )
      .then((d) => setTabItems(d.items || []))
      .catch(() => setTabItems([]))
      .finally(() => setTabLoading(false));
  };

  const switchInfoTab = (tab: "info" | "media" | "documents" | "links") => {
    setInfoTab(tab);
    if (tab === "media") loadTabMedia("image");
    else if (tab === "documents") loadTabMedia("document");
    else {
      setTabItems(null);
      setTabLoading(false);
    }
  };

  // Ekstrak URL dari pesan teks (tab Tautan) — tanpa duplikat, terbaru dulu
  const chatLinks = (() => {
    const seen = new Set<string>();
    const out: { url: string; createdAt: string }[] = [];
    const re = /https?:\/\/[^\s<>"']+/g;
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.isDeleted || m.type !== "text" || !m.content) continue;
      const found = m.content.match(re);
      if (!found) continue;
      for (const u of found) {
        const clean = u.replace(/[.,;:!?)]+$/, "");
        if (seen.has(clean)) continue;
        seen.add(clean);
        out.push({ url: clean, createdAt: m.createdAt });
      }
    }
    return out;
  })();

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
    <div className="flex h-[calc(100vh-7rem)] overflow-hidden bg-[#eae6df] dark:bg-[#0b141a]">
      {/* ── Conversation List ─────────────────────────── */}
      <div className={cn(
        "border-r border-black/10 dark:border-white/10 flex-col bg-white dark:bg-[#111b21]",
        activePhone ? "hidden md:flex md:w-80" : "flex w-full md:w-80"
      )}>
        {/* Header akun ala WA: titik online + nama device + ganti device */}
        <div className="relative bg-[#f0f2f5] dark:bg-[#1f2c34] px-3 pt-2.5" ref={deviceMenuRef}>
          <button
            onClick={() => setDeviceMenuOpen((v) => !v)}
            className="w-full flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-black/5 dark:hover:bg-white/10 transition-colors text-left"
          >
            <span className="relative shrink-0">
              <span className={cn(
                "block w-2.5 h-2.5 rounded-full",
                activeDevice?.status === "connected" ? "bg-[#25d366]" : "bg-[#8696a0]"
              )} />
              {activeDevice?.status === "connected" && (
                <span className="absolute inset-0 rounded-full bg-[#25d366] animate-ping opacity-40" />
              )}
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-[13px] font-medium text-[#111b21] dark:text-[#e9edef] truncate">
                {activeDevice?.name || t("liveChat.selectDeviceFirst")}
              </span>
              {activeDevice?.phone && (
                <span className="block text-[10px] text-[#667781] dark:text-[#8696a0] truncate">
                  {activeDevice.phone}
                </span>
              )}
            </span>
            <ChevronDown className={cn("w-4 h-4 text-[#667781] dark:text-[#8696a0] transition-transform", deviceMenuOpen && "rotate-180")} />
          </button>
          {deviceMenuOpen && (
            <div className="absolute left-3 right-3 top-full mt-1 z-30 rounded-lg border border-black/10 dark:border-white/10 bg-white dark:bg-[#233138] shadow-xl py-1 max-h-64 overflow-y-auto">
              {devices.length === 0 ? (
                <p className="px-3 py-2 text-xs text-[#667781] dark:text-[#8696a0]">{t("liveChat.noDevices")}</p>
              ) : (
                devices.map((d) => (
                  <button
                    key={d.id}
                    onClick={() => {
                      setActiveDevice({ id: d.id, name: d.name, phone: d.phone ?? "", status: d.status ?? "" });
                      setDeviceMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-black/5 dark:hover:bg-white/10 text-left"
                  >
                    <span className={cn(
                      "w-2 h-2 rounded-full shrink-0",
                      d.status === "connected" ? "bg-[#25d366]" : "bg-[#8696a0]"
                    )} />
                    <span className="flex-1 min-w-0">
                      <span className="block text-[13px] text-[#111b21] dark:text-[#e9edef] truncate">{d.name}</span>
                      {d.phone && (
                        <span className="block text-[10px] text-[#667781] dark:text-[#8696a0] truncate">{d.phone}</span>
                      )}
                    </span>
                    {d.id === activeDeviceId && <Check className="w-4 h-4 text-[#00a884] shrink-0" />}
                  </button>
                ))
              )}
            </div>
          )}
        </div>
        {/* Search */}
        <div className="px-3 py-2 bg-[#f0f2f5] dark:bg-[#1f2c34] space-y-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#667781] dark:text-[#8696a0]" />
            <input
              placeholder={t("liveChat.searchPlaceholder")}
              className="w-full h-8 pl-10 pr-3 rounded-lg bg-white dark:bg-[#2a3942] text-[13px] text-[#111b21] dark:text-[#e9edef] placeholder:text-[#667781] dark:placeholder:text-[#8696a0] focus:outline-none"
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
                    ? "bg-[#00a884] text-white"
                    : "bg-black/5 dark:bg-white/10 text-[#667781] dark:text-[#8696a0] hover:text-[#111b21] dark:hover:text-[#e9edef]"
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
                  ? "bg-[#00a884] text-white"
                  : "bg-black/5 dark:bg-white/10 text-[#667781] dark:text-[#8696a0] hover:text-[#111b21] dark:hover:text-[#e9edef]"
              )}
            >
              {t("liveChat.filterUnread")}
            </button>
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto bg-white dark:bg-[#111b21]">
          {activeDeviceId == null ? (
            <div className="p-6 text-center text-xs text-[#667781] dark:text-[#8696a0]">{t("liveChat.selectDeviceFirst")}</div>
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
                  "w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors",
                  activePhone === convo.phone
                    ? "bg-[#f0f2f5] dark:bg-[#2a3942]"
                    : "hover:bg-[#f5f6f6] dark:hover:bg-[#1f2c34]"
                )}
              >
                <ChatAvatar
                  deviceId={activeDeviceId}
                  phone={convo.phone}
                  name={convo.contactName || convo.phone}
                />
                <div className="flex-1 min-w-0 border-b border-black/5 dark:border-white/5 pb-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[13px] text-[#111b21] dark:text-[#e9edef] truncate flex items-center gap-1 min-w-0">
                      {convo.isPinned && (
                        <Pin className="w-3 h-3 text-[#667781] dark:text-[#8696a0] shrink-0" />
                      )}
                      <span className="truncate">{convo.contactName || convo.phone}</span>
                    </span>
                    <span className="flex items-center gap-1.5 shrink-0">
                      <span className={cn(
                        "text-[11px]",
                        convo.unreadCount > 0 ? "text-[#00a884] font-medium" : "text-[#667781] dark:text-[#8696a0]"
                      )}>
                        {timeAgo(convo.lastActivity, t)}
                      </span>
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    <p className="text-[12px] text-[#667781] dark:text-[#8696a0] truncate flex-1 min-w-0">
                      <MediaPreview type={convo.lastMessageType} text={convo.lastMessage} t={t} />
                    </p>
                    {convo.unreadCount > 0 && (
                      <span className="shrink-0 min-w-5 h-5 px-1.5 rounded-full bg-[#25d366] dark:bg-[#00a884] text-white text-[11px] font-medium inline-flex items-center justify-center">
                        {convo.unreadCount}
                      </span>
                    )}
                  </div>
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
            <div className="min-h-[60px] flex items-center justify-between gap-2 pl-3 pr-2 py-1.5 bg-[#f0f2f5] dark:bg-[#1f2c34]">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t("liveChat.back")}
                  onClick={() => setActivePhone(null)}
                  className="md:hidden -ml-2 h-8 w-8 shrink-0 text-[#54656f] dark:text-[#aebac1] hover:bg-black/5 dark:hover:bg-white/10"
                >
                  <ArrowLeft className="w-4 h-4" />
                </Button>
                <ChatAvatar
                  deviceId={activeDeviceId}
                  phone={activePhone}
                  name={activeConvo?.contactName || activePhone}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] text-[#111b21] dark:text-[#e9edef] truncate leading-tight">
                    {activeConvo?.contactName || activePhone}
                  </p>
                  <p
                    className={cn(
                      "text-[11px] truncate",
                      presence?.typing
                        ? "text-[#00a884] dark:text-[#06cf9c]"
                        : "text-[#667781] dark:text-[#8696a0]"
                    )}
                  >
                    {presence?.typing
                      ? t("liveChat.typing")
                      : presence?.online
                        ? t("liveChat.online")
                        : activePhone}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-0.5 shrink-0 text-[#54656f] dark:text-[#aebac1]">
                {/* Cari dalam percakapan */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 hover:bg-black/5 dark:hover:bg-white/10"
                  aria-label={t("liveChat.searchInChat")}
                  title={t("liveChat.searchInChat")}
                  onClick={() => {
                    setMsgSearchOpen((v) => !v);
                    setMsgQuery("");
                  }}
                >
                  <Search className="w-[18px] h-[18px]" />
                </Button>
                {/* AI Toggle */}
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "h-8 text-[11px] gap-1 px-2.5 rounded-full",
                    aiMode
                      ? "bg-[#00a884] text-white hover:bg-[#00a884]/90"
                      : "hover:bg-black/5 dark:hover:bg-white/10"
                  )}
                  onClick={() => setAiMode(!aiMode)}
                >
                  <Bot className="w-3.5 h-3.5" />
                  {aiMode ? t("liveChat.aiOn") : t("liveChat.aiOff")}
                </Button>
                <div className="relative" ref={infoRef}>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 hover:bg-black/5 dark:hover:bg-white/10"
                    aria-label={t("liveChat.contactInfo")}
                    title={t("liveChat.contactInfo")}
                    onClick={() => setShowInfo((v) => !v)}
                  >
                    <MoreHorizontal className="w-[18px] h-[18px]" />
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

                      {/* Tab: Info | Media | Dokumen | Tautan */}
                      <div className="mt-3 grid grid-cols-4 gap-1 rounded-lg bg-secondary/60 p-1">
                        {(
                          [
                            { id: "info", label: t("liveChat.tabInfo") },
                            { id: "media", label: t("liveChat.tabMedia") },
                            { id: "documents", label: t("liveChat.tabDocuments") },
                            { id: "links", label: t("liveChat.tabLinks") },
                          ] as const
                        ).map((tb) => (
                          <button
                            key={tb.id}
                            onClick={() => switchInfoTab(tb.id)}
                            className={cn(
                              "h-7 rounded-md text-[10px] font-medium transition-colors",
                              infoTab === tb.id
                                ? "bg-card text-foreground shadow-sm"
                                : "text-muted-foreground hover:text-foreground"
                            )}
                          >
                            {tb.label}
                          </button>
                        ))}
                      </div>

                      {infoTab === "info" && (
                      <>
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

                      {/* Ekspor riwayat */}
                      <div className="mt-3 pt-3 border-t border-border">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                          <Download className="w-3 h-3" />
                          {t("liveChat.exportTitle")}
                        </p>
                        <div className="mt-2 grid grid-cols-2 gap-1.5">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 text-xs gap-1.5"
                            onClick={() => exportChat("txt")}
                            disabled={exporting}
                          >
                            <FileText className="w-3.5 h-3.5" />
                            TXT
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 text-xs gap-1.5"
                            onClick={() => exportChat("csv")}
                            disabled={exporting}
                          >
                            <FileText className="w-3.5 h-3.5" />
                            CSV
                          </Button>
                        </div>
                      </div>

                      {/* Pengingat follow-up */}
                      <div className="mt-3 pt-3 border-t border-border">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                          <BellRing className="w-3 h-3" />
                          {t("liveChat.reminderTitle")}
                        </p>
                        {reminderForPhone ? (
                          <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900 p-2.5">
                            <p className="text-[11px] font-medium text-amber-800 dark:text-amber-300">
                              {new Date(reminderForPhone.remindAt).toLocaleString("id-ID", {
                                day: "2-digit",
                                month: "short",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </p>
                            {reminderForPhone.note && (
                              <p className="mt-0.5 text-[11px] text-muted-foreground break-words">
                                {reminderForPhone.note}
                              </p>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="mt-1 h-7 text-[11px] gap-1 text-red-600 hover:text-red-700 px-1"
                              onClick={() => deleteReminder(reminderForPhone.id)}
                            >
                              <Trash2 className="w-3 h-3" />
                              {t("liveChat.reminderCancel")}
                            </Button>
                          </div>
                        ) : (
                          <div className="mt-2 space-y-2">
                            <DateTimePicker
                              value={reminderAt}
                              onChange={setReminderAt}
                              placeholder={t("liveChat.reminderPickTime")}
                            />
                            <Input
                              className="h-8 text-xs"
                              placeholder={t("liveChat.reminderNotePlaceholder")}
                              value={reminderNote}
                              onChange={(e) => setReminderNote(e.target.value)}
                              maxLength={500}
                            />
                            <Button
                              size="sm"
                              className="w-full h-8 text-xs gap-1.5"
                              onClick={saveReminder}
                              disabled={savingReminder || !reminderAt}
                            >
                              <BellRing className="w-3.5 h-3.5" />
                              {savingReminder ? t("liveChat.saving") : t("liveChat.reminderSet")}
                            </Button>
                          </div>
                        )}
                      </div>
                      </>)}

                      {/* Tab Media & Dokumen */}
                      {(infoTab === "media" || infoTab === "documents") && (
                        <div className="mt-3">
                          {tabLoading ? (
                            <div className="py-8 flex items-center justify-center gap-2 text-[12px] text-muted-foreground">
                              <Loader2 className="w-4 h-4 animate-spin" />
                              {t("liveChat.loadingMedia")}
                            </div>
                          ) : !tabItems || tabItems.length === 0 ? (
                            <p className="py-8 text-center text-[12px] text-muted-foreground">
                              {infoTab === "media" ? t("liveChat.noMedia") : t("liveChat.noDocuments")}
                            </p>
                          ) : infoTab === "media" ? (
                            <div className="grid grid-cols-3 gap-1">
                              {tabItems.map((it) => (
                                <a
                                  key={it.id}
                                  href={it.mediaUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  title={it.content || it.mediaUrl}
                                >
                                  <img
                                    src={it.mediaUrl}
                                    alt=""
                                    loading="lazy"
                                    className="w-full h-20 object-cover rounded-md hover:opacity-90 transition-opacity"
                                  />
                                </a>
                              ))}
                            </div>
                          ) : (
                            <div className="space-y-1 max-h-64 overflow-y-auto">
                              {tabItems.map((it) => (
                                <div
                                  key={it.id}
                                  className="flex items-center gap-2.5 rounded-md p-1.5 hover:bg-secondary/60"
                                >
                                  <span className="w-9 h-9 rounded-full bg-secondary inline-flex items-center justify-center shrink-0">
                                    <FileText className="w-4 h-4 text-muted-foreground" />
                                  </span>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-[12px] truncate text-foreground">
                                      {it.content || it.mediaUrl.split("/").pop()}
                                    </p>
                                    <p className="text-[10px] text-muted-foreground">
                                      {new Date(it.createdAt).toLocaleDateString(dateLocale, {
                                        day: "numeric",
                                        month: "short",
                                        year: "numeric",
                                      })}
                                    </p>
                                  </div>
                                  <a
                                    href={it.mediaUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    download
                                    aria-label={t("liveChat.download")}
                                    title={t("liveChat.download")}
                                    className="w-8 h-8 shrink-0 rounded-full inline-flex items-center justify-center text-muted-foreground hover:bg-secondary"
                                  >
                                    <Download className="w-4 h-4" />
                                  </a>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Tab Tautan */}
                      {infoTab === "links" && (
                        <div className="mt-3">
                          {chatLinks.length === 0 ? (
                            <p className="py-8 text-center text-[12px] text-muted-foreground">
                              {t("liveChat.noLinks")}
                            </p>
                          ) : (
                            <div className="space-y-1 max-h-64 overflow-y-auto">
                              {chatLinks.map((l) => (
                                <a
                                  key={l.url}
                                  href={l.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="flex items-center gap-2.5 rounded-md p-1.5 hover:bg-secondary/60"
                                >
                                  <LinkIcon className="w-4 h-4 text-[#00a884] shrink-0" />
                                  <span className="flex-1 min-w-0">
                                    <span className="block text-[12px] text-[#00a884] dark:text-[#06cf9c] truncate hover:underline">
                                      {l.url}
                                    </span>
                                    <span className="block text-[10px] text-muted-foreground">
                                      {new Date(l.createdAt).toLocaleDateString(dateLocale, {
                                        day: "numeric",
                                        month: "short",
                                        year: "numeric",
                                      })}
                                    </span>
                                  </span>
                                </a>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
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
            <div className="relative flex-1 overflow-y-auto bg-[#efeae2] dark:bg-[#0b141a]">
              {/* Doodle khas WA */}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 dark:hidden"
                style={{ backgroundImage: WA_DOODLE_LIGHT }}
              />
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 hidden dark:block"
                style={{ backgroundImage: WA_DOODLE_DARK }}
              />
              <div className="relative p-4 space-y-1.5">
              {(() => {
                let lastDay = "";
                return messages.map((msg, i) => {
                  const out = msg.direction === "out";
                  const day = dayKeyOf(new Date(msg.createdAt));
                  const showChip = day !== lastDay;
                  lastDay = day;
                  const showToolbar = toolbarMsg === msg.id && !msg.isDeleted;
                  const showReactions = reactionFor === msg.id;
                  const grouped: { emoji: string; count: number }[] = [];
                  (msg.reactions ?? []).forEach((r) => {
                    const g = grouped.find((x) => x.emoji === r.emoji);
                    if (g) g.count++;
                    else grouped.push({ emoji: r.emoji, count: 1 });
                  });
                  const bubbleCls = cn(
                    "px-2.5 pt-1.5 pb-1 text-[13.5px] leading-snug shadow-[0_1px_1px_rgba(0,0,0,0.12)]",
                    out
                      ? "bg-[#d9fdd3] dark:bg-[#005c4b] text-[#111b21] dark:text-[#e9edef] rounded-[7.5px] rounded-tr-none"
                      : "bg-white dark:bg-[#1f2c34] text-[#111b21] dark:text-[#e9edef] rounded-[7.5px] rounded-tl-none"
                  );
                  const timeCls = cn(
                    "float-right flex items-center gap-1 ml-2 mt-2.5 text-[10px] leading-none",
                    out ? "text-[#667781] dark:text-[#e9edef]/70" : "text-[#667781] dark:text-[#8696a0]"
                  );
                  const msgTime = new Date(msg.createdAt).toLocaleTimeString(dateLocale, {
                    hour: "2-digit",
                    minute: "2-digit",
                  });
                  const tbBtn =
                    "w-7 h-7 rounded-full inline-flex items-center justify-center text-[#54656f] dark:text-[#aebac1] hover:bg-black/5 dark:hover:bg-white/10 transition-colors";
                  return (
                    <>
                      {showChip && (
                        <div key={`chip-${msg.id}`} className="flex justify-center py-1">
                          <span className="px-3 py-1 rounded-md bg-white/95 dark:bg-[#1f2c34] shadow-sm text-[11px] font-medium uppercase text-[#54656f] dark:text-[#aebac1]">
                            {dayChipLabel(
                              msg.createdAt,
                              t("liveChat.todayLabel"),
                              t("liveChat.yesterdayLabel"),
                              dateLocale
                            )}
                          </span>
                        </div>
                      )}
                      <div
                        key={msg.id}
                        ref={(el) => {
                          if (el) msgRefs.current.set(i, el);
                          else msgRefs.current.delete(i);
                        }}
                        className={cn("flex", out ? "justify-end" : "justify-start")}
                      >
                        <div
                          className="relative max-w-[75%] md:max-w-[65%]"
                          onMouseEnter={() => {
                            if (!msg.isDeleted) setToolbarMsg(msg.id);
                          }}
                          onMouseLeave={() => {
                            setToolbarMsg((v) => (v === msg.id ? null : v));
                            setReactionFor((v) => (v === msg.id ? null : v));
                          }}
                          onClick={() =>
                            setToolbarMsg((v) => (v === msg.id ? null : msg.isDeleted ? null : msg.id))
                          }
                        >
                          {/* Toolbar aksi: muncul saat hover / tap bubble */}
                          {showToolbar && !showReactions && (
                            <div
                              className="absolute -top-4 z-10 flex items-center gap-0.5 rounded-full bg-white dark:bg-[#1f2c34] shadow-lg border border-black/10 dark:border-white/10 px-1 py-0.5"
                              style={out ? { right: 0 } : { left: 0 }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                className={tbBtn}
                                aria-label={t("liveChat.reply")}
                                title={t("liveChat.reply")}
                                onClick={() => startReply(msg)}
                              >
                                <Undo2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                className={tbBtn}
                                aria-label={t("liveChat.forward")}
                                title={t("liveChat.forward")}
                                onClick={() => {
                                  setForwardMsg(msg);
                                  setToolbarMsg(null);
                                }}
                              >
                                <Forward className="w-3.5 h-3.5" />
                              </button>
                              <button
                                className={tbBtn}
                                aria-label={t("liveChat.react")}
                                title={t("liveChat.react")}
                                onClick={() => setReactionFor(msg.id)}
                              >
                                <Smile className="w-3.5 h-3.5" />
                              </button>
                              {out && (
                                <button
                                  className={cn(tbBtn, "text-red-500")}
                                  aria-label={t("liveChat.deleteForEveryone")}
                                  title={t("liveChat.deleteForEveryone")}
                                  onClick={() => deleteMessage(msg)}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          )}
                          {/* Popover reaksi cepat */}
                          {showReactions && (
                            <div
                              className="absolute -top-4 z-10 flex items-center gap-1 rounded-full bg-white dark:bg-[#1f2c34] shadow-lg border border-black/10 dark:border-white/10 px-2 py-1"
                              style={out ? { right: 0 } : { left: 0 }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              {QUICK_EMOJIS.map((em) => (
                                <button
                                  key={em}
                                  onClick={() => reactTo(msg, em)}
                                  className="text-lg leading-none hover:scale-125 transition-transform"
                                  aria-label={em}
                                >
                                  {em}
                                </button>
                              ))}
                              <button
                                onClick={() => setReactionFor(null)}
                                className={cn(tbBtn, "w-6 h-6")}
                                aria-label={t("liveChat.closeReactions")}
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          )}
                          <BubbleTail out={out} />
                          <div className={bubbleCls}>
                            {msg.isDeleted ? (
                              <>
                                <span className={timeCls}>
                                  {msgTime}
                                  {out && <Ticks read={msg.isRead} />}
                                </span>
                                <p className="italic text-[#667781] dark:text-[#8696a0] flex items-center gap-1.5">
                                  <span aria-hidden>🚫</span>
                                  {t("liveChat.deletedMessage")}
                                </p>
                              </>
                            ) : (
                              <>
                                <span className={timeCls}>
                                  {msgTime}
                                  {out && <Ticks read={msg.isRead} />}
                                </span>
                                {/* Kutipan balasan ala WA */}
                                {msg.replyContent && (
                                  <div className="mb-1 rounded border-l-[3px] border-[#00a884] bg-black/5 dark:bg-white/5 px-2 py-1">
                                    <p className="text-[12px] text-[#667781] dark:text-[#aebac1] line-clamp-3 break-words">
                                      {msg.replyContent}
                                    </p>
                                  </div>
                                )}
                                {/* Media */}
                                {msg.mediaUrl && (msg.type === "image" || msg.type === "sticker") && (
                                  <img
                                    src={msg.mediaUrl}
                                    alt=""
                                    className="rounded-md max-h-64 w-full object-cover mb-1"
                                    loading="lazy"
                                  />
                                )}
                                {msg.mediaUrl && msg.type === "video" && (
                                  <video
                                    src={msg.mediaUrl}
                                    controls
                                    className="rounded-md max-h-64 w-full mb-1 bg-black"
                                  />
                                )}
                                {msg.mediaUrl && (msg.type === "audio" || msg.type === "voicenote") && (
                                  <audio src={msg.mediaUrl} controls className="w-56 max-w-full my-1" />
                                )}
                                {msg.mediaUrl && msg.type === "document" && (
                                  <div className="flex items-center gap-2.5 py-1 min-w-[180px]">
                                    <span className="w-10 h-10 rounded-full bg-black/5 dark:bg-white/10 inline-flex items-center justify-center shrink-0">
                                      <FileText className="w-5 h-5 text-[#667781] dark:text-[#aebac1]" />
                                    </span>
                                    <div className="min-w-0 flex-1">
                                      <p className="text-[13px] truncate">
                                        {msg.fileName || t("liveChat.document")}
                                      </p>
                                      {msg.content && msg.fileName && (
                                        <p className="text-[11px] text-[#667781] dark:text-[#8696a0] truncate">
                                          {msg.content}
                                        </p>
                                      )}
                                    </div>
                                    <a
                                      href={msg.mediaUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                      download
                                      aria-label={t("liveChat.download")}
                                      title={t("liveChat.download")}
                                      onClick={(e) => e.stopPropagation()}
                                      className="w-8 h-8 shrink-0 rounded-full inline-flex items-center justify-center text-[#54656f] dark:text-[#aebac1] hover:bg-black/5 dark:hover:bg-white/10"
                                    >
                                      <Download className="w-4 h-4" />
                                    </a>
                                  </div>
                                )}
                                {/* Teks / caption */}
                                {(!msg.mediaUrl || msg.type === "text" || msg.type === "image" || msg.type === "video" || msg.type === "sticker") &&
                                  msg.content && (
                                    <p className="whitespace-pre-wrap break-words">
                                      {msgQuery.trim() ? highlight(msg.content, msgQuery) : msg.content}
                                    </p>
                                  )}
                              </>
                            )}
                          </div>
                          {/* Chips reaksi */}
                          {grouped.length > 0 && !msg.isDeleted && (
                            <div className={cn("flex flex-wrap gap-1 mt-1", out ? "justify-end" : "justify-start")}>
                              {grouped.map((g) => (
                                <span
                                  key={g.emoji}
                                  className="inline-flex items-center gap-0.5 rounded-full bg-white dark:bg-[#1f2c34] border border-black/10 dark:border-white/10 px-1.5 py-0.5 text-[11px] shadow-sm"
                                >
                                  {g.emoji}
                                  {g.count > 1 && (
                                    <span className="text-[#667781] dark:text-[#8696a0]">{g.count}</span>
                                  )}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </>
                  );
                });
              })()}
              <div ref={messagesEndRef} />
              </div>
            </div>

            {/* Input Area */}
            <div className="px-3 py-2 bg-[#f0f2f5] dark:bg-[#1f2c34] relative">
              {/* Preview balasan */}
              {replyTo && (
                <div className="mb-2 rounded-md bg-white dark:bg-[#2a3942] border-l-4 border-[#00a884] px-3 py-1.5 flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-semibold text-[#00a884] dark:text-[#06cf9c] truncate">
                      {replyTo.name}
                    </p>
                    <p className="text-[12px] text-[#667781] dark:text-[#aebac1] truncate">
                      {replyTo.content}
                    </p>
                  </div>
                  <button
                    onClick={() => setReplyTo(null)}
                    aria-label={t("liveChat.cancelReply")}
                    className="w-6 h-6 shrink-0 rounded-full inline-flex items-center justify-center text-[#667781] dark:text-[#8696a0] hover:bg-black/5 dark:hover:bg-white/10"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
              {/* Preview media sebelum dikirim */}
              {mediaFile && (
                <div className="mb-2 rounded-lg bg-white dark:bg-[#2a3942] p-2 flex items-center gap-3">
                  {mediaPreviewUrl ? (
                    <img
                      src={mediaPreviewUrl}
                      alt=""
                      className="w-12 h-12 rounded-md object-cover shrink-0"
                    />
                  ) : (
                    <span className="w-12 h-12 rounded-md bg-black/5 dark:bg-white/10 inline-flex items-center justify-center shrink-0">
                      {mediaKind === "video" ? (
                        <Video className="w-6 h-6 text-[#667781] dark:text-[#8696a0]" />
                      ) : (
                        <FileText className="w-6 h-6 text-[#667781] dark:text-[#8696a0]" />
                      )}
                    </span>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] text-[#667781] dark:text-[#8696a0] truncate">
                      {mediaFile.name}
                    </p>
                    <input
                      placeholder={t("liveChat.addCaption")}
                      value={mediaCaption}
                      onChange={(e) => setMediaCaption(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) sendMedia();
                      }}
                      disabled={uploading}
                      className="w-full bg-transparent text-[13px] text-[#111b21] dark:text-[#e9edef] placeholder:text-[#667781] dark:placeholder:text-[#8696a0] focus:outline-none"
                    />
                  </div>
                  {uploading ? (
                    <span className="inline-flex items-center gap-1.5 text-[11px] text-[#667781] dark:text-[#8696a0] shrink-0">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      {t("liveChat.uploading")}
                    </span>
                  ) : (
                    <button
                      onClick={clearMedia}
                      aria-label={t("liveChat.cancelMedia")}
                      className="w-8 h-8 shrink-0 rounded-full inline-flex items-center justify-center text-[#667781] dark:text-[#8696a0] hover:bg-black/5 dark:hover:bg-white/10"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              )}
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
                <button
                  onClick={handleAIReply}
                  disabled={loading}
                  className="flex-1 h-10 rounded-full bg-[#00a884] text-white text-sm font-medium inline-flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  <Bot className="w-4 h-4" />
                  {loading ? t("liveChat.generating") : t("liveChat.generateAiReply")}
                </button>
              ) : recording || sendingVoice ? (
                /* UI merekam voice note */
                <>
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse shrink-0 ml-1" />
                  <span className="text-[14px] tabular-nums text-[#111b21] dark:text-[#e9edef] shrink-0">
                    {fmtRecSecs(recSecs)}
                  </span>
                  <span className="text-[12px] text-[#667781] dark:text-[#8696a0]">
                    {sendingVoice ? t("liveChat.uploading") : t("liveChat.recording")}
                  </span>
                  <div className="flex-1" />
                  <button
                    onClick={() => stopRecording(true)}
                    disabled={sendingVoice}
                    aria-label={t("liveChat.cancelRecording")}
                    title={t("liveChat.cancelRecording")}
                    className="w-10 h-10 shrink-0 rounded-full inline-flex items-center justify-center text-[#54656f] dark:text-[#aebac1] hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-40"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => stopRecording(false)}
                    disabled={sendingVoice}
                    aria-label={t("liveChat.stopRecording")}
                    title={t("liveChat.stopRecording")}
                    className="w-10 h-10 shrink-0 rounded-full bg-[#00a884] text-white inline-flex items-center justify-center hover:bg-[#06cf9c] transition-colors disabled:opacity-40"
                  >
                    {sendingVoice ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <Square className="w-4 h-4 fill-current" />
                    )}
                  </button>
                </>
              ) : (
                <>
                  {/* Paperclip: kirim media */}
                  <div className="relative shrink-0" ref={attachMenuRef}>
                    <button
                      onClick={() => setAttachOpen((v) => !v)}
                      aria-label={t("liveChat.attach")}
                      title={t("liveChat.attach")}
                      className="w-10 h-10 rounded-full inline-flex items-center justify-center text-[#54656f] dark:text-[#aebac1] hover:bg-black/5 dark:hover:bg-white/10"
                    >
                      <Paperclip className="w-5 h-5" />
                    </button>
                    {attachOpen && (
                      <div className="absolute left-0 bottom-full mb-2 z-20 w-44 rounded-lg border border-border bg-card shadow-xl py-1">
                        <button
                          onClick={() => openAttach("image")}
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] text-foreground hover:bg-secondary text-left"
                        >
                          <Camera className="w-4 h-4 text-[#00a884]" />
                          {t("liveChat.photoVideo")}
                        </button>
                        <button
                          onClick={() => openAttach("document")}
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] text-foreground hover:bg-secondary text-left"
                        >
                          <FileText className="w-4 h-4 text-[#00a884]" />
                          {t("liveChat.document")}
                        </button>
                      </div>
                    )}
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    onChange={onAttachFile}
                  />
                  <button
                    onClick={toggleQuickReplies}
                    aria-label={t("liveChat.quickReplies")}
                    title={t("liveChat.quickReplies")}
                    className="w-10 h-10 shrink-0 rounded-full inline-flex items-center justify-center text-[#54656f] dark:text-[#aebac1] hover:bg-black/5 dark:hover:bg-white/10"
                  >
                    <Zap className="w-5 h-5" />
                  </button>
                  <input
                    placeholder={t("liveChat.typeMessage")}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (mediaFile ? sendMedia() : handleSend())}
                    className="flex-1 h-10 px-4 rounded-full bg-white dark:bg-[#2a3942] text-[14px] text-[#111b21] dark:text-[#e9edef] placeholder:text-[#667781] dark:placeholder:text-[#8696a0] focus:outline-none min-w-0"
                    disabled={loading || uploading}
                  />
                  {mediaFile ? (
                    <button
                      onClick={sendMedia}
                      disabled={uploading}
                      aria-label={t("liveChat.send")}
                      className="w-10 h-10 shrink-0 rounded-full bg-[#00a884] text-white inline-flex items-center justify-center disabled:opacity-40 hover:bg-[#06cf9c] transition-colors"
                    >
                      {uploading ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <Send className="w-5 h-5" />
                      )}
                    </button>
                  ) : input.trim() ? (
                    <button
                      onClick={handleSend}
                      disabled={loading}
                      aria-label={t("liveChat.send")}
                      className="w-10 h-10 shrink-0 rounded-full bg-[#00a884] text-white inline-flex items-center justify-center disabled:opacity-40 hover:bg-[#06cf9c] transition-colors"
                    >
                      <Send className="w-5 h-5" />
                    </button>
                  ) : (
                    <button
                      onClick={startRecording}
                      aria-label={t("liveChat.voiceNote")}
                      title={t("liveChat.voiceNote")}
                      className="w-10 h-10 shrink-0 rounded-full inline-flex items-center justify-center text-[#54656f] dark:text-[#aebac1] hover:bg-black/5 dark:hover:bg-white/10"
                    >
                      <Mic className="w-5 h-5" />
                    </button>
                  )}
                </>
              )}
              </div>
            </div>
          </>
        ) : (
          /* Empty State ala WA */
          <div className="relative flex-1 flex items-center justify-center overflow-hidden bg-[#f8f9fa] dark:bg-[#0b141a] border-b-8 border-[#25d366]/60 dark:border-[#00a884]/40">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 dark:hidden opacity-60"
              style={{ backgroundImage: WA_DOODLE_LIGHT }}
            />
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 hidden dark:block opacity-60"
              style={{ backgroundImage: WA_DOODLE_DARK }}
            />
            <div className="relative text-center px-8 max-w-sm">
              <div className="mx-auto w-20 h-20 rounded-full bg-[#25d366]/15 dark:bg-[#00a884]/15 inline-flex items-center justify-center mb-4">
                <MessageCircle className="w-10 h-10 text-[#00a884]" />
              </div>
              <p className="text-xl font-light text-[#111b21] dark:text-[#e9edef]">WaGataway Chat</p>
              <p className="text-[13px] text-[#667781] dark:text-[#8696a0] mt-2">
                {t("liveChat.emptyHint")}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Modal teruskan pesan */}
      {forwardMsg && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setForwardMsg(null)}
        >
          <div
            className="w-full max-w-sm rounded-xl bg-white dark:bg-[#1f2c34] shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-black/10 dark:border-white/10">
              <p className="text-[14px] font-semibold text-[#111b21] dark:text-[#e9edef]">
                {t("liveChat.forwardTo")}
              </p>
              <button
                onClick={() => setForwardMsg(null)}
                aria-label={t("liveChat.closeSearch")}
                className="w-8 h-8 rounded-full inline-flex items-center justify-center text-[#54656f] dark:text-[#aebac1] hover:bg-black/5 dark:hover:bg-white/10"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-4 py-2 border-b border-black/5 dark:border-white/5 bg-[#f0f2f5] dark:bg-[#111b21]">
              <p className="text-[12px] text-[#667781] dark:text-[#8696a0] truncate">
                <MediaPreview type={forwardMsg.type} text={forwardMsg.content} t={t} />
              </p>
            </div>
            <div className="max-h-80 overflow-y-auto py-1">
              {filteredConvos.length === 0 ? (
                <p className="px-4 py-6 text-center text-[12px] text-[#667781] dark:text-[#8696a0]">
                  {t("liveChat.noConversations")}
                </p>
              ) : (
                filteredConvos.map((c) => (
                  <button
                    key={c.phone}
                    disabled={forwarding}
                    onClick={() => doForward(c.phone)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-50 transition-colors"
                  >
                    <ChatAvatar
                      deviceId={activeDeviceId}
                      phone={c.phone}
                      name={c.contactName || c.phone}
                    />
                    <span className="flex-1 min-w-0">
                      <span className="block text-[13px] text-[#111b21] dark:text-[#e9edef] truncate">
                        {c.contactName || c.phone}
                      </span>
                      <span className="block text-[11px] text-[#667781] dark:text-[#8696a0] truncate">
                        {c.phone}
                      </span>
                    </span>
                    {forwarding && <Loader2 className="w-4 h-4 animate-spin text-[#00a884]" />}
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

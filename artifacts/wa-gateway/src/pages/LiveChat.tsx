import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import {
  Send, Search, Phone, MessageSquareDot, ArrowLeft,
  ImageIcon, FileText, Volume2, Sticker, Loader2, CheckCheck,
  Check, Clock, RefreshCw, Plus, Trash2, MailCheck, CornerUpLeft,
  X, Smile, ChevronUp, MoreVertical, Copy, Bot, BotOff,
  Tag, User, Timer, StickyNote, Zap, ChevronRight,
  BarChart2, CheckCircle, Circle, AlertCircle, PauseCircle,
  Shield, Settings, UserCheck, ArrowRightLeft,
} from "lucide-react";
import { apiFetch, getToken } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Device { id: number; name: string; status: string; }
interface Conversation {
  jid: string; contactName: string | null; phone: string; isGroup: boolean;
  lastMessage: string; lastMessageTime: string; lastFromMe: boolean; unread: number;
}
interface ChatMessage {
  id: number; jid: string; fromMe: boolean; text: string | null;
  mediaType: string | null; mediaUrl: string | null; status: string; isRead: boolean;
  isInternal: boolean; timestamp: string; contactName: string | null; messageId: string | null;
}
interface MessagesResponse { messages: ChatMessage[]; total: number; hasMore: boolean; }
interface ConvMeta {
  id: number; userId: number; deviceId: number; jid: string; contactName: string | null;
  status: string; assignedAgent: string | null; tags: string | null;
  slaDeadline: string | null; botPaused: boolean; resolvedAt: string | null;
  createdAt: string; updatedAt: string;
}
interface CannedResponse { id: number; shortcut: string; title: string; body: string; }
interface Report {
  totalConversations: number; totalMessages: number; resolvedToday: number; slaBreached: number;
  byStatus: Record<string, number>; byAgent: Record<string, number>; byTag: Record<string, number>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const CONV_STATUS: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  open:        { label: "Baru",      color: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400",     icon: <Circle size={10} /> },
  in_progress: { label: "Diproses",  color: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400", icon: <AlertCircle size={10} /> },
  resolved:    { label: "Selesai",   color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400", icon: <CheckCircle size={10} /> },
  pending:     { label: "Pending",   color: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-400",     icon: <PauseCircle size={10} /> },
};
const ALL_TAGS = ["Komplain", "Sales", "Urgent", "Teknis", "Billing", "Feedback", "Pertanyaan"];

function fmt(ts: string): string {
  return new Date(ts).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}
function fmtDate(ts: string): string {
  const d = new Date(ts); const now = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diff === 0 && now.getDate() === d.getDate()) return "Hari ini";
  if (diff <= 1) return "Kemarin";
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
}
function fmtConvTime(ts: string): string {
  const d = new Date(ts); const now = new Date();
  if (now.getDate() === d.getDate() && now.getFullYear() === d.getFullYear())
    return d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
  if (Math.floor((now.getTime() - d.getTime()) / 86400000) <= 1) return "Kemarin";
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "short" });
}
function phoneFromJid(jid: string) { return jid.replace("@s.whatsapp.net", "").replace("@g.us", ""); }
function initials(name: string | null, jid: string): string {
  return (name || phoneFromJid(jid)).slice(0, 2).toUpperCase();
}
const COLORS = ["bg-emerald-500","bg-blue-500","bg-violet-500","bg-rose-500","bg-amber-500","bg-teal-500","bg-indigo-500","bg-pink-500","bg-cyan-500","bg-orange-500"];
function avatarColor(jid: string): string {
  let h = 0; for (const c of jid) h = (h * 31 + c.charCodeAt(0)) & 0xffffffff;
  return COLORS[Math.abs(h) % COLORS.length];
}
function slaRemaining(deadline: string): { label: string; urgent: boolean } {
  const diff = new Date(deadline).getTime() - Date.now();
  if (diff <= 0) return { label: "SLA terlewat!", urgent: true };
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  return { label: h > 0 ? `${h}j ${m}m` : `${m}m`, urgent: diff < 30 * 60000 };
}

// ── Emoji Picker ──────────────────────────────────────────────────────────────

const EMOJIS = [
  "😀","😃","😄","😁","😆","😅","🤣","😂","🙂","😊","😇","🥰","😍","🤩","😘",
  "😚","😋","😛","😜","🤪","😝","🤑","🤗","🤭","🤫","🤔","🤐","🤨","😐","😑",
  "😶","😏","😒","🙄","😬","😔","😪","🤤","😴","😷","🤒","🤕","🤢","🥵","🥶",
  "👍","👎","👋","🤝","👏","🙌","✊","👊","✌️","🤞","🖖","🤟","🤘",
  "❤️","🧡","💛","💚","💙","💜","🖤","💕","💞","💓","💗","💖","💘","💝",
  "🙏","👀","💯","🔥","✅","❌","⭐","🎉","🎊","🎈","🎁","🏆","💪","🌟","✨","🚀",
];

function EmojiPicker({ onSelect, onClose }: { onSelect: (e: string) => void; onClose: () => void }) {
  return (
    <div className="absolute bottom-full mb-2 left-0 z-50 w-72 rounded-xl border border-border bg-popover shadow-lg p-2">
      <div className="grid grid-cols-8 gap-0.5 max-h-48 overflow-y-auto">
        {EMOJIS.map((e) => (
          <button key={e} onClick={() => onSelect(e)}
            className="text-xl p-1 rounded hover:bg-muted transition-colors leading-none">
            {e}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Media Display ─────────────────────────────────────────────────────────────

function MediaBubble({ type, url }: { type: string; url: string | null }) {
  if (type === "image" && url) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer">
        <img src={url} alt="Gambar" className="max-w-[220px] rounded-lg object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
      </a>
    );
  }
  if (type === "video" && url) {
    return <video src={url} controls className="max-w-[220px] rounded-lg" />;
  }
  if (type === "audio" && url) {
    return <audio src={url} controls className="max-w-[200px]" />;
  }
  const icons: Record<string, React.ReactNode> = {
    image: <><ImageIcon size={13} /> Gambar</>,
    video: <><Volume2 size={13} /> Video</>,
    audio: <><Volume2 size={13} /> Audio</>,
    document: <><FileText size={13} /> Dokumen</>,
    sticker: <><Sticker size={13} /> Stiker</>,
  };
  return (
    <span className="flex items-center gap-1 italic text-[12px] opacity-80">
      {icons[type] ?? "Media"}
    </span>
  );
}

// ── Date Separator ────────────────────────────────────────────────────────────

function DateSep({ date }: { date: string }) {
  return (
    <div className="flex items-center gap-2 my-4 px-2">
      <div className="flex-1 h-px bg-border/50" />
      <span className="text-[11px] text-muted-foreground bg-muted/60 px-3 py-0.5 rounded-full border border-border/40 whitespace-nowrap font-medium">{date}</span>
      <div className="flex-1 h-px bg-border/50" />
    </div>
  );
}

// ── Reply Preview ─────────────────────────────────────────────────────────────

function ReplyPreview({ msg, onCancel }: { msg: ChatMessage; onCancel: () => void }) {
  return (
    <div className="flex items-start gap-2 bg-muted/60 border-l-4 border-emerald-500 rounded-lg px-3 py-2 mb-2">
      <CornerUpLeft size={14} className="text-emerald-500 mt-0.5 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 mb-0.5">
          {msg.fromMe ? "Anda" : (msg.contactName || "Kontak")}
        </p>
        <p className="text-xs text-muted-foreground truncate">
          {msg.text || (msg.mediaType ? `[${msg.mediaType}]` : "Pesan")}
        </p>
      </div>
      <button onClick={onCancel} className="text-muted-foreground hover:text-foreground ml-1 flex-shrink-0"><X size={14} /></button>
    </div>
  );
}

// ── Message Bubble ────────────────────────────────────────────────────────────

function Bubble({ msg, onReply, onCopy }: { msg: ChatMessage; onReply: (m: ChatMessage) => void; onCopy: (t: string) => void }) {
  const isMe = msg.fromMe;
  const isNote = msg.isInternal;
  const [showCtx, setShowCtx] = useState(false);

  if (isNote) {
    return (
      <div className="flex justify-center my-2">
        <div className="max-w-[80%] bg-amber-50 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-800/30 rounded-xl px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
          <div className="flex items-center gap-1 font-semibold mb-0.5 text-amber-600 dark:text-amber-400">
            <StickyNote size={10} /> Catatan Internal · {msg.contactName || "Agen"}
          </div>
          <p className="whitespace-pre-wrap">{msg.text}</p>
          <p className="text-[10px] opacity-60 text-right mt-1">{fmt(msg.timestamp)}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("group flex items-end gap-1.5 max-w-full", isMe ? "flex-row-reverse" : "flex-row")} onContextMenu={(e) => { e.preventDefault(); setShowCtx(true); }}>
      <DropdownMenu open={showCtx} onOpenChange={setShowCtx}>
        <DropdownMenuTrigger asChild>
          <button className={cn("opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-full hover:bg-muted/70 flex-shrink-0 mb-1", isMe ? "mr-0.5" : "ml-0.5")} onClick={() => setShowCtx(true)}>
            <MoreVertical size={13} className="text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align={isMe ? "end" : "start"} className="w-40">
          <DropdownMenuItem onClick={() => onReply(msg)}><CornerUpLeft size={14} className="mr-2" /> Balas</DropdownMenuItem>
          {msg.text && <DropdownMenuItem onClick={() => onCopy(msg.text!)}><Copy size={14} className="mr-2" /> Salin teks</DropdownMenuItem>}
        </DropdownMenuContent>
      </DropdownMenu>

      <div className={cn("relative max-w-[72%] md:max-w-[60%] rounded-2xl px-3 py-2 text-sm shadow-sm", isMe ? "bg-emerald-500 dark:bg-emerald-600 text-white rounded-br-sm" : "bg-white dark:bg-zinc-800 text-foreground rounded-bl-sm border border-border/40")}>
        {msg.text?.startsWith(">") && (
          <div className="border-l-2 border-emerald-300/60 pl-2 mb-1.5 opacity-80">
            <p className="text-[11px] line-clamp-2">{msg.text.split("\n")[0].slice(1).trim()}</p>
          </div>
        )}
        {msg.mediaType
          ? <MediaBubble type={msg.mediaType} url={msg.mediaUrl} />
          : msg.text
          ? <p className="whitespace-pre-wrap break-words leading-relaxed">{msg.text}</p>
          : <span className="italic text-[11px] opacity-60">Pesan kosong</span>}
        <div className={cn("flex items-center gap-1 mt-1 justify-end", isMe ? "text-white/70" : "text-muted-foreground")}>
          <span className="text-[10px]">{fmt(msg.timestamp)}</span>
          {isMe && (msg.status === "sending" ? <Clock size={11} /> : msg.isRead ? <CheckCheck size={11} className="text-blue-300" /> : <Check size={11} />)}
        </div>
      </div>
    </div>
  );
}

// ── Conversation Item ─────────────────────────────────────────────────────────

function ConvItem({ conv, meta, active, onClick, onDelete, onMarkUnread }: {
  conv: Conversation; meta?: ConvMeta; active: boolean;
  onClick: () => void; onDelete: () => void; onMarkUnread: () => void;
}) {
  const name = conv.contactName || conv.phone;
  const status = meta?.status ?? "open";
  const st = CONV_STATUS[status] ?? CONV_STATUS.open!;
  const slaInfo = meta?.slaDeadline ? slaRemaining(meta.slaDeadline) : null;

  return (
    <div
      className={cn("group relative flex items-center gap-3 px-4 py-3 hover:bg-muted/50 cursor-pointer transition-colors border-b border-border/30", active && "bg-muted/70 dark:bg-muted/40")}
      onClick={onClick}
    >
      <div className="relative flex-shrink-0">
        <div className={cn("w-11 h-11 rounded-full flex items-center justify-center text-white font-semibold text-sm", avatarColor(conv.jid))}>
          {initials(conv.contactName, conv.jid)}
        </div>
        {meta?.botPaused && (
          <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-amber-500 rounded-full flex items-center justify-center">
            <BotOff size={9} className="text-white" />
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-baseline">
          <span className="font-semibold text-sm truncate">{name}</span>
          <span className={cn("text-[10px] flex-shrink-0 ml-2", conv.unread > 0 ? "text-emerald-600 dark:text-emerald-400 font-medium" : "text-muted-foreground")}>
            {fmtConvTime(conv.lastMessageTime)}
          </span>
        </div>
        <div className="flex justify-between items-center mt-0.5">
          <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
            {conv.lastFromMe && <CheckCheck size={11} className="flex-shrink-0 text-muted-foreground" />}
            <span className="truncate">{conv.lastMessage || <i>Media</i>}</span>
          </p>
          <div className="flex items-center gap-1 flex-shrink-0 ml-1">
            {slaInfo?.urgent && <span className="text-[9px] font-bold text-rose-500">{slaInfo.label}</span>}
            {conv.unread > 0 && (
              <span className="min-w-[18px] h-[18px] rounded-full bg-emerald-500 text-white text-[10px] font-bold flex items-center justify-center px-1">
                {conv.unread > 99 ? "99+" : conv.unread}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 mt-0.5">
          {status === "pending" ? (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-rose-500 text-white animate-pulse">
              <UserCheck size={9} /> Perlu Agen
            </span>
          ) : (
            <span className={cn("inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full", st.color)}>
              {st.icon} {st.label}
            </span>
          )}
          {meta?.assignedAgent && (
            <span className="text-[10px] text-muted-foreground truncate max-w-[80px]">· {meta.assignedAgent}</span>
          )}
          {meta?.tags && meta.tags.split(",").filter(Boolean).slice(0, 1).map((t) => (
            <span key={t} className="text-[9px] bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400 px-1.5 py-0.5 rounded-full font-medium">{t.trim()}</span>
          ))}
        </div>
      </div>

      <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="p-1 rounded-full hover:bg-border/60"><MoreVertical size={14} className="text-muted-foreground" /></button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onClick={onMarkUnread}><MailCheck size={14} className="mr-2" /> Tandai belum dibaca</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive"><Trash2 size={14} className="mr-2" /> Hapus percakapan</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

// ── Right Info Panel ──────────────────────────────────────────────────────────

function InfoPanel({
  jid, deviceId, conv, meta, onMetaChange, messages, onClose,
  cannedResponses, onSendNote,
}: {
  jid: string; deviceId: string; conv: Conversation | undefined; meta: ConvMeta | null;
  onMetaChange: (m: ConvMeta) => void; messages: ChatMessage[];
  onClose: () => void; cannedResponses: CannedResponse[];
  onSendNote: (text: string, author: string) => void;
}) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"info" | "notes" | "canned">("info");
  const [noteText, setNoteText] = useState("");
  const [noteAuthor, setNoteAuthor] = useState("Agen");
  const [tagInput, setTagInput] = useState("");
  const [agentInput, setAgentInput] = useState(meta?.assignedAgent ?? "");
  const [slaHours, setSlaHours] = useState(4);
  const [savingStatus, setSavingStatus] = useState(false);

  const phone = phoneFromJid(jid);
  const name = conv?.contactName || phone;
  const tags = meta?.tags ? meta.tags.split(",").filter(Boolean).map((t) => t.trim()) : [];
  const slaInfo = meta?.slaDeadline ? slaRemaining(meta.slaDeadline) : null;

  async function patchConv(path: string, body: object) {
    const r = await apiFetch(`/chat/conversation/${encodeURIComponent(jid)}/${path}?deviceId=${deviceId}`, {
      method: "PUT", body: JSON.stringify(body),
    });
    const data = await r.json();
    onMetaChange(data);
    return data;
  }

  async function setStatus(status: string) {
    setSavingStatus(true);
    try { await patchConv("status", { status }); toast({ title: `Status diubah ke: ${CONV_STATUS[status]?.label}` }); }
    finally { setSavingStatus(false); }
  }

  async function assignAgent() {
    await patchConv("assign", { assignedAgent: agentInput.trim() || null });
    toast({ title: agentInput.trim() ? `Ditugaskan ke ${agentInput.trim()}` : "Penugasan dihapus" });
  }

  async function addTag(tag: string) {
    const current = tags.includes(tag) ? tags.filter((t) => t !== tag) : [...tags, tag];
    await patchConv("tags", { tags: current });
  }

  async function setSla() {
    const deadline = new Date(Date.now() + slaHours * 3600000).toISOString();
    await patchConv("sla", { slaDeadline: deadline });
    toast({ title: `SLA ditetapkan ${slaHours}j dari sekarang` });
  }

  async function toggleBotPause() {
    await patchConv("bot-pause", { botPaused: !meta?.botPaused });
    toast({ title: meta?.botPaused ? "CS Bot diaktifkan kembali" : "CS Bot dijeda — Anda mengambil alih" });
  }

  function submitNote() {
    if (!noteText.trim()) return;
    onSendNote(noteText.trim(), noteAuthor.trim() || "Agen");
    setNoteText("");
  }

  return (
    <div className="w-80 xl:w-96 border-l border-border/50 bg-card flex flex-col flex-shrink-0 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/40 flex-shrink-0">
        <span className="font-semibold text-sm">Detail Percakapan</span>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X size={16} /></button>
      </div>

      {/* Contact info */}
      <div className="px-4 py-3 border-b border-border/30 flex-shrink-0">
        <div className="flex items-center gap-3 mb-3">
          <div className={cn("w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0", avatarColor(jid))}>
            {initials(conv?.contactName ?? null, jid)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm truncate">{name}</p>
            <a href={`https://wa.me/${phone}`} target="_blank" rel="noopener noreferrer" className="text-xs text-emerald-600 hover:underline">+{phone}</a>
            <p className="text-[11px] text-muted-foreground">Total {messages.length} pesan</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border/30 flex-shrink-0">
        {(["info","notes","canned"] as const).map((t) => (
          <button key={t} onClick={() => setActiveTab(t)}
            className={cn("flex-1 py-2 text-xs font-medium transition-colors", activeTab === t ? "border-b-2 border-primary text-primary" : "text-muted-foreground hover:text-foreground")}>
            {t === "info" ? "Info" : t === "notes" ? "Catatan" : "Template"}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* ── Info Tab ── */}
        {activeTab === "info" && (
          <div className="p-4 space-y-4">

            {/* Status */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold flex items-center gap-1.5 text-muted-foreground uppercase tracking-wide"><Circle size={11} />Status</Label>
              <div className="grid grid-cols-2 gap-1.5">
                {Object.entries(CONV_STATUS).map(([k, v]) => (
                  <button key={k} onClick={() => setStatus(k)} disabled={savingStatus}
                    className={cn("flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all", meta?.status === k ? cn(v.color, "border-current shadow-sm") : "border-border text-muted-foreground hover:border-primary/40")}>
                    {v.icon} {v.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Bot pause */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold flex items-center gap-1.5 text-muted-foreground uppercase tracking-wide"><Bot size={11} />CS Bot</Label>
              <button onClick={toggleBotPause}
                className={cn("w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border transition-all", meta?.botPaused ? "bg-amber-50 border-amber-300 text-amber-700 dark:bg-amber-950/30 dark:border-amber-700 dark:text-amber-400" : "bg-emerald-50 border-emerald-300 text-emerald-700 dark:bg-emerald-950/30 dark:border-emerald-700 dark:text-emerald-400")}>
                {meta?.botPaused ? <><BotOff size={13} /> Bot dijeda — klik untuk aktifkan</> : <><Bot size={13} /> Bot aktif — klik untuk jeda</>}
              </button>
            </div>

            {/* Assign agent */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold flex items-center gap-1.5 text-muted-foreground uppercase tracking-wide"><UserCheck size={11} />Agen</Label>
              <div className="flex gap-1.5">
                <Input value={agentInput} onChange={(e) => setAgentInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && assignAgent()}
                  placeholder="Nama agen..." className="h-8 text-xs flex-1" />
                <Button size="sm" variant="outline" className="h-8 px-2.5 text-xs" onClick={assignAgent}>Simpan</Button>
              </div>
              {meta?.assignedAgent && (
                <p className="text-xs text-muted-foreground">Ditugaskan ke: <strong>{meta.assignedAgent}</strong></p>
              )}
            </div>

            {/* Tags */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold flex items-center gap-1.5 text-muted-foreground uppercase tracking-wide"><Tag size={11} />Label</Label>
              <div className="flex flex-wrap gap-1">
                {ALL_TAGS.map((t) => (
                  <button key={t} onClick={() => addTag(t)}
                    className={cn("px-2 py-0.5 rounded-full text-[11px] font-medium border transition-all", tags.includes(t) ? "bg-violet-100 border-violet-400 text-violet-700 dark:bg-violet-900/40 dark:border-violet-600 dark:text-violet-300" : "border-border text-muted-foreground hover:border-primary/40")}>
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {/* SLA */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold flex items-center gap-1.5 text-muted-foreground uppercase tracking-wide"><Timer size={11} />Timer SLA</Label>
              {slaInfo && (
                <div className={cn("px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-2", slaInfo.urgent ? "bg-rose-50 text-rose-600 dark:bg-rose-950/30 dark:text-rose-400" : "bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-400")}>
                  <Timer size={12} /> Sisa waktu: {slaInfo.label}
                </div>
              )}
              <div className="flex items-center gap-1.5">
                <Select value={String(slaHours)} onValueChange={(v) => setSlaHours(Number(v))}>
                  <SelectTrigger className="h-8 text-xs flex-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[1,2,4,8,24].map((h) => <SelectItem key={h} value={String(h)} className="text-xs">{h} jam</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button size="sm" variant="outline" className="h-8 text-xs px-2.5" onClick={setSla}>Set SLA</Button>
                {meta?.slaDeadline && (
                  <Button size="sm" variant="ghost" className="h-8 text-xs px-2" onClick={() => patchConv("sla", { slaDeadline: null })}><X size={12} /></Button>
                )}
              </div>
            </div>

            {/* Customer history info */}
            {meta?.createdAt && (
              <div className="rounded-lg bg-muted/40 p-3 text-xs space-y-1 text-muted-foreground">
                <p className="font-semibold text-foreground">Riwayat</p>
                <p>Pertama masuk: {new Date(meta.createdAt).toLocaleDateString("id-ID", { day:"numeric",month:"long",year:"numeric" })}</p>
                {meta.resolvedAt && <p>Terakhir selesai: {new Date(meta.resolvedAt).toLocaleDateString("id-ID", { day:"numeric",month:"short",year:"numeric" })}</p>}
                <p>Total pesan: {messages.length}</p>
              </div>
            )}
          </div>
        )}

        {/* ── Notes Tab ── */}
        {activeTab === "notes" && (
          <div className="p-4 space-y-3">
            <p className="text-xs text-muted-foreground">Catatan internal — hanya terlihat oleh tim, tidak terkirim ke pelanggan</p>
            <div className="space-y-2">
              {messages.filter((m) => m.isInternal).length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-6">Belum ada catatan</p>
              )}
              {messages.filter((m) => m.isInternal).map((m) => (
                <div key={m.id} className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200/60 rounded-lg p-2.5 text-xs">
                  <p className="font-semibold text-amber-700 dark:text-amber-400 mb-0.5">{m.contactName ?? "Agen"} · {fmt(m.timestamp)}</p>
                  <p className="text-foreground whitespace-pre-wrap">{m.text}</p>
                </div>
              ))}
            </div>
            <div className="space-y-2 border-t border-border/40 pt-3">
              <Input value={noteAuthor} onChange={(e) => setNoteAuthor(e.target.value)} placeholder="Nama Anda" className="h-8 text-xs" />
              <Textarea value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="Tulis catatan..." className="text-xs min-h-[80px] resize-none" />
              <Button size="sm" className="w-full text-xs gap-1.5" onClick={submitNote} disabled={!noteText.trim()}>
                <StickyNote size={12} /> Simpan Catatan
              </Button>
            </div>
          </div>
        )}

        {/* ── Canned Responses Tab ── */}
        {activeTab === "canned" && (
          <div className="p-4 space-y-2">
            <p className="text-xs text-muted-foreground mb-1">Klik untuk salin ke clipboard</p>
            {cannedResponses.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-6">Belum ada template. Buat di menu Pengaturan Template.</p>
            )}
            {cannedResponses.map((cr) => (
              <button key={cr.id} onClick={() => { navigator.clipboard.writeText(cr.body); }}
                className="w-full text-left rounded-lg border border-border hover:border-primary/40 hover:bg-muted/40 p-3 text-xs transition-all space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{cr.title}</span>
                  <code className="text-muted-foreground bg-muted px-1 rounded">/{cr.shortcut}</code>
                </div>
                <p className="text-muted-foreground line-clamp-2">{cr.body}</p>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Reports Panel ─────────────────────────────────────────────────────────────

function ReportsPanel({ deviceId, onClose }: { deviceId: string; onClose: () => void }) {
  const { data: report } = useQuery<Report>({
    queryKey: ["chat-reports", deviceId],
    queryFn: () => apiFetch(`/chat/reports?deviceId=${deviceId}`).then((r) => r.json()),
    enabled: !!deviceId,
  });

  const statuses = [
    { key: "open", label: "Baru", color: "text-blue-600" },
    { key: "in_progress", label: "Diproses", color: "text-amber-600" },
    { key: "resolved", label: "Selesai", color: "text-emerald-600" },
    { key: "pending", label: "Pending", color: "text-rose-600" },
  ];

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border/40 bg-card/80 flex-shrink-0">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}><ArrowLeft size={18} /></Button>
        <span className="font-bold text-sm flex items-center gap-2"><BarChart2 size={16} className="text-primary" /> Laporan Live Chat</span>
      </div>
      {!report ? (
        <div className="flex-1 flex items-center justify-center"><Loader2 className="animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "Total Percakapan", value: report.totalConversations, color: "text-blue-600" },
              { label: "Selesai Hari Ini", value: report.resolvedToday, color: "text-emerald-600" },
              { label: "Total Pesan", value: report.totalMessages, color: "text-violet-600" },
              { label: "SLA Terlewat", value: report.slaBreached, color: "text-rose-600" },
            ].map((s) => (
              <div key={s.label} className="rounded-xl border border-border bg-card p-3 text-center">
                <p className={cn("text-2xl font-bold", s.color)}>{s.value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>

          {/* By status */}
          <div className="rounded-xl border border-border bg-card p-4 space-y-2">
            <p className="text-sm font-semibold">Status Percakapan</p>
            {statuses.map(({ key, label, color }) => {
              const total = report.totalConversations || 1;
              const val = report.byStatus[key] ?? 0;
              return (
                <div key={key} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">{label}</span>
                    <span className={cn("font-semibold", color)}>{val}</span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div className={cn("h-full rounded-full transition-all", color === "text-blue-600" ? "bg-blue-500" : color === "text-amber-600" ? "bg-amber-500" : color === "text-emerald-600" ? "bg-emerald-500" : "bg-rose-500")}
                      style={{ width: `${(val / total) * 100}%` }} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* By agent */}
          {Object.keys(report.byAgent).length > 0 && (
            <div className="rounded-xl border border-border bg-card p-4 space-y-2">
              <p className="text-sm font-semibold">Percakapan per Agen</p>
              {Object.entries(report.byAgent).sort(([,a],[,b]) => b - a).map(([agent, count]) => (
                <div key={agent} className="flex justify-between text-xs">
                  <span className="text-muted-foreground flex items-center gap-1"><User size={11} /> {agent}</span>
                  <span className="font-semibold">{count} chat</span>
                </div>
              ))}
            </div>
          )}

          {/* By tag */}
          {Object.keys(report.byTag).length > 0 && (
            <div className="rounded-xl border border-border bg-card p-4 space-y-2">
              <p className="text-sm font-semibold">Label Terpopuler</p>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(report.byTag).sort(([,a],[,b]) => b - a).map(([tag, count]) => (
                  <span key={tag} className="inline-flex items-center gap-1 bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300 px-2 py-0.5 rounded-full text-xs font-medium">
                    <Tag size={9} /> {tag} <span className="font-bold">({count})</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Canned Responses Manager ──────────────────────────────────────────────────

function CannedManager({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: list = [] } = useQuery<CannedResponse[]>({
    queryKey: ["canned-responses"],
    queryFn: () => apiFetch("/canned-responses").then((r) => r.json()),
  });
  const [form, setForm] = useState({ shortcut: "", title: "", body: "" });
  const [editId, setEditId] = useState<number | null>(null);

  const saveMutation = useMutation({
    mutationFn: (data: typeof form) => editId
      ? apiFetch(`/canned-responses/${editId}`, { method: "PUT", body: JSON.stringify(data) }).then((r) => r.json())
      : apiFetch("/canned-responses", { method: "POST", body: JSON.stringify(data) }).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["canned-responses"] });
      setForm({ shortcut: "", title: "", body: "" }); setEditId(null);
      toast({ title: editId ? "Template diperbarui" : "Template ditambahkan" });
    },
  });
  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/canned-responses/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["canned-responses"] }); toast({ title: "Template dihapus" }); },
  });

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border/40 bg-card/80 flex-shrink-0">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}><ArrowLeft size={18} /></Button>
        <span className="font-bold text-sm flex items-center gap-2"><Zap size={16} className="text-amber-500" /> Kelola Template Balasan</span>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Form */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <p className="text-sm font-semibold">{editId ? "Edit Template" : "Tambah Template"}</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Shortcut</Label>
              <Input value={form.shortcut} onChange={(e) => setForm((f) => ({ ...f, shortcut: e.target.value }))} placeholder="/harga" className="h-8 text-xs font-mono" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Judul</Label>
              <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Info Harga" className="h-8 text-xs" />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Isi Pesan</Label>
            <Textarea value={form.body} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} placeholder="Harga paket kami mulai dari..." className="text-xs min-h-[80px] resize-none" />
          </div>
          <div className="flex gap-2 justify-end">
            {editId && <Button variant="outline" size="sm" className="text-xs" onClick={() => { setEditId(null); setForm({ shortcut: "", title: "", body: "" }); }}>Batal</Button>}
            <Button size="sm" className="text-xs gap-1.5" onClick={() => saveMutation.mutate(form)} disabled={!form.shortcut || !form.title || !form.body || saveMutation.isPending}>
              {saveMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
              {editId ? "Perbarui" : "Tambah"}
            </Button>
          </div>
        </div>

        {/* List */}
        <div className="space-y-2">
          {list.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">Belum ada template</p>}
          {list.map((cr) => (
            <div key={cr.id} className="rounded-xl border border-border bg-card p-3 space-y-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <code className="text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-1.5 py-0.5 rounded font-mono">/{cr.shortcut}</code>
                  <span className="text-xs font-semibold">{cr.title}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setEditId(cr.id); setForm({ shortcut: cr.shortcut, title: cr.title, body: cr.body }); }}>
                    <Settings size={12} />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive" onClick={() => deleteMutation.mutate(cr.id)}>
                    <Trash2 size={12} />
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground line-clamp-2">{cr.body}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function LiveChat() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [deviceId, setDeviceId] = useState("");
  const [activeJid, setActiveJid] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [showInfoPanel, setShowInfoPanel] = useState(false);
  const [showPanel, setShowPanel] = useState(false);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [showEmoji, setShowEmoji] = useState(false);
  const [showNewChat, setShowNewChat] = useState(false);
  const [showCanned, setShowCanned] = useState(false);
  const [showReports, setShowReports] = useState(false);
  const [showCannedManager, setShowCannedManager] = useState(false);
  const [newPhone, setNewPhone] = useState("");
  const [msgOffset, setMsgOffset] = useState(0);
  const [allMessages, setAllMessages] = useState<ChatMessage[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [convMetas, setConvMetas] = useState<Record<string, ConvMeta>>({});
  const [cannedFilter, setCannedFilter] = useState("");

  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const sseRef = useRef<EventSource | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectDelay = useRef(1000);
  const activeJidRef = useRef(activeJid);
  activeJidRef.current = activeJid;

  // Devices
  const { data: devices = [] } = useQuery<Device[]>({
    queryKey: ["devices"],
    queryFn: () => apiFetch("/devices").then((r) => r.json()),
  });

  useEffect(() => {
    if (!deviceId && devices.length) {
      const d = devices.find((d) => d.status === "connected") ?? devices[0];
      setDeviceId(String(d.id));
    }
  }, [devices, deviceId]);

  // Conversations
  const { data: conversations = [], refetch: refetchConvs } = useQuery<Conversation[]>({
    queryKey: ["chat-conversations", deviceId],
    queryFn: () => apiFetch(`/chat/conversations?deviceId=${deviceId}`).then((r) => r.json()),
    enabled: !!deviceId,
    refetchInterval: 15000,
  });

  // Canned responses
  const { data: cannedResponses = [] } = useQuery<CannedResponse[]>({
    queryKey: ["canned-responses"],
    queryFn: () => apiFetch("/canned-responses").then((r) => r.json()),
  });

  // Messages (latest 40)
  const { data: msgData, isLoading: loadingMsgs, refetch: refetchMsgs } = useQuery<MessagesResponse>({
    queryKey: ["chat-messages", deviceId, activeJid],
    queryFn: () => apiFetch(`/chat/messages?deviceId=${deviceId}&jid=${encodeURIComponent(activeJid!)}&offset=0&limit=40`).then((r) => r.json()),
    enabled: !!deviceId && !!activeJid,
  });

  useEffect(() => {
    if (msgData) { setAllMessages(msgData.messages); setHasMore(msgData.hasMore); setMsgOffset(40); }
  }, [msgData]);

  // Conv metadata for active conversation
  useEffect(() => {
    if (!activeJid || !deviceId) return;
    apiFetch(`/chat/conversation/${encodeURIComponent(activeJid)}?deviceId=${deviceId}`)
      .then((r) => r.json())
      .then((meta: ConvMeta) => setConvMetas((prev) => ({ ...prev, [activeJid]: meta })));
  }, [activeJid, deviceId]);

  // Auto-scroll
  const lastMsgCount = useRef(0);
  useEffect(() => {
    const count = allMessages.length;
    if (count !== lastMsgCount.current) {
      lastMsgCount.current = count;
      bottomRef.current?.scrollIntoView({ behavior: count === msgData?.messages.length ? "instant" : "smooth" });
    }
  }, [allMessages]);

  // SSE
  const connectSSE = useCallback(() => {
    if (!deviceId) return;
    sseRef.current?.close();
    const token = getToken();
    const url = `/api/chat/stream?deviceId=${deviceId}&token=${token}`;
    const es = new EventSource(url);
    sseRef.current = es;
    es.addEventListener("connected", () => { reconnectDelay.current = 1000; });
    es.addEventListener("message", (e) => {
      try {
        const msg: ChatMessage = JSON.parse(e.data);
        refetchConvs();
        if (msg.jid === activeJidRef.current) {
          setAllMessages((prev) => prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]);
          if (!msg.fromMe && !msg.isInternal && document.hidden) {
            toast({ title: `Pesan baru dari ${phoneFromJid(msg.jid)}`, description: msg.text?.slice(0, 60) || "[Media]" });
          }
        } else if (!msg.fromMe && !msg.isInternal) {
          if (document.hidden) toast({ title: `Pesan baru dari ${phoneFromJid(msg.jid)}`, description: msg.text?.slice(0, 60) || "[Media]" });
        }
      } catch {}
    });
    es.addEventListener("conv_update", (e) => {
      try {
        const conv: ConvMeta = JSON.parse(e.data);
        setConvMetas((prev) => ({ ...prev, [conv.jid]: conv }));
      } catch {}
    });
    es.onerror = () => {
      es.close();
      reconnectTimer.current = setTimeout(() => {
        reconnectDelay.current = Math.min(reconnectDelay.current * 2, 30000);
        connectSSE();
      }, reconnectDelay.current);
    };
  }, [deviceId]);

  useEffect(() => {
    connectSSE();
    return () => { sseRef.current?.close(); if (reconnectTimer.current) clearTimeout(reconnectTimer.current); };
  }, [connectSSE]);

  useEffect(() => {
    setAllMessages([]); setHasMore(false); setMsgOffset(0); setReplyTo(null); setShowEmoji(false); setShowCanned(false);
  }, [activeJid, deviceId]);

  async function loadMore() {
    if (!deviceId || !activeJid || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await apiFetch(`/chat/messages?deviceId=${deviceId}&jid=${encodeURIComponent(activeJid)}&offset=${msgOffset}&limit=40`);
      const data: MessagesResponse = await res.json();
      setAllMessages((prev) => [...data.messages, ...prev]);
      setHasMore(data.hasMore); setMsgOffset((o) => o + 40);
    } finally { setLoadingMore(false); }
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || !deviceId || !activeJid || sending) return;
    setInput(""); setReplyTo(null); setShowEmoji(false); setShowCanned(false); setSending(true);
    const optimistic: ChatMessage = {
      id: Date.now(), jid: activeJid, fromMe: true, text,
      mediaType: null, mediaUrl: null, status: "sending", isRead: false,
      isInternal: false, timestamp: new Date().toISOString(), contactName: null, messageId: null,
    };
    setAllMessages((prev) => [...prev, optimistic]);
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    try {
      const res = await apiFetch("/chat/send", {
        method: "POST",
        body: JSON.stringify({ deviceId: parseInt(deviceId), jid: activeJid, text, replyTo: replyTo ? { messageId: replyTo.messageId, text: replyTo.text } : undefined }),
      });
      if (!res.ok) throw new Error((await res.json()).message);
      await refetchMsgs(); refetchConvs();
    } catch (err: any) {
      toast({ title: "Gagal kirim", description: err.message, variant: "destructive" });
      setAllMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      setInput(text);
    } finally { setSending(false); }
  }

  async function handleSendNote(text: string, author: string) {
    if (!activeJid || !deviceId) return;
    await apiFetch(`/chat/conversation/${encodeURIComponent(activeJid)}/note?deviceId=${deviceId}`, {
      method: "POST", body: JSON.stringify({ text, author }),
    });
    refetchMsgs();
  }

  const deleteMutation = useMutation({
    mutationFn: (jid: string) => apiFetch(`/chat/conversations/${encodeURIComponent(jid)}?deviceId=${deviceId}`, { method: "DELETE" }),
    onSuccess: (_data, jid) => {
      qc.invalidateQueries({ queryKey: ["chat-conversations", deviceId] });
      if (activeJid === jid) { setActiveJid(null); setShowPanel(false); setShowInfoPanel(false); }
      toast({ title: "Percakapan dihapus" });
    },
  });

  const unreadMutation = useMutation({
    mutationFn: (jid: string) => apiFetch(`/chat/conversations/${encodeURIComponent(jid)}/unread?deviceId=${deviceId}`, { method: "PATCH" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chat-conversations", deviceId] }),
  });

  function startNewChat() {
    const clean = newPhone.replace(/\D/g, "");
    if (!clean) return;
    const jid = `${clean}@s.whatsapp.net`;
    setShowNewChat(false); setNewPhone(""); setActiveJid(jid); setShowPanel(true);
    setTimeout(() => textareaRef.current?.focus(), 100);
  }

  function copyText(text: string) {
    navigator.clipboard.writeText(text).then(() => toast({ title: "Teks disalin" }));
  }

  // Input change — detect "/" for canned responses
  function handleInputChange(val: string) {
    setInput(val);
    if (val.startsWith("/") && val.length > 0) {
      setCannedFilter(val.slice(1).toLowerCase());
      setShowCanned(true);
    } else {
      setShowCanned(false);
    }
  }

  const filteredCanned = cannedResponses.filter((cr) =>
    !cannedFilter || cr.shortcut.toLowerCase().includes(cannedFilter) || cr.title.toLowerCase().includes(cannedFilter)
  );

  // Filtered conversations
  const filtered = conversations.filter((c) => {
    if (statusFilter !== "all") {
      const meta = convMetas[c.jid];
      const status = meta?.status ?? "open";
      if (status !== statusFilter) return false;
    }
    if (!search) return true;
    const q = search.toLowerCase();
    return c.contactName?.toLowerCase().includes(q) || c.phone.includes(q) || c.lastMessage.toLowerCase().includes(q);
  });

  // Group messages by date
  type Group = { date: string; msgs: ChatMessage[] };
  const grouped: Group[] = [];
  for (const m of allMessages) {
    const d = fmtDate(m.timestamp);
    const last = grouped[grouped.length - 1];
    if (!last || last.date !== d) grouped.push({ date: d, msgs: [m] });
    else last.msgs.push(m);
  }

  const activeConv = conversations.find((c) => c.jid === activeJid);
  const activeName = activeConv?.contactName || (activeJid ? phoneFromJid(activeJid) : "");
  const activeMeta = activeJid ? convMetas[activeJid] ?? null : null;
  const isConnected = devices.find((d) => String(d.id) === deviceId)?.status === "connected";
  const totalUnread = conversations.reduce((s, c) => s + c.unread, 0);
  const pendingCount = conversations.filter((c) => (convMetas[c.jid]?.status ?? "open") === "pending").length;
  const activeStatus = activeMeta?.status ?? "open";
  const activeSt = CONV_STATUS[activeStatus] ?? CONV_STATUS.open!;

  return (
    <div className="-m-4 md:-m-6 flex overflow-hidden bg-background" style={{ height: "calc(100vh - 3.5rem)" }}>

      {/* ── LEFT PANEL ────────────────────────────────────────────────── */}
      <div className={cn("flex flex-col border-r border-border/50 bg-card w-full md:w-80 lg:w-96 flex-shrink-0 md:flex", showPanel ? "hidden md:flex" : "flex")}>

        {/* Header */}
        <div className="px-4 pt-3 pb-2 border-b border-border/40 bg-card">
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-2">
              <MessageSquareDot size={18} className="text-emerald-500" />
              <h1 className="font-bold text-base">Live Chat</h1>
              {totalUnread > 0 && (
                <span className="bg-emerald-500 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-[20px] text-center">{totalUnread}</span>
              )}
              {pendingCount > 0 && (
                <span className="bg-rose-500 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5 flex items-center gap-0.5 animate-pulse" title={`${pendingCount} percakapan perlu agen`}>
                  <UserCheck size={9} /> {pendingCount}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setShowReports(true); setShowPanel(true); }} title="Laporan">
                <BarChart2 size={14} />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-amber-600" onClick={() => { setShowCannedManager(true); setShowPanel(true); }} title="Template">
                <Zap size={14} />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => refetchConvs()} title="Refresh">
                <RefreshCw size={14} />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-emerald-600 hover:text-emerald-700" onClick={() => setShowNewChat(true)} title="Chat baru">
                <Plus size={16} />
              </Button>
            </div>
          </div>

          <Select value={deviceId} onValueChange={(v) => { setDeviceId(v); setActiveJid(null); setShowPanel(false); setShowInfoPanel(false); }}>
            <SelectTrigger className="h-8 text-xs border-border/60"><SelectValue placeholder="Pilih perangkat..." /></SelectTrigger>
            <SelectContent>
              {devices.map((d) => (
                <SelectItem key={d.id} value={String(d.id)} className="text-xs">
                  <span className={cn("inline-block w-1.5 h-1.5 rounded-full mr-1.5 flex-shrink-0", d.status === "connected" ? "bg-emerald-500" : "bg-zinc-400")} />
                  {d.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {deviceId && !isConnected && (
            <p className="text-[11px] text-amber-500 mt-1.5 flex items-center gap-1">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500" /> Perangkat tidak terhubung — mode baca saja
            </p>
          )}
        </div>

        {/* Status filter */}
        <div className="px-3 py-1.5 border-b border-border/30 flex gap-1 overflow-x-auto">
          {[{ key: "all", label: "Semua" }, ...Object.entries(CONV_STATUS).map(([k, v]) => ({ key: k, label: v.label }))].map((s) => (
            <button key={s.key} onClick={() => setStatusFilter(s.key)}
              className={cn("flex-shrink-0 px-2.5 py-1 rounded-full text-[11px] font-medium transition-all whitespace-nowrap", statusFilter === s.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted/70")}>
              {s.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="px-3 py-2 border-b border-border/30 bg-card">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <input value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nama, nomor, atau pesan..."
              className="w-full pl-8 pr-3 h-8 text-xs rounded-lg bg-muted/50 border border-border/50 outline-none focus:border-emerald-500/50 placeholder:text-muted-foreground/60 transition-colors" />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X size={12} /></button>
            )}
          </div>
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto">
          {!deviceId ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
              <MessageSquareDot size={36} className="opacity-20" />
              <p className="text-sm">Pilih perangkat terlebih dahulu</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground py-12">
              <MessageSquareDot size={36} className="opacity-20" />
              <div className="text-center">
                <p className="text-sm font-medium">{search ? "Tidak ada hasil" : "Belum ada percakapan"}</p>
                {!search && <p className="text-xs mt-1 opacity-70">Pesan masuk akan muncul otomatis</p>}
              </div>
              {!search && (
                <Button variant="outline" size="sm" className="gap-2 mt-2 text-xs" onClick={() => setShowNewChat(true)}>
                  <Plus size={14} /> Mulai chat baru
                </Button>
              )}
            </div>
          ) : (
            filtered.map((c) => (
              <ConvItem key={c.jid} conv={c} meta={convMetas[c.jid]} active={activeJid === c.jid}
                onClick={() => {
                  setActiveJid(c.jid); setShowPanel(true); setShowReports(false); setShowCannedManager(false);
                  setTimeout(() => textareaRef.current?.focus(), 100);
                }}
                onDelete={() => deleteMutation.mutate(c.jid)}
                onMarkUnread={() => unreadMutation.mutate(c.jid)}
              />
            ))
          )}
        </div>
      </div>

      {/* ── CENTER + RIGHT ─────────────────────────────────────────────── */}
      <div className={cn("flex-1 flex min-w-0 overflow-hidden", !showPanel ? "hidden md:flex" : "flex")}>

        {/* Reports Panel */}
        {showReports && <ReportsPanel deviceId={deviceId} onClose={() => { setShowReports(false); setActiveJid(null); }} />}

        {/* Canned Manager Panel */}
        {showCannedManager && <CannedManager onClose={() => { setShowCannedManager(false); setActiveJid(null); }} />}

        {/* Chat Panel */}
        {!showReports && !showCannedManager && (
          <>
            <div className="flex-1 flex flex-col min-w-0">
              {!activeJid ? (
                <div className="flex-1 flex flex-col items-center justify-center bg-muted/5 gap-5">
                  <div className="w-24 h-24 rounded-full bg-emerald-500/10 flex items-center justify-center">
                    <MessageSquareDot size={44} className="text-emerald-500 opacity-50" />
                  </div>
                  <div className="text-center">
                    <h2 className="font-bold text-lg mb-1.5">WA Gateway Live Chat</h2>
                    <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">
                      Pilih percakapan, atau mulai chat baru. Gunakan tombol ⚡ untuk kelola template balasan cepat.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button className="gap-2 bg-emerald-500 hover:bg-emerald-600" onClick={() => setShowNewChat(true)}>
                      <Plus size={16} /> Chat Baru
                    </Button>
                    <Button variant="outline" className="gap-2" onClick={() => { setShowReports(true); setShowPanel(true); }}>
                      <BarChart2 size={16} /> Laporan
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  {/* Chat header */}
                  <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border/50 bg-card/80 backdrop-blur-sm flex-shrink-0 shadow-sm">
                    <Button variant="ghost" size="icon" className="md:hidden -ml-1 h-8 w-8" onClick={() => { setShowPanel(false); setActiveJid(null); setShowInfoPanel(false); }}>
                      <ArrowLeft size={18} />
                    </Button>
                    <div className={cn("w-9 h-9 rounded-full flex items-center justify-center text-white font-semibold text-xs flex-shrink-0", avatarColor(activeJid))}>
                      {initials(activeConv?.contactName ?? null, activeJid)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-sm truncate">{activeName}</p>
                        <span className={cn("inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full", activeSt.color)}>
                          {activeSt.icon} {activeSt.label}
                        </span>
                        {activeMeta?.botPaused && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400">
                            <BotOff size={9} /> Bot jeda
                          </span>
                        )}
                        {activeMeta?.assignedAgent && (
                          <span className="text-[11px] text-muted-foreground hidden sm:block">· {activeMeta.assignedAgent}</span>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground truncate">{phoneFromJid(activeJid)}</p>
                    </div>

                    {/* Status quick-change */}
                    <div className="flex items-center gap-0.5">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" size="sm" className="h-7 px-2 text-xs gap-1">
                            {activeSt.icon} <span className="hidden sm:inline">{activeSt.label}</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-40">
                          {Object.entries(CONV_STATUS).map(([k, v]) => (
                            <DropdownMenuItem key={k} onClick={async () => {
                              const r = await apiFetch(`/chat/conversation/${encodeURIComponent(activeJid)}/status?deviceId=${deviceId}`, { method: "PUT", body: JSON.stringify({ status: k }) });
                              const meta = await r.json();
                              setConvMetas((prev) => ({ ...prev, [activeJid]: meta }));
                            }}>
                              <span className={cn("flex items-center gap-1.5", activeMeta?.status === k ? "font-semibold" : "")}>
                                {v.icon} {v.label}
                              </span>
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>

                      <a href={`https://wa.me/${phoneFromJid(activeJid)}`} target="_blank" rel="noopener noreferrer">
                        <Button variant="ghost" size="icon" className="h-8 w-8" title="Buka di WA"><Phone size={15} /></Button>
                      </a>
                      <Button variant="ghost" size="icon" className={cn("h-8 w-8", showInfoPanel && "bg-muted")} onClick={() => setShowInfoPanel((v) => !v)} title="Detail">
                        <ChevronRight size={15} className={cn("transition-transform", showInfoPanel && "rotate-180")} />
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8"><MoreVertical size={15} /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuItem onClick={() => unreadMutation.mutate(activeJid)}><MailCheck size={14} className="mr-2" /> Tandai belum dibaca</DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => deleteMutation.mutate(activeJid)}>
                            <Trash2 size={14} className="mr-2" /> Hapus percakapan
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>

                  {/* SLA warning bar */}
                  {activeMeta?.slaDeadline && (() => {
                    const info = slaRemaining(activeMeta.slaDeadline);
                    return info.urgent ? (
                      <div className="flex items-center gap-2 px-4 py-1.5 bg-rose-50 dark:bg-rose-950/30 border-b border-rose-200/60 dark:border-rose-800/30 text-xs font-semibold text-rose-600 dark:text-rose-400 flex-shrink-0">
                        <Timer size={12} /> SLA: {info.label}
                      </div>
                    ) : null;
                  })()}

                  {/* Messages */}
                  <div className="flex-1 overflow-y-auto px-3 py-2 space-y-0.5" style={{ background: "hsl(var(--muted)/0.12)" }}>
                    {hasMore && (
                      <div className="flex justify-center py-2">
                        <Button variant="outline" size="sm" className="gap-2 text-xs h-7" onClick={loadMore} disabled={loadingMore}>
                          {loadingMore ? <Loader2 size={12} className="animate-spin" /> : <ChevronUp size={12} />}
                          Muat pesan sebelumnya
                        </Button>
                      </div>
                    )}
                    {loadingMsgs ? (
                      <div className="flex justify-center py-8"><Loader2 size={22} className="animate-spin text-muted-foreground" /></div>
                    ) : allMessages.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full py-16 text-muted-foreground gap-2">
                        <p className="text-sm">Belum ada pesan</p>
                        <p className="text-xs opacity-60">Tulis pesan di bawah untuk memulai</p>
                      </div>
                    ) : (
                      grouped.map((g) => (
                        <div key={g.date}>
                          <DateSep date={g.date} />
                          <div className="space-y-1">
                            {g.msgs.map((m) => <Bubble key={m.id} msg={m} onReply={setReplyTo} onCopy={copyText} />)}
                          </div>
                        </div>
                      ))
                    )}
                    <div ref={bottomRef} />
                  </div>

                  {/* Input area */}
                  <div className="px-3 pb-3 pt-2 border-t border-border/40 bg-card/90 backdrop-blur-sm flex-shrink-0">
                    {!isConnected ? (
                      <div className="text-center text-sm text-amber-500 py-2 flex items-center justify-center gap-2">
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500" />
                        Perangkat tidak terhubung — tidak dapat mengirim pesan
                      </div>
                    ) : (
                      <div className="flex flex-col gap-1.5">
                        {replyTo && <ReplyPreview msg={replyTo} onCancel={() => setReplyTo(null)} />}

                        {/* Canned responses popup */}
                        {showCanned && filteredCanned.length > 0 && (
                          <div className="border border-border rounded-xl bg-popover shadow-lg overflow-hidden">
                            <div className="px-3 py-1.5 border-b border-border/40 flex items-center gap-1.5 text-xs text-muted-foreground">
                              <Zap size={11} className="text-amber-500" /> Template balasan cepat
                            </div>
                            <div className="max-h-48 overflow-y-auto">
                              {filteredCanned.map((cr) => (
                                <button key={cr.id} onClick={() => { setInput(cr.body); setShowCanned(false); setTimeout(() => textareaRef.current?.focus(), 50); }}
                                  className="w-full text-left px-3 py-2 hover:bg-muted/60 transition-colors text-xs border-b border-border/20 last:border-0">
                                  <div className="flex items-center gap-2">
                                    <code className="text-amber-600 font-mono">/{cr.shortcut}</code>
                                    <span className="font-semibold">{cr.title}</span>
                                  </div>
                                  <p className="text-muted-foreground line-clamp-1 mt-0.5">{cr.body}</p>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="flex items-end gap-2">
                          <div className="relative flex-shrink-0">
                            <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-foreground" onClick={() => setShowEmoji((v) => !v)}>
                              <Smile size={18} />
                            </Button>
                            {showEmoji && <EmojiPicker onSelect={(e) => { setInput((v) => v + e); textareaRef.current?.focus(); }} onClose={() => setShowEmoji(false)} />}
                          </div>
                          <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-amber-500 flex-shrink-0" title="Template (/)" onClick={() => { setInput("/"); setShowCanned(true); setCannedFilter(""); textareaRef.current?.focus(); }}>
                            <Zap size={16} />
                          </Button>

                          <div className="flex-1 relative">
                            <textarea ref={textareaRef} value={input}
                              onChange={(e) => {
                                handleInputChange(e.target.value);
                                e.target.style.height = "auto";
                                e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
                              }}
                              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } if (e.key === "Escape") { setShowCanned(false); setShowEmoji(false); } }}
                              onClick={() => setShowEmoji(false)}
                              placeholder="Tulis pesan... (/ untuk template, Enter kirim)"
                              rows={1} disabled={sending}
                              className="w-full resize-none rounded-2xl px-4 py-2.5 text-sm bg-muted/50 border border-border/60 outline-none focus:border-emerald-500/60 placeholder:text-muted-foreground/60 transition-colors leading-relaxed overflow-hidden disabled:opacity-50"
                              style={{ minHeight: "40px", maxHeight: "120px" }}
                            />
                          </div>
                          <Button onClick={handleSend} disabled={!input.trim() || sending} size="icon"
                            className="h-9 w-9 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white flex-shrink-0 shadow-sm">
                            {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                          </Button>
                        </div>
                        <p className="text-[10px] text-muted-foreground/50 text-right pr-12">
                          / template · Enter kirim · Shift+Enter baris baru
                        </p>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Info Panel (right sidebar) */}
            {showInfoPanel && activeJid && (
              <InfoPanel
                jid={activeJid} deviceId={deviceId} conv={activeConv} meta={activeMeta}
                onMetaChange={(m) => setConvMetas((prev) => ({ ...prev, [activeJid]: m }))}
                messages={allMessages} onClose={() => setShowInfoPanel(false)}
                cannedResponses={cannedResponses} onSendNote={handleSendNote}
              />
            )}
          </>
        )}
      </div>

      {/* ── New Chat Dialog ─────────────────────────────────────────────── */}
      <Dialog open={showNewChat} onOpenChange={setShowNewChat}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Plus size={18} className="text-emerald-500" /> Chat Baru</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label className="text-sm">Nomor WhatsApp</Label>
              <Input value={newPhone} onChange={(e) => setNewPhone(e.target.value.replace(/[^\d+]/g, ""))}
                onKeyDown={(e) => e.key === "Enter" && startNewChat()}
                placeholder="628123456789 (tanpa +)" autoFocus className="font-mono" />
              <p className="text-xs text-muted-foreground">Contoh: 6281234567890</p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowNewChat(false)}>Batal</Button>
              <Button size="sm" className="bg-emerald-500 hover:bg-emerald-600" onClick={startNewChat} disabled={!newPhone.trim()}>Mulai Chat</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

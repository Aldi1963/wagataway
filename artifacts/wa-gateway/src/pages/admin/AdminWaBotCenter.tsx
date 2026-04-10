import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Bot, MessageSquare, Users, Activity, Settings, RefreshCw,
  Smartphone, Clock, Trash2, Link2, Bell, Send, Megaphone,
  Ticket, MessageCircle, Plus, CheckCircle, XCircle, Save,
  Info, ChevronRight, ArrowDownCircle, ArrowUpCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api";

// ── Types ─────────────────────────────────────────────────────────────────────

interface WaBotSettings {
  id?: number;
  deviceId: number | null;
  isEnabled: boolean;
  welcomeMessage: string;
  menuMessage: string;
  helpMessage: string;
  footerText: string;
  sessionTimeoutMinutes: number;
  appName: string;
  reminderEnabled: boolean;
  reminderDaysBefore: string;
  reminderMessage: string;
  onboardingEnabled: boolean;
  onboardingMessage: string;
}

interface WaBotSession {
  id: number;
  phone: string;
  userId: number | null;
  userEmail: string | null;
  userName: string | null;
  userPlan: string | null;
  step: string;
  pendingPlanSlug: string | null;
  lastActivity: string;
  createdAt: string;
}

interface WaBotStats {
  totalSessions: number;
  linkedSessions: number;
  activeToday: number;
  awaitingEmail: number;
  openTickets: number;
  totalBroadcasts: number;
}

interface WaBotBroadcast {
  id: number;
  title: string;
  message: string;
  status: string;
  targetCount: number;
  sentCount: number;
  failCount: number;
  createdAt: string;
  sentAt: string | null;
}

interface WaBotTicket {
  id: number;
  ticketCode: string;
  phone: string;
  userId: number | null;
  userName: string | null;
  userEmail: string | null;
  message: string;
  status: string;
  adminReply: string | null;
  repliedAt: string | null;
  createdAt: string;
}

interface WaBotConvLog {
  id: number;
  phone: string;
  userId: number | null;
  userName: string | null;
  direction: string;
  message: string;
  createdAt: string;
}

interface Device {
  id: number;
  name: string;
  phone: string | null;
  status: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeSince(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "baru saja";
  if (mins < 60) return `${mins} mnt lalu`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} jam lalu`;
  return `${Math.floor(hrs / 24)} hari lalu`;
}

function stepLabel(step: string): { label: string; color: string } {
  if (step === "await_email") return { label: "Belum login", color: "bg-yellow-100 text-yellow-700" };
  if (step === "idle") return { label: "Aktif", color: "bg-green-100 text-green-700" };
  return { label: step, color: "bg-gray-100 text-gray-600" };
}

function broadcastStatusBadge(status: string) {
  if (status === "sent") return <Badge className="bg-green-100 text-green-700 border-0">Terkirim</Badge>;
  if (status === "sending") return <Badge className="bg-blue-100 text-blue-700 border-0">Mengirim...</Badge>;
  if (status === "failed") return <Badge className="bg-red-100 text-red-700 border-0">Gagal</Badge>;
  return <Badge variant="outline">Draft</Badge>;
}

// ── Default settings ──────────────────────────────────────────────────────────

const DEFAULT_SETTINGS: WaBotSettings = {
  deviceId: null,
  isEnabled: false,
  welcomeMessage: "👋 Halo! Selamat datang di *WA Center* {{appName}}.\n\nSilakan kirim *email* akun kamu untuk login dan melihat informasi langganan.\n\nContoh: email@kamu.com",
  menuMessage:
    "📋 *Menu WA Center*\n\n" +
    "1️⃣ *cek* — Status akun & langganan\n" +
    "2️⃣ *paket* — Lihat semua paket\n" +
    "3️⃣ *perpanjang* — Perpanjang paket aktif\n" +
    "4️⃣ *riwayat* — Riwayat transaksi\n" +
    "5️⃣ *topup* — Info top up saldo\n" +
    "6️⃣ *tiket [masalah]* — Buat tiket support\n\n" +
    "Ketik *menu* kapan saja untuk melihat ini lagi.",
  helpMessage: "🆘 Butuh bantuan lebih lanjut? Hubungi tim support kami.\n\nKetik *menu* untuk melihat daftar perintah.",
  footerText: "WA Gateway — Platform WhatsApp Profesional",
  sessionTimeoutMinutes: 60,
  appName: "WA Gateway",
  reminderEnabled: false,
  reminderDaysBefore: "7,3,1",
  reminderMessage:
    "⏰ *Reminder Langganan*\n\nHai *{{userName}}*!\n\nLangganan paket *{{planName}}* kamu akan berakhir pada *{{expiry}}* ({{daysLeft}} hari lagi).\n\nKetik *perpanjang* untuk memperpanjang sekarang.",
  onboardingEnabled: false,
  onboardingMessage:
    "🎉 *Selamat bergabung di {{appName}}!*\n\nHai *{{userName}}*,\n\nAkun kamu sudah berhasil dibuat. Yuk mulai kirim pesan WhatsApp sekarang!\n\n📱 Tambah perangkat di: *Menu → Perangkat*\n\nKetik *menu* untuk melihat menu lengkap.",
};

// ── Stat Card ─────────────────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: number | undefined; color: string }) {
  return (
    <Card>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${color}`}>
            <Icon className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-xl font-bold">{value ?? "—"}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Settings Tab ──────────────────────────────────────────────────────────────

function SettingsTab({ devices }: { devices: Device[] }) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: raw, isLoading } = useQuery<WaBotSettings | null>({
    queryKey: ["admin-wa-bot-settings"],
    queryFn: () => apiFetch("/admin/wa-bot").then((r) => r.json()),
  });

  const [form, setForm] = useState<WaBotSettings>(DEFAULT_SETTINGS);
  useEffect(() => { if (raw) setForm({ ...DEFAULT_SETTINGS, ...raw }); }, [raw]);
  function set(k: keyof WaBotSettings, v: any) { setForm((f) => ({ ...f, [k]: v })); }

  const saveMutation = useMutation({
    mutationFn: () => apiFetch("/admin/wa-bot", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) }).then((r) => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-wa-bot-settings"] }); toast({ title: "✅ Pengaturan WA Center disimpan" }); },
    onError: () => toast({ title: "Gagal menyimpan", variant: "destructive" }),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground py-8 text-center">Memuat pengaturan...</p>;

  const selectedDevice = devices.find((d) => d.id === form.deviceId);

  return (
    <div className="space-y-5">
      {/* Enable */}
      <Card>
        <CardContent className="pt-5 pb-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 bg-green-500">
                <Bot className="w-4 h-4 text-white" />
              </div>
              <div>
                <p className="font-semibold text-sm">Aktifkan WA Center Bot</p>
                <p className="text-xs text-muted-foreground mt-0.5">Pesan masuk ke device yang dipilih akan diproses oleh WA Center Bot</p>
              </div>
            </div>
            <Switch checked={form.isEnabled} onCheckedChange={(v) => set("isEnabled", v)} className="shrink-0 mt-0.5" />
          </div>
        </CardContent>
      </Card>

      {form.isEnabled && !form.deviceId && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription className="text-xs">Pilih device WhatsApp yang akan digunakan sebagai WA Center Bot sebelum mengaktifkan.</AlertDescription>
        </Alert>
      )}

      {/* Device */}
      <Card className={!form.isEnabled ? "opacity-60 pointer-events-none" : ""}>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm flex items-center gap-2"><Smartphone className="h-4 w-4 text-blue-500" />Device WhatsApp</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-3">
          <Select value={form.deviceId?.toString() ?? "__none__"} onValueChange={(v) => set("deviceId", v === "__none__" ? null : parseInt(v, 10))}>
            <SelectTrigger><SelectValue placeholder="Pilih device..." /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">— Pilih device —</SelectItem>
              {devices.map((d) => (
                <SelectItem key={d.id} value={d.id.toString()}>{d.name} {d.phone ? `(${d.phone})` : ""} — {d.status}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedDevice && (
            <div className={`rounded-lg border px-4 py-3 flex items-center gap-3 ${selectedDevice.status === "connected" ? "border-green-200 bg-green-50" : "border-yellow-200 bg-yellow-50"}`}>
              <div className={`w-2 h-2 rounded-full ${selectedDevice.status === "connected" ? "bg-green-500" : "bg-yellow-400"}`} />
              <div>
                <p className="text-sm font-medium">{selectedDevice.name}</p>
                <p className="text-xs text-muted-foreground">{selectedDevice.phone ?? "Nomor belum diatur"} — {selectedDevice.status}</p>
              </div>
            </div>
          )}
          <p className="text-xs text-muted-foreground">⚠️ Device ini tidak bisa digunakan CS Bot — semua pesan masuk akan dikelola WA Center.</p>
        </CardContent>
      </Card>

      {/* Identitas */}
      <Card className={!form.isEnabled ? "opacity-60 pointer-events-none" : ""}>
        <CardHeader className="pb-2 pt-4 px-4"><CardTitle className="text-sm">Identitas Platform</CardTitle></CardHeader>
        <CardContent className="px-4 pb-4 space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Nama Aplikasi</Label>
            <Input value={form.appName} onChange={(e) => set("appName", e.target.value)} placeholder="WA Gateway" />
            <p className="text-xs text-muted-foreground">Muncul di pesan sebagai {"{{appName}}"}</p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Footer Teks</Label>
            <Input value={form.footerText} onChange={(e) => set("footerText", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Timeout Sesi (menit)</Label>
            <Input type="number" min={5} max={1440} value={form.sessionTimeoutMinutes} onChange={(e) => set("sessionTimeoutMinutes", parseInt(e.target.value) || 60)} className="w-32" />
          </div>
        </CardContent>
      </Card>

      {/* Pesan */}
      <Card className={!form.isEnabled ? "opacity-60 pointer-events-none" : ""}>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm flex items-center gap-2"><MessageSquare className="h-4 w-4 text-purple-500" />Pesan Bot</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Pesan Sambutan (Welcome)</Label>
            <Textarea value={form.welcomeMessage} onChange={(e) => set("welcomeMessage", e.target.value)} rows={4} className="text-sm font-mono" />
          </div>
          <Separator />
          <div className="space-y-1.5">
            <Label className="text-xs">Pesan Menu</Label>
            <Textarea value={form.menuMessage} onChange={(e) => set("menuMessage", e.target.value)} rows={9} className="text-sm font-mono" />
          </div>
          <Separator />
          <div className="space-y-1.5">
            <Label className="text-xs">Pesan Bantuan (Help)</Label>
            <Textarea value={form.helpMessage} onChange={(e) => set("helpMessage", e.target.value)} rows={3} className="text-sm font-mono" />
          </div>
        </CardContent>
      </Card>

      {/* Reminder */}
      <Card className={!form.isEnabled ? "opacity-60 pointer-events-none" : ""}>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm flex items-center gap-2"><Bell className="h-4 w-4 text-orange-500" />Reminder Expired Langganan</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Aktifkan Reminder</p>
              <p className="text-xs text-muted-foreground">Bot otomatis kirim WA saat langganan mendekati expired</p>
            </div>
            <Switch checked={form.reminderEnabled} onCheckedChange={(v) => set("reminderEnabled", v)} />
          </div>
          {form.reminderEnabled && (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs">Kirim berapa hari sebelum expired (pisah koma)</Label>
                <Input value={form.reminderDaysBefore} onChange={(e) => set("reminderDaysBefore", e.target.value)} placeholder="7,3,1" className="w-40" />
                <p className="text-xs text-muted-foreground">Contoh: 7,3,1 → kirim 7 hari, 3 hari, dan 1 hari sebelum expired</p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Pesan Reminder</Label>
                <Textarea value={form.reminderMessage} onChange={(e) => set("reminderMessage", e.target.value)} rows={6} className="text-sm font-mono" />
                <p className="text-xs text-muted-foreground">Variabel: {"{{userName}}"} {"{{planName}}"} {"{{expiry}}"} {"{{daysLeft}}"} {"{{appName}}"}</p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Onboarding */}
      <Card className={!form.isEnabled ? "opacity-60 pointer-events-none" : ""}>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm flex items-center gap-2"><CheckCircle className="h-4 w-4 text-green-500" />Onboarding User Baru</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Kirim WA Saat User Register</p>
              <p className="text-xs text-muted-foreground">Jika user sudah pernah chat bot, otomatis dapat pesan sambutan</p>
            </div>
            <Switch checked={form.onboardingEnabled} onCheckedChange={(v) => set("onboardingEnabled", v)} />
          </div>
          {form.onboardingEnabled && (
            <div className="space-y-1.5">
              <Label className="text-xs">Pesan Onboarding</Label>
              <Textarea value={form.onboardingMessage} onChange={(e) => set("onboardingMessage", e.target.value)} rows={7} className="text-sm font-mono" />
              <p className="text-xs text-muted-foreground">Variabel: {"{{userName}}"} {"{{userEmail}}"} {"{{appName}}"}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
          <Save className="w-4 h-4 mr-1.5" />
          {saveMutation.isPending ? "Menyimpan..." : "Simpan Pengaturan"}
        </Button>
      </div>

      {/* Command Reference */}
      <Card className="border-dashed">
        <CardHeader className="pb-2 pt-4 px-4"><CardTitle className="text-sm text-muted-foreground">Referensi Perintah Bot</CardTitle></CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            {[
              { cmd: "halo / hi", desc: "Pesan sambutan" },
              { cmd: "[email]", desc: "Login / verifikasi akun" },
              { cmd: "cek / status", desc: "Status langganan & saldo" },
              { cmd: "paket / harga", desc: "Daftar paket tersedia" },
              { cmd: "langganan [nama]", desc: "Berlangganan paket" },
              { cmd: "perpanjang / renew", desc: "Perpanjang paket aktif + link bayar" },
              { cmd: "riwayat / history", desc: "5 transaksi terakhir" },
              { cmd: "topup / saldo", desc: "Info top up saldo wallet" },
              { cmd: "tiket [masalah]", desc: "Buat tiket support" },
              { cmd: "menu / help / ?", desc: "Tampilkan menu utama" },
              { cmd: "logout / keluar", desc: "Unlink akun dari sesi ini" },
            ].map((item) => (
              <div key={item.cmd} className="flex gap-2 p-2 rounded bg-muted/40">
                <code className="text-primary shrink-0 font-mono">{item.cmd}</code>
                <span className="text-muted-foreground">— {item.desc}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Sessions Tab ──────────────────────────────────────────────────────────────

function SessionsTab() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: sessions = [], isLoading, refetch } = useQuery<WaBotSession[]>({
    queryKey: ["admin-wa-bot-sessions"],
    queryFn: () => apiFetch("/admin/wa-bot/sessions?limit=100").then((r) => r.json()),
    refetchInterval: 15000,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/admin/wa-bot/sessions/${id}`, { method: "DELETE" }).then((r) => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-wa-bot-sessions"] }); toast({ title: "Sesi dihapus" }); },
  });

  if (isLoading) return <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />)}</div>;

  if (sessions.length === 0) {
    return (
      <div className="text-center py-16">
        <Users className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
        <p className="text-sm text-muted-foreground">Belum ada sesi aktif</p>
        <p className="text-xs text-muted-foreground mt-1">Sesi akan muncul saat user mengirim pesan ke device WA Center</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{sessions.length} sesi ditemukan</p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" />Refresh
        </Button>
      </div>
      {sessions.map((s) => {
        const { label, color } = stepLabel(s.step);
        return (
          <div key={s.id} className="rounded-lg border p-4 flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-sm font-medium">{s.phone}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${color}`}>{label}</span>
                {s.pendingPlanSlug && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">Pending: {s.pendingPlanSlug}</span>}
              </div>
              {s.userId ? (
                <div className="mt-1.5 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{s.userName}</span> · {s.userEmail}
                  {s.userPlan && <span className="ml-2 text-primary font-medium">Paket: {s.userPlan}</span>}
                </div>
              ) : (
                <p className="mt-1 text-xs text-muted-foreground">Belum terhubung ke akun</p>
              )}
              <div className="flex items-center gap-1.5 mt-1.5 text-[10px] text-muted-foreground">
                <Clock className="w-3 h-3" />
                <span>Aktif {timeSince(s.lastActivity)}</span>
                <span>·</span>
                <span>Sejak {new Date(s.createdAt).toLocaleDateString("id-ID")}</span>
              </div>
            </div>
            <Button variant="ghost" size="icon" className="shrink-0 text-muted-foreground hover:text-red-500" onClick={() => deleteMutation.mutate(s.id)}>
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        );
      })}
    </div>
  );
}

// ── Broadcast Tab ─────────────────────────────────────────────────────────────

function BroadcastTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newMessage, setNewMessage] = useState("");

  const { data: broadcasts = [], isLoading, refetch } = useQuery<WaBotBroadcast[]>({
    queryKey: ["admin-wa-bot-broadcasts"],
    queryFn: () => apiFetch("/admin/wa-bot/broadcasts").then((r) => r.json()),
    refetchInterval: 10000,
  });

  const createMutation = useMutation({
    mutationFn: () => apiFetch("/admin/wa-bot/broadcasts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: newTitle, message: newMessage }) }).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-wa-bot-broadcasts"] });
      toast({ title: "Broadcast dibuat" });
      setShowCreate(false); setNewTitle(""); setNewMessage("");
    },
  });

  const sendMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/admin/wa-bot/broadcasts/${id}/send`, { method: "POST" }).then((r) => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-wa-bot-broadcasts"] }); toast({ title: "📢 Broadcast sedang dikirim..." }); },
    onError: () => toast({ title: "Gagal kirim broadcast", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/admin/wa-bot/broadcasts/${id}`, { method: "DELETE" }).then((r) => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-wa-bot-broadcasts"] }); toast({ title: "Broadcast dihapus" }); },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Kirim pesan ke semua user yang sudah login (linked sessions)</p>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="w-3.5 h-3.5 mr-1.5" />Buat Broadcast
        </Button>
      </div>

      <Alert>
        <Megaphone className="h-4 w-4" />
        <AlertDescription className="text-xs">
          Broadcast hanya dikirim ke user yang sudah login ke WA Center Bot (ada sesi aktif dengan akun terhubung). Gunakan untuk pengumuman promo, maintenance, atau update fitur.
        </AlertDescription>
      </Alert>

      {isLoading && <div className="space-y-2">{[1, 2].map((i) => <div key={i} className="h-20 rounded-lg bg-muted animate-pulse" />)}</div>}

      {!isLoading && broadcasts.length === 0 && (
        <div className="text-center py-16">
          <Megaphone className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">Belum ada broadcast</p>
        </div>
      )}

      {broadcasts.map((b) => (
        <Card key={b.id}>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-medium text-sm">{b.title}</p>
                  {broadcastStatusBadge(b.status)}
                </div>
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{b.message}</p>
                {b.status === "sent" && (
                  <p className="text-xs text-muted-foreground mt-1.5">
                    Terkirim ke {b.sentCount}/{b.targetCount} user
                    {b.failCount > 0 && ` · ${b.failCount} gagal`}
                    {b.sentAt && ` · ${new Date(b.sentAt).toLocaleDateString("id-ID")}`}
                  </p>
                )}
                {b.status === "draft" && (
                  <p className="text-xs text-muted-foreground mt-1">Dibuat {timeSince(b.createdAt)}</p>
                )}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {b.status === "draft" && (
                  <Button size="sm" variant="outline" onClick={() => sendMutation.mutate(b.id)} disabled={sendMutation.isPending}>
                    <Send className="w-3.5 h-3.5 mr-1" />Kirim
                  </Button>
                )}
                {b.status === "sent" && (
                  <Button size="sm" variant="outline" onClick={() => sendMutation.mutate(b.id)}>
                    <RefreshCw className="w-3.5 h-3.5 mr-1" />Kirim Ulang
                  </Button>
                )}
                <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-red-500" onClick={() => deleteMutation.mutate(b.id)}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader><DialogTitle>Buat Broadcast Baru</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Judul (untuk referensi admin)</Label>
              <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Promo Lebaran 2025" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Pesan</Label>
              <Textarea value={newMessage} onChange={(e) => setNewMessage(e.target.value)} rows={6} placeholder="🎉 Halo! Ada promo spesial untuk kamu..." className="font-mono text-sm" />
              <p className="text-xs text-muted-foreground">Pesan ini akan dikirim ke semua user yang sudah login WA Center Bot.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Batal</Button>
            <Button onClick={() => createMutation.mutate()} disabled={!newTitle.trim() || !newMessage.trim() || createMutation.isPending}>
              {createMutation.isPending ? "Menyimpan..." : "Simpan Broadcast"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Tickets Tab ───────────────────────────────────────────────────────────────

function TicketsTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [activeTicket, setActiveTicket] = useState<WaBotTicket | null>(null);
  const [replyText, setReplyText] = useState("");
  const [filter, setFilter] = useState("open");

  const { data: tickets = [], isLoading, refetch } = useQuery<WaBotTicket[]>({
    queryKey: ["admin-wa-bot-tickets", filter],
    queryFn: () => apiFetch(`/admin/wa-bot/tickets${filter !== "all" ? `?status=${filter}` : ""}`).then((r) => r.json()),
    refetchInterval: 15000,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      apiFetch(`/admin/wa-bot/tickets/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-wa-bot-tickets"] });
      toast({ title: "Tiket diperbarui" });
      setActiveTicket(null); setReplyText("");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/admin/wa-bot/tickets/${id}`, { method: "DELETE" }).then((r) => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-wa-bot-tickets"] }); toast({ title: "Tiket dihapus" }); },
  });

  function openReply(ticket: WaBotTicket) { setActiveTicket(ticket); setReplyText(ticket.adminReply ?? ""); }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-2">
          {["open", "resolved", "all"].map((s) => (
            <Button key={s} size="sm" variant={filter === s ? "default" : "outline"} onClick={() => setFilter(s)}>
              {s === "open" ? "Terbuka" : s === "resolved" ? "Selesai" : "Semua"}
            </Button>
          ))}
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" />Refresh
        </Button>
      </div>

      {isLoading && <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-20 rounded-lg bg-muted animate-pulse" />)}</div>}

      {!isLoading && tickets.length === 0 && (
        <div className="text-center py-16">
          <Ticket className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">Tidak ada tiket {filter === "open" ? "terbuka" : filter === "resolved" ? "selesai" : ""}</p>
        </div>
      )}

      {tickets.map((t) => (
        <Card key={t.id} className={t.status === "resolved" ? "opacity-70" : ""}>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">{t.ticketCode}</code>
                  <Badge variant={t.status === "open" ? "destructive" : "outline"} className="text-[10px]">
                    {t.status === "open" ? "🔴 Terbuka" : "✅ Selesai"}
                  </Badge>
                </div>
                <p className="text-sm mt-1.5 font-medium">{t.message}</p>
                <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground flex-wrap">
                  <span className="font-mono">{t.phone}</span>
                  {t.userEmail && <><span>·</span><span>{t.userName ?? t.userEmail}</span></>}
                  <span>·</span>
                  <span>{timeSince(t.createdAt)}</span>
                </div>
                {t.adminReply && (
                  <div className="mt-2 p-2.5 rounded-lg bg-blue-50 border border-blue-100 text-xs text-blue-800">
                    <span className="font-semibold">Balasan Admin: </span>{t.adminReply}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Button size="sm" variant="outline" onClick={() => openReply(t)}>
                  <MessageCircle className="w-3.5 h-3.5 mr-1" />
                  {t.adminReply ? "Edit" : "Balas"}
                </Button>
                {t.status === "open" && (
                  <Button size="sm" variant="outline" className="text-green-600 border-green-200" onClick={() => updateMutation.mutate({ id: t.id, data: { status: "resolved" } })}>
                    <CheckCircle className="w-3.5 h-3.5 mr-1" />Selesai
                  </Button>
                )}
                <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-red-500" onClick={() => deleteMutation.mutate(t.id)}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}

      {/* Reply Dialog */}
      <Dialog open={!!activeTicket} onOpenChange={(o) => { if (!o) { setActiveTicket(null); setReplyText(""); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Balas Tiket {activeTicket?.ticketCode}</DialogTitle></DialogHeader>
          {activeTicket && (
            <div className="space-y-3 py-2">
              <div className="p-3 rounded-lg bg-muted text-sm">
                <p className="font-medium">Masalah dari {activeTicket.userName ?? activeTicket.phone}:</p>
                <p className="mt-1 text-muted-foreground">{activeTicket.message}</p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Balasan Admin (dikirim via WA jika tersedia)</Label>
                <Textarea value={replyText} onChange={(e) => setReplyText(e.target.value)} rows={4} placeholder="Terima kasih atas laporan Anda. Kami sedang menyelidiki masalah ini..." />
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setActiveTicket(null); setReplyText(""); }}>Batal</Button>
            <Button variant="outline" className="text-green-600" onClick={() => updateMutation.mutate({ id: activeTicket!.id, data: { status: "resolved", adminReply: replyText } })} disabled={updateMutation.isPending}>
              <CheckCircle className="w-3.5 h-3.5 mr-1" />Selesai + Simpan
            </Button>
            <Button onClick={() => updateMutation.mutate({ id: activeTicket!.id, data: { adminReply: replyText } })} disabled={!replyText.trim() || updateMutation.isPending}>
              Simpan Balasan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Conversation Log Tab ──────────────────────────────────────────────────────

function ConvLogTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);

  const { data: phoneList = [], isLoading: loadingPhones, refetch } = useQuery<WaBotConvLog[]>({
    queryKey: ["admin-wa-bot-conv-phones"],
    queryFn: () => apiFetch("/admin/wa-bot/conversations/phones").then((r) => r.json()),
    refetchInterval: 20000,
  });

  const { data: convLogs = [], isLoading: loadingLogs } = useQuery<WaBotConvLog[]>({
    queryKey: ["admin-wa-bot-conv-logs", selectedPhone],
    queryFn: () => apiFetch(`/admin/wa-bot/conversations?phone=${selectedPhone}&limit=200`).then((r) => r.json()),
    enabled: !!selectedPhone,
  });

  const clearMutation = useMutation({
    mutationFn: () => apiFetch("/admin/wa-bot/conversations", { method: "DELETE" }).then((r) => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-wa-bot-conv-phones"] }); qc.invalidateQueries({ queryKey: ["admin-wa-bot-conv-logs"] }); setSelectedPhone(null); toast({ title: "Log percakapan dihapus" }); },
  });

  return (
    <div className="flex gap-4" style={{ minHeight: 500 }}>
      {/* Phone list */}
      <div className="w-56 shrink-0 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Percakapan</p>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => refetch()}>
            <RefreshCw className="w-3 h-3" />
          </Button>
        </div>

        {loadingPhones && <div className="space-y-1.5">{[1,2,3].map(i => <div key={i} className="h-12 rounded bg-muted animate-pulse" />)}</div>}

        {!loadingPhones && phoneList.length === 0 && (
          <div className="text-center py-8">
            <MessageCircle className="w-6 h-6 mx-auto text-muted-foreground mb-2" />
            <p className="text-xs text-muted-foreground">Belum ada log</p>
          </div>
        )}

        {phoneList.map((p) => (
          <button
            key={p.phone}
            onClick={() => setSelectedPhone(p.phone)}
            className={`w-full text-left p-2.5 rounded-lg border transition-colors ${selectedPhone === p.phone ? "bg-primary/10 border-primary/30" : "hover:bg-muted/60 border-transparent"}`}
          >
            <p className="text-xs font-mono font-medium truncate">{p.phone}</p>
            {p.userName && <p className="text-[10px] text-muted-foreground truncate">{p.userName}</p>}
            <p className="text-[10px] text-muted-foreground">{timeSince(p.createdAt)}</p>
          </button>
        ))}

        {phoneList.length > 0 && (
          <Button variant="ghost" size="sm" className="w-full text-muted-foreground text-xs hover:text-red-500 mt-2" onClick={() => clearMutation.mutate()} disabled={clearMutation.isPending}>
            <Trash2 className="w-3 h-3 mr-1" />Hapus Semua Log
          </Button>
        )}
      </div>

      {/* Chat log */}
      <div className="flex-1 min-w-0">
        {!selectedPhone && (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <div className="text-center">
              <MessageCircle className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Pilih percakapan</p>
            </div>
          </div>
        )}

        {selectedPhone && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-mono font-medium">{selectedPhone}</p>
              <Badge variant="outline" className="text-[10px]">{convLogs.length} pesan</Badge>
            </div>
            <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
              {loadingLogs && <div className="space-y-2">{[1,2,3,4].map(i => <div key={i} className="h-10 rounded bg-muted animate-pulse" />)}</div>}
              {[...convLogs].reverse().map((log) => (
                <div key={log.id} className={`flex gap-2 ${log.direction === "out" ? "flex-row-reverse" : ""}`}>
                  <div className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center ${log.direction === "out" ? "bg-primary/10" : "bg-muted"}`}>
                    {log.direction === "out"
                      ? <ArrowUpCircle className="w-3.5 h-3.5 text-primary" />
                      : <ArrowDownCircle className="w-3.5 h-3.5 text-muted-foreground" />}
                  </div>
                  <div className={`max-w-[80%] rounded-lg px-3 py-2 text-xs ${log.direction === "out" ? "bg-primary/10 text-foreground" : "bg-muted"}`}>
                    <p className="whitespace-pre-wrap break-words">{log.message}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">{new Date(log.createdAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AdminWaBotCenter() {
  const { data: stats } = useQuery<WaBotStats>({
    queryKey: ["admin-wa-bot-stats"],
    queryFn: () => apiFetch("/admin/wa-bot/stats").then((r) => r.json()),
    refetchInterval: 30000,
  });

  const { data: devicesRaw } = useQuery<Device[]>({
    queryKey: ["admin-wa-bot-devices"],
    queryFn: () => apiFetch("/devices").then((r) => r.json()),
  });
  const devices = devicesRaw ?? [];

  return (
    <div className="space-y-6">
      <div>
        <p className="text-muted-foreground text-sm">
          Bot WhatsApp khusus admin — user bisa cek langganan, perpanjang, buat tiket, dan subscribe via WA.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard icon={Users} label="Total Sesi" value={stats?.totalSessions} color="bg-blue-500" />
        <StatCard icon={Link2} label="Terhubung" value={stats?.linkedSessions} color="bg-green-500" />
        <StatCard icon={Activity} label="Aktif Hari Ini" value={stats?.activeToday} color="bg-purple-500" />
        <StatCard icon={Clock} label="Menunggu Login" value={stats?.awaitingEmail} color="bg-orange-500" />
        <StatCard icon={Ticket} label="Tiket Terbuka" value={stats?.openTickets} color="bg-red-500" />
        <StatCard icon={Megaphone} label="Total Broadcast" value={stats?.totalBroadcasts} color="bg-indigo-500" />
      </div>

      <Alert>
        <Bot className="h-4 w-4" />
        <AlertDescription className="text-xs">
          <strong>Cara kerja:</strong> Pilih satu device WhatsApp sebagai "WA Center". Saat user mengirim pesan ke nomor tersebut, bot merespons otomatis. User login dengan email, lalu bisa cek status, perpanjang paket, buat tiket support, dan mendapat link bayar — semua lewat WhatsApp.
        </AlertDescription>
      </Alert>

      {/* Tabs */}
      <Tabs defaultValue="settings">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="settings"><Settings className="w-3.5 h-3.5 mr-1.5" />Pengaturan</TabsTrigger>
          <TabsTrigger value="sessions">
            <Users className="w-3.5 h-3.5 mr-1.5" />Sesi Aktif
            {(stats?.totalSessions ?? 0) > 0 && <span className="ml-1.5 bg-primary/15 text-primary text-[10px] px-1.5 py-0.5 rounded-full font-medium">{stats?.totalSessions}</span>}
          </TabsTrigger>
          <TabsTrigger value="broadcast"><Megaphone className="w-3.5 h-3.5 mr-1.5" />Broadcast</TabsTrigger>
          <TabsTrigger value="tickets">
            <Ticket className="w-3.5 h-3.5 mr-1.5" />Tiket Support
            {(stats?.openTickets ?? 0) > 0 && <span className="ml-1.5 bg-red-100 text-red-700 text-[10px] px-1.5 py-0.5 rounded-full font-medium">{stats?.openTickets}</span>}
          </TabsTrigger>
          <TabsTrigger value="logs"><MessageCircle className="w-3.5 h-3.5 mr-1.5" />Log Percakapan</TabsTrigger>
        </TabsList>

        <TabsContent value="settings" className="mt-4"><SettingsTab devices={devices} /></TabsContent>
        <TabsContent value="sessions" className="mt-4"><SessionsTab /></TabsContent>
        <TabsContent value="broadcast" className="mt-4"><BroadcastTab /></TabsContent>
        <TabsContent value="tickets" className="mt-4"><TicketsTab /></TabsContent>
        <TabsContent value="logs" className="mt-4"><ConvLogTab /></TabsContent>
      </Tabs>
    </div>
  );
}

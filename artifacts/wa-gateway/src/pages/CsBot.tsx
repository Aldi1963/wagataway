import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Bot, Plus, Trash2, Edit2, Loader2, Power, Send,
  MessageSquare, Clock, HelpCircle, Tag, Zap, ChevronDown, ChevronRight,
  ToggleLeft, ToggleRight, Star, Search, PlayCircle, Sparkles, Brain, Info,
  Key, Eye, EyeOff, CheckCircle, XCircle, Globe, RefreshCw,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api";

interface DeviceBotEntry {
  device: { id: number; name: string; phone?: string; status: string };
  bot: BotConfig | null;
}
interface BotConfig {
  id: number; deviceId: number; isEnabled: boolean; botName: string;
  greetingMessage: string; fallbackMessage: string; offlineMessage: string;
  menuMessage: string; businessHoursEnabled: boolean;
  businessHoursStart: string; businessHoursEnd: string; businessDays: string;
  humanHandoffKeyword: string; humanHandoffMessage: string;
  sessionTimeoutMinutes: number; showMenu: boolean;
  language: string;
  // AI fields
  aiEnabled: boolean; aiMode: string; aiModel: string;
  aiSystemPrompt: string; aiBusinessContext: string; aiMaxTokens: number;
  // AI provider override
  aiProvider: string; aiApiKey: string;
  // Website knowledge base
  websiteUrl: string; websiteContent: string; websiteContentUpdatedAt: string | null;
}
interface Faq {
  id: number; deviceId: number; category: string; question: string;
  keywords: string; answer: string; matchType: string;
  sortOrder: number; triggerCount: number; isActive: boolean;
  mediaUrl?: string | null; mediaCaption?: string | null;
}

const MATCH_TYPES = [
  { value: "contains", label: "Mengandung kata kunci" },
  { value: "exact", label: "Persis sama" },
  { value: "startsWith", label: "Dimulai dengan" },
];

const DAY_LABELS = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant={status === "connected" ? "default" : "secondary"} className="text-xs">
      {status === "connected" ? "Terhubung" : "Terputus"}
    </Badge>
  );
}

export default function CsBot() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [selectedDeviceId, setSelectedDeviceId] = useState<number | null>(null);
  const [faqOpen, setFaqOpen] = useState(false);
  const [editFaq, setEditFaq] = useState<Faq | null>(null);
  const [faqForm, setFaqForm] = useState({
    category: "Umum", question: "", keywords: "", answer: "",
    matchType: "contains", sortOrder: 0, isActive: true,
    mediaUrl: "", mediaCaption: "",
  });
  const [testMsg, setTestMsg] = useState("");
  const [testHistory, setTestHistory] = useState<{ from: "user" | "bot"; text: string }[]>([]);
  const [testLoading, setTestLoading] = useState(false);
  const testChatEndRef = useRef<HTMLDivElement | null>(null);
  const [faqSearch, setFaqSearch] = useState("");

  // ── Queries ────────────────────────────────────────────────────────────────

  const { data: entries, isLoading: listLoading } = useQuery<DeviceBotEntry[]>({
    queryKey: ["cs-bot"],
    queryFn: () => apiFetch("/cs-bot").then((r) => r.json()),
  });

  const selectedEntry = entries?.find((e) => e.device.id === selectedDeviceId) ?? null;
  const bot = selectedEntry?.bot ?? null;

  const { data: faqs, isLoading: faqsLoading } = useQuery<Faq[]>({
    queryKey: ["cs-bot-faqs", selectedDeviceId],
    queryFn: () => apiFetch(`/cs-bot/${selectedDeviceId}/faqs`).then((r) => r.json()),
    enabled: !!selectedDeviceId,
  });

  const { data: aiAccess, refetch: refetchAiAccess } = useQuery<{
    allowed: boolean;
    source: "own_key" | "plan" | "none";
    hasOwnKey: boolean;
    keyPrefix: string | null;
  }>({
    queryKey: ["cs-bot-ai-access"],
    queryFn: () => apiFetch("/cs-bot/ai-access").then((r) => r.json()),
    staleTime: 60000,
  });

  const [showKeyInput, setShowKeyInput] = useState(false);
  const [keyInputValue, setKeyInputValue] = useState("");
  const [keyInputVisible, setKeyInputVisible] = useState(false);

  const saveKeyMutation = useMutation({
    mutationFn: (apiKey: string) =>
      apiFetch("/cs-bot/my-ai-key", { method: "PUT", body: JSON.stringify({ apiKey }) }).then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).message);
        return r.json();
      }),
    onSuccess: () => {
      toast({ title: "API Key disimpan", description: "AI CS Bot sekarang menggunakan key pribadi Anda" });
      setKeyInputValue("");
      setShowKeyInput(false);
      refetchAiAccess();
    },
    onError: (err: Error) => toast({ title: "Gagal menyimpan key", description: err.message, variant: "destructive" }),
  });

  const removeKeyMutation = useMutation({
    mutationFn: () => apiFetch("/cs-bot/my-ai-key", { method: "DELETE" }).then((r) => r.json()),
    onSuccess: () => {
      toast({ title: "API Key dihapus" });
      refetchAiAccess();
    },
    onError: () => toast({ title: "Gagal menghapus key", variant: "destructive" }),
  });

  // ── Bot config mutation ────────────────────────────────────────────────────

  const updateBot = useMutation({
    mutationFn: (body: Partial<BotConfig>) =>
      apiFetch(`/cs-bot/${selectedDeviceId}`, { method: "PUT", body: JSON.stringify(body) }).then((r) => r.json()),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["cs-bot"] });
      if (!("isEnabled" in vars)) toast({ title: "Konfigurasi berhasil disimpan" });
    },
    onError: () => toast({ title: "Gagal menyimpan konfigurasi bot", variant: "destructive" }),
  });

  const toggleBot = () => {
    if (!selectedDeviceId) return;
    updateBot.mutate({ isEnabled: !bot?.isEnabled });
  };

  // ── FAQ mutations ──────────────────────────────────────────────────────────

  const saveFaq = useMutation({
    mutationFn: async (body: any) => {
      if (editFaq) {
        return apiFetch(`/cs-bot/${selectedDeviceId}/faqs/${editFaq.id}`, {
          method: "PUT", body: JSON.stringify(body),
        }).then((r) => r.json());
      }
      return apiFetch(`/cs-bot/${selectedDeviceId}/faqs`, {
        method: "POST", body: JSON.stringify(body),
      }).then((r) => r.json());
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cs-bot-faqs", selectedDeviceId] });
      setFaqOpen(false);
      setEditFaq(null);
      resetFaqForm();
      toast({ title: editFaq ? "FAQ diperbarui" : "FAQ ditambahkan" });
    },
    onError: () => toast({ title: "Gagal menyimpan FAQ", variant: "destructive" }),
  });

  const deleteFaq = useMutation({
    mutationFn: (id: number) =>
      apiFetch(`/cs-bot/${selectedDeviceId}/faqs/${id}`, { method: "DELETE" }).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cs-bot-faqs", selectedDeviceId] });
      toast({ title: "FAQ dihapus" });
    },
  });

  const toggleFaqActive = useMutation({
    mutationFn: (faq: Faq) =>
      apiFetch(`/cs-bot/${selectedDeviceId}/faqs/${faq.id}`, {
        method: "PUT",
        body: JSON.stringify({ ...faq, isActive: !faq.isActive }),
      }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cs-bot-faqs", selectedDeviceId] }),
  });

  function resetFaqForm() {
    setFaqForm({ category: "Umum", question: "", keywords: "", answer: "", matchType: "contains", sortOrder: 0, isActive: true, mediaUrl: "", mediaCaption: "" });
  }

  function openEditFaq(f: Faq) {
    setEditFaq(f);
    setFaqForm({
      category: f.category, question: f.question, keywords: f.keywords,
      answer: f.answer, matchType: f.matchType, sortOrder: f.sortOrder, isActive: f.isActive,
      mediaUrl: f.mediaUrl ?? "", mediaCaption: f.mediaCaption ?? "",
    });
    setFaqOpen(true);
  }

  // ── Test bot ───────────────────────────────────────────────────────────────

  async function sendTestMsg() {
    if (!testMsg.trim() || !selectedDeviceId || testLoading) return;
    const msg = testMsg.trim();
    setTestMsg("");
    setTestHistory((h) => [...h, { from: "user", text: msg }]);
    setTestLoading(true);
    try {
      const r = await apiFetch(`/cs-bot/${selectedDeviceId}/test`, {
        method: "POST", body: JSON.stringify({ message: msg }),
      });
      const { reply } = await r.json();
      setTestHistory((h) => [...h, { from: "bot", text: reply }]);
    } catch {
      setTestHistory((h) => [...h, { from: "bot", text: "(Error: gagal mendapat respons)" }]);
    } finally {
      setTestLoading(false);
    }
  }

  // ── Auto-scroll test chat ──────────────────────────────────────────────────
  useEffect(() => {
    testChatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [testHistory, testLoading]);

  // ── Business days helper ───────────────────────────────────────────────────

  function toggleDay(day: number, currentDays: string) {
    const days = currentDays.split(",").map(Number).filter(Boolean);
    const next = days.includes(day) ? days.filter((d) => d !== day) : [...days, day].sort();
    return next.join(",");
  }

  const filteredFaqs = (faqs ?? []).filter((f) =>
    !faqSearch || f.question.toLowerCase().includes(faqSearch.toLowerCase()) ||
    f.keywords.toLowerCase().includes(faqSearch.toLowerCase()) ||
    f.category.toLowerCase().includes(faqSearch.toLowerCase())
  );

  const categories = [...new Set((faqs ?? []).map((f) => f.category))];

  // ── Render ─────────────────────────────────────────────────────────────────

  if (listLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid md:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      </div>
    );
  }

  const devices = entries ?? [];

  return (
    <div className="space-y-6">

      {/* ── Device selector ─────────────────────────────────────────────── */}
      {devices.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground text-sm">
            Belum ada perangkat. Tambahkan perangkat terlebih dahulu.
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-1">
          <Label className="text-sm font-medium">Pilih Perangkat</Label>
          <Select
            value={selectedDeviceId ? String(selectedDeviceId) : ""}
            onValueChange={(v) => setSelectedDeviceId(v ? Number(v) : null)}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="— Pilih perangkat —" />
            </SelectTrigger>
            <SelectContent>
              {devices.map(({ device, bot: b }) => (
                <SelectItem key={device.id} value={String(device.id)}>
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full flex-shrink-0 ${device.status === "connected" ? "bg-green-500" : "bg-muted-foreground"}`} />
                    <span className="font-medium">{device.name}</span>
                    {device.phone && <span className="text-muted-foreground text-xs">{device.phone}</span>}
                    {b?.isEnabled && <span className="text-xs text-primary ml-1">· Bot Aktif</span>}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* ── Bot config panel ────────────────────────────────────────────── */}
      {selectedDeviceId && selectedEntry && (
        <Tabs defaultValue="config" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold text-base">{selectedEntry.device.name}</h2>
              <p className="text-xs text-muted-foreground">Konfigurasi CS Bot</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">{bot?.isEnabled ? "Aktif" : "Nonaktif"}</span>
              <Switch
                checked={bot?.isEnabled ?? false}
                onCheckedChange={toggleBot}
                disabled={updateBot.isPending}
              />
            </div>
          </div>

          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="config" className="gap-1.5"><MessageSquare className="h-3.5 w-3.5" /> Pesan</TabsTrigger>
            <TabsTrigger value="hours" className="gap-1.5"><Clock className="h-3.5 w-3.5" /> Jam Operasional</TabsTrigger>
            <TabsTrigger value="faqs" className="gap-1.5">
              <HelpCircle className="h-3.5 w-3.5" /> FAQ
              {(faqs?.length ?? 0) > 0 && (
                <span className="ml-0.5 bg-muted text-muted-foreground rounded-full px-1.5 py-0.5 text-[10px] font-medium">{faqs!.length}</span>
              )}
            </TabsTrigger>
            <TabsTrigger value="ai" className="gap-1.5">
              <Sparkles className="h-3.5 w-3.5" /> AI
              {bot?.aiEnabled && (
                <span className="ml-0.5 w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
              )}
            </TabsTrigger>
            <TabsTrigger value="test" className="gap-1.5"><PlayCircle className="h-3.5 w-3.5" /> Uji Bot</TabsTrigger>
          </TabsList>

          {/* ── Messages tab ──────────────────────────────────────────────── */}
          <TabsContent value="config" className="space-y-4">
            <BotMessagesForm bot={bot} deviceId={selectedDeviceId} onSave={(d) => updateBot.mutate(d)} saving={updateBot.isPending} />

            {/* Order Flow Info Card */}
            <Card className="border-primary/20 bg-primary/[0.03]">
              <CardContent className="pt-4 pb-4 px-4">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                    <Tag className="w-4 h-4 text-primary" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold">Fitur Pemesanan Otomatis</p>
                    <p className="text-xs text-muted-foreground mt-0.5 mb-2">
                      CS Bot dapat menerima pesanan produk dari pelanggan secara otomatis melalui percakapan WhatsApp.
                    </p>
                    <p className="text-xs text-muted-foreground font-medium mb-1">Pelanggan bisa memulai dengan mengetik:</p>
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {["katalog", "lihat produk", "mau pesan", "mau beli", "mau order", "cara pesan"].map((kw) => (
                        <code key={kw} className="text-[11px] bg-muted px-1.5 py-0.5 rounded font-mono">{kw}</code>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Atur produk dan lihat pesanan masuk di halaman{" "}
                      <a href="/bot-products" className="text-primary underline font-medium">Produk &amp; Pesanan Bot</a>.
                      Fitur ini aktif otomatis jika ada produk yang terdaftar.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Business hours tab ────────────────────────────────────────── */}
          <TabsContent value="hours">
            <BusinessHoursForm bot={bot} onSave={(d) => updateBot.mutate(d)} saving={updateBot.isPending} toggleDay={toggleDay} />
          </TabsContent>

          {/* ── FAQs tab ──────────────────────────────────────────────────── */}
          <TabsContent value="faqs">
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative flex-1 min-w-[180px]">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Cari FAQ..."
                    value={faqSearch}
                    onChange={(e) => setFaqSearch(e.target.value)}
                    className="pl-8"
                  />
                </div>
                <Button size="sm" onClick={() => { setEditFaq(null); resetFaqForm(); setFaqOpen(true); }} className="gap-1.5">
                  <Plus className="h-4 w-4" /> Tambah FAQ
                </Button>
              </div>

              {faqsLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20" />)}
                </div>
              ) : filteredFaqs.length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center text-muted-foreground text-sm space-y-3">
                    <HelpCircle className="h-8 w-8 mx-auto opacity-30" />
                    <p>{faqSearch ? "Tidak ada FAQ yang cocok." : "Belum ada FAQ. Tambahkan pertanyaan dan jawaban untuk bot Anda."}</p>
                    {!faqSearch && (
                      <Button size="sm" variant="outline" onClick={() => { setEditFaq(null); resetFaqForm(); setFaqOpen(true); }}>
                        <Plus className="h-4 w-4 mr-1" /> Tambah FAQ Pertama
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-2">
                  {categories.filter((c) => filteredFaqs.some((f) => f.category === c)).map((cat) => (
                    <div key={cat}>
                      <div className="flex items-center gap-2 py-1.5 mb-1">
                        <Tag className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{cat}</span>
                      </div>
                      <div className="space-y-2">
                        {filteredFaqs.filter((f) => f.category === cat).map((faq) => (
                          <Card key={faq.id} className={!faq.isActive ? "opacity-60" : ""}>
                            <CardContent className="p-3">
                              <div className="flex items-start gap-3">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <p className="text-sm font-medium">{faq.question}</p>
                                    {faq.triggerCount > 0 && (
                                      <Badge variant="secondary" className="text-xs gap-1">
                                        <Star className="h-2.5 w-2.5" />{faq.triggerCount}x
                                      </Badge>
                                    )}
                                    <Badge variant="outline" className="text-xs capitalize">{
                                      MATCH_TYPES.find((m) => m.value === faq.matchType)?.label ?? faq.matchType
                                    }</Badge>
                                  </div>
                                  <div className="flex flex-wrap gap-1 mt-1">
                                    {faq.keywords.split(",").map((kw, i) => (
                                      <span key={i} className="text-xs bg-secondary text-muted-foreground rounded px-1.5 py-0.5">
                                        {kw.trim()}
                                      </span>
                                    ))}
                                  </div>
                                  <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">{faq.answer}</p>
                                </div>
                                <div className="flex items-center gap-1 flex-shrink-0">
                                  <Button variant="ghost" size="icon" className="h-7 w-7"
                                    onClick={() => toggleFaqActive.mutate(faq)}>
                                    {faq.isActive
                                      ? <ToggleRight className="h-4 w-4 text-primary" />
                                      : <ToggleLeft className="h-4 w-4 text-muted-foreground" />}
                                  </Button>
                                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditFaq(faq)}>
                                    <Edit2 className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                                    onClick={() => deleteFaq.mutate(faq.id)}>
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <Card className="bg-secondary/30 border-dashed">
                <CardContent className="p-4 text-xs text-muted-foreground space-y-1.5">
                  <p className="font-semibold text-foreground text-sm flex items-center gap-1.5"><Zap className="h-3.5 w-3.5 text-primary" /> Tips Keyword</p>
                  <p>• Pisahkan kata kunci dengan koma: <code className="bg-muted px-1 rounded">harga, price, biaya</code></p>
                  <p>• Gunakan kata kunci pendek dan variasi penulisan yang umum</p>
                  <p>• Urutan FAQ menentukan prioritas — FAQ yang lebih atas lebih diprioritaskan</p>
                  <p>• Pesan <code className="bg-muted px-1 rounded">agen</code> atau <code className="bg-muted px-1 rounded">cs</code> akan diteruskan ke handoff manusia</p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ── AI tab ────────────────────────────────────────────────────── */}
          <TabsContent value="ai" className="space-y-4">

            {/* ── Personal API Key Card ─────────────────────────────────── */}
            <Card className={aiAccess?.hasOwnKey ? "border-green-500/40 bg-green-500/5" : ""}>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Key className="h-4 w-4 text-primary" /> API Key Pribadi (OpenAI)
                </CardTitle>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Gunakan API key OpenAI Anda sendiri untuk mengaktifkan fitur AI tanpa bergantung pada paket berlangganan. Key disimpan secara terenkripsi dan hanya digunakan untuk CS Bot Anda.
                </p>
              </CardHeader>
              <CardContent>
                {aiAccess?.hasOwnKey ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                      <CheckCircle className="h-4 w-4 text-green-600 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-green-700">API Key Aktif</p>
                        <p className="text-xs text-green-600 font-mono">{aiAccess.keyPrefix}</p>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => { setShowKeyInput(true); setKeyInputValue(""); }}
                        >
                          Ganti
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          className="h-7 text-xs"
                          onClick={() => removeKeyMutation.mutate()}
                          disabled={removeKeyMutation.isPending}
                        >
                          {removeKeyMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <XCircle className="h-3 w-3" />}
                        </Button>
                      </div>
                    </div>
                    {showKeyInput && (
                      <div className="space-y-2">
                        <div className="relative">
                          <Input
                            type={keyInputVisible ? "text" : "password"}
                            placeholder="sk-proj-..."
                            value={keyInputValue}
                            onChange={(e) => setKeyInputValue(e.target.value)}
                            className="pr-10 font-mono text-sm"
                          />
                          <button
                            type="button"
                            onClick={() => setKeyInputVisible(!keyInputVisible)}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          >
                            {keyInputVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            className="text-xs"
                            onClick={() => saveKeyMutation.mutate(keyInputValue)}
                            disabled={saveKeyMutation.isPending || !keyInputValue.startsWith("sk-")}
                          >
                            {saveKeyMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                            Simpan Key Baru
                          </Button>
                          <Button size="sm" variant="ghost" className="text-xs" onClick={() => setShowKeyInput(false)}>
                            Batal
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {!showKeyInput ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-2 text-sm"
                        onClick={() => setShowKeyInput(true)}
                      >
                        <Key className="h-4 w-4" /> Tambahkan API Key Saya
                      </Button>
                    ) : (
                      <div className="space-y-2">
                        <Label className="text-xs text-muted-foreground">
                          Masukkan OpenAI API Key Anda (dimulai dengan <code className="bg-muted px-1 rounded">sk-</code>)
                        </Label>
                        <div className="relative">
                          <Input
                            type={keyInputVisible ? "text" : "password"}
                            placeholder="sk-proj-..."
                            value={keyInputValue}
                            onChange={(e) => setKeyInputValue(e.target.value)}
                            className="pr-10 font-mono text-sm"
                          />
                          <button
                            type="button"
                            onClick={() => setKeyInputVisible(!keyInputVisible)}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          >
                            {keyInputVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            className="text-xs"
                            onClick={() => saveKeyMutation.mutate(keyInputValue)}
                            disabled={saveKeyMutation.isPending || !keyInputValue.startsWith("sk-")}
                          >
                            {saveKeyMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                            Simpan & Aktifkan
                          </Button>
                          <Button size="sm" variant="ghost" className="text-xs" onClick={() => { setShowKeyInput(false); setKeyInputValue(""); }}>
                            Batal
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Dapatkan API key di{" "}
                          <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer" className="underline text-primary">
                            platform.openai.com/api-keys
                          </a>
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* ── Access status + form ──────────────────────────────────── */}
            {aiAccess?.allowed === false ? (
              <Card className="border-dashed">
                <CardContent className="py-10 text-center">
                  <div
                    className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
                    style={{ backgroundColor: "hsl(145 63% 49% / 0.1)" }}
                  >
                    <Sparkles className="h-7 w-7" style={{ color: "hsl(145 63% 49%)" }} />
                  </div>
                  <h3 className="font-semibold text-base mb-1">Konfigurasi AI Belum Tersedia</h3>
                  <p className="text-sm text-muted-foreground max-w-xs mx-auto mb-5">
                    Tambahkan API key OpenAI pribadi Anda di atas, atau upgrade ke paket yang mendukung AI CS Bot.
                  </p>
                  <a href="/billing">
                    <button
                      className="px-4 py-2 rounded-lg text-sm font-medium text-white"
                      style={{ backgroundColor: "hsl(145 63% 49%)" }}
                    >
                      Lihat Paket Tersedia
                    </button>
                  </a>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {aiAccess?.source === "plan" && (
                  <div className="flex items-center gap-2 p-3 rounded-lg border border-blue-500/20 bg-blue-500/5 text-blue-700 text-xs">
                    <Info className="h-4 w-4 shrink-0" />
                    Menggunakan API key admin (termasuk dalam paket Anda). Tambahkan key pribadi di atas untuk menggunakan quota Anda sendiri.
                  </div>
                )}
                <AiSettingsForm bot={bot} deviceId={selectedDeviceId} onSave={(d) => updateBot.mutate(d)} saving={updateBot.isPending} />
              </div>
            )}
          </TabsContent>

          {/* ── Test tab ──────────────────────────────────────────────────── */}
          <TabsContent value="test">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <PlayCircle className="h-4 w-4 text-primary" /> Simulasi Chat
                </CardTitle>
                <p className="text-xs text-muted-foreground">Ketik pesan seperti pelanggan untuk menguji respons bot</p>
              </CardHeader>
              <CardContent>
                <div className="bg-secondary/20 rounded-xl p-4 h-72 overflow-y-auto mb-4 space-y-3">
                  {testHistory.length === 0 && (
                    <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                      <div className="text-center space-y-2">
                        <Bot className="h-8 w-8 mx-auto opacity-30" />
                        <p>Mulai chat untuk menguji bot</p>
                        <p className="text-xs">Coba: <code className="bg-muted px-1 rounded">halo</code> · <code className="bg-muted px-1 rounded">menu</code> · <code className="bg-muted px-1 rounded">katalog</code> · <code className="bg-muted px-1 rounded">mau beli</code></p>
                      </div>
                    </div>
                  )}
                  {testHistory.map((h, i) => (
                    <div key={i} className={`flex ${h.from === "user" ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[75%] rounded-xl px-3 py-2 text-sm whitespace-pre-wrap break-words ${
                        h.from === "user"
                          ? "bg-primary text-white rounded-br-sm"
                          : "bg-card border border-border rounded-bl-sm"
                      }`}>
                        {h.from === "bot" && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                            <Bot className="h-3 w-3" /> {bot?.botName ?? "CS Bot"}
                          </div>
                        )}
                        {h.text}
                      </div>
                    </div>
                  ))}
                  {testLoading && (
                    <div className="flex justify-start">
                      <div className="bg-card border rounded-xl rounded-bl-sm px-3 py-2 text-sm text-muted-foreground flex items-center gap-1.5">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Mengetik...
                      </div>
                    </div>
                  )}
                  <div ref={testChatEndRef} />
                </div>
                <div className="flex gap-2">
                  <Input
                    placeholder="Ketik pesan simulasi..."
                    value={testMsg}
                    onChange={(e) => setTestMsg(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendTestMsg()}
                  />
                  <Button onClick={sendTestMsg} disabled={!testMsg.trim() || testLoading} size="icon">
                    <Send className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setTestHistory([])} className="text-xs whitespace-nowrap">
                    Hapus
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-2">Tekan Enter untuk mengirim</p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      {/* ── FAQ Dialog ────────────────────────────────────────────────────── */}
      <Dialog open={faqOpen} onOpenChange={(o) => { if (!o) { setFaqOpen(false); setEditFaq(null); resetFaqForm(); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editFaq ? "Edit FAQ" : "Tambah FAQ"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Kategori</Label>
                <Input
                  placeholder="Umum, Produk, Pembayaran..."
                  value={faqForm.category}
                  onChange={(e) => setFaqForm((f) => ({ ...f, category: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Tipe Pencocokan</Label>
                <Select value={faqForm.matchType} onValueChange={(v) => setFaqForm((f) => ({ ...f, matchType: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MATCH_TYPES.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Pertanyaan / Judul FAQ</Label>
              <Input
                placeholder="Contoh: Berapa harga produk X?"
                value={faqForm.question}
                onChange={(e) => setFaqForm((f) => ({ ...f, question: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Kata Kunci <span className="text-muted-foreground">(pisahkan dengan koma)</span></Label>
              <Input
                placeholder="harga, price, berapa, cost"
                value={faqForm.keywords}
                onChange={(e) => setFaqForm((f) => ({ ...f, keywords: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">Bot akan membalas ketika pesan mengandung salah satu kata kunci ini</p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Jawaban Bot</Label>
              <Textarea
                placeholder="Ketik jawaban yang akan dikirim bot..."
                value={faqForm.answer}
                onChange={(e) => setFaqForm((f) => ({ ...f, answer: e.target.value }))}
                rows={5}
              />
              <p className="text-xs text-muted-foreground">Mendukung emoji 😊 dan baris baru. Gunakan *teks* untuk bold.</p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">URL Gambar / Dokumen <span className="text-muted-foreground">(opsional)</span></Label>
              <Input
                placeholder="https://example.com/gambar.jpg atau link dokumen"
                value={faqForm.mediaUrl}
                onChange={(e) => setFaqForm((f) => ({ ...f, mediaUrl: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">Bot akan mengirim gambar atau dokumen ini bersama jawaban teks</p>
            </div>

            {faqForm.mediaUrl && (
              <div className="space-y-1.5">
                <Label className="text-xs">Caption Media <span className="text-muted-foreground">(opsional)</span></Label>
                <Input
                  placeholder="Caption untuk gambar/dokumen..."
                  value={faqForm.mediaCaption}
                  onChange={(e) => setFaqForm((f) => ({ ...f, mediaCaption: e.target.value }))}
                />
              </div>
            )}

            <div className="flex items-center justify-between">
              <Label className="text-xs">FAQ Aktif</Label>
              <Switch
                checked={faqForm.isActive}
                onCheckedChange={(v) => setFaqForm((f) => ({ ...f, isActive: v }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setFaqOpen(false); setEditFaq(null); resetFaqForm(); }}>Batal</Button>
            <Button
              onClick={() => saveFaq.mutate(faqForm)}
              disabled={!faqForm.question.trim() || !faqForm.keywords.trim() || !faqForm.answer.trim() || saveFaq.isPending}
            >
              {saveFaq.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editFaq ? "Simpan Perubahan" : "Tambah FAQ"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── AI Settings Form ──────────────────────────────────────────────────────────

export const AI_PROVIDERS = [
  { value: "platform", label: "Platform (default)", desc: "Gunakan API key yang dikonfigurasi oleh platform", icon: "⚡" },
  { value: "openai",   label: "OpenAI",    desc: "ChatGPT, GPT-4o, o1, dll", icon: "🟢" },
  { value: "anthropic",label: "Anthropic", desc: "Claude 3.5 Sonnet, Claude Haiku, dll", icon: "🔷" },
  { value: "gemini",   label: "Google Gemini", desc: "Gemini 1.5 Pro, Gemini Flash, dll", icon: "🔵" },
  { value: "groq",     label: "Groq",      desc: "Llama 3, Mixtral — super cepat & gratis", icon: "⚡" },
  { value: "openrouter", label: "OpenRouter", desc: "Akses 200+ model dari satu API key", icon: "🌐" },
  { value: "deepseek", label: "DeepSeek",  desc: "DeepSeek-V3, DeepSeek-R1 — sangat hemat", icon: "🐋" },
  { value: "mistral",  label: "Mistral AI", desc: "Mistral Large, Mixtral, dll", icon: "💨" },
];

const AI_MODELS_BY_PROVIDER: Record<string, { group: string; items: { value: string; label: string }[] }[]> = {
  platform: [
    { group: "GPT-4o", items: [
      { value: "gpt-4o-mini", label: "GPT-4o Mini ★ Rekomendasi" },
      { value: "gpt-4o",      label: "GPT-4o — Pintar & multimodal" },
    ]},
  ],
  openai: [
    { group: "GPT-4o", items: [
      { value: "gpt-4o-mini", label: "GPT-4o Mini ★ Rekomendasi" },
      { value: "gpt-4o",      label: "GPT-4o — Pintar & multimodal" },
      { value: "gpt-4o-2024-11-20", label: "GPT-4o (Nov 2024)" },
    ]},
    { group: "GPT-4", items: [
      { value: "gpt-4-turbo", label: "GPT-4 Turbo — Konteks panjang" },
      { value: "gpt-4",       label: "GPT-4 — Klasik andalan" },
    ]},
    { group: "GPT-3.5", items: [
      { value: "gpt-3.5-turbo", label: "GPT-3.5 Turbo — Sangat hemat" },
    ]},
    { group: "Reasoning (o-series)", items: [
      { value: "o4-mini", label: "o4 Mini — Reasoning cepat" },
      { value: "o3-mini", label: "o3 Mini — Reasoning hemat" },
      { value: "o1-mini", label: "o1 Mini — Reasoning mendalam" },
      { value: "o1",      label: "o1 — Reasoning penuh" },
    ]},
  ],
  anthropic: [
    { group: "Claude 3.5", items: [
      { value: "claude-3-5-sonnet-20241022", label: "Claude 3.5 Sonnet ★ Rekomendasi" },
      { value: "claude-3-5-haiku-20241022",  label: "Claude 3.5 Haiku — Cepat & hemat" },
    ]},
    { group: "Claude 3", items: [
      { value: "claude-3-opus-20240229",   label: "Claude 3 Opus — Paling pintar" },
      { value: "claude-3-sonnet-20240229", label: "Claude 3 Sonnet — Seimbang" },
      { value: "claude-3-haiku-20240307",  label: "Claude 3 Haiku — Tercepat" },
    ]},
  ],
  gemini: [
    { group: "Gemini 2.0", items: [
      { value: "gemini-2.0-flash",    label: "Gemini 2.0 Flash ★ Rekomendasi" },
      { value: "gemini-2.0-flash-lite", label: "Gemini 2.0 Flash Lite — Tercepat" },
    ]},
    { group: "Gemini 1.5", items: [
      { value: "gemini-1.5-pro",   label: "Gemini 1.5 Pro — Konteks panjang" },
      { value: "gemini-1.5-flash", label: "Gemini 1.5 Flash — Cepat & hemat" },
    ]},
  ],
  groq: [
    { group: "Llama 3.3", items: [
      { value: "llama-3.3-70b-versatile",  label: "Llama 3.3 70B ★ Rekomendasi" },
      { value: "llama-3.3-70b-specdec",    label: "Llama 3.3 70B SpecDec — Super cepat" },
    ]},
    { group: "Llama 3.1", items: [
      { value: "llama-3.1-8b-instant",    label: "Llama 3.1 8B — Tercepat & gratis" },
      { value: "llama-3.1-70b-versatile", label: "Llama 3.1 70B — Seimbang" },
    ]},
    { group: "Mixtral", items: [
      { value: "mixtral-8x7b-32768", label: "Mixtral 8x7B — Konteks panjang" },
    ]},
    { group: "Gemma", items: [
      { value: "gemma2-9b-it", label: "Gemma 2 9B — Ringan & cepat" },
    ]},
  ],
  openrouter: [
    { group: "Populer", items: [
      { value: "openai/gpt-4o-mini",           label: "GPT-4o Mini ★ Rekomendasi" },
      { value: "anthropic/claude-3.5-sonnet",  label: "Claude 3.5 Sonnet" },
      { value: "google/gemini-flash-1.5",      label: "Gemini 1.5 Flash" },
      { value: "meta-llama/llama-3.3-70b-instruct", label: "Llama 3.3 70B" },
      { value: "deepseek/deepseek-chat",       label: "DeepSeek V3 — Sangat hemat" },
    ]},
    { group: "Free Tier", items: [
      { value: "meta-llama/llama-3.1-8b-instruct:free", label: "Llama 3.1 8B — Gratis" },
      { value: "mistralai/mistral-7b-instruct:free",    label: "Mistral 7B — Gratis" },
    ]},
  ],
  deepseek: [
    { group: "DeepSeek", items: [
      { value: "deepseek-chat",     label: "DeepSeek V3 ★ Rekomendasi" },
      { value: "deepseek-reasoner", label: "DeepSeek R1 — Reasoning" },
    ]},
  ],
  mistral: [
    { group: "Mistral", items: [
      { value: "mistral-large-latest",  label: "Mistral Large ★ Rekomendasi" },
      { value: "mistral-small-latest",  label: "Mistral Small — Hemat" },
      { value: "open-mixtral-8x22b",    label: "Mixtral 8x22B — Konteks panjang" },
      { value: "open-mistral-nemo",     label: "Mistral Nemo — Ringan" },
    ]},
  ],
};

// Default models per provider
const DEFAULT_MODEL_FOR_PROVIDER: Record<string, string> = {
  platform:   "gpt-4o-mini",
  openai:     "gpt-4o-mini",
  anthropic:  "claude-3-5-sonnet-20241022",
  gemini:     "gemini-2.0-flash",
  groq:       "llama-3.3-70b-versatile",
  openrouter: "openai/gpt-4o-mini",
  deepseek:   "deepseek-chat",
  mistral:    "mistral-large-latest",
};

// Keep for backwards compat reference (used in model selector)
const AI_MODELS = AI_MODELS_BY_PROVIDER["openai"] ?? [];

const AI_MODES = [
  {
    value: "faq_only",
    label: "FAQ Saja",
    desc: "Hanya cocokkan kata kunci FAQ, tidak pakai AI",
    icon: "🗂️",
  },
  {
    value: "ai_fallback",
    label: "AI sebagai Fallback",
    desc: "FAQ diproses dulu, AI menjawab jika tidak ada yang cocok",
    icon: "🤝",
  },
  {
    value: "full_ai",
    label: "Full AI",
    desc: "AI selalu menjawab menggunakan FAQ sebagai konteks",
    icon: "🤖",
  },
];

function AiSettingsForm({
  bot,
  deviceId,
  onSave,
  saving,
}: {
  bot: BotConfig | null;
  deviceId: number;
  onSave: (data: Partial<BotConfig>) => void;
  saving: boolean;
}) {
  const makeAiForm = (b: BotConfig | null): Partial<BotConfig> => ({
    aiEnabled: b?.aiEnabled ?? false,
    aiMode: b?.aiMode ?? "ai_fallback",
    aiModel: b?.aiModel ?? "gpt-4o-mini",
    aiSystemPrompt: b?.aiSystemPrompt ?? "Kamu adalah asisten customer service yang ramah dan profesional. Jawab pertanyaan pelanggan dengan singkat, jelas, dan sopan. Gunakan bahasa Indonesia yang baik.",
    aiBusinessContext: b?.aiBusinessContext ?? "",
    aiMaxTokens: b?.aiMaxTokens ?? 300,
    aiProvider: b?.aiProvider ?? "platform",
    aiApiKey: b?.aiApiKey ?? "",
    websiteUrl: b?.websiteUrl ?? "",
    websiteContent: b?.websiteContent ?? "",
    websiteContentUpdatedAt: b?.websiteContentUpdatedAt ?? null,
  });

  const [form, setForm] = useState<Partial<BotConfig>>(makeAiForm(bot));
  const { toast } = useToast();
  const qc = useQueryClient();

  useEffect(() => { setForm(makeAiForm(bot)); }, [deviceId]);

  function set(k: keyof typeof form, v: any) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  const scrapeMutation = useMutation({
    mutationFn: (url: string) =>
      apiFetch(`/cs-bot/${deviceId}/scrape-website`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      }).then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.message ?? "Gagal mengambil konten");
        return d;
      }),
    onSuccess: (d) => {
      setForm((f) => ({
        ...f,
        websiteContent: d.preview,
        websiteContentUpdatedAt: d.updatedAt,
      }));
      qc.invalidateQueries({ queryKey: ["cs-bot", deviceId] });
      toast({ title: `✅ Berhasil! ${d.charCount} karakter diambil dari website` });
    },
    onError: (err: any) => {
      toast({ title: err.message ?? "Gagal ambil konten website", variant: "destructive" });
    },
  });

  return (
    <div className="space-y-4">
      {/* Master toggle */}
      <Card>
        <CardContent className="pt-5 pb-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                style={{ backgroundColor: "hsl(145 63% 49% / 0.12)" }}
              >
                <Sparkles className="w-4 h-4" style={{ color: "hsl(145 63% 49%)" }} />
              </div>
              <div>
                <p className="font-semibold text-sm">Aktifkan AI untuk CS Bot</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Bot akan menggunakan AI untuk menjawab pesan pelanggan secara cerdas
                </p>
              </div>
            </div>
            <Switch
              checked={form.aiEnabled ?? false}
              onCheckedChange={(v) => set("aiEnabled", v)}
              className="shrink-0 mt-0.5"
            />
          </div>
        </CardContent>
      </Card>

      {/* AI Provider Selection */}
      {form.aiEnabled && (
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <Zap className="h-4 w-4" style={{ color: "hsl(145 63% 49%)" }} />
              Provider AI
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Pilih layanan AI yang ingin digunakan. Masukkan API key sendiri untuk provider non-platform.
            </p>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-3">
            <div className="grid grid-cols-1 gap-1.5">
              {AI_PROVIDERS.map((p) => (
                <button
                  key={p.value}
                  onClick={() => {
                    set("aiProvider", p.value);
                    const def = DEFAULT_MODEL_FOR_PROVIDER[p.value];
                    if (def) set("aiModel", def);
                  }}
                  className={`w-full rounded-lg border px-3 py-2.5 text-left transition-colors ${
                    form.aiProvider === p.value
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/40"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-base">{p.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium">{p.label}</p>
                        {p.value === "platform" && (
                          <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-medium">Default</span>
                        )}
                        {p.value === "groq" && (
                          <span className="text-[10px] bg-green-500/10 text-green-600 px-1.5 py-0.5 rounded-full font-medium">Gratis</span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{p.desc}</p>
                    </div>
                    {form.aiProvider === p.value && (
                      <div
                        className="ml-auto w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: "hsl(145 63% 49%)" }}
                      />
                    )}
                  </div>
                </button>
              ))}
            </div>

            {/* API Key input for non-platform providers */}
            {form.aiProvider && form.aiProvider !== "platform" && (
              <div className="space-y-1.5 pt-1">
                <Label className="text-xs">
                  API Key — {AI_PROVIDERS.find((p) => p.value === form.aiProvider)?.label}
                </Label>
                <Input
                  type="password"
                  value={form.aiApiKey ?? ""}
                  onChange={(e) => set("aiApiKey", e.target.value)}
                  placeholder={
                    form.aiProvider === "anthropic" ? "sk-ant-api03-..." :
                    form.aiProvider === "groq" ? "gsk_..." :
                    form.aiProvider === "openrouter" ? "sk-or-v1-..." :
                    form.aiProvider === "deepseek" ? "sk-..." :
                    form.aiProvider === "gemini" ? "AIza..." :
                    "Masukkan API key..."
                  }
                  className="font-mono text-xs"
                />
                <p className="text-xs text-muted-foreground">
                  API key disimpan terenkripsi dan hanya digunakan untuk CS Bot ini.
                  {form.aiProvider === "groq" && (
                    <> Daftar gratis di <a href="https://console.groq.com" target="_blank" rel="noreferrer" className="underline text-primary">console.groq.com</a></>
                  )}
                  {form.aiProvider === "openrouter" && (
                    <> Daftar di <a href="https://openrouter.ai" target="_blank" rel="noreferrer" className="underline text-primary">openrouter.ai</a> — ada model gratis</>
                  )}
                  {form.aiProvider === "deepseek" && (
                    <> Daftar di <a href="https://platform.deepseek.com" target="_blank" rel="noreferrer" className="underline text-primary">platform.deepseek.com</a> — harga sangat murah</>
                  )}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* AI Mode */}
      <Card className={!form.aiEnabled ? "opacity-50 pointer-events-none" : ""}>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm flex items-center gap-2">
            <Brain className="h-4 w-4" style={{ color: "hsl(145 63% 49%)" }} />
            Mode AI
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-2">
          {AI_MODES.map((m) => (
            <button
              key={m.value}
              onClick={() => set("aiMode", m.value)}
              className={`w-full rounded-lg border px-4 py-3 text-left transition-colors ${
                form.aiMode === m.value
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/40"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-base">{m.icon}</span>
                <div>
                  <p className="text-sm font-medium">{m.label}</p>
                  <p className="text-xs text-muted-foreground">{m.desc}</p>
                </div>
                {form.aiMode === m.value && (
                  <div
                    className="ml-auto w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: "hsl(145 63% 49%)" }}
                  />
                )}
              </div>
            </button>
          ))}
        </CardContent>
      </Card>

      {/* Model & Token */}
      <Card className={!form.aiEnabled ? "opacity-50 pointer-events-none" : ""}>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm">Model & Performa</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Model AI</Label>
            <Select value={form.aiModel ?? "gpt-4o-mini"} onValueChange={(v) => set("aiModel", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(AI_MODELS_BY_PROVIDER[form.aiProvider ?? "platform"] ?? AI_MODELS_BY_PROVIDER["openai"]!).map((g) => (
                  <SelectGroup key={g.group}>
                    <SelectLabel>{g.group}</SelectLabel>
                    {g.items.map((m) => (
                      <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Model yang direkomendasikan sudah dipilih otomatis saat Anda memilih provider
            </p>
          </div>

          <Separator />

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Panjang Maks Respons</Label>
              <div className="flex items-center gap-1.5">
                <Input
                  type="number"
                  min={50}
                  max={1000}
                  value={form.aiMaxTokens ?? 300}
                  onChange={(e) => set("aiMaxTokens", parseInt(e.target.value) || 300)}
                  className="w-20 h-7 text-sm text-center px-1"
                />
                <span className="text-xs text-muted-foreground">token</span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              ~100 token ≈ 75 kata. 200–400 token cukup untuk CS WhatsApp.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* System Prompt */}
      <Card className={!form.aiEnabled ? "opacity-50 pointer-events-none" : ""}>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm">Kepribadian & Konteks Bot</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">System Prompt (Instruksi AI)</Label>
            <Textarea
              value={form.aiSystemPrompt ?? ""}
              onChange={(e) => set("aiSystemPrompt", e.target.value)}
              rows={4}
              placeholder="Kamu adalah asisten customer service yang ramah..."
              className="text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Tentukan gaya bahasa, kepribadian, dan batasan bot. Semakin spesifik semakin baik.
            </p>
          </div>

          <Separator />

          <div className="space-y-1.5">
            <Label className="text-xs">Informasi Bisnis (Konteks Tambahan)</Label>
            <Textarea
              value={form.aiBusinessContext ?? ""}
              onChange={(e) => set("aiBusinessContext", e.target.value)}
              rows={4}
              placeholder={`Nama toko: Toko Saya\nProduk: Baju, celana, aksesoris\nJam buka: 09.00–21.00\nLokasi: Jakarta\nKontak: 0812-xxx-xxxx`}
              className="text-sm font-mono"
            />
            <p className="text-xs text-muted-foreground">
              Informasi ini diberikan ke AI agar bisa menjawab pertanyaan spesifik tentang bisnis Anda
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Website Knowledge Base */}
      <Card className={!form.aiEnabled ? "opacity-50 pointer-events-none" : ""}>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm flex items-center gap-2">
            <Globe className="h-4 w-4" style={{ color: "hsl(145 63% 49%)" }} />
            Knowledge Base dari Website
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-3">
          <p className="text-xs text-muted-foreground">
            Bot akan otomatis mengambil konten dari website Anda dan menggunakannya sebagai referensi untuk menjawab pertanyaan pelanggan.
          </p>

          <div className="flex gap-2">
            <Input
              placeholder="https://www.tokoanda.com"
              value={form.websiteUrl ?? ""}
              onChange={(e) => set("websiteUrl", e.target.value)}
              className="text-sm flex-1"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5 shrink-0"
              onClick={() => {
                const url = form.websiteUrl?.trim();
                if (!url) return;
                scrapeMutation.mutate(url);
              }}
              disabled={scrapeMutation.isPending || !form.websiteUrl?.trim()}
            >
              {scrapeMutation.isPending
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <RefreshCw className="h-3.5 w-3.5" />}
              {scrapeMutation.isPending ? "Mengambil..." : "Ambil Konten"}
            </Button>
          </div>

          {form.websiteContent ? (
            <div className="rounded-lg bg-muted/50 border p-3 space-y-1.5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-green-600 dark:text-green-400 flex items-center gap-1">
                  <CheckCircle className="h-3 w-3" /> Konten berhasil diambil
                </p>
                {form.websiteContentUpdatedAt && (
                  <p className="text-[10px] text-muted-foreground">
                    {new Date(form.websiteContentUpdatedAt).toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </p>
                )}
              </div>
              <p className="text-xs text-muted-foreground line-clamp-3 font-mono leading-relaxed">
                {form.websiteContent.slice(0, 200)}…
              </p>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground italic">
              Belum ada konten. Masukkan URL lalu klik "Ambil Konten".
            </p>
          )}

          <p className="text-xs text-muted-foreground">
            Konten akan di-refresh setiap kali Anda klik tombol "Ambil Konten". Simpan konfigurasi setelah mengambil konten.
          </p>
        </CardContent>
      </Card>

      {/* Preset prompts */}
      <Card className={!form.aiEnabled ? "opacity-50 pointer-events-none" : ""}>
        <CardContent className="pt-4 pb-4 px-4 space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Template System Prompt
          </p>
          {[
            {
              label: "E-Commerce",
              prompt: "Kamu adalah asisten belanja online yang ramah dan membantu. Bantu pelanggan dengan pertanyaan produk, status pesanan, cara pembayaran, dan pengiriman. Gunakan bahasa yang santai tapi profesional. Jika tidak yakin, minta pelanggan menghubungi agen manusia.",
            },
            {
              label: "Properti",
              prompt: "Kamu adalah asisten properti yang profesional. Bantu calon pembeli/penyewa dengan informasi unit, harga, lokasi, dan jadwal survei. Gunakan bahasa formal dan meyakinkan. Arahkan ke agen jika ada pertanyaan spesifik.",
            },
            {
              label: "Restoran / F&B",
              prompt: "Kamu adalah asisten restoran yang ramah. Bantu pelanggan dengan menu, harga, jam buka, reservasi meja, dan pemesanan. Gunakan tone yang hangat dan mengundang selera.",
            },
            {
              label: "Layanan Kesehatan",
              prompt: "Kamu adalah asisten klinik/apotek yang sopan dan empati. Bantu pasien dengan jadwal dokter, informasi layanan, dan pertanyaan umum. JANGAN memberikan saran medis spesifik — selalu arahkan ke tenaga medis.",
            },
          ].map((t) => (
            <div key={t.label} className="rounded-lg bg-muted/30 p-3 space-y-1.5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold">{t.label}</p>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 text-xs px-2"
                  onClick={() => set("aiSystemPrompt", t.prompt)}
                >
                  Gunakan
                </Button>
              </div>
              <p className="text-xs text-muted-foreground line-clamp-2">{t.prompt}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={() => onSave(form)} disabled={saving} className="gap-2">
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Simpan Konfigurasi AI
        </Button>
      </div>
    </div>
  );
}

// ── Bot Messages Form ─────────────────────────────────────────────────────────

function BotMessagesForm({
  bot, deviceId, onSave, saving,
}: {
  bot: BotConfig | null;
  deviceId: number;
  onSave: (data: Partial<BotConfig>) => void;
  saving: boolean;
}) {
  const defaultBot: Partial<BotConfig> = {
    botName: "CS Bot",
    greetingMessage: "Halo! Saya adalah asisten virtual. Ada yang bisa saya bantu? 😊",
    fallbackMessage: "Maaf, saya belum bisa menjawab pertanyaan itu. Ketik *menu* untuk melihat pilihan, atau tunggu dibantu oleh agen kami.",
    offlineMessage: "Halo! Kami sedang tidak beroperasi saat ini. Silakan tinggalkan pesan dan kami akan segera merespons. 🙏",
    menuMessage: "Ketik nomor untuk pilihan:\n1. Informasi produk\n2. Status pesanan\n3. Cara pembayaran\n4. Hubungi agen\n0. Kembali ke menu",
    humanHandoffKeyword: "agen,manusia,cs,operator",
    humanHandoffMessage: "Baik, saya akan menghubungkan Anda dengan agen kami. Mohon tunggu sebentar... 🙏",
    sessionTimeoutMinutes: 30,
  };

  const makeForm = (b: BotConfig | null): Partial<BotConfig> => ({
    botName: b?.botName ?? defaultBot.botName,
    greetingMessage: b?.greetingMessage ?? defaultBot.greetingMessage,
    fallbackMessage: b?.fallbackMessage ?? defaultBot.fallbackMessage,
    offlineMessage: b?.offlineMessage ?? defaultBot.offlineMessage,
    menuMessage: b?.menuMessage ?? defaultBot.menuMessage,
    showMenu: b?.showMenu ?? true,
    humanHandoffKeyword: b?.humanHandoffKeyword ?? defaultBot.humanHandoffKeyword,
    humanHandoffMessage: b?.humanHandoffMessage ?? defaultBot.humanHandoffMessage,
    sessionTimeoutMinutes: b?.sessionTimeoutMinutes ?? defaultBot.sessionTimeoutMinutes,
    language: b?.language ?? "id",
  });

  const [form, setForm] = useState<Partial<BotConfig>>(makeForm(bot));

  useEffect(() => { setForm(makeForm(bot)); }, [deviceId]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Profil Bot</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Nama Bot</Label>
            <Input
              placeholder="CS Bot, Asisten Toko, dll"
              value={form.botName ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, botName: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Bahasa Bot</Label>
            <Select value={form.language ?? "id"} onValueChange={(v) => setForm((f) => ({ ...f, language: v }))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="id">🇮🇩 Bahasa Indonesia</SelectItem>
                <SelectItem value="en">🇬🇧 English</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Mempengaruhi bahasa respons AI. Pesan statis di bawah bisa dikustomisasi sesuai bahasa pilihan.</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Pesan Otomatis</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Pesan Sapaan <span className="text-muted-foreground">(saat pelanggan memulai chat)</span></Label>
            <Textarea
              value={form.greetingMessage ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, greetingMessage: e.target.value }))}
              rows={3}
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Tampilkan Menu Setelah Sapaan</Label>
              <Switch
                checked={form.showMenu ?? true}
                onCheckedChange={(v) => setForm((f) => ({ ...f, showMenu: v }))}
              />
            </div>
          </div>

          {form.showMenu && (
            <div className="space-y-1.5">
              <Label className="text-xs">Teks Menu</Label>
              <Textarea
                value={form.menuMessage ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, menuMessage: e.target.value }))}
                rows={6}
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs">Pesan Fallback <span className="text-muted-foreground">(ketika tidak ada FAQ yang cocok)</span></Label>
            <Textarea
              value={form.fallbackMessage ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, fallbackMessage: e.target.value }))}
              rows={3}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Pesan Di Luar Jam Operasional</Label>
            <Textarea
              value={form.offlineMessage ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, offlineMessage: e.target.value }))}
              rows={2}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Handoff ke Agen Manusia</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Kata Kunci Handoff <span className="text-muted-foreground">(pisahkan dengan koma)</span></Label>
            <Input
              placeholder="agen, manusia, cs, operator"
              value={form.humanHandoffKeyword ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, humanHandoffKeyword: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Pesan Handoff</Label>
            <Textarea
              value={form.humanHandoffMessage ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, humanHandoffMessage: e.target.value }))}
              rows={2}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Sesi &amp; Timeout</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Timeout Sesi</p>
              <p className="text-xs text-muted-foreground">Sesi pelanggan akan direset setelah tidak aktif selama periode ini</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Input
                type="number"
                min={1}
                max={1440}
                value={form.sessionTimeoutMinutes ?? 30}
                onChange={(e) => setForm((f) => ({ ...f, sessionTimeoutMinutes: parseInt(e.target.value) || 30 }))}
                className="w-20 h-8 text-sm text-center"
              />
              <span className="text-xs text-muted-foreground whitespace-nowrap">menit</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={() => onSave(form)} disabled={saving} className="gap-2">
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Simpan Konfigurasi
        </Button>
      </div>
    </div>
  );
}

// ── Business Hours Form ───────────────────────────────────────────────────────

function BusinessHoursForm({
  bot, onSave, saving, toggleDay,
}: {
  bot: BotConfig | null;
  onSave: (data: Partial<BotConfig>) => void;
  saving: boolean;
  toggleDay: (day: number, currentDays: string) => string;
}) {
  const [form, setForm] = useState({
    businessHoursEnabled: bot?.businessHoursEnabled ?? false,
    businessHoursStart: bot?.businessHoursStart ?? "08:00",
    businessHoursEnd: bot?.businessHoursEnd ?? "17:00",
    businessDays: bot?.businessDays ?? "1,2,3,4,5",
  });

  useEffect(() => {
    setForm({
      businessHoursEnabled: bot?.businessHoursEnabled ?? false,
      businessHoursStart: bot?.businessHoursStart ?? "08:00",
      businessHoursEnd: bot?.businessHoursEnd ?? "17:00",
      businessDays: bot?.businessDays ?? "1,2,3,4,5",
    });
  }, [bot?.id]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Jam Operasional</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Aktifkan jam operasional</p>
            <p className="text-xs text-muted-foreground">Bot akan membalas dengan pesan offline di luar jam kerja</p>
          </div>
          <Switch
            checked={form.businessHoursEnabled}
            onCheckedChange={(v) => setForm((f) => ({ ...f, businessHoursEnabled: v }))}
          />
        </div>

        {form.businessHoursEnabled && (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Jam Mulai</Label>
                <Input
                  type="time"
                  value={form.businessHoursStart}
                  onChange={(e) => setForm((f) => ({ ...f, businessHoursStart: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Jam Selesai</Label>
                <Input
                  type="time"
                  value={form.businessHoursEnd}
                  onChange={(e) => setForm((f) => ({ ...f, businessHoursEnd: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Hari Kerja</Label>
              <div className="flex gap-2 flex-wrap">
                {["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"].map((label, idx) => {
                  const active = form.businessDays.split(",").map(Number).includes(idx);
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, businessDays: toggleDay(idx, f.businessDays) }))}
                      className={`w-10 h-10 rounded-lg text-xs font-medium transition-colors border ${
                        active ? "bg-primary text-white border-primary" : "border-border text-muted-foreground hover:border-primary/50"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}

        <div className="flex justify-end pt-2">
          <Button onClick={() => onSave(form)} disabled={saving} className="gap-2">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Simpan Jam Operasional
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

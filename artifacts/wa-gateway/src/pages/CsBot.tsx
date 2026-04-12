import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Bot, Plus, Trash2, Edit2, Loader2, Power, Send,
  MessageSquare, Clock, HelpCircle, Tag, Zap, ChevronDown, ChevronRight,
  ToggleLeft, ToggleRight, Star, Search, PlayCircle, Sparkles, Brain, Info,
  Key, Eye, EyeOff, CheckCircle, XCircle, Globe, RefreshCw, BookText, FileText,
  ClipboardList, Upload, FileIcon, AlertCircle, Smartphone, Save
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
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue, SelectSeparator,
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

const AI_PROVIDERS = [
  { value: "platform", label: "ID Platform (default)", icon: <Zap className="h-4 w-4" /> },
  { value: "openai",   label: "OpenAI",    icon: <Globe className="h-4 w-4" /> },
  { value: "anthropic", label: "Anthropic", icon: <Brain className="h-4 w-4" /> },
  { value: "gemini",   label: "Google Gemini", icon: <Sparkles className="h-4 w-4" /> },
  { value: "groq",     label: "Groq",      icon: <Zap className="h-4 w-4" /> },
  { value: "openrouter", label: "OpenRouter", icon: <Globe className="h-4 w-4" /> },
  { value: "deepseek",   label: "DeepSeek",   icon: <Bot className="h-4 w-4" /> },
  { value: "mistral",    label: "Mistral AI", icon: <RefreshCw className="h-4 w-4" /> },
];

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

  const [knowledgeOpen, setKnowledgeOpen] = useState(false);
  const [editKnowledge, setEditKnowledge] = useState<any>(null);
  const [knowledgeForm, setKnowledgeForm] = useState({ title: "", content: "", sourceType: "manual" });
  const [knowledgeSearch, setKnowledgeSearch] = useState("");

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

  const { data: knowledgeBase, isLoading: kbLoading } = useQuery<any[]>({
    queryKey: ["cs-bot-knowledge", selectedDeviceId],
    queryFn: () => apiFetch(`/cs-bot/${selectedDeviceId}/knowledge`).then((r) => r.json()),
    enabled: !!selectedDeviceId,
  });

  const updateBot = useMutation({
    mutationFn: (body: Partial<BotConfig>) =>
      apiFetch(`/cs-bot/${selectedDeviceId}`, { method: "PUT", body: JSON.stringify(body) }).then((r) => r.json()),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["cs-bot"] });
      if (!("isEnabled" in vars)) toast({ title: "Berhasil disimpan" });
    },
    onError: () => toast({ title: "Gagal menyimpan", variant: "destructive" }),
  });

  const saveFaq = useMutation({
    mutationFn: (body: any) => {
      const url = editFaq ? `/cs-bot/${selectedDeviceId}/faqs/${editFaq.id}` : `/cs-bot/${selectedDeviceId}/faqs`;
      return apiFetch(url, { method: editFaq ? "PUT" : "POST", body: JSON.stringify(body) }).then((r) => r.json());
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cs-bot-faqs", selectedDeviceId] });
      setFaqOpen(false);
      setEditFaq(null);
      toast({ title: editFaq ? "FAQ diperbarui" : "FAQ ditambahkan" });
    },
  });

  const deleteFaq = useMutation({
    mutationFn: (id: number) => apiFetch(`/cs-bot/${selectedDeviceId}/faqs/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cs-bot-faqs", selectedDeviceId] }),
  });

  const uploadKnowledgeMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      return apiFetch(`/cs-bot/${selectedDeviceId}/upload-knowledge`, { method: "POST", body: formData }).then(r => r.json());
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cs-bot-knowledge", selectedDeviceId] }),
  });

  const sendTestMsg = async () => {
    if (!testMsg.trim() || testLoading) return;
    const msg = testMsg;
    setTestMsg("");
    setTestHistory(h => [...h, { from: "user", text: msg }]);
    setTestLoading(true);
    try {
      const r = await apiFetch(`/cs-bot/${selectedDeviceId}/test`, { method: "POST", body: JSON.stringify({ message: msg }) });
      const { reply } = await r.json();
      setTestHistory(h => [...h, { from: "bot", text: reply }]);
    } catch {
      setTestHistory(h => [...h, { from: "bot", text: "(Gagal mendapat respons)" }]);
    } finally {
      setTestLoading(false);
    }
  };

  useEffect(() => { testChatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [testHistory]);

  if (listLoading) return <div className="p-8"><Skeleton className="h-64 rounded-xl" /></div>;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Bot className="w-5 h-5 text-primary" />
            CS Bot Manager
          </CardTitle>
          <div className="w-64">
            <Select value={String(selectedDeviceId)} onValueChange={(v) => setSelectedDeviceId(Number(v))}>
              <SelectTrigger>
                <SelectValue placeholder="Pilih Perangkat" />
              </SelectTrigger>
              <SelectContent>
                {entries?.map((e) => (
                  <SelectItem key={e.device.id} value={String(e.device.id)}>
                    {e.device.name} ({e.device.phone || "No Number"})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
      </Card>

      {selectedDeviceId ? (
        <div className="space-y-6 animate-in fade-in slide-in-from-top-4 duration-500">
          <div className="flex items-center justify-between bg-card p-4 rounded-xl border border-border shadow-sm">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${bot?.isEnabled ? 'bg-emerald-500/10 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                <Zap className="w-5 h-5" />
              </div>
              <div>
                <p className="font-bold text-sm">Status CS Bot</p>
                <p className="text-xs text-muted-foreground">{bot?.isEnabled ? 'Aktif - Bot siap menjawab pesan' : 'Nonaktif - Bot tidak akan membalas'}</p>
              </div>
            </div>
            <Switch checked={bot?.isEnabled ?? false} onCheckedChange={(v) => updateBot.mutate({ isEnabled: v })} />
          </div>

          <Tabs defaultValue="ai" className="space-y-4">
            <TabsList className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 h-auto p-1 bg-muted/50 rounded-xl">
              <TabsTrigger value="ai" className="gap-2 py-2.5 rounded-lg"><Sparkles className="w-3.5 h-3.5" /> AI Brain</TabsTrigger>
              <TabsTrigger value="config" className="gap-2 py-2.5 rounded-lg"><MessageSquare className="w-3.5 h-3.5" /> Pesan</TabsTrigger>
              <TabsTrigger value="hours" className="gap-2 py-2.5 rounded-lg"><Clock className="w-3.5 h-3.5" /> Jadwal</TabsTrigger>
              <TabsTrigger value="faqs" className="gap-2 py-2.5 rounded-lg"><HelpCircle className="w-3.5 h-3.5" /> FAQ</TabsTrigger>
              <TabsTrigger value="knowledge" className="gap-2 py-2.5 rounded-lg"><BookText className="w-3.5 h-3.5" /> Knowledge</TabsTrigger>
              <TabsTrigger value="test" className="gap-2 py-2.5 rounded-lg"><PlayCircle className="w-3.5 h-3.5" /> Simulator</TabsTrigger>
            </TabsList>

            <TabsContent value="ai"><AiSettingsForm bot={bot} deviceId={selectedDeviceId} onSave={(d) => updateBot.mutate(d)} saving={updateBot.isPending} /></TabsContent>
            <TabsContent value="config"><BotMessagesForm bot={bot} onSave={(d) => updateBot.mutate(d)} saving={updateBot.isPending} /></TabsContent>
            <TabsContent value="hours"><BusinessHoursForm bot={bot} onSave={(d) => updateBot.mutate(d)} saving={updateBot.isPending} /></TabsContent>
            <TabsContent value="faqs">
                 <div className="space-y-4">
                    <div className="flex gap-2">
                       <Input placeholder="Cari FAQ..." value={faqSearch} onChange={e=>setFaqSearch(e.target.value)} className="max-w-sm" />
                       <Button onClick={()=>{setEditFaq(null);setFaqOpen(true)}} className="gap-2"><Plus className="w-4 h-4"/> Tambah FAQ</Button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                       {faqs?.filter(f=>f.question.toLowerCase().includes(faqSearch.toLowerCase())).map(f=>(
                          <Card key={f.id} className="relative group">
                             <CardContent className="p-4">
                                <div className="flex justify-between items-start mb-2">
                                   <p className="font-bold text-sm truncate pr-8">{f.question}</p>
                                   <div className="flex gap-1 absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={()=>{setEditFaq(f);setFaqForm({...f, mediaUrl: f.mediaUrl??'', mediaCaption:f.mediaCaption??''});setFaqOpen(true)}}><Edit2 className="w-3 h-3"/></Button>
                                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={()=>deleteFaq.mutate(f.id)}><Trash2 className="w-3 h-3"/></Button>
                                   </div>
                                </div>
                                <p className="text-xs text-muted-foreground line-clamp-2 italic">"{f.answer}"</p>
                             </CardContent>
                          </Card>
                       ))}
                    </div>
                 </div>
            </TabsContent>
            <TabsContent value="knowledge">
                 <div className="space-y-4">
                    <div className="flex justify-between items-center">
                       <h4 className="text-sm font-bold">Basis Pengetahuan AI</h4>
                       <Button variant="outline" size="sm" onClick={()=>setKnowledgeOpen(true)}>Tambah Info</Button>
                    </div>
                    <div className="space-y-2">
                       {knowledgeBase?.map(k=>(
                          <Card key={k.id} className="p-4 flex items-center justify-between">
                             <div className="flex items-center gap-3">
                                <FileText className="w-5 h-5 text-primary" />
                                <div><p className="font-bold text-sm">{k.title}</p><p className="text-xs text-muted-foreground">{k.content.slice(0, 100)}...</p></div>
                             </div>
                             <Button variant="ghost" size="icon" onClick={()=>apiFetch(`/cs-bot/${selectedDeviceId}/knowledge/${k.id}`, {method:'DELETE'}).then(()=>qc.invalidateQueries({queryKey:['cs-bot-knowledge',selectedDeviceId]}))}><Trash2 className="w-4 h-4 text-destructive"/></Button>
                          </Card>
                       ))}
                    </div>
                 </div>
            </TabsContent>
            <TabsContent value="test">
                <Card className="h-[500px] flex flex-col">
                   <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-muted/10">
                      {testHistory.map((h,i)=>(
                        <div key={i} className={`flex ${h.from==='user'?'justify-end':'justify-start'}`}>
                           <div className={`max-w-[80%] p-3 rounded-xl text-sm ${h.from==='user'?'bg-primary text-primary-foreground':'bg-card border'}`}>{h.text}</div>
                        </div>
                      ))}
                      {testLoading && <div className="flex justify-start"><div className="bg-card border p-3 rounded-xl text-xs italic animate-pulse">Mengetik...</div></div>}
                      <div ref={testChatEndRef} />
                   </div>
                   <div className="p-4 border-t flex gap-2">
                      <Input placeholder="Tes pesan ke bot..." value={testMsg} onChange={e=>setTestMsg(e.target.value)} onKeyDown={e=>e.key==='Enter'&&sendTestMsg()} />
                      <Button onClick={sendTestMsg} disabled={testLoading}><Send className="w-4 h-4"/></Button>
                   </div>
                </Card>
            </TabsContent>
          </Tabs>
        </div>
      ) : (
        <Card className="py-20 flex flex-col items-center justify-center opacity-40">
           <Smartphone className="w-16 h-16 mb-4" />
           <p className="font-bold">Pilih perangkat untuk mulai konfigurasi</p>
        </Card>
      )}

      {/* Dialogs */}
      <Dialog open={faqOpen} onOpenChange={setFaqOpen}>
         <DialogContent>
            <DialogHeader><DialogTitle>{editFaq ? 'Edit FAQ' : 'Tambah FAQ'}</DialogTitle></DialogHeader>
            <div className="space-y-3 py-4">
               <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1"><Label>Kategori</Label><Input value={faqForm.category} onChange={e=>setFaqForm({...faqForm,category:e.target.value})} /></div>
                  <div className="space-y-1"><Label>Tipe</Label><Select value={faqForm.matchType} onValueChange={v=>setFaqForm({...faqForm,matchType:v})}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{MATCH_TYPES.map(m=><SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent></Select></div>
               </div>
               <div className="space-y-1"><Label>Pertanyaan</Label><Input value={faqForm.question} onChange={e=>setFaqForm({...faqForm,question:e.target.value})} /></div>
               <div className="space-y-1"><Label>Kata Kunci (koma)</Label><Input value={faqForm.keywords} onChange={e=>setFaqForm({...faqForm,keywords:e.target.value})} /></div>
               <div className="space-y-1"><Label>Jawaban</Label><Textarea value={faqForm.answer} onChange={e=>setFaqForm({...faqForm,answer:e.target.value})} rows={4} /></div>
            </div>
            <DialogFooter><Button onClick={()=>saveFaq.mutate(faqForm)}>Simpan</Button></DialogFooter>
         </DialogContent>
      </Dialog>

      <Dialog open={knowledgeOpen} onOpenChange={setKnowledgeOpen}>
         <DialogContent>
            <DialogHeader><DialogTitle>Tambah Knowledge</DialogTitle></DialogHeader>
            <div className="space-y-3 py-4">
               <div className="flex gap-2 p-1 bg-muted rounded-lg mb-2">
                  <Button variant="ghost" className="flex-1 bg-background shadow-sm h-8 text-xs">Manual</Button>
                  <label className="flex-1 h-8 text-xs flex items-center justify-center cursor-pointer hover:bg-background/50 rounded-md transition-all"><Upload className="w-3 h-3 mr-1"/> Upload<input type="file" className="hidden" onChange={e=>{const f=e.target.files?.[0]; if(f) { uploadKnowledgeMutation.mutate(f); setKnowledgeOpen(false); }}} /></label>
               </div>
               <div className="space-y-1"><Label>Judul</Label><Input value={knowledgeForm.title} onChange={e=>setKnowledgeForm({...knowledgeForm,title:e.target.value})} /></div>
               <div className="space-y-1"><Label>Konten</Label><Textarea value={knowledgeForm.content} onChange={e=>setKnowledgeForm({...knowledgeForm,content:e.target.value})} rows={10} /></div>
            </div>
            <DialogFooter><Button onClick={()=>{apiFetch(`/cs-bot/${selectedDeviceId}/knowledge`,{method:'POST',body:JSON.stringify(knowledgeForm)}).then(()=>{qc.invalidateQueries({queryKey:['cs-bot-knowledge',selectedDeviceId]});setKnowledgeOpen(false)})}}>Tambah</Button></DialogFooter>
         </DialogContent>
      </Dialog>
    </div>
  );
}

const AI_MODELS_BY_PROVIDER: Record<string, { label: string; value: string }[]> = {
  platform: [
    { label: "GPT-4o Mini (Rekomendasi)", value: "gpt-4o-mini" },
    { label: "GPT-4o (Pintar)", value: "gpt-4o" },
  ],
  openai: [
    { label: "GPT-4o Mini", value: "gpt-4o-mini" },
    { label: "GPT-4o", value: "gpt-4o" },
    { label: "GPT-3.5 Turbo", value: "gpt-3.5-turbo" },
  ],
  anthropic: [
    { label: "Claude 3.5 Sonnet", value: "claude-3-5-sonnet-20241022" },
    { label: "Claude 3.5 Haiku", value: "claude-3-5-haiku-20241022" },
  ],
  gemini: [
    { label: "Gemini 1.5 Flash", value: "gemini-1.5-flash" },
    { label: "Gemini 1.5 Pro", value: "gemini-1.5-pro" },
    { label: "Gemini 2.0 Flash (Experimental)", value: "gemini-2.0-flash-exp" },
  ],
  groq: [
    { label: "Llama 3.3 70B Versatile", value: "llama-3.3-70b-versatile" },
    { label: "Llama 3.1 8B Instant (Gratis)", value: "llama-3.1-8b-instant" },
    { label: "Mixtral 8x7B", value: "mixtral-8x7b-32768" },
  ],
  deepseek: [
    { label: "DeepSeek V3", value: "deepseek-chat" },
    { label: "DeepSeek R1 (Reasoning)", value: "deepseek-reasoner" },
  ],
  openrouter: [
    { label: "Auto (OpenRouter)", value: "auto" },
    { label: "Google: Gemini Flash 1.5", value: "google/gemini-flash-1.5" },
    { label: "OpenAI: GPT-4o Mini", value: "openai/gpt-4o-mini" },
  ],
  mistral: [
    { label: "Mistral Large", value: "mistral-large-latest" },
    { label: "Mistral Small", value: "mistral-small-latest" },
  ],
};

function AiSettingsForm({ bot, deviceId, onSave, saving }: any) {
  const { toast } = useToast();
  const [testLoading, setTestLoading] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [form, setForm] = useState({
    aiEnabled: bot?.aiEnabled ?? false,
    aiMode: bot?.aiMode ?? "ai_fallback",
    aiModel: bot?.aiModel ?? "gpt-4o-mini",
    aiProvider: bot?.aiProvider ?? "platform",
    aiApiKey: bot?.aiApiKey ?? "",
    aiSystemPrompt: bot?.aiSystemPrompt ?? "Be a professional assistant.",
    aiBusinessContext: bot?.aiBusinessContext ?? "",
    websiteUrl: bot?.websiteUrl ?? ""
  });

  const testApi = async () => {
    if (!form.aiApiKey && form.aiProvider !== 'platform') {
      toast({ title: "API Key Kosong", description: "Masukkan API key sebelum mencoba tes.", variant: "destructive" });
      return;
    }
    setTestLoading(true);
    try {
      const r = await apiFetch(`/cs-bot/${deviceId}/test-api`, { 
        method: "POST", 
        body: JSON.stringify({ 
           provider: form.aiProvider,
           apiKey: form.aiApiKey,
           model: form.aiModel
        }) 
      });
      const res = await r.json();
      if (res.success) {
        toast({ title: "Koneksi API Berhasil!", description: `Provider ${form.aiProvider} merespons dengan model ${res.model}.` });
      } else {
        toast({ title: "Koneksi API Gagal", description: res.message, variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Terjadi Kesalahan", description: "Gagal terhubung ke server untuk tes API.", variant: "destructive" });
    } finally {
      setTestLoading(false);
    }
  };

  const handleProviderChange = (v: string) => {
    const models = AI_MODELS_BY_PROVIDER[v] || [];
    setForm({ ...form, aiProvider: v, aiModel: models[0]?.value || "" });
  };

  return (
    <div className="space-y-6">
       <Card className={form.aiEnabled?'border-primary/20 bg-primary/[0.02] transition-all duration-500 shadow-sm':''}>
          <CardContent className="p-6 flex items-center justify-between">
             <div className="flex gap-4 items-center">
                <div className={`p-3 rounded-xl transition-all duration-500 ${form.aiEnabled?'bg-primary text-white shadow-lg shadow-primary/20' : 'bg-muted text-muted-foreground'}`}>
                   <Sparkles className="w-6 h-6" />
                </div>
                <div>
                   <p className="font-bold text-lg">Aktifkan Intelegensi Buatan (AI)</p>
                   <p className="text-sm text-muted-foreground">Biarkan bot menjawab pertanyaan sulit secara alami menggunakan basis pengetahuan Anda.</p>
                </div>
             </div>
             <Switch checked={form.aiEnabled} onCheckedChange={v=>setForm({...form,aiEnabled:v})} className="scale-125 data-[state=checked]:bg-primary" />
          </CardContent>
       </Card>

       <div className={`grid grid-cols-1 md:grid-cols-2 gap-6 transition-all duration-500 ${!form.aiEnabled?'opacity-40 grayscale pointer-events-none' : ''}`}>
          <Card className="border-muted-foreground/10 shadow-sm">
             <CardHeader className="pb-3 border-b bg-muted/30">
                <CardTitle className="text-sm flex items-center gap-2">
                   <Key className="w-4 h-4 text-primary" />
                   Konfigurasi API AI
                </CardTitle>
             </CardHeader>
             <CardContent className="p-5 space-y-5">
                <div className="space-y-2">
                   <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Pilih Provider</Label>
                   <div className="grid grid-cols-2 gap-2">
                      {AI_PROVIDERS.map(p=>(
                        <button 
                          key={p.value} 
                          onClick={()=>handleProviderChange(p.value)} 
                          className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs font-bold transition-all relative overflow-hidden ${
                             form.aiProvider===p.value
                             ? 'bg-primary/10 border-primary text-primary shadow-sm' 
                             : 'bg-card border-border hover:border-primary/40 hover:bg-muted/50'
                          }`}
                        >
                           {p.icon}
                           <span className="truncate">{p.label}</span>
                           {form.aiProvider===p.value && <div className="absolute top-0 right-0 w-8 h-8 bg-primary/10 rounded-bl-full flex items-center justify-center translate-x-3 -translate-y-3"><CheckCircle className="w-2.5 h-2.5" /></div>}
                        </button>
                      ))}
                   </div>
                </div>

                {form.aiProvider !== 'platform' && (
                  <div className="space-y-4 animate-in slide-in-from-top-2 duration-300">
                    <div className="space-y-2">
                       <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex justify-between">
                          <span>API Key {form.aiProvider.toUpperCase()}</span>
                          {form.aiApiKey && <span className="text-[10px] text-emerald-600 font-bold flex items-center gap-1"><CheckCircle className="w-2.5 h-2.5"/> Tersimpan</span>}
                       </Label>
                       <div className="relative">
                          <Input 
                            type={showKey ? "text" : "password"} 
                            value={form.aiApiKey} 
                            onChange={e=>setForm({...form,aiApiKey:e.target.value})} 
                            placeholder={bot?.aiApiKey ? "••••••••••••••••" : "Masukkan API key Anda (sk-...)"}
                            className="pr-10 bg-muted/20 border-border focus-visible:ring-primary/20 font-mono text-sm h-11" 
                          />
                          <button 
                            type="button"
                            onClick={() => setShowKey(!showKey)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                          >
                             {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                       </div>
                    </div>

                    <div className="space-y-2">
                       <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Pilih Model AI</Label>
                       <Select value={form.aiModel} onValueChange={v=>setForm({...form,aiModel:v})}>
                          <SelectTrigger className="h-11 bg-muted/20 border-border font-medium">
                             <SelectValue placeholder="Pilih model yang didukung" />
                          </SelectTrigger>
                          <SelectContent>
                             <SelectGroup>
                                <SelectLabel className="text-[10px] uppercase font-black opacity-50 px-2 py-1.5">{form.aiProvider} Models</SelectLabel>
                                {(AI_MODELS_BY_PROVIDER[form.aiProvider] || []).map(m=>(
                                  <SelectItem key={m.value} value={m.value} className="text-sm">{m.label}</SelectItem>
                                ))}
                             </SelectGroup>
                             <SelectSeparator />
                             <div className="p-2">
                                <Label className="text-[10px] font-bold text-muted-foreground mb-1 block">Atau input manual:</Label>
                                <Input 
                                  size={1}
                                  placeholder="Custom model ID..." 
                                  className="h-8 text-xs bg-muted/40 border-none"
                                  value={form.aiModel} 
                                  onChange={e=>setForm({...form,aiModel:e.target.value})}
                                />
                             </div>
                          </SelectContent>
                       </Select>
                    </div>
                  </div>
                )}
                
                <Button 
                  type="button"
                  variant="outline" 
                  className="w-full h-11 rounded-xl border-dashed border-primary/40 text-primary hover:bg-primary/5 gap-2 font-bold"
                  onClick={testApi} 
                  disabled={testLoading || (!form.aiApiKey && !bot?.aiApiKey && form.aiProvider !== 'platform')}
                >
                   {testLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4 shadow-[0_0_8px_rgba(59,130,246,0.3)]" />}
                   Cek Koneksi API {form.aiProvider !== 'platform' ? form.aiProvider.toUpperCase() : ''}
                </Button>
             </CardContent>
          </Card>

          <Card className="border-muted-foreground/10 shadow-sm">
             <CardHeader className="pb-3 border-b bg-muted/30">
                <CardTitle className="text-sm flex items-center gap-2">
                   <Brain className="w-4 h-4 text-primary" />
                   Mode Kecerdasan
                </CardTitle>
             </CardHeader>
             <CardContent className="p-5 space-y-3">
                {[
                  { id: 'faq_only', name: 'Manual (FAQ Only)', desc: 'Bot hanya menjawab berdasarkan kata kunci yang Anda buat di tab FAQ.', icon: '🗂️' },
                  { id: 'ai_fallback', name: 'Asisten Hybrid', desc: 'Bot mencari di FAQ dulu. Jika tidak ada yang cocok, AI akan membantu menjawab.', icon: '🤝' },
                  { id: 'full_ai', name: 'Full Brain Autonomous', desc: 'AI selalu menjawab dengan kecerdasan tinggi, menggunakan FAQ & Knowledge sebagai referensi fakta.', icon: '🤖' }
                ].map(m=>(
                  <button 
                    key={m.id} 
                    onClick={()=>setForm({...form,aiMode:m.id})} 
                    className={`w-full p-4 rounded-2xl border text-left flex items-center gap-4 transition-all duration-300 relative ${
                       form.aiMode===m.id
                       ? 'bg-primary text-primary-foreground border-primary shadow-lg ring-2 ring-primary/10 ring-offset-1' 
                       : 'bg-card border-border hover:border-primary/40 hover:bg-muted/30'
                    }`}
                  >
                     <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl shadow-inner ${form.aiMode===m.id ? 'bg-white/20' : 'bg-muted'}`}>
                        {m.icon}
                     </div>
                     <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm tracking-tight">{m.name}</p>
                        <p className={`text-[10px] leading-relaxed line-clamp-2 ${form.aiMode===m.id ? 'text-white/80' : 'text-muted-foreground'}`}>{m.desc}</p>
                     </div>
                     {form.aiMode===m.id && <div className="absolute top-2 right-2 w-1.5 h-1.5 bg-white rounded-full animate-pulse shadow-[0_0_8px_white]" />}
                  </button>
                ))}
             </CardContent>
          </Card>
       </div>

       <div className={`space-y-6 transition-all duration-500 delay-100 ${!form.aiEnabled?'opacity-40 pointer-events-none' : ''}`}>
          <Card className="bg-muted/10 border-muted-foreground/10 border-dashed"><CardContent className="p-8 space-y-6">
             <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block">Persona / Karaketer Bot</Label>
                <Textarea 
                  value={form.aiSystemPrompt} 
                  onChange={e=>setForm({...form,aiSystemPrompt:e.target.value})} 
                  rows={4} 
                  className="rounded-xl bg-card border-border focus-visible:ring-primary/20 text-sm py-3 leading-relaxed"
                  placeholder="Contoh: Jadilah asisten toko yang sangat ramah, panggil pelanggan dengan sebutan 'Kak', dan selalu akhiri dengan promo harian." 
                />
             </div>
             <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block">Informasi Tambahan (Website Scrape)</Label>
                <div className="flex gap-2">
                   <div className="relative flex-1">
                      <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground opacity-50" />
                      <Input 
                        placeholder="https://website-bisnis-anda.com/katalog" 
                        value={form.websiteUrl} 
                        onChange={e=>setForm({...form,websiteUrl:e.target.value})} 
                        className="pl-9 h-11 bg-card rounded-xl border-border" 
                      />
                   </div>
                   <Button 
                     variant="outline" 
                     className="h-11 w-11 p-0 rounded-xl hover:bg-primary/5 hover:text-primary transition-colors"
                     onClick={()=>apiFetch(`/cs-bot/${deviceId}/scrape-website`,{method:'POST',body:JSON.stringify({url:form.websiteUrl})}).then(r=>r.json()).then(d=>setForm({...form,aiBusinessContext:d.content}))}
                   >
                      <RefreshCw className="w-4 h-4" />
                   </Button>
                </div>
                <p className="text-[10px] text-muted-foreground px-1 italic">Kami akan mengambil konten teks dari URL ini untuk dipelajari oleh AI.</p>
             </div>
             <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block">Konteks Bisnis Utama (Dokumen Manual)</Label>
                <Textarea 
                  value={form.aiBusinessContext} 
                  onChange={e=>setForm({...form,aiBusinessContext:e.target.value})} 
                  rows={5} 
                  className="rounded-xl bg-card border-border focus-visible:ring-primary/20 text-xs font-mono py-3"
                  placeholder="Contoh: Kami menjual sepatu kulit merk X. Harga mulai dari 200rb. Toko buka jam 9 pagi - 9 malam. Tidak menerima retur jika segel rusak." 
                />
             </div>
          </CardContent></Card>
          
          <div className="bg-card border p-6 rounded-[28px] flex flex-col md:flex-row items-center justify-between gap-6 shadow-sm">
             <div className="flex gap-3 items-center">
                <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-600"><CheckCircle className="w-5 h-5" /></div>
                <div><p className="font-bold text-sm">Konfigurasi Siap</p><p className="text-[10px] text-muted-foreground">Pastikan Anda telah melakukan 'Cek Koneksi API' sebelum menyimpan.</p></div>
             </div>
             <div className="flex gap-3 w-full md:w-auto">
                <Button variant="ghost" className="font-bold px-6" onClick={() => setForm({ ...form, aiEnabled: false })}>Batalkan</Button>
                <Button size="lg" onClick={()=>onSave(form)} disabled={saving} className="px-12 h-14 rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-primary/25 hover:scale-[1.02] active:scale-[0.98] transition-all">
                   {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                   Simpan Perubahan AI
                </Button>
             </div>
          </div>
       </div>
    </div>
  );
}

function BotMessagesForm({ bot, onSave, saving }: any) {
  const [form, setForm] = useState({
    greetingMessage: bot?.greetingMessage ?? "",
    showMenu: bot?.showMenu ?? true,
    menuMessage: bot?.menuMessage ?? "",
    fallbackMessage: bot?.fallbackMessage ?? "",
    offlineMessage: bot?.offlineMessage ?? "",
    humanHandoffKeyword: bot?.humanHandoffKeyword ?? "cs, operator",
    humanHandoffMessage: bot?.humanHandoffMessage ?? "Sabar ya, kamu akan disambungkan ke agen kami."
  });
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
       <Card><CardHeader><CardTitle className="text-sm">Alur Pembuka</CardTitle></CardHeader>
          <CardContent className="space-y-4">
             <div className="space-y-1.5"><Label>Pesan Sapaan</Label><Textarea value={form.greetingMessage} onChange={e=>setForm({...form,greetingMessage:e.target.value})} rows={3} /></div>
             <div className="flex items-center justify-between"><Label>Tampilkan Menu</Label><Switch checked={form.showMenu} onCheckedChange={v=>setForm({...form,showMenu:v})} /></div>
             {form.showMenu && <div className="space-y-1.5"><Label>Daftar Menu</Label><Textarea value={form.menuMessage} onChange={e=>setForm({...form,menuMessage:e.target.value})} rows={6} className="font-mono text-xs" /></div>}
          </CardContent>
       </Card>
       <div className="space-y-6">
          <Card><CardHeader><CardTitle className="text-sm">Fallback & Offline</CardTitle></CardHeader>
             <CardContent className="space-y-4">
                <div className="space-y-1.5"><Label>Pesan Tidak Dimengerti</Label><Textarea value={form.fallbackMessage} onChange={e=>setForm({...form,fallbackMessage:e.target.value})} rows={2} /></div>
                <div className="space-y-1.5"><Label>Pesan Saat Libur</Label><Textarea value={form.offlineMessage} onChange={e=>setForm({...form,offlineMessage:e.target.value})} rows={2} /></div>
             </CardContent>
          </Card>
          <Card><CardHeader><CardTitle className="text-sm">Handoff Agen</CardTitle></CardHeader>
             <CardContent className="space-y-4">
                <div className="space-y-1.5"><Label>Kata Kunci (agen, operator)</Label><Input value={form.humanHandoffKeyword} onChange={e=>setForm({...form,humanHandoffKeyword:e.target.value})} /></div>
                <div className="space-y-1.5"><Label>Pesan Pengalihan</Label><Textarea value={form.humanHandoffMessage} onChange={e=>setForm({...form,humanHandoffMessage:e.target.value})} rows={2} /></div>
             </CardContent>
          </Card>
          <div className="flex justify-end"><Button onClick={()=>onSave(form)} disabled={saving}>Simpan Konfigurasi</Button></div>
       </div>
    </div>
  );
}

function BusinessHoursForm({ bot, onSave, saving }: any) {
  const [form, setForm] = useState({
    businessHoursEnabled: bot?.businessHoursEnabled ?? false,
    businessHoursStart: bot?.businessHoursStart ?? "09:00",
    businessHoursEnd: bot?.businessHoursEnd ?? "18:00",
    businessDays: bot?.businessDays ?? "1,2,3,4,5"
  });
  const toggleDay = (idx: number) => {
     const days = form.businessDays.split(',').filter(d=>d!=='').map(Number);
     const newDays = days.includes(idx) ? days.filter(d=>d!==idx) : [...days, idx].sort();
     setForm({...form, businessDays: newDays.join(',')});
  };
  return (
    <Card>
       <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-sm">Jadwal Operasional</CardTitle>
          <Switch checked={form.businessHoursEnabled} onCheckedChange={v=>setForm({...form,businessHoursEnabled:v})} />
       </CardHeader>
       <CardContent className={`space-y-6 ${!form.businessHoursEnabled?'opacity-50 pointer-events-none':''}`}>
          <div className="grid grid-cols-2 gap-4">
             <div className="space-y-1.5"><Label>Jam Mulai</Label><Input type="time" value={form.businessHoursStart} onChange={e=>setForm({...form,businessHoursStart:e.target.value})} /></div>
             <div className="space-y-1.5"><Label>Jam Selesai</Label><Input type="time" value={form.businessHoursEnd} onChange={e=>setForm({...form,businessHoursEnd:e.target.value})} /></div>
          </div>
          <div className="space-y-2">
             <Label>Hari Kerja</Label>
             <div className="flex gap-2 flex-wrap">
                {DAY_LABELS.map((l, i)=>(
                  <button key={i} type="button" onClick={()=>toggleDay(i)} className={`w-10 h-10 rounded-lg text-xs font-bold transition-all border ${form.businessDays.split(',').map(Number).includes(i)?'bg-primary text-white border-primary shadow-sm':'hover:bg-muted'}`}>{l}</button>
                ))}
             </div>
          </div>
          <div className="flex justify-end"><Button onClick={()=>onSave(form)} disabled={saving}>Simpan Jadwal</Button></div>
       </CardContent>
    </Card>
  );
}

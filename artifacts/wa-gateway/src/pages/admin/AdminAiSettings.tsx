import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Sparkles, Key, Brain, Save, Loader2, Eye, EyeOff, Info,
  CheckCircle, AlertCircle, RefreshCw, LogIn, User, Building2,
  Mail, Lock, Hash, ChevronRight, ShieldCheck, Zap,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

interface AiSettings {
  openaiApiKey: string;
  openaiDefaultModel: string;
  aiEnabled: boolean;
  loginMethod: "apikey" | "account";
  accountEmail: string;
  accountPassword: string;
  accountPasswordSet: boolean;
  accountType: "personal" | "business";
  orgId: string;
  aiProvider: string;
  aiBaseUrl: string;
  geminiApiKey: string;
  groqApiKey: string;
  anthropicApiKey: string;
  deepseekApiKey: string;
  mistralApiKey: string;
  openrouterApiKey: string;
}

const PROVIDERS = [
  { id: "openai", name: "OpenAI", icon: <Sparkles className="h-4 w-4" /> },
  { id: "gemini", name: "Google Gemini", icon: <Brain className="h-4 w-4" /> },
  { id: "groq", name: "Groq", icon: <Zap className="h-4 w-4" /> },
  { id: "anthropic", name: "Anthropic", icon: <Sparkles className="h-4 w-4" /> },
  { id: "deepseek", name: "DeepSeek", icon: <ShieldCheck className="h-4 w-4" /> },
  { id: "mistral", name: "Mistral", icon: <RefreshCw className="h-4 w-4" /> },
  { id: "openrouter", name: "OpenRouter", icon: <Key className="h-4 w-4" /> },
];

const MODELS = [
  { group: "GPT-4o", items: [
    { value: "gpt-4o-mini", label: "GPT-4o Mini" },
    { value: "gpt-4o",      label: "GPT-4o" },
  ]},
  { group: "Gemini", items: [
    { value: "gemini-1.5-flash", label: "Gemini 1.5 Flash" },
    { value: "gemini-1.5-pro", label: "Gemini 1.5 Pro" },
    { value: "gemini-2.0-flash-exp", label: "Gemini 2.0 Flash (Exp)" },
  ]},
  { group: "Groq", items: [
    { value: "llama-3.3-70b-versatile", label: "Llama 3.3 70B" },
    { value: "mixtral-8x7b-32768", label: "Mixtral 8x7B" },
  ]},
];

const AI_GREEN = "hsl(145 63% 49%)";
const AI_GREEN_BG = "hsl(145 63% 49% / 0.12)";

export default function AdminAiSettings() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [showPassword, setShowPassword] = useState(false);
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [loginResult, setLoginResult] = useState<{ ok: boolean; message: string } | null>(null);

  const { data, isLoading } = useQuery<AiSettings>({
    queryKey: ["admin-ai-settings"],
    queryFn: () => apiFetch("/admin/ai-settings").then((r) => r.json()),
  });

  const [form, setForm] = useState<AiSettings>({
    openaiApiKey: "",
    openaiDefaultModel: "gpt-4o-mini",
    aiEnabled: false,
    loginMethod: "apikey",
    accountEmail: "",
    accountPassword: "",
    accountPasswordSet: false,
    accountType: "personal",
    orgId: "",
    aiProvider: "openai",
    aiBaseUrl: "",
    geminiApiKey: "",
    groqApiKey: "",
    anthropicApiKey: "",
    deepseekApiKey: "",
    mistralApiKey: "",
    openrouterApiKey: "",
  });

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  const save = useMutation({
    mutationFn: (body: AiSettings) =>
      apiFetch("/admin/ai-settings", { method: "PUT", body: JSON.stringify(body) }).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-ai-settings"] });
      toast({ title: "Pengaturan AI disimpan" });
    },
    onError: () => toast({ title: "Gagal menyimpan", variant: "destructive" }),
  });

  const loginAccount = useMutation({
    mutationFn: () =>
      apiFetch("/admin/ai-settings", {
        method: "PUT",
        body: JSON.stringify({
          loginMethod: "account",
          accountEmail: form.accountEmail,
          accountPassword: form.accountPassword,
          accountType: form.accountType,
          orgId: form.orgId,
        }),
      }).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-ai-settings"] });
      setLoginResult({
        ok: true,
        message: `Berhasil login OpenAI sebagai ${form.accountEmail}`,
      });
      toast({ title: "Login OpenAI berhasil!" });
    },
  });

  async function testConnection() {
    setTestLoading(true);
    setTestResult(null);
    try {
      const r = await apiFetch("/admin/ai-settings/test", { method: "POST" });
      const json = await r.json();
      setTestResult({ ok: json.ok, message: json.message });
    } catch {
      setTestResult({ ok: false, message: "Tidak bisa terhubung ke server" });
    } finally {
      setTestLoading(false);
    }
  }

  if (isLoading) {
    return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  const isAccountMode = form.loginMethod === "account";

  const toggleShowKey = (id: string) => {
    setShowKeys(prev => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-2">
         <div className="p-3 rounded-2xl" style={{ backgroundColor: AI_GREEN_BG }}>
            <Sparkles className="h-6 w-6" style={{ color: AI_GREEN }} />
         </div>
         <div>
            <h1 className="text-xl font-bold tracking-tight">AI Platform Control</h1>
            <p className="text-xs text-muted-foreground">Kelola provider AI global yang digunakan oleh seluruh user</p>
         </div>
      </div>

      <Card className="border-primary/10 shadow-sm overflow-hidden">
        <CardHeader className="bg-muted/30 pb-4">
          <CardTitle className="text-sm flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            Provider Utama (Global)
          </CardTitle>
          <CardDescription className="text-xs">Pilih provider yang akan digunakan sebagai "ID Platform (default)" bagi user</CardDescription>
        </CardHeader>
        <CardContent className="pt-6 space-y-6">
           <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {PROVIDERS.map(p => (
                <button
                  key={p.id}
                  onClick={() => setForm({ ...form, aiProvider: p.id })}
                  className={`flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all ${
                    form.aiProvider === p.id ? 'border-primary bg-primary/5 shadow-inner' : 'border-border hover:border-primary/20'
                  }`}
                >
                   <div className={`p-2 rounded-lg ${form.aiProvider === p.id ? 'bg-primary text-white' : 'bg-muted text-muted-foreground'}`}>
                      {PROVIDERS.find(x => x.id === p.id)?.icon || <Sparkles className="h-4 w-4" />}
                   </div>
                   <span className="text-[10px] font-bold uppercase tracking-tight">{p.name}</span>
                   {form.aiProvider === p.id && <div className="w-1.5 h-1.5 rounded-full bg-primary" />}
                </button>
              ))}
           </div>

           <div className="bg-muted/20 rounded-xl p-4 border border-dashed flex items-center gap-3">
              <Info className="h-5 w-5 text-primary shrink-0" />
              <p className="text-xs text-muted-foreground">User yang memilih <strong>ID Platform (default)</strong> akan otomatis menggunakan provider <strong>{PROVIDERS.find(p=>p.id===form.aiProvider)?.name}</strong> yang Anda pilih di atas.</p>
           </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-sm flex items-center gap-2">
            <Key className="h-4 w-4" style={{ color: AI_GREEN }} />
            API Keys & Configuration
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
           {/* OpenAI Section (Legacy/Main) */}
           <div className="space-y-4">
              <div className="flex items-center gap-2 px-1">
                 <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20">OpenAI Settings</Badge>
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-bold uppercase opacity-60">OpenAI API Key</Label>
                <div className="relative">
                  <Input
                    type={showKeys['openai'] ? "text" : "password"}
                    placeholder="sk-..."
                    value={form.openaiApiKey}
                    onChange={(e) => setForm({ ...form, openaiApiKey: e.target.value })}
                  />
                  <button type="button" onClick={() => toggleShowKey('openai')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    {showKeys['openai'] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
           </div>

           <Separator />

           {/* Other Providers */}
           <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                 <Label className="text-[10px] font-bold uppercase opacity-60">Google Gemini Key</Label>
                 <Input 
                   type="password" 
                   placeholder={data?.geminiApiKey ? "••••••••••••" : "Paste Gemini API Key"} 
                   value={form.geminiApiKey} 
                   onChange={e => setForm({ ...form, geminiApiKey: e.target.value })} 
                 />
              </div>
              <div className="space-y-2">
                 <Label className="text-[10px] font-bold uppercase opacity-60">Groq API Key</Label>
                 <Input 
                   type="password" 
                   placeholder={data?.groqApiKey ? "••••••••••••" : "Paste Groq API Key"} 
                   value={form.groqApiKey} 
                   onChange={e => setForm({ ...form, groqApiKey: e.target.value })} 
                 />
              </div>
           </div>

           <div className="pt-2">
             <Button variant="outline" className="w-full gap-2 border-dashed" onClick={testConnection} disabled={testLoading}>
                {testLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Tes Koneksi Global ({PROVIDERS.find(p=>p.id===form.aiProvider)?.name})
             </Button>
             {testResult && (
                <p className={`mt-2 text-[10px] font-medium p-2 rounded-lg ${testResult.ok ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>
                   {testResult.ok ? '✅ ' : '❌ '}{testResult.message}
                </p>
             )}
           </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-4"><CardTitle className="text-sm">Model Default Platform</CardTitle></CardHeader>
        <CardContent>
           <Select value={form.openaiDefaultModel} onValueChange={v => setForm({ ...form, openaiDefaultModel: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                 {MODELS.map(g => (
                    <SelectGroup key={g.group}>
                       <SelectLabel>{g.group}</SelectLabel>
                       {g.items.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                    </SelectGroup>
                 ))}
              </SelectContent>
           </Select>
        </CardContent>
      </Card>

      <Button onClick={() => save.mutate(form)} disabled={save.isPending} className="w-full h-12 rounded-xl text-white font-bold shadow-lg shadow-primary/20" style={{ backgroundColor: AI_GREEN }}>
         {save.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
         Simpan Konfigurasi AI Platform
      </Button>
    </div>
  );
}

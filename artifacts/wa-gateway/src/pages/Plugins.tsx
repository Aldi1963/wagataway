import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Puzzle, Settings, Loader2, Save, ChevronDown, ChevronUp, Zap } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

interface PluginItem {
  id: string | null;
  type: string;
  name: string;
  description: string;
  icon: string;
  config: Record<string, any>;
  isActive: boolean;
}

const AI_MODELS: Record<string, string[]> = {
  openai: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"],
  gemini: ["gemini-2.0-flash", "gemini-1.5-pro", "gemini-1.5-flash"],
  claude: ["claude-opus-4-5", "claude-sonnet-4-5", "claude-3-5-haiku-20241022"],
};

function ConfigField({ label, type = "text", value, onChange, placeholder, hint }: {
  label: string; type?: string; value: any; onChange: (v: any) => void; placeholder?: string; hint?: string;
}) {
  if (type === "textarea") {
    return (
      <div className="space-y-1.5">
        <Label className="text-xs">{label}</Label>
        <Textarea
          className="text-xs"
          rows={3}
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
        />
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
    );
  }
  if (type === "number") {
    return (
      <div className="space-y-1.5">
        <Label className="text-xs">{label}</Label>
        <Input type="number" className="text-xs" value={value ?? ""} onChange={(e) => onChange(Number(e.target.value))} placeholder={placeholder} />
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
    );
  }
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <Input
        type={type}
        className="text-xs"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function PluginCard({ plugin }: { plugin: PluginItem }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [config, setConfig] = useState<Record<string, any>>(plugin.config ?? {});

  const updatePlugin = useMutation({
    mutationFn: (body: any) => apiFetch(`/plugins/${plugin.type}`, { method: "PUT", body: JSON.stringify(body) }).then((r) => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["plugins"] }); toast({ title: `${plugin.name} disimpan!` }); },
    onError: () => toast({ title: "Gagal menyimpan konfigurasi", variant: "destructive" }),
  });

  const togglePlugin = useMutation({
    mutationFn: (isActive: boolean) => apiFetch(`/plugins/${plugin.type}/toggle`, { method: "POST", body: JSON.stringify({ isActive }) }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["plugins"] }),
  });

  function setConfigField(key: string, value: any) {
    setConfig((prev) => ({ ...prev, [key]: value }));
  }

  function handleSave() {
    updatePlugin.mutate({ config });
  }

  const isAI = ["openai", "gemini", "claude"].includes(plugin.type);
  const models = AI_MODELS[plugin.type] ?? [];

  return (
    <Card className={`transition-all duration-200 ${!plugin.isActive ? "opacity-70" : ""}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center text-2xl">
              {plugin.icon}
            </div>
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                {plugin.name}
                {plugin.isActive && (
                  <Badge className="text-xs bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-0">
                    <Zap className="w-3 h-3 mr-1" /> Aktif
                  </Badge>
                )}
              </CardTitle>
              <CardDescription className="text-xs mt-0.5">{plugin.description}</CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Switch
              checked={plugin.isActive}
              onCheckedChange={(v) => togglePlugin.mutate(v)}
              disabled={togglePlugin.isPending}
            />
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setExpanded((e) => !e)}>
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </Button>
          </div>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="pt-0 border-t">
          <div className="pt-4 space-y-4">
            {isAI && (
              <>
                <ConfigField
                  label="API Key"
                  type="password"
                  value={config.apiKey ?? ""}
                  onChange={(v) => setConfigField("apiKey", v)}
                  placeholder="Masukkan API key..."
                  hint={`Dapatkan API key dari platform ${plugin.name}`}
                />
                <div className="space-y-1.5">
                  <Label className="text-xs">Model</Label>
                  <Select value={config.model ?? models[0]} onValueChange={(v) => setConfigField("model", v)}>
                    <SelectTrigger className="text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {models.map((m) => <SelectItem key={m} value={m} className="text-xs">{m}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <ConfigField
                  label="System Prompt"
                  type="textarea"
                  value={config.systemPrompt ?? ""}
                  onChange={(v) => setConfigField("systemPrompt", v)}
                  placeholder="You are a helpful WhatsApp assistant..."
                  hint="Instruksi untuk AI tentang cara merespons pesan"
                />
                <ConfigField
                  label="Max Tokens"
                  type="number"
                  value={config.maxTokens ?? 500}
                  onChange={(v) => setConfigField("maxTokens", v)}
                  hint="Batas panjang respons AI (50–2000)"
                />
                <div className="space-y-1.5">
                  <Label className="text-xs">Kata Kunci Pemicu (pisahkan dengan koma)</Label>
                  <Input
                    className="text-xs"
                    value={Array.isArray(config.triggerKeywords) ? config.triggerKeywords.join(", ") : ""}
                    onChange={(e) => setConfigField("triggerKeywords", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
                    placeholder="ai, help, bantuan, bot"
                  />
                  <p className="text-xs text-muted-foreground">AI hanya aktif jika pesan mengandung salah satu kata kunci ini</p>
                </div>
              </>
            )}

            {plugin.type === "botsticker" && (
              <>
                <ConfigField
                  label="Sticker Pack URL"
                  value={config.stickerPackUrl ?? ""}
                  onChange={(v) => setConfigField("stickerPackUrl", v)}
                  placeholder="https://example.com/stickers/"
                  hint="URL folder tempat menyimpan file stiker (.webp)"
                />
                <div className="space-y-1.5">
                  <Label className="text-xs">Kata Kunci Pemicu (pisahkan dengan koma)</Label>
                  <Input
                    className="text-xs"
                    value={Array.isArray(config.triggerKeywords) ? config.triggerKeywords.join(", ") : ""}
                    onChange={(e) => setConfigField("triggerKeywords", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
                    placeholder="sticker, stiker, sticer"
                  />
                </div>
                <div className="flex items-center gap-3 p-3 rounded-lg bg-secondary">
                  <Switch
                    checked={config.autoConvertImages ?? false}
                    onCheckedChange={(v) => setConfigField("autoConvertImages", v)}
                  />
                  <div>
                    <p className="text-xs font-medium">Auto Convert Images</p>
                    <p className="text-xs text-muted-foreground">Otomatis konversi foto yang dikirim menjadi stiker</p>
                  </div>
                </div>
              </>
            )}

            {plugin.type === "spreadsheet" && (
              <>
                <ConfigField
                  label="Google Spreadsheet ID"
                  value={config.spreadsheetId ?? ""}
                  onChange={(v) => setConfigField("spreadsheetId", v)}
                  placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
                  hint="ID spreadsheet dari URL Google Sheets Anda"
                />
                <ConfigField
                  label="Nama Sheet"
                  value={config.sheetName ?? "Messages"}
                  onChange={(v) => setConfigField("sheetName", v)}
                  placeholder="Messages"
                />
                <ConfigField
                  label="Google API Key"
                  type="password"
                  value={config.googleApiKey ?? ""}
                  onChange={(v) => setConfigField("googleApiKey", v)}
                  placeholder="AIza..."
                  hint="Aktifkan Google Sheets API di Google Cloud Console"
                />
                <div className="space-y-2">
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-secondary">
                    <Switch
                      checked={config.logIncoming ?? true}
                      onCheckedChange={(v) => setConfigField("logIncoming", v)}
                    />
                    <div>
                      <p className="text-xs font-medium">Log Pesan Masuk</p>
                      <p className="text-xs text-muted-foreground">Simpan pesan masuk ke spreadsheet</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-secondary">
                    <Switch
                      checked={config.logOutgoing ?? true}
                      onCheckedChange={(v) => setConfigField("logOutgoing", v)}
                    />
                    <div>
                      <p className="text-xs font-medium">Log Pesan Keluar</p>
                      <p className="text-xs text-muted-foreground">Simpan pesan terkirim ke spreadsheet</p>
                    </div>
                  </div>
                </div>
              </>
            )}

            <div className="flex justify-end pt-2">
              <Button size="sm" onClick={handleSave} disabled={updatePlugin.isPending} className="gap-2">
                {updatePlugin.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Simpan Konfigurasi
              </Button>
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

export default function Plugins() {
  const { data: plugins, isLoading } = useQuery<PluginItem[]>({
    queryKey: ["plugins"],
    queryFn: () => apiFetch("/plugins").then((r) => r.json()),
  });

  const activeCount = (plugins ?? []).filter((p) => p.isActive).length;

  return (
    <div className="space-y-6">

      {!isLoading && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-primary/5 border border-primary/20">
          <Zap className="w-5 h-5 text-primary" />
          <div>
            <p className="text-sm font-medium">{activeCount} dari {plugins?.length ?? 0} plugin aktif</p>
            <p className="text-xs text-muted-foreground">Aktifkan plugin dan konfigurasi untuk mulai digunakan</p>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
      ) : (
        <div className="space-y-4">
          {(plugins ?? []).map((plugin) => (
            <PluginCard key={plugin.type} plugin={plugin} />
          ))}
        </div>
      )}
    </div>
  );
}

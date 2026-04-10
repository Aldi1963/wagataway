import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ShieldAlert, ShieldCheck, Timer, Keyboard, TrendingUp, Shuffle,
  Loader2, Save, Info, RefreshCw, Zap, Clock, Wifi, BookOpen,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiFetch } from "@/lib/api";
import { useDevice } from "@/contexts/DeviceContext";
import { useToast } from "@/hooks/use-toast";

interface AntiBannedSettings {
  antiBannedEnabled: boolean;
  minDelay: number;
  maxDelay: number;
  typingSimulation: boolean;
  typingDuration: number;
  readSimulation: boolean;
  autoRead: boolean;
  autoOnline: boolean;
  warmupMode: boolean;
  warmupCurrentLimit: number;
  warmupIncrement: number;
  warmupMaxLimit: number;
  dailyLimit: number;
  warmupLastUpdated: string | null;
}

// ── Reusable row component for toggle settings ──────────────────────────────
function SettingRow({
  label,
  description,
  checked,
  onCheckedChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium leading-none">{label}</p>
        {description && (
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{description}</p>
        )}
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} className="shrink-0 mt-0.5" />
    </div>
  );
}

// ── Slider with number input side-by-side ───────────────────────────────────
function SliderInput({
  label,
  value,
  min,
  max,
  step = 1,
  unit = "detik",
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-sm">{label}</Label>
        <div className="flex items-center gap-1.5 shrink-0">
          <Input
            type="number"
            min={min}
            max={max}
            value={value}
            onChange={(e) => {
              const n = parseInt(e.target.value);
              if (!isNaN(n)) onChange(Math.min(max, Math.max(min, n)));
            }}
            className="w-16 h-7 text-sm text-center px-1"
          />
          <span className="text-xs text-muted-foreground">{unit}</span>
        </div>
      </div>
      <Slider
        min={min}
        max={max}
        step={step}
        value={[value]}
        onValueChange={([v]) => onChange(v!)}
      />
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{min} {unit}</span>
        <span>{max} {unit}</span>
      </div>
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────
export default function AntiBanned() {
  const { selectedDevice } = useDevice();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [settings, setSettings] = useState<AntiBannedSettings>({
    antiBannedEnabled: true,
    minDelay: 3,
    maxDelay: 10,
    typingSimulation: true,
    typingDuration: 2,
    readSimulation: false,
    autoRead: false,
    autoOnline: false,
    warmupMode: false,
    warmupCurrentLimit: 20,
    warmupIncrement: 10,
    warmupMaxLimit: 200,
    dailyLimit: 0,
    warmupLastUpdated: null,
  });

  const [spinTemplate, setSpinTemplate] = useState(
    "{Halo|Hi|Hey} {{name}}, pesanan kamu sudah {siap|dikirim|diproses}!"
  );
  const [spinPreviews, setSpinPreviews] = useState<string[]>([]);
  const [spinLoading, setSpinLoading] = useState(false);

  const devId = selectedDevice?.id;

  const { data, isLoading } = useQuery<AntiBannedSettings>({
    queryKey: ["anti-banned", devId],
    queryFn: () => apiFetch(`/devices/${devId}/anti-banned`).then((r) => r.json()),
    enabled: !!devId,
  });

  useEffect(() => {
    if (data) setSettings(data);
  }, [data]);

  const save = useMutation({
    mutationFn: (body: Partial<AntiBannedSettings>) =>
      apiFetch(`/devices/${devId}/anti-banned`, {
        method: "PUT",
        body: JSON.stringify(body),
      }).then((r) => r.json()),
    onSuccess: (updated) => {
      setSettings(updated);
      qc.invalidateQueries({ queryKey: ["anti-banned", devId] });
      toast({ title: "Pengaturan anti-banned disimpan" });
    },
    onError: () => toast({ title: "Gagal menyimpan", variant: "destructive" }),
  });

  const handleSpin = async () => {
    setSpinLoading(true);
    try {
      const r = await apiFetch("/anti-banned/spin-preview", {
        method: "POST",
        body: JSON.stringify({ message: spinTemplate, count: 5 }),
      });
      const json = await r.json();
      setSpinPreviews(json.previews ?? []);
    } catch {
      toast({ title: "Gagal generate preview", variant: "destructive" });
    } finally {
      setSpinLoading(false);
    }
  };

  // ── Empty state ─────────────────────────────────────────────────────────
  if (!devId) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="text-center max-w-xs">
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4"
            style={{ backgroundColor: "hsl(145 63% 49% / 0.1)" }}
          >
            <ShieldAlert className="w-7 h-7" style={{ color: "hsl(145 63% 49%)" }} />
          </div>
          <p className="font-semibold mb-1">Pilih Perangkat</p>
          <p className="text-sm text-muted-foreground">
            Pilih perangkat dari sidebar untuk mengatur fitur Anti-Banned
          </p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: "hsl(145 63% 49%)" }} />
      </div>
    );
  }

  const enabled = settings.antiBannedEnabled;

  // ── Main layout ─────────────────────────────────────────────────────────
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="p-4 md:p-6 space-y-5 max-w-2xl mx-auto">

        {/* ── Header ─────────────────────────────────────────────────── */}
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <ShieldAlert className="w-5 h-5 shrink-0" style={{ color: "hsl(145 63% 49%)" }} />
            <Badge
              variant="outline"
              className={
                enabled
                  ? "border-green-500 text-green-600 bg-green-50 dark:bg-green-950"
                  : "border-red-400 text-red-500 bg-red-50 dark:bg-red-950"
              }
            >
              {enabled ? (
                <><ShieldCheck className="w-3 h-3 mr-1" />Aktif</>
              ) : (
                <><ShieldAlert className="w-3 h-3 mr-1" />Nonaktif</>
              )}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Lindungi nomor WhatsApp dari pemblokiran dengan pengiriman yang lebih alami
          </p>
        </div>

        {/* ── Tabs ───────────────────────────────────────────────────── */}
        <Tabs defaultValue="protection">
          <TabsList className="w-full grid grid-cols-3 h-9">
            <TabsTrigger value="protection" className="text-xs sm:text-sm">Proteksi</TabsTrigger>
            <TabsTrigger value="warmup" className="text-xs sm:text-sm">Warmup</TabsTrigger>
            <TabsTrigger value="spinner" className="text-xs sm:text-sm">Spinner</TabsTrigger>
          </TabsList>

          {/* ── Tab: Proteksi Dasar ─────────────────────────────────── */}
          <TabsContent value="protection" className="space-y-4 mt-4">

            {/* Master toggle */}
            <Card>
              <CardContent className="pt-5 pb-5">
                <SettingRow
                  label="Aktifkan Anti-Banned"
                  description="Terapkan semua proteksi pengiriman pada perangkat ini"
                  checked={settings.antiBannedEnabled}
                  onCheckedChange={(v) => setSettings((s) => ({ ...s, antiBannedEnabled: v }))}
                />
              </CardContent>
            </Card>

            {/* Random Delay */}
            <Card className={!enabled ? "opacity-50 pointer-events-none" : ""}>
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Timer className="w-4 h-4 shrink-0" style={{ color: "hsl(145 63% 49%)" }} />
                  Jeda Acak Antar Pesan
                </CardTitle>
                <CardDescription className="text-xs">
                  Tambahkan jedah acak antara setiap pesan untuk meniru perilaku manusia
                </CardDescription>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-5">
                <SliderInput
                  label="Jeda Minimum"
                  value={settings.minDelay}
                  min={1}
                  max={30}
                  onChange={(v) =>
                    setSettings((s) => ({
                      ...s,
                      minDelay: v,
                      maxDelay: Math.max(s.maxDelay, v),
                    }))
                  }
                />
                <SliderInput
                  label="Jeda Maksimum"
                  value={settings.maxDelay}
                  min={settings.minDelay}
                  max={60}
                  onChange={(v) => setSettings((s) => ({ ...s, maxDelay: v }))}
                />
                <div className="flex items-start gap-2 rounded-lg bg-muted/50 p-3">
                  <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Jeda <strong>{settings.minDelay}–{settings.maxDelay} detik</strong> antar pesan pada Bulk.
                    Rekomendasi: <strong>3–10 dtk</strong> normal, <strong>5–20 dtk</strong> nomor baru.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Typing + Read Simulation */}
            <Card className={!enabled ? "opacity-50 pointer-events-none" : ""}>
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Keyboard className="w-4 h-4 shrink-0" style={{ color: "hsl(145 63% 49%)" }} />
                  Simulasi Aktivitas
                </CardTitle>
                <CardDescription className="text-xs">
                  Tampilkan indikator mengetik sebelum mengirim pesan
                </CardDescription>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-4">
                <SettingRow
                  label="Simulasi Mengetik"
                  description="Tampilkan status &ldquo;sedang mengetik...&rdquo; sebelum pesan terkirim"
                  checked={settings.typingSimulation}
                  onCheckedChange={(v) => setSettings((s) => ({ ...s, typingSimulation: v }))}
                />

                {settings.typingSimulation && (
                  <div className="pl-0 pt-1">
                    <SliderInput
                      label="Durasi Mengetik"
                      value={settings.typingDuration}
                      min={1}
                      max={8}
                      onChange={(v) => setSettings((s) => ({ ...s, typingDuration: v }))}
                    />
                  </div>
                )}

              </CardContent>
            </Card>

            {/* Presence & Read */}
            <Card>
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Wifi className="w-4 h-4 shrink-0" style={{ color: "hsl(145 63% 49%)" }} />
                  Kehadiran & Status
                </CardTitle>
                <CardDescription className="text-xs">
                  Atur kehadiran online dan baca pesan otomatis
                </CardDescription>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-4">
                <SettingRow
                  label="Auto Online"
                  description="Selalu tampil online di WhatsApp — kirim status &ldquo;tersedia&rdquo; setiap 30 detik saat perangkat terhubung"
                  checked={settings.autoOnline}
                  onCheckedChange={(v) => setSettings((s) => ({ ...s, autoOnline: v }))}
                />
                <Separator />
                <SettingRow
                  label="Auto Read"
                  description="Tandai pesan masuk sebagai terbaca secara otomatis (centang biru ✓✓) segera setelah diterima"
                  checked={settings.autoRead}
                  onCheckedChange={(v) => setSettings((s) => ({ ...s, autoRead: v }))}
                />
                <Separator />
                <SettingRow
                  label="Simulasi Tanda Baca (saat kirim)"
                  description="Tandai pesan masuk sebagai terbaca sebelum CS Bot membalas — berbeda dari Auto Read yang membaca semua pesan"
                  checked={settings.readSimulation}
                  onCheckedChange={(v) => setSettings((s) => ({ ...s, readSimulation: v }))}
                />
                {(settings.autoOnline || settings.autoRead) && (
                  <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3">
                    <p className="text-xs text-amber-700 dark:text-amber-400 flex items-start gap-1.5">
                      <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <span>
                        <strong>Catatan:</strong> Auto Online & Auto Read dapat meningkatkan risiko ban pada nomor baru.
                        Gunakan hanya pada nomor yang sudah terverifikasi (&gt; 3 bulan aktif).
                      </span>
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Daily Limit */}
            <Card className={!enabled ? "opacity-50 pointer-events-none" : ""}>
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Zap className="w-4 h-4 shrink-0" style={{ color: "hsl(145 63% 49%)" }} />
                  Batas Harian Perangkat
                </CardTitle>
                <CardDescription className="text-xs">
                  Set batas pesan per hari khusus perangkat ini (0 = ikuti limit plan)
                </CardDescription>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-3">
                <div className="flex items-center gap-3">
                  <Input
                    type="number"
                    min={0}
                    value={settings.dailyLimit}
                    onChange={(e) =>
                      setSettings((s) => ({ ...s, dailyLimit: parseInt(e.target.value) || 0 }))
                    }
                    className="w-28"
                    placeholder="0"
                  />
                  <span className="text-xs text-muted-foreground">
                    {settings.dailyLimit === 0
                      ? "Mengikuti limit plan aktif"
                      : `Maks ${settings.dailyLimit} pesan/hari`}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Untuk nomor baru mulai dengan 50–100/hari. Gunakan Warmup tab untuk kenaikan otomatis.
                </p>
              </CardContent>
            </Card>

            <Button
              onClick={() => save.mutate(settings)}
              disabled={save.isPending}
              style={{ backgroundColor: "hsl(145 63% 49%)" }}
              className="text-white w-full"
            >
              {save.isPending
                ? <Loader2 className="w-4 h-4 animate-spin mr-2" />
                : <Save className="w-4 h-4 mr-2" />}
              Simpan Pengaturan
            </Button>
          </TabsContent>

          {/* ── Tab: Warmup Mode ─────────────────────────────────────── */}
          <TabsContent value="warmup" className="space-y-4 mt-4">
            <Card>
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 shrink-0" style={{ color: "hsl(145 63% 49%)" }} />
                  Warmup Mode
                </CardTitle>
                <CardDescription className="text-xs">
                  Tingkatkan batas harian secara otomatis tiap hari untuk nomor baru
                </CardDescription>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-4">
                <SettingRow
                  label="Aktifkan Warmup Mode"
                  description="Batas harian meningkat otomatis setiap hari hingga batas maksimum"
                  checked={settings.warmupMode}
                  onCheckedChange={(v) => setSettings((s) => ({ ...s, warmupMode: v }))}
                />

                {settings.warmupMode ? (
                  <>
                    <Separator />

                    {/* Status card */}
                    <div
                      className="rounded-lg p-3 flex items-center gap-3"
                      style={{ backgroundColor: "hsl(145 63% 49% / 0.08)" }}
                    >
                      <Clock className="w-4 h-4 shrink-0" style={{ color: "hsl(145 63% 49%)" }} />
                      <div className="text-xs leading-relaxed">
                        <span className="font-medium">Batas hari ini: </span>
                        <span
                          className="font-bold text-sm"
                          style={{ color: "hsl(145 63% 49%)" }}
                        >
                          {settings.warmupCurrentLimit} pesan
                        </span>
                        {settings.warmupLastUpdated && (
                          <span className="text-muted-foreground">
                            {" "}· Diperbarui{" "}
                            {new Date(settings.warmupLastUpdated).toLocaleDateString("id-ID")}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Warmup inputs */}
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        {
                          label: "Batas Awal",
                          key: "warmupCurrentLimit" as const,
                          sub: "Hari ini",
                          default: 20,
                        },
                        {
                          label: "Kenaikan/Hari",
                          key: "warmupIncrement" as const,
                          sub: "+pesan/hari",
                          default: 10,
                        },
                        {
                          label: "Batas Maks",
                          key: "warmupMaxLimit" as const,
                          sub: "Puncak",
                          default: 200,
                        },
                      ].map(({ label, key, sub, default: def }) => (
                        <div key={key} className="space-y-1.5">
                          <Label className="text-xs">{label}</Label>
                          <Input
                            type="number"
                            min={1}
                            value={settings[key]}
                            onChange={(e) =>
                              setSettings((s) => ({
                                ...s,
                                [key]: parseInt(e.target.value) || def,
                              }))
                            }
                            className="h-8 text-sm"
                          />
                          <p className="text-xs text-muted-foreground">{sub}</p>
                        </div>
                      ))}
                    </div>

                    {/* Projection grid */}
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Proyeksi
                      </p>
                      <div className="grid grid-cols-4 gap-1.5">
                        {[0, 1, 3, 7, 10, 14, 21, 30].map((day) => {
                          const limit = Math.min(
                            settings.warmupCurrentLimit + day * settings.warmupIncrement,
                            settings.warmupMaxLimit
                          );
                          const atMax = limit >= settings.warmupMaxLimit;
                          return (
                            <div
                              key={day}
                              className="rounded-lg text-center py-2 px-1 text-xs"
                              style={{
                                backgroundColor: atMax
                                  ? "hsl(145 63% 49% / 0.15)"
                                  : "hsl(var(--muted))",
                              }}
                            >
                              <div className="text-muted-foreground text-[10px] mb-0.5">
                                {day === 0 ? "Hari ini" : `+${day}h`}
                              </div>
                              <div
                                className="font-bold text-sm leading-none"
                                style={{ color: "hsl(145 63% 49%)" }}
                              >
                                {limit}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="rounded-lg bg-muted/30 p-6 text-center">
                    <TrendingUp className="w-8 h-8 mx-auto mb-2 text-muted-foreground/40" />
                    <p className="text-sm text-muted-foreground">
                      Aktifkan Warmup Mode untuk nomor baru
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Tips */}
            <Card>
              <CardContent className="pt-4 pb-4 px-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                  Tips Warmup
                </p>
                <ul className="space-y-2">
                  {[
                    "Mulai dengan 20–50 pesan/hari untuk nomor baru",
                    "Naikkan 10–20 pesan/hari setiap harinya",
                    "Target aman: 200–300 pesan/hari per nomor",
                    "Hindari blast ke nomor tidak dikenal sekaligus",
                    "Gunakan jeda 5–15 dtk saat warmup untuk hasil terbaik",
                  ].map((tip, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                      <span
                        className="shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold mt-0.5"
                        style={{
                          backgroundColor: "hsl(145 63% 49% / 0.15)",
                          color: "hsl(145 63% 49%)",
                        }}
                      >
                        {i + 1}
                      </span>
                      {tip}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            <Button
              onClick={() => save.mutate(settings)}
              disabled={save.isPending}
              style={{ backgroundColor: "hsl(145 63% 49%)" }}
              className="text-white w-full"
            >
              {save.isPending
                ? <Loader2 className="w-4 h-4 animate-spin mr-2" />
                : <Save className="w-4 h-4 mr-2" />}
              Simpan Warmup
            </Button>
          </TabsContent>

          {/* ── Tab: Message Spinner ────────────────────────────────── */}
          <TabsContent value="spinner" className="space-y-4 mt-4">
            <Card>
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Shuffle className="w-4 h-4 shrink-0" style={{ color: "hsl(145 63% 49%)" }} />
                  Message Spinner
                </CardTitle>
                <CardDescription className="text-xs">
                  Variasikan isi pesan agar setiap penerima mendapat teks yang sedikit berbeda
                </CardDescription>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-4">
                {/* Syntax info */}
                <div className="rounded-lg bg-muted/50 p-3 space-y-2">
                  <p className="text-xs font-medium">Cara Pakai</p>
                  <div className="space-y-1.5 text-xs text-muted-foreground">
                    <div className="flex items-start gap-2">
                      <code className="bg-background border rounded px-1.5 py-0.5 shrink-0 text-foreground font-mono">
                        {"{opsi1|opsi2|opsi3}"}
                      </code>
                      <span>Pilih acak salah satu</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <code className="bg-background border rounded px-1.5 py-0.5 shrink-0 text-foreground font-mono">
                        {"{{name}}"}
                      </code>
                      <span>Diganti nama penerima</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-sm">Template Pesan</Label>
                  <Textarea
                    value={spinTemplate}
                    onChange={(e) => setSpinTemplate(e.target.value)}
                    rows={3}
                    placeholder="{Halo|Hi} {{name}}, promo {50%|30%} untuk kamu!"
                    className="font-mono text-sm resize-none"
                  />
                </div>

                <Button
                  onClick={handleSpin}
                  disabled={spinLoading || !spinTemplate.trim()}
                  variant="outline"
                  className="w-full"
                >
                  {spinLoading
                    ? <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    : <RefreshCw className="w-4 h-4 mr-2" />}
                  Generate 5 Variasi Preview
                </Button>

                {spinPreviews.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Hasil Preview
                    </p>
                    {spinPreviews.map((preview, i) => (
                      <div
                        key={i}
                        className="rounded-lg border bg-muted/30 px-3 py-2.5 text-sm leading-relaxed"
                      >
                        <span className="text-xs font-mono text-muted-foreground mr-2">#{i + 1}</span>
                        {preview}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Template examples */}
            <Card>
              <CardContent className="pt-4 pb-4 px-4 space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Template Siap Pakai
                </p>
                {[
                  {
                    label: "Blast Promosi",
                    text: "{Halo|Hai|Selamat pagi} {{name}}! 🎉 {Jangan lewatkan|Ada} promo spesial: {diskon 50%|cashback 30%|gratis ongkir}. Kunjungi toko kami sekarang!",
                  },
                  {
                    label: "Konfirmasi Order",
                    text: "{Hi|Halo} {{name}}, pesanan kamu {sudah kami terima|berhasil dikonfirmasi}. {Estimasi pengiriman|Paket tiba} dalam {1-2 hari|2-3 hari kerja}.",
                  },
                  {
                    label: "Follow Up",
                    text: "{Selamat siang|Selamat sore} {{name}}! Kami {ingin|hanya} {mengingatkan|konfirmasi} penawaran kami masih {berlaku|tersedia} hingga akhir bulan.",
                  },
                ].map((ex) => (
                  <div key={ex.label} className="rounded-lg bg-muted/30 p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold">{ex.label}</p>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 text-xs px-2"
                        onClick={() => setSpinTemplate(ex.text)}
                      >
                        Gunakan
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground font-mono leading-relaxed break-all">
                      {ex.text}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

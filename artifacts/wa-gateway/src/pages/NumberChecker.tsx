import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Phone, CheckCircle2, XCircle, Loader2, ClipboardPaste,
  Search, Download, Smartphone, RefreshCw,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

interface CheckResult {
  phone: string;
  exists: boolean;
  jid?: string;
}

export default function NumberChecker() {
  const { toast } = useToast();
  const [deviceId, setDeviceId] = useState("");
  const [rawInput, setRawInput] = useState("");
  const [results, setResults] = useState<CheckResult[]>([]);
  const [filterMode, setFilterMode] = useState<"all" | "exists" | "not_exists">("all");

  const { data: devices, isLoading: devicesLoading } = useQuery({
    queryKey: ["devices"],
    queryFn: () => apiFetch("/devices").then((r) => r.json()),
  });
  const connectedDevices = (devices ?? []).filter((d: any) => d.status === "connected");

  const parsePhones = (raw: string): string[] =>
    raw.split(/[\n,;]+/).map((p) => p.trim().replace(/\D/g, "")).filter((p) => p.length >= 7);

  const phones = parsePhones(rawInput);

  const checkMutation = useMutation({
    mutationFn: () =>
      apiFetch("/check-numbers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId: parseInt(deviceId, 10), phones }),
      }).then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.message ?? "Gagal cek nomor");
        return data;
      }),
    onSuccess: (data) => {
      setResults(data.data ?? []);
      toast({
        title: `Selesai: ${data.exists} terdaftar, ${data.notExists} tidak terdaftar`,
      });
    },
    onError: (err: any) => {
      toast({ title: err.message ?? "Gagal cek nomor", variant: "destructive" });
    },
  });

  const filteredResults = results.filter((r) => {
    if (filterMode === "exists") return r.exists;
    if (filterMode === "not_exists") return !r.exists;
    return true;
  });

  const existCount = results.filter((r) => r.exists).length;
  const notExistCount = results.filter((r) => !r.exists).length;

  const exportCsv = (onlyExists: boolean) => {
    const data = onlyExists ? results.filter((r) => r.exists) : results.filter((r) => !r.exists);
    const csv = "phone,exists\n" + data.map((r) => `${r.phone},${r.exists}`).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = onlyExists ? "terdaftar_wa.csv" : "tidak_terdaftar_wa.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Input */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Search className="w-4 h-4 text-primary" />
              Input Nomor
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Perangkat WhatsApp</Label>
              {devicesLoading ? (
                <div className="h-10 bg-muted animate-pulse rounded-md" />
              ) : (
                <Select value={deviceId} onValueChange={setDeviceId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih perangkat..." />
                  </SelectTrigger>
                  <SelectContent>
                    {connectedDevices.length === 0 ? (
                      <SelectItem value="_none" disabled>Tidak ada perangkat terhubung</SelectItem>
                    ) : connectedDevices.map((d: any) => (
                      <SelectItem key={d.id} value={String(d.id)}>
                        <div className="flex items-center gap-2">
                          <Smartphone className="w-3.5 h-3.5 text-green-500" />
                          {d.name} {d.phone && <span className="text-muted-foreground text-xs">({d.phone})</span>}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Daftar Nomor</Label>
                <span className="text-xs text-muted-foreground">{phones.length} nomor ({phones.length > 100 ? <span className="text-red-500">maks 100</span> : "OK"})</span>
              </div>
              <Textarea
                placeholder="Masukkan nomor, satu per baris atau pisahkan dengan koma&#10;Contoh:&#10;6281234567890&#10;6287654321098&#10;6285..."
                rows={8}
                value={rawInput}
                onChange={(e) => setRawInput(e.target.value)}
                className="font-mono text-xs"
              />
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1 text-xs"
                  onClick={async () => {
                    const text = await navigator.clipboard.readText();
                    setRawInput((prev) => prev ? prev + "\n" + text : text);
                  }}
                >
                  <ClipboardPaste className="w-3 h-3" />
                  Paste
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1 text-xs text-destructive"
                  onClick={() => { setRawInput(""); setResults([]); }}
                >
                  Reset
                </Button>
              </div>
            </div>

            <Button
              className="w-full gap-2"
              onClick={() => checkMutation.mutate()}
              disabled={checkMutation.isPending || !deviceId || phones.length === 0 || phones.length > 100}
            >
              {checkMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              {checkMutation.isPending ? `Mengecek ${phones.length} nomor...` : `Cek ${phones.length} Nomor`}
            </Button>
          </CardContent>
        </Card>

        {/* Result summary */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-500" />
              Hasil Pengecekan
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {results.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-muted-foreground gap-2">
                <Phone className="w-8 h-8 opacity-20" />
                <p className="text-sm">Belum ada hasil. Masukkan nomor dan klik Cek.</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 p-4 text-center">
                    <p className="text-2xl font-bold text-green-600">{existCount}</p>
                    <p className="text-xs text-green-600/70 mt-0.5">Terdaftar WA</p>
                  </div>
                  <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4 text-center">
                    <p className="text-2xl font-bold text-red-500">{notExistCount}</p>
                    <p className="text-xs text-red-500/70 mt-0.5">Tidak Terdaftar</p>
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Terdaftar</span>
                    <span>{results.length > 0 ? Math.round((existCount / results.length) * 100) : 0}%</span>
                  </div>
                  <Progress value={results.length > 0 ? (existCount / results.length) * 100 : 0} className="h-2" />
                </div>

                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="gap-1 text-xs flex-1 text-green-600 border-green-200" onClick={() => exportCsv(true)}>
                    <Download className="w-3 h-3" />
                    Export Terdaftar
                  </Button>
                  <Button size="sm" variant="outline" className="gap-1 text-xs flex-1 text-red-500 border-red-200" onClick={() => exportCsv(false)}>
                    <Download className="w-3 h-3" />
                    Export Tidak
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Results table */}
      {results.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Detail Hasil</CardTitle>
              <div className="flex gap-1">
                {(["all", "exists", "not_exists"] as const).map((mode) => (
                  <Button
                    key={mode}
                    size="sm"
                    variant={filterMode === mode ? "default" : "outline"}
                    className="h-7 text-xs"
                    onClick={() => setFilterMode(mode)}
                  >
                    {mode === "all" ? `Semua (${results.length})` : mode === "exists" ? `✅ Terdaftar (${existCount})` : `❌ Tidak (${notExistCount})`}
                  </Button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-80 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium text-xs text-muted-foreground">#</th>
                    <th className="text-left px-4 py-2 font-medium text-xs text-muted-foreground">Nomor</th>
                    <th className="text-left px-4 py-2 font-medium text-xs text-muted-foreground">Status</th>
                    <th className="text-left px-4 py-2 font-medium text-xs text-muted-foreground">JID</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredResults.map((r, i) => (
                    <tr key={i} className="border-t border-border/50 hover:bg-muted/30">
                      <td className="px-4 py-2 text-muted-foreground text-xs">{i + 1}</td>
                      <td className="px-4 py-2 font-mono text-xs">{r.phone}</td>
                      <td className="px-4 py-2">
                        {r.exists ? (
                          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-xs gap-1">
                            <CheckCircle2 className="w-3 h-3" /> Terdaftar
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-red-50 text-red-600 border-red-200 text-xs gap-1">
                            <XCircle className="w-3 h-3" /> Tidak
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{r.jid ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="bg-blue-50/50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800">
        <CardContent className="pt-4 pb-4">
          <p className="text-xs text-blue-700 dark:text-blue-400 font-medium mb-1.5">Cara Pakai:</p>
          <ul className="text-xs text-blue-600/80 dark:text-blue-400/80 space-y-1 list-disc list-inside">
            <li>Paste daftar nomor (1 nomor per baris, atau pisahkan dengan koma)</li>
            <li>Format nomor: awali dengan kode negara (628..., 601..., dst) tanpa tanda +</li>
            <li>Maksimal 100 nomor per pengecekan</li>
            <li>Export hasil terdaftar untuk digunakan di Blast / Drip Campaign</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

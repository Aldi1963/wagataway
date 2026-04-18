import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  MessageSquare, Upload, Loader2, CheckCircle2, XCircle, BarChart3,
  Users, FileText, Send, Sparkles, RefreshCw, Image, Link2, X,
  Eye, Download, Clock, Calendar, FileSpreadsheet, Plus, Trash2,
  Settings2,
} from "lucide-react";
import * as XLSX from "xlsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ContactPicker, ContactChips, type PickedContact } from "@/components/ContactPicker";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface BulkJob {
  id: string;
  name: string;
  message?: string;
  mediaUrl?: string;
  mediaType?: string;
  status: string;
  scheduledAt?: string | null;
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  total: number;
  sent: number;
  failed: number;
  createdAt?: string;
}

interface ReportMessage {
  phone: string;
  status: string;
  createdAt?: string;
}

interface BulkReport {
  jobId: string;
  jobName: string;
  total: number;
  sent: number;
  failed: number;
  messages: ReportMessage[];
}

function statusBadge(status: string, scheduledAt?: string | null) {
  if (status === "pending" && scheduledAt) {
    return (
      <Badge variant="outline" className="gap-1 text-blue-600 border-blue-300 bg-blue-50 dark:bg-blue-950/30">
        <Clock className="w-3 h-3" />
        Terjadwal
      </Badge>
    );
  }
  const map: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
    completed: { variant: "default", label: "Selesai" },
    running:   { variant: "secondary", label: "Berjalan" },
    failed:    { variant: "destructive", label: "Gagal" },
    cancelled: { variant: "outline", label: "Dibatalkan" },
    pending:   { variant: "outline", label: "Menunggu" },
  };
  const cfg = map[status] ?? { variant: "outline", label: status };
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}

function MediaTypeIcon({ type }: { type?: string }) {
  if (!type) return null;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <Image className="w-3 h-3" />
      {type === "image" ? "Gambar" : type === "video" ? "Video" : type === "audio" ? "Audio" : "Dokumen"}
    </span>
  );
}

export default function BulkMessages() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [tab, setTab] = useState("create");
  const [deviceId, setDeviceId] = useState("");
  const [jobName, setJobName] = useState("");
  const [numbers, setNumbers] = useState("");
  const [message, setMessage] = useState("");
  const [pickedContacts, setPickedContacts] = useState<PickedContact[]>([]);
  const [mediaUrl, setMediaUrl] = useState("");
  const [mediaType, setMediaType] = useState("image");
  const [showMedia, setShowMedia] = useState(false);
  const [scheduledAt, setScheduledAt] = useState("");
  const [useSchedule, setUseSchedule] = useState(false);

  // ── Interactive Message State ─────────────────────────────────────────────
  const [messageType, setMessageType] = useState<"text" | "button" | "list">("text");
  const [footer, setFooter] = useState("");
  const [headerUrl, setHeaderUrl] = useState("");
  const [buttons, setButtons] = useState<any[]>([]); // { type: 'quick_reply' | 'url', title: string, value: string }

  const [detailJob, setDetailJob] = useState<BulkJob | null>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: "binary" });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws) as any[];

        const importedContacts: PickedContact[] = data
          .map((row: any) => {
            const phone = String(row.phone || row.nomor || row.whatsapp || "").replace(/\D/g, "");
            const name = String(row.name || row.nama || "");
            if (phone.length < 8) return null;
            return { id: `import_${phone}_${Math.random()}`, phone, name };
          })
          .filter(Boolean) as PickedContact[];

        if (importedContacts.length > 0) {
          setPickedContacts((prev) => {
            const existing = new Set(prev.map((c) => c.phone));
            const unique = importedContacts.filter((c) => !existing.has(c.phone));
            return [...prev, ...unique];
          });
          toast({ title: `Berhasil mengimpor ${importedContacts.length} kontak` });
        } else {
          toast({ title: "Tidak ada nomor valid yang ditemukan", variant: "destructive" });
        }
      } catch (err) {
        toast({ title: "Gagal membaca file", variant: "destructive" });
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = ""; // reset
  };

  const addButton = () => {
    if (buttons.length >= 3) return;
    setButtons([...buttons, { type: "quick_reply", title: "", value: "" }]);
  };

  const updateButton = (index: number, field: string, val: string) => {
    setButtons((prev) => prev.map((b, i) => (i === index ? { ...b, [field]: val } : b)));
  };

  const removeButton = (index: number) => {
    setButtons((prev) => prev.filter((_, i) => i !== index));
  };

  const { data: devices } = useQuery({
    queryKey: ["devices"],
    queryFn: () => apiFetch("/devices").then((r) => r.json()),
  });

  const { data: jobs, isLoading } = useQuery<BulkJob[]>({
    queryKey: ["bulk-jobs"],
    queryFn: () => apiFetch("/messages/bulk-jobs").then((r) => r.json()),
    refetchInterval: 5000,
    select: (data: any[]) => data.map((j) => ({
      ...j,
      totalRecipients: j.totalRecipients ?? j.total ?? 0,
      sentCount: j.sentCount ?? j.sent ?? 0,
      failedCount: j.failedCount ?? j.failed ?? 0,
    })),
  });

  const { data: report, isLoading: reportLoading } = useQuery<BulkReport>({
    queryKey: ["bulk-report", detailJob?.id],
    queryFn: () => apiFetch(`/messages/bulk-jobs/${detailJob!.id}/report`).then((r) => r.json()),
    enabled: !!detailJob,
  });

  const sendBulk = useMutation({
    mutationFn: (body: any) =>
      apiFetch("/messages/bulk", { method: "POST", body: JSON.stringify(body) }).then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw Object.assign(new Error(d.message ?? "Error"), d);
        return d;
      }),
    onSuccess: (d: any) => {
      qc.invalidateQueries({ queryKey: ["bulk-jobs"] });
      setTab("history");
      setJobName(""); setNumbers(""); setMessage(""); setPickedContacts([]);
      setMediaUrl(""); setShowMedia(false); setScheduledAt(""); setUseSchedule(false);
      toast({ title: d.status === "pending" ? `Blast dijadwalkan: ${format(new Date(d.scheduledAt), "dd MMM yyyy HH:mm")}` : "Blast berhasil ditambahkan ke antrian!" });
    },
    onError: (err: any) => toast({ title: err.message || "Gagal membuat blast", variant: "destructive" }),
  });

  const cancelJob = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/messages/bulk/${id}/cancel`, { method: "POST" }).then((r) => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["bulk-jobs"] }); toast({ title: "Job dibatalkan" }); },
  });

  const retryFailed = useMutation({
    mutationFn: () => apiFetch("/messages/retry-failed", { method: "POST" }).then((r) => r.json()),
    onSuccess: (d: any) => {
      qc.invalidateQueries({ queryKey: ["bulk-jobs"] });
      toast({ title: `${d.retried} pesan gagal dijadwalkan ulang` });
    },
    onError: () => toast({ title: "Gagal retry pesan", variant: "destructive" }),
  });

  const retryJobFailed = useMutation({
    mutationFn: (jobId: number) =>
      apiFetch(`/messages/bulk-jobs/${jobId}/retry-failed`, { method: "POST" }).then((r) => r.json()),
    onSuccess: (d: any) => {
      qc.invalidateQueries({ queryKey: ["bulk-jobs"] });
      qc.invalidateQueries({ queryKey: ["bulk-report", detailJob?.id] });
      toast({ title: `${d.retried} pesan gagal dikerjakan ulang` });
    },
    onError: () => toast({ title: "Gagal retry pesan", variant: "destructive" }),
  });

  const connectedDevices = (devices ?? []).filter((d: any) => d.status === "connected");

  const allPhones = (() => {
    const fromContacts = pickedContacts.map((c) => ({ phone: c.phone, name: c.name }));
    const fromManual = numbers.split(/[\n,]/).map((p) => p.trim()).filter(Boolean).map((p) => ({ phone: p }));
    const seenPhones = new Set(fromContacts.map((c) => c.phone));
    const merged = [...fromContacts, ...fromManual.filter((c) => !seenPhones.has(c.phone))];
    return merged;
  })();

  const totalCount = allPhones.length;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!deviceId || !message.trim() || !allPhones.length) {
      toast({ title: "Lengkapi semua field", variant: "destructive" });
      return;
    }
    sendBulk.mutate({
      deviceId,
      message: message.trim(),
      name: jobName || `Blast ${format(new Date(), "dd/MM/yyyy HH:mm")}`,
      recipients: allPhones,
      messageType,
      extra: messageType === "button" ? {
        buttons: buttons.map((b) => ({
          type: b.type,
          displayText: b.title,
          url: b.type === "url" ? b.value : undefined,
          phoneNumber: b.type === "call" ? b.value : undefined,
        })),
        footer,
        headerUrl,
      } : undefined,
      ...(showMedia && mediaUrl && messageType === "text" ? { mediaUrl, mediaType } : {}),
      ...(useSchedule && scheduledAt ? { scheduledAt: new Date(scheduledAt).toISOString() } : {}),
    });
  }

  function downloadReport(jobId: string) {
    apiFetch(`/messages/bulk-jobs/${jobId}/report?format=csv`).then((r) => r.blob()).then((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `laporan-blast-${jobId}.csv`; a.click();
      URL.revokeObjectURL(url);
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end">
        {tab === "history" && (
          <Button onClick={() => setTab("create")} className="gap-2">
            <Send className="w-4 h-4" /> Buat Pengiriman
          </Button>
        )}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="create" className="gap-1.5"><Send className="w-3.5 h-3.5" />Buat Pengiriman</TabsTrigger>
          <TabsTrigger value="history" className="gap-1.5"><BarChart3 className="w-3.5 h-3.5" />Riwayat</TabsTrigger>
        </TabsList>

        {/* ── Buat tab ──────────────────────────────────────────────── */}
        <TabsContent value="create" className="mt-5">
          <div className="max-w-2xl">
            <form onSubmit={handleSubmit} className="space-y-0">
              <Card className="overflow-hidden border-border/60">
                <CardHeader className="pb-4 pt-5 px-5 border-b border-border/50"
                  style={{ background: "linear-gradient(135deg, hsl(145 63% 49% / 0.05) 0%, transparent 60%)" }}>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: "hsl(145 63% 49% / 0.12)" }}>
                      <Upload className="w-3.5 h-3.5" style={{ color: "hsl(145 63% 42%)" }} />
                    </div>
                    Konfigurasi Pengiriman
                  </CardTitle>
                </CardHeader>

                <CardContent className="p-5 space-y-5">
                  {/* Row 1: Job name + device */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-sm font-medium">Nama Job <span className="text-muted-foreground font-normal">(opsional)</span></Label>
                      <Input placeholder="Promo Ramadan 2024" value={jobName} onChange={(e) => setJobName(e.target.value)} className="h-10" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-sm font-medium">Perangkat WhatsApp</Label>
                      <Select onValueChange={setDeviceId} value={deviceId}>
                        <SelectTrigger className="h-10">
                          <SelectValue placeholder="Pilih perangkat" />
                        </SelectTrigger>
                        <SelectContent>
                          {!connectedDevices.length ? (
                            <SelectItem value="_none" disabled>Tidak ada perangkat terhubung</SelectItem>
                          ) : (
                            connectedDevices.map((d: any) => (
                              <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <Separator className="my-1" />

                  {/* Recipients */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-medium flex items-center gap-1.5">
                        <Users className="w-4 h-4 text-muted-foreground" /> Penerima
                      </Label>
                      <div className="flex items-center gap-2">
                        {totalCount > 0 && (
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full border"
                            style={{ backgroundColor: "hsl(145 63% 49% / 0.1)", color: "hsl(145 63% 40%)", borderColor: "hsl(145 63% 49% / 0.25)" }}>
                            {totalCount} nomor
                          </span>
                        )}
                        <div className="flex items-center gap-2">
                          <label className="cursor-pointer">
                            <input type="file" className="hidden" accept=".xlsx,.xls,.csv" onChange={handleFileUpload} />
                            <div className="flex items-center gap-1.5 h-8 px-3 text-xs font-medium border rounded-md hover:bg-muted transition-colors">
                              <FileSpreadsheet className="w-3.5 h-3.5" /> Import Excel
                            </div>
                          </label>
                          <ContactPicker mode="multi" selected={pickedContacts} onSelect={setPickedContacts}
                            trigger={
                              <Button type="button" variant="outline" size="sm" className="gap-1.5 h-8 text-xs">
                                <Users className="w-3.5 h-3.5" /> Pilih Kontak
                              </Button>
                            }
                          />
                        </div>
                      </div>
                    </div>
                    {pickedContacts.length > 0 && (
                      <div className="p-3 rounded-xl border border-border/50 bg-muted/30">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-medium text-muted-foreground">{pickedContacts.length} kontak dipilih</span>
                          <button type="button" onClick={() => setPickedContacts([])} className="text-[11px] text-muted-foreground hover:text-destructive transition-colors">
                            Hapus semua
                          </button>
                        </div>
                        <ContactChips contacts={pickedContacts} onRemove={(id) => setPickedContacts((p) => p.filter((c) => c.id !== id))} />
                      </div>
                    )}
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">Atau ketik nomor manual</span>
                      </div>
                      <Textarea placeholder={"628111000001\n628111000002\n628111000003"} rows={4} value={numbers}
                        onChange={(e) => setNumbers(e.target.value)} className="font-mono text-sm resize-none" />
                      <p className="text-xs text-muted-foreground">Satu nomor per baris atau dipisahkan koma. Format: 628xxx</p>
                    </div>
                  </div>

                  <Separator className="my-1" />

                  {/* Message Type Selection */}
                  <div className="space-y-1.5 pt-1">
                    <Label className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Tipe Pesan</Label>
                    <div className="grid grid-cols-2 gap-2">
                      <Button type="button" variant={messageType === "text" ? "default" : "outline"}
                        className="h-9 gap-2 text-xs" onClick={() => setMessageType("text")}>
                        <MessageSquare className="w-3.5 h-3.5" /> Pesan Teks/Media
                      </Button>
                      <Button type="button" variant={messageType === "button" ? "default" : "outline"}
                        className="h-9 gap-2 text-xs" onClick={() => setMessageType("button")}>
                        <Settings2 className="w-3.5 h-3.5" /> Pesan Tombol
                      </Button>
                    </div>
                  </div>

                  <Separator className="my-1" />

                  {/* Message Content */}
                  <div className="space-y-4">
                    {messageType === "button" && (
                      <div className="space-y-3 p-4 rounded-2xl border bg-muted/20 border-border/50">
                        <div className="space-y-1.5">
                          <Label className="text-xs font-medium">Header Media <span className="font-normal text-muted-foreground">(Opsional)</span></Label>
                          <Input placeholder="URL Gambar Header..." value={headerUrl} onChange={(e) => setHeaderUrl(e.target.value)} className="h-9 text-xs" />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs font-medium">Warna Footer <span className="font-normal text-muted-foreground">(Teks kecil di bawah pesan)</span></Label>
                          <Input placeholder="Ketik footer..." value={footer} onChange={(e) => setFooter(e.target.value)} className="h-9 text-xs" />
                        </div>
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <Label className="text-xs font-semibold">Daftar Tombol <span className="font-normal text-muted-foreground">(Maks 3)</span></Label>
                            {buttons.length < 3 && (
                              <Button type="button" variant="ghost" size="sm" onClick={addButton} className="h-7 text-[10px] gap-1 px-2 h-7 rounded-lg bg-primary/10 text-primary">
                                <Plus className="w-3 h-3" /> Tambah Tombol
                              </Button>
                            )}
                          </div>
                          {buttons.map((btn, idx) => (
                            <div key={idx} className="space-y-2 p-3 rounded-xl border bg-background relative group">
                              <button type="button" onClick={() => removeButton(idx)} className="absolute top-2 right-2 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                              <div className="grid grid-cols-2 gap-2">
                                <Select value={btn.type} onValueChange={(v) => updateButton(idx, "type", v)}>
                                  <SelectTrigger className="h-8 text-[11px]"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="quick_reply">Quick Reply</SelectItem>
                                    <SelectItem value="url">Link Website</SelectItem>
                                    <SelectItem value="call">Panggilan Telepon</SelectItem>
                                  </SelectContent>
                                </Select>
                                <Input placeholder="Label Tombol" value={btn.title} onChange={(e) => updateButton(idx, "title", e.target.value)} className="h-8 text-[11px]" />
                              </div>
                              {btn.type !== "quick_reply" && (
                                <Input
                                  placeholder={btn.type === "url" ? "https://wa.me/..." : "Nomor Telepon (628...)"}
                                  value={btn.value}
                                  onChange={(e) => updateButton(idx, "value", e.target.value)}
                                  className="h-8 text-[11px]"
                                />
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm font-medium flex items-center gap-1.5">
                          <MessageSquare className="w-4 h-4 text-muted-foreground" />
                          {messageType === "button" ? "Body Pesan" : "Isi Pesan"}
                        </Label>
                        <span className="text-[10px] text-muted-foreground uppercase tracking-widest">{message.length} chars</span>
                      </div>
                      <Textarea placeholder="Halo {nama}! Ada promo spesial..." rows={5} value={message}
                        onChange={(e) => setMessage(e.target.value)} className="resize-none leading-relaxed text-sm" />
                      <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <Sparkles className="w-3 h-3 text-primary" />
                        Gunakan <code className="bg-primary/5 text-primary px-1 rounded">{"{nama}"}</code> untuk personalisasi
                      </p>
                    </div>

                    {messageType === "text" && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs font-semibold flex items-center gap-1.5 uppercase tracking-wider text-muted-foreground">
                            <Image className="w-3.5 h-3.5" /> Lampiran Media
                          </Label>
                          <Button type="button" variant="ghost" size="sm" className="h-7 text-[10px] gap-1 uppercase tracking-wider"
                            onClick={() => setShowMedia((v) => !v)}>
                            {showMedia ? <><X className="w-3 h-3" /> Tutup</> : <><Link2 className="w-3 h-3" /> Tambah URL</>}
                          </Button>
                        </div>
                        {showMedia && (
                          <div className="grid grid-cols-4 gap-2">
                            <div className="col-span-3">
                              <Input placeholder="https://..." value={mediaUrl}
                                onChange={(e) => setMediaUrl(e.target.value)} className="h-8 text-xs" />
                            </div>
                            <Select value={mediaType} onValueChange={setMediaType}>
                              <SelectTrigger className="h-8 text-[10px] uppercase"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="image">Gambar</SelectItem>
                                <SelectItem value="video">Video</SelectItem>
                                <SelectItem value="audio">Audio</SelectItem>
                                <SelectItem value="document">File</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Schedule */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-medium flex items-center gap-1.5">
                        <Calendar className="w-4 h-4 text-muted-foreground" /> Jadwalkan Pengiriman
                        <span className="text-muted-foreground font-normal">(opsional)</span>
                      </Label>
                      <Button type="button" variant="ghost" size="sm" className="h-7 text-xs gap-1"
                        onClick={() => setUseSchedule((v) => !v)}>
                        {useSchedule ? <><X className="w-3 h-3" /> Kirim Sekarang</> : <><Clock className="w-3 h-3" /> Atur Jadwal</>}
                      </Button>
                    </div>
                    {useSchedule && (
                      <Input
                        type="datetime-local"
                        value={scheduledAt}
                        onChange={(e) => setScheduledAt(e.target.value)}
                        min={new Date(Date.now() + 60000).toISOString().slice(0, 16)}
                        className="h-9 text-sm"
                      />
                    )}
                  </div>

                  {/* Submit */}
                  <Button type="submit" className="w-full h-11 gap-2 text-white font-semibold"
                    style={totalCount > 0 ? { background: useSchedule ? "linear-gradient(135deg, hsl(220 63% 50%) 0%, hsl(220 63% 42%) 100%)" : "linear-gradient(135deg, hsl(145 63% 44%) 0%, hsl(145 63% 38%) 100%)" } : {}}
                    disabled={sendBulk.isPending || !totalCount || !deviceId || !message.trim() || (useSchedule && !scheduledAt)}>
                    {sendBulk.isPending
                      ? <><Loader2 className="w-4 h-4 animate-spin" /> Memproses...</>
                      : useSchedule
                      ? <><Calendar className="w-4 h-4" /> Jadwalkan ke {totalCount || "—"} Nomor</>
                      : <><Upload className="w-4 h-4" /> Kirim ke {totalCount || "—"} Nomor</>}
                  </Button>
                </CardContent>
              </Card>
            </form>
          </div>
        </TabsContent>

        {/* ── Riwayat tab ────────────────────────────────────────────── */}
        <TabsContent value="history" className="mt-5">
          {(jobs ?? []).some((j) => j.failedCount > 0 || j.failed > 0) && (
            <div className="mb-4 flex justify-end">
              <Button variant="outline" className="gap-2 text-orange-600 border-orange-300 hover:bg-orange-50 dark:hover:bg-orange-950/30"
                onClick={() => retryFailed.mutate()} disabled={retryFailed.isPending}>
                {retryFailed.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                Retry Semua Gagal
              </Button>
            </div>
          )}
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
            </div>
          ) : !jobs?.length ? (
            <Card className="border-dashed">
              <CardContent className="py-16 text-center">
                <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
                  <BarChart3 className="w-6 h-6 text-muted-foreground" />
                </div>
                <p className="font-medium text-sm mb-1">Belum ada riwayat pengiriman</p>
                <p className="text-muted-foreground text-xs mb-5">Buat pengiriman bulk pertama Anda</p>
                <Button variant="outline" size="sm" onClick={() => setTab("create")} className="gap-2">
                  <Send className="w-3.5 h-3.5" /> Buat Pengiriman
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3 max-w-3xl">
              {jobs.map((job) => {
                const total = job.totalRecipients || job.total || 0;
                const sent = job.sentCount || job.sent || 0;
                const failed = job.failedCount || job.failed || 0;
                const progress = total > 0 ? Math.round(((sent + failed) / total) * 100) : 0;
                return (
                  <Card key={job.id} className="hover:shadow-sm transition-shadow border-border/60">
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between mb-3 gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                            style={{ backgroundColor: "hsl(145 63% 49% / 0.1)" }}>
                            <MessageSquare className="w-4 h-4" style={{ color: "hsl(145 63% 42%)" }} />
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-sm truncate">{job.name || `Job #${job.id}`}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <p className="text-xs text-muted-foreground">
                                {job.createdAt ? format(new Date(job.createdAt), "dd MMM yyyy, HH:mm") : ""}
                              </p>
                              {job.mediaUrl && <MediaTypeIcon type={job.mediaType} />}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {statusBadge(job.status, job.scheduledAt)}
                          {job.status === "running" && (
                            <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive hover:text-destructive gap-1"
                              onClick={() => cancelJob.mutate(job.id)}>
                              <X className="w-3 h-3" /> Batal
                            </Button>
                          )}
                        </div>
                      </div>

                      {job.status === "running" && (
                        <div className="mb-3">
                          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
                            <span>Progress</span>
                            <span>{progress}%</span>
                          </div>
                          <Progress value={progress} className="h-1.5" />
                        </div>
                      )}

                      <div className="flex items-center gap-5 text-xs">
                        <span className="flex items-center gap-1.5 text-muted-foreground">
                          <MessageSquare className="w-3.5 h-3.5" />
                          Total: <strong className="text-foreground">{total}</strong>
                        </span>
                        <span className="flex items-center gap-1.5 text-green-600">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Terkirim: <strong>{sent}</strong>
                        </span>
                        <span className="flex items-center gap-1.5 text-destructive">
                          <XCircle className="w-3.5 h-3.5" />
                          Gagal: <strong>{failed}</strong>
                        </span>
                        <div className="ml-auto flex items-center gap-2">
                          {total > 0 && (
                            <span className="text-muted-foreground">Sukses: {Math.round((sent / total) * 100)}%</span>
                          )}
                          <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
                            onClick={() => setDetailJob(job)}>
                            <Eye className="w-3 h-3" /> Lihat Detail
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 text-muted-foreground"
                            onClick={() => downloadReport(job.id)}>
                            <Download className="w-3 h-3" /> CSV
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ── Detail Modal ──────────────────────────────────────────── */}
      <Dialog open={!!detailJob} onOpenChange={(v) => !v && setDetailJob(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              Laporan: {detailJob?.name || `Job #${detailJob?.id}`}
            </DialogTitle>
          </DialogHeader>
          {reportLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : report ? (
            <div className="flex flex-col gap-4 overflow-hidden">
              {/* Ringkasan */}
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl border p-3 text-center">
                  <div className="text-2xl font-bold">{report.total}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">Total</div>
                </div>
                <div className="rounded-xl border p-3 text-center bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-900">
                  <div className="text-2xl font-bold text-green-600">{report.sent}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">Terkirim</div>
                </div>
                <div className="rounded-xl border p-3 text-center bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900">
                  <div className="text-2xl font-bold text-red-500">{report.failed}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">Gagal</div>
                </div>
              </div>
              {/* Actions */}
              <div className="flex justify-between items-center gap-2">
                {report.failed > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 text-orange-600 border-orange-300 hover:bg-orange-50 dark:hover:bg-orange-900/20"
                    onClick={() => retryJobFailed.mutate(Number(detailJob!.id))}
                    disabled={retryJobFailed.isPending}
                  >
                    {retryJobFailed.isPending
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <RefreshCw className="w-3.5 h-3.5" />}
                    Retry {report.failed} Gagal
                  </Button>
                )}
                <Button size="sm" variant="outline" className="gap-1.5 ml-auto" onClick={() => downloadReport(detailJob!.id)}>
                  <Download className="w-3.5 h-3.5" /> Download CSV
                </Button>
              </div>
              {/* Table */}
              <div className="overflow-y-auto flex-1 border rounded-xl">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm">
                    <tr>
                      <th className="text-left px-4 py-2.5 font-medium text-xs text-muted-foreground">Nomor</th>
                      <th className="text-left px-4 py-2.5 font-medium text-xs text-muted-foreground">Status</th>
                      <th className="text-left px-4 py-2.5 font-medium text-xs text-muted-foreground">Waktu</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.messages.map((m, i) => (
                      <tr key={i} className="border-t border-border/50 hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-2.5 font-mono text-xs">{m.phone}</td>
                        <td className="px-4 py-2.5">
                          {m.status === "sent"
                            ? <span className="inline-flex items-center gap-1 text-green-600 text-xs"><CheckCircle2 className="w-3 h-3" /> Terkirim</span>
                            : <span className="inline-flex items-center gap-1 text-destructive text-xs"><XCircle className="w-3 h-3" /> Gagal</span>}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground">
                          {m.createdAt ? format(new Date(m.createdAt), "dd/MM/yyyy HH:mm:ss") : "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="py-8 text-center text-muted-foreground text-sm">Tidak ada data laporan</div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

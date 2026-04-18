import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Edit2, Loader2, Bot, Clock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

interface AutoReplyRule {
  id: string;
  keyword: string;
  matchType: string;
  reply: string;
  isActive: boolean;
  deviceId?: string;
  scheduleFrom?: string | null;
  scheduleTo?: string | null;
  timezone?: string;
  triggerCount?: number;
  mediaUrl?: string | null;
  mediaCaption?: string | null;
  messageType?: string;
  extra?: any;
}

const matchTypeLabels: Record<string, string> = {
  exact: "Sama persis",
  contains: "Mengandung",
  startsWith: "Diawali",
  endsWith: "Diakhiri",
};

const TIMEZONES = [
  "Asia/Jakarta", "Asia/Makassar", "Asia/Jayapura",
  "Asia/Singapore", "Asia/Kuala_Lumpur",
];

export default function AutoReply() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editItem, setEditItem] = useState<AutoReplyRule | null>(null);
  const [useSchedule, setUseSchedule] = useState(false);
  const [form, setForm] = useState<any>({
    keyword: "", matchType: "contains", reply: "", deviceId: "all",
    scheduleFrom: "08:00", scheduleTo: "17:00", timezone: "Asia/Jakarta",
    mediaUrl: "", mediaCaption: "", messageType: "text", extra: { buttons: [] },
  });

  const { data: rules, isLoading } = useQuery<AutoReplyRule[]>({
    queryKey: ["auto-replies"],
    queryFn: () => apiFetch("/autoreply").then((r) => r.json()),
  });

  const { data: devices } = useQuery({
    queryKey: ["devices"],
    queryFn: () => apiFetch("/devices").then((r) => r.json()),
  });

  const createRule = useMutation({
    mutationFn: (body: any) => apiFetch("/autoreply", { method: "POST", body: JSON.stringify(body) }).then((r) => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["auto-replies"] }); setOpen(false); resetForm(); toast({ title: "Aturan auto reply ditambahkan" }); },
    onError: () => toast({ title: "Gagal menambahkan aturan", variant: "destructive" }),
  });

  const updateRule = useMutation({
    mutationFn: ({ id, body }: { id: string; body: any }) => apiFetch(`/autoreply/${id}`, { method: "PUT", body: JSON.stringify(body) }).then((r) => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["auto-replies"] }); setOpen(false); setEditItem(null); resetForm(); toast({ title: "Aturan diperbarui" }); },
  });

  const toggleRule = useMutation({
    mutationFn: ({ id }: { id: string }) => apiFetch(`/autoreply/${id}/toggle`, { method: "POST" }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["auto-replies"] }),
  });

  const deleteRule = useMutation({
    mutationFn: (id: string) => apiFetch(`/autoreply/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["auto-replies"] }); toast({ title: "Aturan dihapus" }); },
  });

  function resetForm() {
    setForm({
      keyword: "", matchType: "contains", reply: "", deviceId: "all",
      scheduleFrom: "08:00", scheduleTo: "17:00", timezone: "Asia/Jakarta",
      mediaUrl: "", mediaCaption: "", messageType: "text", extra: { buttons: [] },
    });
    setUseSchedule(false);
  }

  function openEdit(rule: AutoReplyRule) {
    setEditItem(rule);
    setForm({
      keyword: rule.keyword, matchType: rule.matchType, reply: rule.reply,
      deviceId: rule.deviceId ?? "all",
      scheduleFrom: rule.scheduleFrom ?? "08:00",
      scheduleTo: rule.scheduleTo ?? "17:00",
      timezone: rule.timezone ?? "Asia/Jakarta",
      mediaUrl: rule.mediaUrl ?? "",
      mediaCaption: rule.mediaCaption ?? "",
      messageType: rule.messageType ?? "text",
      extra: rule.extra || { buttons: [] },
    });
    setUseSchedule(!!(rule.scheduleFrom && rule.scheduleTo));
    setOpen(true);
  }

  function handleSave() {
    const body = {
      ...form,
      deviceId: form.deviceId === "all" ? undefined : form.deviceId,
      scheduleFrom: useSchedule ? form.scheduleFrom : null,
      scheduleTo: useSchedule ? form.scheduleTo : null,
      timezone: form.timezone,
    };
    if (editItem) updateRule.mutate({ id: editItem.id, body });
    else createRule.mutate(body);
  }

  const isPending = createRule.isPending || updateRule.isPending;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Button onClick={() => { resetForm(); setEditItem(null); setOpen(true); }} className="gap-2">
          <Plus className="w-4 h-4" /> Tambah Aturan
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
      ) : !rules?.length ? (
        <Card>
          <CardContent className="py-16 flex flex-col items-center gap-4 text-center">
            <Bot className="w-12 h-12 text-muted-foreground/50" />
            <div>
              <p className="font-medium">Belum ada aturan auto reply</p>
              <p className="text-sm text-muted-foreground">Tambahkan kata kunci untuk membalas pesan secara otomatis</p>
            </div>
            <Button onClick={() => { resetForm(); setOpen(true); }} className="gap-2">
              <Plus className="w-4 h-4" /> Tambah Aturan
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {rules.map((rule) => (
            <Card key={rule.id}>
              <CardContent className="p-4 flex items-start gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <code className="text-sm font-mono bg-secondary px-2 py-0.5 rounded">{rule.keyword}</code>
                    <Badge variant="outline" className="text-xs">{matchTypeLabels[rule.matchType] ?? rule.matchType}</Badge>
                    {!rule.isActive && <Badge variant="secondary" className="text-xs">Nonaktif</Badge>}
                    {rule.scheduleFrom && rule.scheduleTo && (
                      <Badge variant="outline" className="text-xs gap-1 text-purple-600 border-purple-300 dark:border-purple-700">
                        <Clock className="w-2.5 h-2.5" />
                        {rule.scheduleFrom} – {rule.scheduleTo}
                      </Badge>
                    )}
                    {(rule.triggerCount ?? 0) > 0 && (
                      <span className="text-xs text-muted-foreground">{rule.triggerCount}× terpicu</span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground truncate">{rule.reply}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Switch checked={rule.isActive} onCheckedChange={() => toggleRule.mutate({ id: rule.id })} />
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(rule)}>
                    <Edit2 className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => deleteRule.mutate(rule.id)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setEditItem(null); resetForm(); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editItem ? "Edit Aturan" : "Tambah Aturan Auto Reply"}</DialogTitle>
          </DialogHeader>
          <div className="px-5 py-4 space-y-4 overflow-y-auto max-h-[75vh]">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Kata Kunci</Label>
                <Input placeholder="halo, order, info" value={form.keyword} onChange={(e) => setForm((f: any) => ({ ...f, keyword: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">Tipe Pencocokan</Label>
                <Select value={form.matchType} onValueChange={(v) => setForm((f: any) => ({ ...f, matchType: v }))}>
                  <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(matchTypeLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Tipe Pesan</Label>
                <Select value={form.messageType || "text"} onValueChange={(v) => setForm((f: any) => ({ ...f, messageType: v, extra: f.extra || {} }))}>
                  <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="text">Teks Biasa</SelectItem>
                    <SelectItem value="button">Pesan Tombol (Interactive)</SelectItem>
                    <SelectItem value="list">Pesan List (Menu)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">Perangkat (opsional)</Label>
                <Select value={form.deviceId} onValueChange={(v) => setForm((f: any) => ({ ...f, deviceId: v }))}>
                  <SelectTrigger className="h-10"><SelectValue placeholder="Semua" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua perangkat</SelectItem>
                    {(devices ?? []).map((d: any) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Separator />

            {/* Content Section */}
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Isi Pesan / Body</Label>
                <Textarea placeholder="Ketik pesan balasan di sini..." rows={3} value={form.reply} onChange={(e) => setForm((f: any) => ({ ...f, reply: e.target.value }))} className="resize-none" />
              </div>

              {form.messageType === "button" && (
                <div className="space-y-3 p-3 rounded-xl border bg-muted/20 border-border/50">
                  <div className="flex items-center justify-between mb-1">
                    <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Konfigurasi Tombol</Label>
                    <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => {
                      const buttons = [...(form.extra?.buttons || [])];
                      if (buttons.length < 3) {
                        buttons.push({ type: "quick_reply", title: "Tombol Baru", url: "", phoneNumber: "" });
                        setForm((f: any) => ({ ...f, extra: { ...f.extra, buttons } }));
                      }
                    }} disabled={(form.extra?.buttons || []).length >= 10}>
                      <Plus className="w-3.5 h-3.5" /> Tambah
                    </Button>
                  </div>

                  {(form.extra?.buttons || []).map((btn: any, idx: number) => (
                    <div key={idx} className="space-y-2 p-2.5 rounded-lg bg-background border shadow-sm relative group">
                      <div className="grid grid-cols-2 gap-2">
                        <Select value={btn.type || "quick_reply"} onValueChange={(v) => {
                          const buttons = [...form.extra.buttons];
                          buttons[idx] = { ...buttons[idx], type: v };
                          setForm((f: any) => ({ ...f, extra: { ...f.extra, buttons } }));
                        }}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="quick_reply">Quick Reply</SelectItem>
                            <SelectItem value="url">Link Website (URL)</SelectItem>
                            <SelectItem value="call">Telepon (Call)</SelectItem>
                          </SelectContent>
                        </Select>
                        <Input placeholder="Teks Tombol" className="h-8 text-xs" value={btn.title || btn.displayText || ""}
                          onChange={(e) => {
                            const buttons = [...form.extra.buttons];
                            buttons[idx] = { ...buttons[idx], title: e.target.value, displayText: e.target.value };
                            setForm((f: any) => ({ ...f, extra: { ...f.extra, buttons } }));
                          }} />
                      </div>
                      {btn.type === "url" && (
                        <Input placeholder="https://..." className="h-8 text-xs" value={btn.url}
                          onChange={(e) => {
                            const buttons = [...form.extra.buttons];
                            buttons[idx] = { ...buttons[idx], url: e.target.value };
                            setForm((f: any) => ({ ...f, extra: { ...f.extra, buttons } }));
                          }} />
                      )}
                      {btn.type === "call" && (
                        <Input placeholder="6281xxx" className="h-8 text-xs" value={btn.phoneNumber || btn.phone}
                          onChange={(e) => {
                            const buttons = [...form.extra.buttons];
                            buttons[idx] = { ...buttons[idx], phoneNumber: e.target.value, phone: e.target.value };
                            setForm((f: any) => ({ ...f, extra: { ...f.extra, buttons } }));
                          }} />
                      )}
                      <button className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-destructive text-destructive-foreground opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                        onClick={() => {
                          const buttons = form.extra.buttons.filter((_: any, i: number) => i !== idx);
                          setForm((f: any) => ({ ...f, extra: { ...f.extra, buttons } }));
                        }}>
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[10px] uppercase text-muted-foreground ml-1">Header (Atas)</Label>
                      <Input placeholder="Teks Header" className="h-8 text-xs" value={form.extra?.headerText || ""}
                        onChange={(e) => setForm((f: any) => ({ ...f, extra: { ...f.extra, headerText: e.target.value } }))} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] uppercase text-muted-foreground ml-1">Footer (Bawah)</Label>
                      <Input placeholder="Teks Footer" className="h-8 text-xs" value={form.extra?.footer || ""}
                        onChange={(e) => setForm((f: any) => ({ ...f, extra: { ...f.extra, footer: e.target.value } }))} />
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label className="text-sm font-medium">Media Attachment <span className="text-muted-foreground font-normal">(Opsional)</span></Label>
                <div className="relative">
                  <Input placeholder="https://example.com/image.jpg atau header URL" value={form.mediaUrl} onChange={(e) => setForm((f: any) => ({ ...f, mediaUrl: e.target.value }))} className="h-10 pr-10" />
                  {form.mediaUrl && (
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded flex items-center justify-center bg-green-500/10">
                      <img src={form.mediaUrl} className="w-4 h-4 object-cover rounded" onError={(e) => (e.currentTarget.style.display = "none")} />
                    </div>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground">Jika Pesan Tombol aktif, media ini akan jadi Banner utama.</p>
              </div>
            </div>

            <Separator />

            {/* Schedule section */}
            <div className={`p-4 rounded-xl border transition-colors ${useSchedule ? "border-purple-200 bg-purple-50/20 dark:border-purple-900/40 dark:bg-purple-950/10" : "bg-muted/10 border-border/50"}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${useSchedule ? "bg-purple-500/10 text-purple-600" : "bg-muted text-muted-foreground"}`}>
                    <Clock className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold leading-tight">Jadwal Aktif</p>
                    <p className="text-[10px] text-muted-foreground">Aktif hanya pada jam operasional tertentu</p>
                  </div>
                </div>
                <Switch checked={useSchedule} onCheckedChange={setUseSchedule} />
              </div>
              {useSchedule && (
                <div className="grid grid-cols-3 gap-3 mt-4 animate-in fade-in slide-in-from-top-2 duration-300">
                  <div className="space-y-1">
                    <Label className="text-[10px] uppercase text-muted-foreground ml-1">Dari Jam</Label>
                    <Input type="time" value={form.scheduleFrom} onChange={(e) => setForm((f: any) => ({ ...f, scheduleFrom: e.target.value }))} className="h-9 text-sm" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] uppercase text-muted-foreground ml-1">Sampai Jam</Label>
                    <Input type="time" value={form.scheduleTo} onChange={(e) => setForm((f: any) => ({ ...f, scheduleTo: e.target.value }))} className="h-9 text-sm" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] uppercase text-muted-foreground ml-1">Zona Waktu</Label>
                    <Select value={form.timezone} onValueChange={(v) => setForm((f: any) => ({ ...f, timezone: v }))}>
                      <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {TIMEZONES.map((tz) => <SelectItem key={tz} value={tz} className="text-xs">{tz.replace("Asia/", "").replace("_", " ")}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </div>
          </div>
          <DialogFooter className="px-5 py-4 border-t bg-muted/20">
            <Button variant="outline" onClick={() => setOpen(false)}>Batal</Button>
            <Button
              onClick={handleSave}
              disabled={!form.keyword || !form.reply || isPending}
              className="px-8 text-white"
              style={{ background: "linear-gradient(135deg, hsl(145 63% 44%) 0%, hsl(145 63% 38%) 100%)" }}
            >
              {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editItem ? "Simpan Perubahan" : "Terbitkan Aturan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

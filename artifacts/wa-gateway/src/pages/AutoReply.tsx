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
  const [form, setForm] = useState({
    keyword: "", matchType: "contains", reply: "", deviceId: "all",
    scheduleFrom: "08:00", scheduleTo: "17:00", timezone: "Asia/Jakarta",
    mediaUrl: "", mediaCaption: "",
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
    setForm({ keyword: "", matchType: "contains", reply: "", deviceId: "all", scheduleFrom: "08:00", scheduleTo: "17:00", timezone: "Asia/Jakarta", mediaUrl: "", mediaCaption: "" });
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
      mediaUrl: rule.mediaUrl ?? "", mediaCaption: rule.mediaCaption ?? "",
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
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Kata Kunci</Label>
                <Input placeholder="halo, order, info" value={form.keyword} onChange={(e) => setForm((f) => ({ ...f, keyword: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Tipe Pencocokan</Label>
                <Select value={form.matchType} onValueChange={(v) => setForm((f) => ({ ...f, matchType: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(matchTypeLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Perangkat (opsional)</Label>
              <Select value={form.deviceId} onValueChange={(v) => setForm((f) => ({ ...f, deviceId: v }))}>
                <SelectTrigger><SelectValue placeholder="Semua perangkat" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua perangkat</SelectItem>
                  {(devices ?? []).map((d: any) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Balasan</Label>
              <Textarea placeholder="Halo! Terima kasih sudah menghubungi kami..." rows={3} value={form.reply} onChange={(e) => setForm((f) => ({ ...f, reply: e.target.value }))} />
            </div>

            <div className="space-y-2">
              <Label className="text-sm">URL Gambar / Dokumen <span className="text-muted-foreground font-normal">(opsional)</span></Label>
              <Input placeholder="https://example.com/gambar.jpg atau link dokumen" value={form.mediaUrl} onChange={(e) => setForm((f) => ({ ...f, mediaUrl: e.target.value }))} />
              <p className="text-xs text-muted-foreground">Bot akan mengirim media ini bersama balasan teks</p>
            </div>
            {form.mediaUrl && (
              <div className="space-y-2">
                <Label className="text-sm">Caption Media <span className="text-muted-foreground font-normal">(opsional)</span></Label>
                <Input placeholder="Caption untuk media..." value={form.mediaCaption} onChange={(e) => setForm((f) => ({ ...f, mediaCaption: e.target.value }))} />
              </div>
            )}

            {/* Schedule section */}
            <div className="border rounded-lg p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium flex items-center gap-1.5"><Clock className="w-3.5 h-3.5 text-purple-500" />Jadwal Aktif</p>
                  <p className="text-xs text-muted-foreground">Aturan hanya aktif dalam rentang jam tertentu</p>
                </div>
                <Switch checked={useSchedule} onCheckedChange={setUseSchedule} />
              </div>
              {useSchedule && (
                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Dari</Label>
                    <Input type="time" value={form.scheduleFrom} onChange={(e) => setForm((f) => ({ ...f, scheduleFrom: e.target.value }))} className="h-8 text-sm" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Sampai</Label>
                    <Input type="time" value={form.scheduleTo} onChange={(e) => setForm((f) => ({ ...f, scheduleTo: e.target.value }))} className="h-8 text-sm" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Zona Waktu</Label>
                    <Select value={form.timezone} onValueChange={(v) => setForm((f) => ({ ...f, timezone: v }))}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {TIMEZONES.map((tz) => <SelectItem key={tz} value={tz} className="text-xs">{tz.replace("Asia/", "")}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Batal</Button>
            <Button onClick={handleSave} disabled={!form.keyword || !form.reply || isPending}>
              {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editItem ? "Simpan Perubahan" : "Tambahkan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

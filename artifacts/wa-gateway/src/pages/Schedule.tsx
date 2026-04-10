import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Calendar, Clock, Plus, Trash2, Loader2, RefreshCw,
  CheckCircle2, XCircle, Timer, Send, Users, Phone, X,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { ContactPicker, type PickedContact } from "@/components/ContactPicker";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";

interface ScheduledMessage {
  id: string;
  deviceId: string;
  phone: string;
  message: string;
  messageType: string;
  scheduledAt: string;
  status: "pending" | "sent" | "failed" | "cancelled";
  repeat: string;
  sentAt: string | null;
  createdAt: string;
}

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: React.ReactNode; color: string }> = {
  pending:   { label: "Menunggu",   variant: "outline",      icon: <Timer className="w-3 h-3" />,       color: "text-yellow-600" },
  sent:      { label: "Terkirim",   variant: "default",      icon: <CheckCircle2 className="w-3 h-3" />, color: "text-green-600" },
  failed:    { label: "Gagal",      variant: "destructive",  icon: <XCircle className="w-3 h-3" />,     color: "text-red-600" },
  cancelled: { label: "Dibatalkan", variant: "secondary",    icon: <XCircle className="w-3 h-3" />,     color: "text-muted-foreground" },
};

const repeatLabels: Record<string, string> = {
  none:    "Sekali",
  daily:   "Setiap Hari",
  weekly:  "Setiap Minggu",
  monthly: "Setiap Bulan",
};

const messageTypeLabels: Record<string, string> = {
  text:     "Teks",
  button:   "Tombol",
  list:     "List",
  media:    "Media",
  poll:     "Polling",
  template: "Template",
};

export default function Schedule() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState("all");
  const [pickedContact, setPickedContact] = useState<PickedContact | null>(null);
  const [form, setForm] = useState({
    deviceId: "",
    phone: "",
    message: "",
    messageType: "text",
    scheduledAt: "",
    repeat: "none",
  });

  const { data: messages, isLoading } = useQuery<ScheduledMessage[]>({
    queryKey: ["schedule"],
    queryFn: () => apiFetch("/schedule").then((r) => r.json()),
    refetchInterval: 30000,
  });

  const { data: devices } = useQuery({
    queryKey: ["devices"],
    queryFn: () => apiFetch("/devices").then((r) => r.json()),
  });

  const createSchedule = useMutation({
    mutationFn: (body: any) => apiFetch("/schedule", { method: "POST", body: JSON.stringify(body) }).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["schedule"] });
      setOpen(false);
      resetForm();
      toast({ title: "Pesan dijadwalkan!" });
    },
    onError: () => toast({ title: "Gagal menjadwalkan pesan", variant: "destructive" }),
  });

  const cancelSchedule = useMutation({
    mutationFn: (id: string) => apiFetch(`/schedule/${id}/cancel`, { method: "POST", body: "{}" }).then((r) => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["schedule"] }); toast({ title: "Jadwal dibatalkan" }); },
  });

  const deleteSchedule = useMutation({
    mutationFn: (id: string) => apiFetch(`/schedule/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["schedule"] }); toast({ title: "Jadwal dihapus" }); },
  });

  function resetForm() {
    setForm({ deviceId: "", phone: "", message: "", messageType: "text", scheduledAt: "", repeat: "none" });
    setPickedContact(null);
  }

  function handleContactPicked(contacts: PickedContact[]) {
    if (contacts.length > 0) {
      const c = contacts[0];
      setPickedContact(c);
      setForm((f) => ({ ...f, phone: c.phone }));
    }
  }

  function clearContact() {
    setPickedContact(null);
    setForm((f) => ({ ...f, phone: "" }));
  }

  function handleSave() {
    if (!form.deviceId || !form.phone || !form.message || !form.scheduledAt) {
      toast({ title: "Lengkapi semua field", variant: "destructive" }); return;
    }
    createSchedule.mutate(form);
  }

  const filtered = (messages ?? []).filter((m) => tab === "all" || m.status === tab);
  const connectedDevices = (devices ?? []).filter((d: any) => d.status === "connected");
  const now = new Date();
  const minDateTime = new Date(now.getTime() + 60000).toISOString().slice(0, 16);

  const stats = {
    pending:  (messages ?? []).filter((m) => m.status === "pending").length,
    sent:     (messages ?? []).filter((m) => m.status === "sent").length,
    failed:   (messages ?? []).filter((m) => m.status === "failed").length,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Button onClick={() => setOpen(true)} className="gap-2 text-white"
          style={{ background: "linear-gradient(135deg, hsl(145 63% 44%) 0%, hsl(145 63% 38%) 100%)" }}>
          <Plus className="w-4 h-4" /> Jadwalkan Pesan
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Menunggu", value: stats.pending, icon: Timer, color: "text-yellow-600", bg: "bg-yellow-50 dark:bg-yellow-950/30", border: "border-yellow-200 dark:border-yellow-900" },
          { label: "Terkirim", value: stats.sent,    icon: CheckCircle2, color: "text-green-600", bg: "bg-green-50 dark:bg-green-950/30", border: "border-green-200 dark:border-green-900" },
          { label: "Gagal",    value: stats.failed,  icon: XCircle, color: "text-red-600", bg: "bg-red-50 dark:bg-red-950/30", border: "border-red-200 dark:border-red-900" },
        ].map((s) => (
          <Card key={s.label} className={`border ${s.border}`}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${s.bg}`}>
                <s.icon className={`w-5 h-5 ${s.color}`} />
              </div>
              <div>
                <p className="text-2xl font-bold leading-tight">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="all">Semua ({(messages ?? []).length})</TabsTrigger>
          <TabsTrigger value="pending">Menunggu</TabsTrigger>
          <TabsTrigger value="sent">Terkirim</TabsTrigger>
          <TabsTrigger value="failed">Gagal</TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="mt-4">
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full" />)}
            </div>
          ) : !filtered.length ? (
            <Card className="border-dashed">
              <CardContent className="p-12 text-center">
                <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
                  <Calendar className="w-7 h-7 text-muted-foreground" />
                </div>
                <p className="font-medium text-sm mb-1">Belum ada pesan terjadwal</p>
                <p className="text-xs text-muted-foreground mb-4">Jadwalkan pesan pertama Anda sekarang</p>
                <Button variant="outline" size="sm" className="gap-2" onClick={() => setOpen(true)}>
                  <Plus className="w-4 h-4" /> Jadwalkan Sekarang
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {filtered.map((msg) => {
                const sc = statusConfig[msg.status] ?? statusConfig.pending;
                const scheduledDate = new Date(msg.scheduledAt);
                return (
                  <Card key={msg.id} className="hover:shadow-sm transition-shadow border-border/60">
                    <CardContent className="p-4">
                      <div className="flex items-start gap-4">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                          style={{ backgroundColor: "hsl(145 63% 49% / 0.1)" }}>
                          <Send className="w-4 h-4" style={{ color: "hsl(145 63% 42%)" }} />
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="font-semibold text-sm font-mono">{msg.phone}</span>
                            <Badge variant={sc.variant} className="text-xs flex items-center gap-1">
                              {sc.icon} {sc.label}
                            </Badge>
                            <Badge variant="outline" className="text-xs">{messageTypeLabels[msg.messageType] ?? msg.messageType}</Badge>
                            {msg.repeat !== "none" && (
                              <Badge variant="secondary" className="text-xs flex items-center gap-1">
                                <RefreshCw className="w-3 h-3" /> {repeatLabels[msg.repeat]}
                              </Badge>
                            )}
                          </div>

                          <p className="text-sm text-muted-foreground line-clamp-2 mb-2">{msg.message}</p>

                          <div className="flex items-center gap-4 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {format(scheduledDate, "dd MMM yyyy, HH:mm", { locale: idLocale })}
                            </span>
                            {msg.sentAt && (
                              <span className="flex items-center gap-1 text-green-600">
                                <CheckCircle2 className="w-3 h-3" />
                                Terkirim {format(new Date(msg.sentAt), "dd MMM, HH:mm", { locale: idLocale })}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {msg.status === "pending" && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-xs h-8"
                              onClick={() => cancelSchedule.mutate(msg.id)}
                              disabled={cancelSchedule.isPending}
                            >
                              Batalkan
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            onClick={() => deleteSchedule.mutate(msg.id)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
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

      {/* ── Create dialog ──────────────────────────────────────────── */}
      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
        <DialogContent className="max-w-md p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-5 pt-5 pb-4 border-b border-border"
            style={{ background: "linear-gradient(135deg, hsl(145 63% 49% / 0.05) 0%, transparent 70%)" }}>
            <DialogTitle className="flex items-center gap-2.5 text-base">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: "hsl(145 63% 49% / 0.12)" }}>
                <Calendar className="w-3.5 h-3.5" style={{ color: "hsl(145 63% 42%)" }} />
              </div>
              Jadwalkan Pesan
            </DialogTitle>
          </DialogHeader>

          <div className="px-5 py-4 space-y-4 overflow-y-auto max-h-[70vh]">
            {/* Device */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Perangkat WhatsApp</Label>
              <Select value={form.deviceId} onValueChange={(v) => setForm((f) => ({ ...f, deviceId: v }))}>
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Pilih perangkat" />
                </SelectTrigger>
                <SelectContent>
                  {!connectedDevices.length ? (
                    <SelectItem value="_none" disabled>Tidak ada perangkat terhubung</SelectItem>
                  ) : connectedDevices.map((d: any) => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Separator />

            {/* Phone / Contact picker */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Nomor Tujuan</Label>
                <ContactPicker
                  mode="single"
                  selected={pickedContact ? [pickedContact] : []}
                  onSelect={handleContactPicked}
                  trigger={
                    <Button type="button" variant="outline" size="sm" className="h-7 gap-1.5 text-xs">
                      <Users className="w-3.5 h-3.5" />
                      Pilih Kontak
                    </Button>
                  }
                />
              </div>

              {/* Selected contact chip */}
              {pickedContact ? (
                <div className="flex items-center gap-2 p-2.5 rounded-xl border"
                  style={{ backgroundColor: "hsl(145 63% 49% / 0.06)", borderColor: "hsl(145 63% 49% / 0.25)" }}>
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                    style={{ backgroundColor: "hsl(145 63% 49% / 0.15)" }}>
                    <Users className="w-3.5 h-3.5" style={{ color: "hsl(145 63% 42%)" }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold leading-tight">{pickedContact.name}</p>
                    <p className="text-xs font-mono text-muted-foreground">{pickedContact.phone}</p>
                  </div>
                  <button type="button" onClick={clearContact}
                    className="w-6 h-6 rounded-full hover:bg-muted flex items-center justify-center shrink-0 transition-colors">
                    <X className="w-3.5 h-3.5 text-muted-foreground" />
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="628123456789"
                    value={form.phone}
                    onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                    className="pl-10 h-10 font-mono"
                  />
                </div>
              )}
              <p className="text-xs text-muted-foreground">Gunakan tombol "Pilih Kontak" atau ketik nomor manual (format: 628xxx)</p>
            </div>

            <Separator />

            {/* Type + repeat */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Jenis Pesan</Label>
                <Select value={form.messageType} onValueChange={(v) => setForm((f) => ({ ...f, messageType: v }))}>
                  <SelectTrigger className="h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(messageTypeLabels).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Pengulangan</Label>
                <Select value={form.repeat} onValueChange={(v) => setForm((f) => ({ ...f, repeat: v }))}>
                  <SelectTrigger className="h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(repeatLabels).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Scheduled time */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-muted-foreground" /> Waktu Pengiriman
              </Label>
              <Input
                type="datetime-local"
                min={minDateTime}
                value={form.scheduledAt}
                onChange={(e) => setForm((f) => ({ ...f, scheduledAt: e.target.value }))}
                className="h-10"
              />
            </div>

            {/* Message */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Pesan</Label>
                <span className="text-xs text-muted-foreground">{form.message.length} karakter</span>
              </div>
              <Textarea
                placeholder="Ketik pesan di sini..."
                rows={4}
                value={form.message}
                onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
                className="resize-none"
              />
            </div>
          </div>

          <DialogFooter className="px-5 py-3 border-t border-border bg-muted/20">
            <Button variant="outline" onClick={() => setOpen(false)}>Batal</Button>
            <Button
              onClick={handleSave}
              disabled={createSchedule.isPending}
              className="gap-2 text-white"
              style={{ backgroundColor: "hsl(145 63% 45%)" }}
            >
              {createSchedule.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              <Calendar className="w-4 h-4" />
              Jadwalkan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

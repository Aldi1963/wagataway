import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Webhook as WebhookIcon, Plus, Trash2, Loader2, Copy, Play, CheckCircle2, XCircle, Bell } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface WebhookItem {
  id: string;
  deviceId: string | null;
  name: string;
  url: string;
  events: string[];
  secret: string | null;
  isActive: boolean;
  lastTriggered: string | null;
  triggerCount: number;
  createdAt: string;
}

const EVENTS = [
  { id: "message.received", label: "Pesan Masuk", desc: "Saat ada pesan WhatsApp masuk" },
  { id: "message.sent", label: "Pesan Terkirim", desc: "Saat pesan berhasil dikirim" },
  { id: "message.failed", label: "Pesan Gagal", desc: "Saat pesan gagal dikirim" },
  { id: "device.connected", label: "Perangkat Terhubung", desc: "Saat perangkat berhasil terhubung" },
  { id: "device.disconnected", label: "Perangkat Terputus", desc: "Saat perangkat terputus" },
  { id: "contact.added", label: "Kontak Ditambahkan", desc: "Saat ada kontak baru" },
];

export default function Webhook() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", url: "", deviceId: "", events: ["message.received"] as string[] });
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; message: string }>>({});

  const { data: webhooks, isLoading } = useQuery<WebhookItem[]>({
    queryKey: ["webhooks"],
    queryFn: () => apiFetch("/webhooks").then((r) => r.json()),
  });

  const { data: devices } = useQuery({
    queryKey: ["devices"],
    queryFn: () => apiFetch("/devices").then((r) => r.json()),
  });

  const createWebhook = useMutation({
    mutationFn: (body: any) => apiFetch("/webhooks", { method: "POST", body: JSON.stringify(body) }).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["webhooks"] });
      setOpen(false);
      resetForm();
      toast({ title: "Webhook berhasil dibuat!" });
    },
    onError: () => toast({ title: "Gagal membuat webhook", variant: "destructive" }),
  });

  const toggleWebhook = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiFetch(`/webhooks/${id}`, { method: "PUT", body: JSON.stringify({ isActive }) }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["webhooks"] }),
  });

  const deleteWebhook = useMutation({
    mutationFn: (id: string) => apiFetch(`/webhooks/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["webhooks"] }); toast({ title: "Webhook dihapus" }); },
  });

  const testWebhook = useMutation({
    mutationFn: (id: string) => apiFetch(`/webhooks/${id}/test`, { method: "POST", body: "{}" }).then((r) => r.json()),
    onSuccess: (data, id) => {
      setTestResults((prev) => ({ ...prev, [id]: { success: data.success, message: data.message } }));
      setTimeout(() => setTestResults((prev) => { const n = { ...prev }; delete n[id]; return n; }), 5000);
    },
    onError: (_err, id) => setTestResults((prev) => ({ ...prev, [id]: { success: false, message: "Gagal menghubungi endpoint" } })),
  });

  function resetForm() {
    setForm({ name: "", url: "", deviceId: "", events: ["message.received"] });
  }

  function toggleEvent(ev: string) {
    setForm((f) => ({
      ...f,
      events: f.events.includes(ev) ? f.events.filter((e) => e !== ev) : [...f.events, ev],
    }));
  }

  function copyUrl(url: string) {
    navigator.clipboard.writeText(url);
    toast({ title: "URL disalin!" });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Button onClick={() => setOpen(true)} className="gap-2">
          <Plus className="w-4 h-4" />
          Tambah Webhook
        </Button>
      </div>

      <Card className="bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
        <CardContent className="p-4 flex gap-3">
          <Bell className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-blue-700 dark:text-blue-400">Cara Kerja Webhook</p>
            <p className="text-blue-600 dark:text-blue-300 mt-1">WA Gateway akan mengirimkan HTTP POST request ke URL Anda setiap kali ada event terpilih. Pastikan server Anda mengembalikan HTTP 200.</p>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2].map((i) => <Skeleton key={i} className="h-32 w-full" />)}
        </div>
      ) : !webhooks?.length ? (
        <Card>
          <CardContent className="p-12 text-center">
            <WebhookIcon className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="font-medium">Belum ada webhook</p>
            <p className="text-sm text-muted-foreground mt-1">Tambahkan webhook untuk menerima notifikasi real-time</p>
            <Button variant="outline" className="mt-4 gap-2" onClick={() => setOpen(true)}>
              <Plus className="w-4 h-4" /> Tambah Webhook
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {webhooks.map((wh) => {
            const testResult = testResults[wh.id];
            return (
              <Card key={wh.id} className={!wh.isActive ? "opacity-60" : ""}>
                <CardContent className="p-5">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <WebhookIcon className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm">{wh.name}</span>
                        <Badge variant={wh.isActive ? "default" : "secondary"} className="text-xs">
                          {wh.isActive ? "Aktif" : "Nonaktif"}
                        </Badge>
                        {wh.deviceId ? (
                          <Badge variant="outline" className="text-xs">
                            {(devices ?? []).find((d: any) => d.id === wh.deviceId)?.name ?? `Device ${wh.deviceId}`}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs">Semua Perangkat</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1.5">
                        <code className="text-xs font-mono text-muted-foreground truncate flex-1">{wh.url}</code>
                        <Button variant="ghost" size="icon" className="h-5 w-5 flex-shrink-0" onClick={() => copyUrl(wh.url)}>
                          <Copy className="w-3 h-3" />
                        </Button>
                      </div>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {(wh.events ?? []).map((ev) => {
                          const evMeta = EVENTS.find((e) => e.id === ev);
                          return (
                            <Badge key={ev} variant="secondary" className="text-xs">{evMeta?.label ?? ev}</Badge>
                          );
                        })}
                      </div>
                      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                        <span>{wh.triggerCount} trigger</span>
                        {wh.lastTriggered && <span>Terakhir: {format(new Date(wh.lastTriggered), "dd MMM yyyy, HH:mm")}</span>}
                      </div>
                      {testResult && (
                        <div className={`flex items-center gap-1.5 mt-2 text-xs font-medium ${testResult.success ? "text-green-600" : "text-red-600"}`}>
                          {testResult.success ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                          {testResult.message}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Switch
                        checked={wh.isActive}
                        onCheckedChange={(v) => toggleWebhook.mutate({ id: wh.id, isActive: v })}
                      />
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        title="Test Webhook"
                        onClick={() => testWebhook.mutate(wh.id)}
                        disabled={testWebhook.isPending}
                      >
                        {testWebhook.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => deleteWebhook.mutate(wh.id)}
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

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <WebhookIcon className="w-4 h-4" /> Tambah Webhook
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Nama Webhook</Label>
              <Input
                placeholder="Contoh: Notifikasi CRM"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>URL Endpoint</Label>
              <Input
                placeholder="https://your-server.com/webhook"
                value={form.url}
                onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Perangkat (Opsional)</Label>
              <Select value={form.deviceId} onValueChange={(v) => setForm((f) => ({ ...f, deviceId: v === "_all" ? "" : v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Semua perangkat" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">Semua Perangkat</SelectItem>
                  {(devices ?? []).map((d: any) => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Events</Label>
              <div className="space-y-2 rounded-lg border p-3">
                {EVENTS.map((ev) => (
                  <div key={ev.id} className="flex items-start gap-3">
                    <Checkbox
                      id={ev.id}
                      checked={form.events.includes(ev.id)}
                      onCheckedChange={() => toggleEvent(ev.id)}
                    />
                    <div className="flex-1">
                      <label htmlFor={ev.id} className="text-sm font-medium cursor-pointer">{ev.label}</label>
                      <p className="text-xs text-muted-foreground">{ev.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Batal</Button>
            <Button onClick={() => createWebhook.mutate(form)} disabled={!form.name || !form.url || createWebhook.isPending} className="gap-2">
              {createWebhook.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

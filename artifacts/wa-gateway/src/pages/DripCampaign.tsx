import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Zap, Plus, Trash2, Edit2, Loader2, Users, Clock, Play,
  Pause, ChevronRight, ArrowDown, MessageSquare, X, UserPlus,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface Campaign {
  id: string;
  name: string;
  description?: string;
  status: string;
  deviceId: string;
  stepsCount: number;
  activeEnrollments: number;
  createdAt?: string;
}

interface Step {
  id: string;
  stepOrder: number;
  delayDays: number;
  message: string;
  mediaUrl?: string;
  mediaType?: string;
}

interface Enrollment {
  id: string;
  phone: string;
  contactName?: string;
  currentStep: number;
  status: string;
  nextSendAt?: string;
  enrolledAt?: string;
}

function statusBadge(status: string) {
  if (status === "active") return <Badge className="bg-green-500 hover:bg-green-600 text-white">Aktif</Badge>;
  if (status === "paused") return <Badge variant="secondary">Dijeda</Badge>;
  return <Badge variant="outline">{status}</Badge>;
}

export default function DripCampaign() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editCampaign, setEditCampaign] = useState<Campaign | null>(null);
  const [form, setForm] = useState({ name: "", description: "", deviceId: "", status: "active" });

  const [addStepOpen, setAddStepOpen] = useState(false);
  const [editStep, setEditStep] = useState<Step | null>(null);
  const [stepForm, setStepForm] = useState({ message: "", delayDays: 0, mediaUrl: "", mediaType: "image" });

  const [enrollOpen, setEnrollOpen] = useState(false);
  const [enrollNumbers, setEnrollNumbers] = useState("");

  const { data: devices } = useQuery({
    queryKey: ["devices"],
    queryFn: () => apiFetch("/devices").then((r) => r.json()),
  });

  const { data: campaigns, isLoading } = useQuery<Campaign[]>({
    queryKey: ["drip-campaigns"],
    queryFn: () => apiFetch("/drip").then((r) => r.json()),
  });

  const { data: steps, isLoading: stepsLoading } = useQuery<Step[]>({
    queryKey: ["drip-steps", selectedId],
    queryFn: () => apiFetch(`/drip/${selectedId}/steps`).then((r) => r.json()),
    enabled: !!selectedId,
  });

  const { data: enrollments } = useQuery<Enrollment[]>({
    queryKey: ["drip-enrollments", selectedId],
    queryFn: () => apiFetch(`/drip/${selectedId}/enrollments`).then((r) => r.json()),
    enabled: !!selectedId,
  });

  const selected = campaigns?.find((c) => c.id === selectedId) ?? null;

  const createCampaign = useMutation({
    mutationFn: (body: any) => apiFetch("/drip", { method: "POST", body: JSON.stringify(body) }).then((r) => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["drip-campaigns"] }); setCreateOpen(false); setEditCampaign(null); toast({ title: "Campaign dibuat" }); },
    onError: () => toast({ title: "Gagal membuat campaign", variant: "destructive" }),
  });

  const updateCampaign = useMutation({
    mutationFn: ({ id, body }: { id: string; body: any }) =>
      apiFetch(`/drip/${id}`, { method: "PUT", body: JSON.stringify(body) }).then((r) => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["drip-campaigns"] }); setCreateOpen(false); setEditCampaign(null); toast({ title: "Campaign diperbarui" }); },
    onError: () => toast({ title: "Gagal memperbarui campaign", variant: "destructive" }),
  });

  const deleteCampaign = useMutation({
    mutationFn: (id: string) => apiFetch(`/drip/${id}`, { method: "DELETE" }).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["drip-campaigns"] });
      setSelectedId(null);
      toast({ title: "Campaign dihapus" });
    },
    onError: () => toast({ title: "Gagal menghapus campaign", variant: "destructive" }),
  });

  const createStep = useMutation({
    mutationFn: (body: any) => apiFetch(`/drip/${selectedId}/steps`, { method: "POST", body: JSON.stringify(body) }).then((r) => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["drip-steps", selectedId] }); setAddStepOpen(false); setEditStep(null); toast({ title: "Langkah ditambahkan" }); },
    onError: () => toast({ title: "Gagal menambah langkah", variant: "destructive" }),
  });

  const updateStep = useMutation({
    mutationFn: ({ id, body }: { id: string; body: any }) =>
      apiFetch(`/drip/steps/${id}`, { method: "PUT", body: JSON.stringify(body) }).then((r) => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["drip-steps", selectedId] }); setAddStepOpen(false); setEditStep(null); toast({ title: "Langkah diperbarui" }); },
    onError: () => toast({ title: "Gagal memperbarui langkah", variant: "destructive" }),
  });

  const deleteStep = useMutation({
    mutationFn: (id: string) => apiFetch(`/drip/steps/${id}`, { method: "DELETE" }).then((r) => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["drip-steps", selectedId] }); toast({ title: "Langkah dihapus" }); },
    onError: () => toast({ title: "Gagal menghapus langkah", variant: "destructive" }),
  });

  const enrollContacts = useMutation({
    mutationFn: (contacts: { phone: string }[]) =>
      apiFetch(`/drip/${selectedId}/enroll`, { method: "POST", body: JSON.stringify({ contacts }) }).then((r) => r.json()),
    onSuccess: (d: any) => {
      qc.invalidateQueries({ queryKey: ["drip-enrollments", selectedId] });
      qc.invalidateQueries({ queryKey: ["drip-campaigns"] });
      setEnrollOpen(false); setEnrollNumbers("");
      toast({ title: `${d.enrolled} kontak terdaftar, ${d.skipped} dilewati` });
    },
    onError: () => toast({ title: "Gagal mendaftarkan kontak", variant: "destructive" }),
  });

  const unenroll = useMutation({
    mutationFn: (id: string) => apiFetch(`/drip/enrollments/${id}`, { method: "DELETE" }).then((r) => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["drip-enrollments", selectedId] }); toast({ title: "Enrollment dibatalkan" }); },
  });

  const connectedDevices = (devices ?? []).filter((d: any) => d.status === "connected");

  function openCreate() {
    setForm({ name: "", description: "", deviceId: connectedDevices[0]?.id ?? "", status: "active" });
    setEditCampaign(null);
    setCreateOpen(true);
  }

  function openEdit(c: Campaign) {
    setForm({ name: c.name, description: c.description ?? "", deviceId: c.deviceId, status: c.status });
    setEditCampaign(c);
    setCreateOpen(true);
  }

  function openAddStep() {
    setStepForm({ message: "", delayDays: (steps?.length ?? 0) === 0 ? 0 : 1, mediaUrl: "", mediaType: "image" });
    setEditStep(null);
    setAddStepOpen(true);
  }

  function openEditStep(s: Step) {
    setStepForm({ message: s.message, delayDays: s.delayDays, mediaUrl: s.mediaUrl ?? "", mediaType: s.mediaType ?? "image" });
    setEditStep(s);
    setAddStepOpen(true);
  }

  function handleSaveCampaign() {
    const body = { name: form.name, description: form.description || undefined, deviceId: form.deviceId, status: form.status };
    if (editCampaign) updateCampaign.mutate({ id: editCampaign.id, body });
    else createCampaign.mutate(body);
  }

  function handleSaveStep() {
    const body = {
      message: stepForm.message,
      delayDays: Number(stepForm.delayDays),
      stepOrder: editStep ? editStep.stepOrder : (steps?.length ?? 0),
      mediaUrl: stepForm.mediaUrl || undefined,
      mediaType: stepForm.mediaUrl ? stepForm.mediaType : undefined,
    };
    if (editStep) updateStep.mutate({ id: editStep.id, body });
    else createStep.mutate(body);
  }

  function handleEnroll() {
    const phones = enrollNumbers.split(/[\n,]/).map((p) => p.trim()).filter(Boolean).map((p) => ({ phone: p }));
    if (!phones.length) { toast({ title: "Masukkan minimal satu nomor", variant: "destructive" }); return; }
    enrollContacts.mutate(phones);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end">
        <Button onClick={openCreate} className="gap-2"><Plus className="w-4 h-4" /> Buat Campaign</Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* ── Campaign list ─────────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-3">
          {isLoading ? (
            Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)
          ) : !campaigns?.length ? (
            <Card className="border-dashed">
              <CardContent className="py-12 text-center">
                <Zap className="w-8 h-8 text-muted-foreground/50 mx-auto mb-3" />
                <p className="font-medium text-sm mb-1">Belum ada campaign</p>
                <p className="text-xs text-muted-foreground mb-4">Buat campaign drip pertama Anda</p>
                <Button size="sm" onClick={openCreate} className="gap-1.5"><Plus className="w-3.5 h-3.5" /> Buat Campaign</Button>
              </CardContent>
            </Card>
          ) : (
            campaigns.map((c) => (
              <Card
                key={c.id}
                className={`cursor-pointer hover:shadow-sm transition-all border-border/60 ${selectedId === c.id ? "ring-2 ring-primary" : ""}`}
                onClick={() => setSelectedId(c.id)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                        style={{ backgroundColor: "hsl(145 63% 49% / 0.1)" }}>
                        <Zap className="w-4 h-4" style={{ color: "hsl(145 63% 42%)" }} />
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-sm truncate">{c.name}</p>
                        {c.description && <p className="text-xs text-muted-foreground truncate">{c.description}</p>}
                      </div>
                    </div>
                    {statusBadge(c.status)}
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><MessageSquare className="w-3 h-3" /> {c.stepsCount} langkah</span>
                    <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {c.activeEnrollments} aktif</span>
                  </div>
                  <div className="flex justify-end gap-1 mt-2">
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={(e) => { e.stopPropagation(); openEdit(c); }}><Edit2 className="w-3.5 h-3.5" /></Button>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={(e) => { e.stopPropagation(); deleteCampaign.mutate(c.id); }}><Trash2 className="w-3.5 h-3.5" /></Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* ── Detail panel ──────────────────────────────────────── */}
        <div className="lg:col-span-3">
          {!selected ? (
            <Card className="border-dashed h-full">
              <CardContent className="py-16 text-center h-full flex flex-col items-center justify-center gap-3">
                <ChevronRight className="w-8 h-8 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">Pilih campaign di kiri untuk melihat detail</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {/* Steps */}
              <Card className="border-border/60">
                <CardHeader className="pb-3 pt-4 px-5 border-b border-border/50">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Clock className="w-4 h-4 text-muted-foreground" />
                      Urutan Pengiriman
                    </CardTitle>
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={openAddStep}>
                      <Plus className="w-3 h-3" /> Tambah Langkah
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="p-4">
                  {stepsLoading ? (
                    <div className="space-y-2"><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></div>
                  ) : !steps?.length ? (
                    <div className="py-8 text-center">
                      <p className="text-sm text-muted-foreground mb-3">Belum ada langkah pengiriman</p>
                      <Button size="sm" variant="outline" onClick={openAddStep} className="gap-1.5"><Plus className="w-3.5 h-3.5" /> Tambah Langkah Pertama</Button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {steps.map((s, i) => (
                        <div key={s.id}>
                          <div className="flex items-start gap-3 p-3 rounded-xl border border-border/50 bg-muted/20">
                            <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-xs font-bold text-primary">
                              {i + 1}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  {s.delayDays === 0 ? "Langsung" : `+${s.delayDays} hari`}
                                </span>
                                {s.mediaUrl && <Badge variant="outline" className="text-[10px] h-4">Media</Badge>}
                              </div>
                              <p className="text-sm line-clamp-2">{s.message}</p>
                            </div>
                            <div className="flex gap-1 shrink-0">
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openEditStep(s)}><Edit2 className="w-3.5 h-3.5" /></Button>
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => deleteStep.mutate(s.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                            </div>
                          </div>
                          {i < steps.length - 1 && (
                            <div className="flex justify-center my-1"><ArrowDown className="w-4 h-4 text-muted-foreground/40" /></div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Enrollments */}
              <Card className="border-border/60">
                <CardHeader className="pb-3 pt-4 px-5 border-b border-border/50">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Users className="w-4 h-4 text-muted-foreground" />
                      Kontak Terdaftar
                    </CardTitle>
                    <Button size="sm" className="h-7 text-xs gap-1" onClick={() => setEnrollOpen(true)}>
                      <UserPlus className="w-3 h-3" /> Daftarkan Kontak
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  {!enrollments?.length ? (
                    <div className="py-8 text-center text-sm text-muted-foreground">Belum ada kontak terdaftar</div>
                  ) : (
                    <div className="divide-y divide-border/50">
                      {enrollments.slice(0, 20).map((e) => (
                        <div key={e.id} className="flex items-center justify-between px-5 py-3">
                          <div>
                            <p className="text-sm font-medium">{e.contactName || e.phone}</p>
                            <p className="text-xs text-muted-foreground">
                              {e.contactName && <span className="mr-2">{e.phone}</span>}
                              Langkah {e.currentStep + 1} · {e.status === "active" ? "Aktif" : e.status}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            {e.nextSendAt && (
                              <span className="text-xs text-muted-foreground">
                                {format(new Date(e.nextSendAt), "dd/MM HH:mm")}
                              </span>
                            )}
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                              onClick={() => unenroll.mutate(e.id)}>
                              <X className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </div>
                      ))}
                      {enrollments.length > 20 && (
                        <div className="px-5 py-3 text-xs text-muted-foreground text-center">
                          +{enrollments.length - 20} kontak lainnya
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>

      {/* ── Create/Edit Campaign Dialog ───────────────────────── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editCampaign ? "Edit Campaign" : "Buat Campaign Baru"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Nama Campaign</Label>
              <Input placeholder="Follow-up Pelanggan Baru" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Deskripsi <span className="text-muted-foreground font-normal">(opsional)</span></Label>
              <Input placeholder="Kirim pesan follow-up selama 7 hari" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Perangkat</Label>
                <Select value={form.deviceId} onValueChange={(v) => setForm((f) => ({ ...f, deviceId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Pilih perangkat" /></SelectTrigger>
                  <SelectContent>
                    {connectedDevices.map((d: any) => (
                      <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Aktif</SelectItem>
                    <SelectItem value="paused">Dijeda</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Batal</Button>
            <Button onClick={handleSaveCampaign} disabled={createCampaign.isPending || updateCampaign.isPending || !form.name || !form.deviceId}>
              {(createCampaign.isPending || updateCampaign.isPending) ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              {editCampaign ? "Simpan" : "Buat Campaign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Add/Edit Step Dialog ──────────────────────────────── */}
      <Dialog open={addStepOpen} onOpenChange={setAddStepOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editStep ? "Edit Langkah" : "Tambah Langkah"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Jeda Setelah Langkah Sebelumnya</Label>
              <div className="flex items-center gap-2">
                <Input type="number" min={0} value={stepForm.delayDays} onChange={(e) => setStepForm((f) => ({ ...f, delayDays: Number(e.target.value) }))} className="w-24" />
                <span className="text-sm text-muted-foreground">hari (0 = langsung)</span>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Pesan</Label>
              <Textarea
                placeholder="Halo {nama}, terima kasih sudah bergabung! ..."
                rows={4}
                value={stepForm.message}
                onChange={(e) => setStepForm((f) => ({ ...f, message: e.target.value }))}
                className="resize-none"
              />
              <p className="text-xs text-muted-foreground">Gunakan <code className="bg-muted px-1 rounded">{"{nama}"}</code> untuk nama kontak</p>
            </div>
            <div className="space-y-1.5">
              <Label>URL Media <span className="text-muted-foreground font-normal">(opsional)</span></Label>
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <Input placeholder="https://..." value={stepForm.mediaUrl} onChange={(e) => setStepForm((f) => ({ ...f, mediaUrl: e.target.value }))} />
                </div>
                <Select value={stepForm.mediaType} onValueChange={(v) => setStepForm((f) => ({ ...f, mediaType: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="image">Gambar</SelectItem>
                    <SelectItem value="video">Video</SelectItem>
                    <SelectItem value="audio">Audio</SelectItem>
                    <SelectItem value="document">Dokumen</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddStepOpen(false)}>Batal</Button>
            <Button onClick={handleSaveStep} disabled={createStep.isPending || updateStep.isPending || !stepForm.message}>
              {(createStep.isPending || updateStep.isPending) ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              {editStep ? "Simpan" : "Tambah Langkah"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Enroll Dialog ─────────────────────────────────────── */}
      <Dialog open={enrollOpen} onOpenChange={setEnrollOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Daftarkan Kontak</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label>Nomor WhatsApp</Label>
            <Textarea
              placeholder={"628111000001\n628111000002"}
              rows={5}
              value={enrollNumbers}
              onChange={(e) => setEnrollNumbers(e.target.value)}
              className="font-mono text-sm resize-none"
            />
            <p className="text-xs text-muted-foreground">Satu nomor per baris atau dipisahkan koma. Format: 628xxx</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEnrollOpen(false)}>Batal</Button>
            <Button onClick={handleEnroll} disabled={enrollContacts.isPending}>
              {enrollContacts.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <UserPlus className="w-4 h-4 mr-2" />}
              Daftarkan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

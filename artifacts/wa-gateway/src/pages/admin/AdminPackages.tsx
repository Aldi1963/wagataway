import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus, Pencil, Trash2, Check, Star, PackageCheck, ToggleLeft, ToggleRight,
  Loader2, AlertTriangle, Infinity, Package, Sparkles,
} from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

interface Plan {
  id: number;
  slug: string;
  name: string;
  description: string;
  priceUsd: number;
  priceIdr: number;
  priceUsdYearly: number;
  priceIdrYearly: number;
  yearlyDiscountPercent: number;
  period: string;
  features: string[];
  limitDevices: number;
  limitMessagesPerDay: number;
  limitContacts: number;
  limitApiCallsPerDay: number;
  limitBulkRecipients: number;
  limitScheduledMessages: number;
  limitAutoReplies: number;
  planColor: string;
  planIcon: string;
  trialDays: number;
  isPopular: boolean;
  isActive: boolean;
  aiCsBotEnabled: boolean;
  bulkMessagingEnabled: boolean;
  webhookEnabled: boolean;
  liveChatEnabled: boolean;
  apiAccessEnabled: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

const emptyForm = {
  name: "",
  slug: "",
  description: "",
  priceUsd: 0,
  priceIdr: 0,
  priceUsdYearly: 0,
  priceIdrYearly: 0,
  yearlyDiscountPercent: 0,
  period: "monthly",
  features: "",
  limitDevices: 1,
  limitMessagesPerDay: 100,
  limitContacts: 100,
  limitApiCallsPerDay: 1000,
  limitBulkRecipients: 100,
  limitScheduledMessages: 10,
  limitAutoReplies: 5,
  planColor: "",
  planIcon: "",
  trialDays: 0,
  isPopular: false,
  isActive: true,
  aiCsBotEnabled: false,
  bulkMessagingEnabled: true,
  webhookEnabled: false,
  liveChatEnabled: false,
  apiAccessEnabled: true,
  sortOrder: 0,
};

type FormState = typeof emptyForm;

function limitLabel(v: number, unit: string) {
  if (v === -1) return <span className="flex items-center gap-1"><Infinity className="h-3.5 w-3.5" /> Tak terbatas</span>;
  return `${v.toLocaleString("id-ID")} ${unit}`;
}

function formatRupiah(v: number) {
  if (!v) return "Gratis";
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(v);
}

function slugify(v: string) {
  return v.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

export default function AdminPackages() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editPlan, setEditPlan] = useState<Plan | null>(null);
  const [deletePlan, setDeletePlan] = useState<Plan | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [slugManual, setSlugManual] = useState(false);

  const { data: plans = [], isLoading } = useQuery<Plan[]>({
    queryKey: ["admin-plans"],
    queryFn: () => apiFetch("/admin/plans").then((r) => r.json()),
  });

  function openCreate() {
    setEditPlan(null);
    setForm(emptyForm);
    setSlugManual(false);
    setDialogOpen(true);
  }

  function openEdit(plan: Plan) {
    setEditPlan(plan);
    setForm({
      name: plan.name,
      slug: plan.slug,
      description: plan.description ?? "",
      priceUsd: plan.priceUsd,
      priceIdr: plan.priceIdr,
      priceUsdYearly: plan.priceUsdYearly ?? 0,
      priceIdrYearly: plan.priceIdrYearly ?? 0,
      yearlyDiscountPercent: plan.yearlyDiscountPercent ?? 0,
      period: plan.period,
      features: plan.features.join("\n"),
      limitDevices: plan.limitDevices,
      limitMessagesPerDay: plan.limitMessagesPerDay,
      limitContacts: plan.limitContacts,
      limitApiCallsPerDay: plan.limitApiCallsPerDay ?? 1000,
      limitBulkRecipients: plan.limitBulkRecipients ?? 100,
      limitScheduledMessages: plan.limitScheduledMessages ?? 10,
      limitAutoReplies: plan.limitAutoReplies ?? 5,
      planColor: plan.planColor ?? "",
      planIcon: plan.planIcon ?? "",
      trialDays: plan.trialDays ?? 0,
      isPopular: plan.isPopular,
      isActive: plan.isActive,
      aiCsBotEnabled: plan.aiCsBotEnabled,
      bulkMessagingEnabled: plan.bulkMessagingEnabled ?? true,
      webhookEnabled: plan.webhookEnabled ?? false,
      liveChatEnabled: plan.liveChatEnabled ?? false,
      apiAccessEnabled: plan.apiAccessEnabled ?? true,
      sortOrder: plan.sortOrder,
    });
    setSlugManual(true);
    setDialogOpen(true);
  }

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "name" && !slugManual) {
        next.slug = slugify(String(value));
      }
      if (key === "priceUsd" && !editPlan) {
        next.priceIdr = Number(value) * 15000;
      }
      return next;
    });
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        ...form,
        priceUsd: Number(form.priceUsd),
        priceIdr: Number(form.priceIdr),
        priceUsdYearly: Number(form.priceUsdYearly),
        priceIdrYearly: Number(form.priceIdrYearly),
        yearlyDiscountPercent: Number(form.yearlyDiscountPercent),
        limitDevices: Number(form.limitDevices),
        limitMessagesPerDay: Number(form.limitMessagesPerDay),
        limitContacts: Number(form.limitContacts),
        limitApiCallsPerDay: Number(form.limitApiCallsPerDay),
        limitBulkRecipients: Number(form.limitBulkRecipients),
        limitScheduledMessages: Number(form.limitScheduledMessages),
        limitAutoReplies: Number(form.limitAutoReplies),
        trialDays: Number(form.trialDays),
        sortOrder: Number(form.sortOrder),
        features: form.features.split("\n").map((s) => s.trim()).filter(Boolean),
      };
      const method = editPlan ? "PUT" : "POST";
      const url = editPlan ? `/admin/plans/${editPlan.id}` : "/admin/plans";
      const r = await apiFetch(url, { method, body: JSON.stringify(payload) });
      if (!r.ok) {
        const err = await r.json().catch(() => ({ message: "Gagal menyimpan" }));
        throw new Error(err.message);
      }
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-plans"] });
      toast({ title: editPlan ? "Paket diperbarui" : "Paket ditambahkan", description: `Paket "${form.name}" berhasil disimpan.` });
      setDialogOpen(false);
    },
    onError: (e: Error) => toast({ variant: "destructive", title: "Gagal menyimpan", description: e.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await apiFetch(`/admin/plans/${id}`, { method: "DELETE" });
      if (!r.ok) {
        const err = await r.json().catch(() => ({ message: "Gagal menghapus" }));
        throw new Error(err.message);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-plans"] });
      toast({ title: "Paket dihapus" });
      setDeletePlan(null);
    },
    onError: (e: Error) => {
      toast({ variant: "destructive", title: "Tidak bisa dihapus", description: e.message });
      setDeletePlan(null);
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      const r = await apiFetch(`/admin/plans/${id}`, { method: "PUT", body: JSON.stringify({ isActive }) });
      if (!r.ok) throw new Error("Gagal mengubah status");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-plans"] }),
    onError: (e: Error) => toast({ variant: "destructive", title: "Gagal", description: e.message }),
  });

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-end">
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1.5" /> Tambah Paket
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : plans.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center py-16 gap-3 text-center">
            <PackageCheck className="h-12 w-12 text-muted-foreground/40" />
            <p className="text-muted-foreground">Belum ada paket. Klik <strong>Tambah Paket</strong> untuk mulai.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {plans.map((plan) => (
            <Card key={plan.id} className={`relative flex flex-col transition-opacity ${!plan.isActive ? "opacity-60" : ""}`}>
              {plan.isPopular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
                  <Badge className="bg-primary text-primary-foreground gap-1 shadow">
                    <Star className="h-3 w-3 fill-current" /> Populer
                  </Badge>
                </div>
              )}
              <CardHeader className="pb-2 pt-5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs text-muted-foreground font-mono">{plan.slug}</p>
                    <h2 className="text-lg font-bold leading-tight">{plan.name}</h2>
                  </div>
                  <Switch
                    checked={plan.isActive}
                    onCheckedChange={(v) => toggleActiveMutation.mutate({ id: plan.id, isActive: v })}
                    aria-label="Toggle aktif"
                  />
                </div>
                {plan.description && (
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed line-clamp-2">{plan.description}</p>
                )}
                <div className="mt-1">
                  {plan.priceUsd === 0 ? (
                    <span className="text-2xl font-extrabold text-primary">Gratis</span>
                  ) : (
                    <div>
                      <span className="text-2xl font-extrabold">${plan.priceUsd}</span>
                      <span className="text-sm text-muted-foreground">/{plan.period === "monthly" ? "bln" : "thn"}</span>
                      <p className="text-xs text-muted-foreground mt-0.5">{formatRupiah(plan.priceIdr)}</p>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent className="flex-1 space-y-3">
                {/* Limits */}
                <div className="rounded-lg bg-muted/50 px-3 py-2 space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Perangkat</span>
                    <span className="font-medium">{limitLabel(plan.limitDevices, "")}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Pesan/hari</span>
                    <span className="font-medium">{limitLabel(plan.limitMessagesPerDay, "")}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Kontak</span>
                    <span className="font-medium">{limitLabel(plan.limitContacts, "")}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground flex items-center gap-1">
                      <Sparkles className="h-3 w-3" /> AI CS Bot
                    </span>
                    <span className={`font-medium text-xs ${plan.aiCsBotEnabled ? "text-green-600" : "text-muted-foreground"}`}>
                      {plan.aiCsBotEnabled ? "Aktif" : "Tidak"}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1 pt-1">
                    {plan.apiAccessEnabled && <span className="text-[10px] bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 rounded px-1.5 py-0.5">API</span>}
                    {plan.bulkMessagingEnabled && <span className="text-[10px] bg-orange-50 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300 rounded px-1.5 py-0.5">Blast</span>}
                    {plan.webhookEnabled && <span className="text-[10px] bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 rounded px-1.5 py-0.5">Webhook</span>}
                    {plan.liveChatEnabled && <span className="text-[10px] bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300 rounded px-1.5 py-0.5">Live Chat</span>}
                  </div>
                </div>
                {/* Features */}
                <ul className="space-y-1.5">
                  {plan.features.map((f, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-xs">
                      <Check className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
              <div className="flex gap-2 p-4 pt-0 border-t mt-auto">
                <Button size="sm" variant="outline" className="flex-1" onClick={() => openEdit(plan)}>
                  <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                </Button>
                <Button size="sm" variant="destructive" onClick={() => setDeletePlan(plan)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editPlan ? `Edit Paket — ${editPlan.name}` : "Tambah Paket Baru"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Nama Paket <span className="text-destructive">*</span></Label>
                <Input placeholder="Contoh: Business" value={form.name} onChange={(e) => setField("name", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Slug <span className="text-destructive">*</span></Label>
                <Input
                  placeholder="business"
                  value={form.slug}
                  onChange={(e) => { setSlugManual(true); setField("slug", slugify(e.target.value)); }}
                />
                <p className="text-xs text-muted-foreground">ID unik untuk paket (huruf kecil, tanpa spasi)</p>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Deskripsi Paket</Label>
              <Input
                placeholder="Contoh: Cocok untuk usaha kecil yang baru mulai"
                value={form.description}
                onChange={(e) => setField("description", e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Ditampilkan di halaman billing dan landing page</p>
            </div>

            <div className="space-y-2">
              <Label>Harga Bulanan</Label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Harga USD ($)</Label>
                  <Input type="number" min={0} value={form.priceUsd} onChange={(e) => setField("priceUsd", Number(e.target.value))} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Harga IDR (Rp)</Label>
                  <Input type="number" min={0} value={form.priceIdr} onChange={(e) => setField("priceIdr", Number(e.target.value))} />
                  <p className="text-xs text-muted-foreground">Auto: USD × 15.000</p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Periode Default</Label>
                  <Select value={form.period} onValueChange={(v) => setField("period", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monthly">Bulanan</SelectItem>
                      <SelectItem value="yearly">Tahunan</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Harga Tahunan <span className="text-xs font-normal text-muted-foreground">(opsional — isi 0 untuk sembunyikan)</span></Label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Harga USD/tahun ($)</Label>
                  <Input type="number" min={0} value={form.priceUsdYearly} onChange={(e) => setField("priceUsdYearly", Number(e.target.value))} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Harga IDR/tahun (Rp)</Label>
                  <Input type="number" min={0} value={form.priceIdrYearly} onChange={(e) => setField("priceIdrYearly", Number(e.target.value))} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Diskon Tahunan (%)</Label>
                  <Input type="number" min={0} max={100} value={form.yearlyDiscountPercent} onChange={(e) => setField("yearlyDiscountPercent", Number(e.target.value))} />
                  <p className="text-xs text-muted-foreground">Tampil sebagai badge "Hemat X%"</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Warna Paket</Label>
                <Select
                  value={form.planColor || "__none__"}
                  onValueChange={(v) => setField("planColor", v === "__none__" ? "" : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Default (berdasarkan slug)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Default</SelectItem>
                    <SelectItem value="zinc">Abu-abu</SelectItem>
                    <SelectItem value="blue">Biru</SelectItem>
                    <SelectItem value="emerald">Hijau</SelectItem>
                    <SelectItem value="violet">Ungu</SelectItem>
                    <SelectItem value="orange">Oranye</SelectItem>
                    <SelectItem value="rose">Merah Muda</SelectItem>
                    <SelectItem value="amber">Kuning</SelectItem>
                    <SelectItem value="cyan">Cyan</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Ikon Paket</Label>
                <Select
                  value={form.planIcon || "__none__"}
                  onValueChange={(v) => setField("planIcon", v === "__none__" ? "" : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Default (berdasarkan slug)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Default</SelectItem>
                    <SelectItem value="zap">⚡ Zap</SelectItem>
                    <SelectItem value="star">⭐ Star</SelectItem>
                    <SelectItem value="crown">👑 Crown</SelectItem>
                    <SelectItem value="shield">🛡 Shield</SelectItem>
                    <SelectItem value="sparkles">✨ Sparkles</SelectItem>
                    <SelectItem value="rocket">🚀 Rocket</SelectItem>
                    <SelectItem value="briefcase">💼 Briefcase</SelectItem>
                    <SelectItem value="diamond">💎 Diamond</SelectItem>
                    <SelectItem value="flame">🔥 Flame</SelectItem>
                    <SelectItem value="heart">❤️ Heart</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label className="mb-1.5 block">Fitur (satu baris per fitur)</Label>
              <Textarea
                rows={5}
                placeholder={"5 Perangkat\n5.000 pesan/hari\nAkses API penuh\nAuto-reply"}
                value={form.features}
                onChange={(e) => setField("features", e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Batas Penggunaan</Label>
              <p className="text-xs text-muted-foreground">Isi <code className="bg-muted px-1 rounded">-1</code> untuk tak terbatas</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Perangkat</Label>
                  <Input type="number" min={-1} value={form.limitDevices} onChange={(e) => setField("limitDevices", Number(e.target.value))} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Pesan/hari</Label>
                  <Input type="number" min={-1} value={form.limitMessagesPerDay} onChange={(e) => setField("limitMessagesPerDay", Number(e.target.value))} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Kontak</Label>
                  <Input type="number" min={-1} value={form.limitContacts} onChange={(e) => setField("limitContacts", Number(e.target.value))} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">API call/hari</Label>
                  <Input type="number" min={-1} value={form.limitApiCallsPerDay} onChange={(e) => setField("limitApiCallsPerDay", Number(e.target.value))} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Blast penerima</Label>
                  <Input type="number" min={-1} value={form.limitBulkRecipients} onChange={(e) => setField("limitBulkRecipients", Number(e.target.value))} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Pesan terjadwal</Label>
                  <Input type="number" min={-1} value={form.limitScheduledMessages} onChange={(e) => setField("limitScheduledMessages", Number(e.target.value))} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Auto-reply</Label>
                  <Input type="number" min={-1} value={form.limitAutoReplies} onChange={(e) => setField("limitAutoReplies", Number(e.target.value))} />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Urutan Tampil</Label>
                <Input type="number" min={0} value={form.sortOrder} onChange={(e) => setField("sortOrder", Number(e.target.value))} />
              </div>
              <div className="space-y-1.5">
                <Label>Masa Percobaan (hari)</Label>
                <Input type="number" min={0} value={form.trialDays} onChange={(e) => setField("trialDays", Number(e.target.value))} />
                <p className="text-xs text-muted-foreground">Isi 0 untuk nonaktifkan trial</p>
              </div>
              <div className="flex items-center gap-3 pt-2">
                <Switch checked={form.isPopular} onCheckedChange={(v) => setField("isPopular", v)} id="popular" />
                <Label htmlFor="popular" className="cursor-pointer">Tandai Populer</Label>
              </div>
              <div className="flex items-center gap-3">
                <Switch checked={form.isActive} onCheckedChange={(v) => setField("isActive", v)} id="active" />
                <Label htmlFor="active" className="cursor-pointer">Aktif / Ditampilkan</Label>
              </div>
              <div className="flex items-center gap-3">
                <Switch checked={form.aiCsBotEnabled} onCheckedChange={(v) => setField("aiCsBotEnabled", v)} id="aiCsBot" />
                <div>
                  <Label htmlFor="aiCsBot" className="cursor-pointer flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-primary" /> AI CS Bot
                  </Label>
                  <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">
                    Pengguna paket ini bisa menggunakan fitur AI CS Bot
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Switch checked={form.apiAccessEnabled} onCheckedChange={(v) => setField("apiAccessEnabled", v)} id="apiAccess" />
                <Label htmlFor="apiAccess" className="cursor-pointer">Akses API</Label>
              </div>
              <div className="flex items-center gap-3">
                <Switch checked={form.bulkMessagingEnabled} onCheckedChange={(v) => setField("bulkMessagingEnabled", v)} id="bulkMsg" />
                <Label htmlFor="bulkMsg" className="cursor-pointer">Blast / Bulk Messaging</Label>
              </div>
              <div className="flex items-center gap-3">
                <Switch checked={form.webhookEnabled} onCheckedChange={(v) => setField("webhookEnabled", v)} id="webhook" />
                <Label htmlFor="webhook" className="cursor-pointer">Webhook</Label>
              </div>
              <div className="flex items-center gap-3">
                <Switch checked={form.liveChatEnabled} onCheckedChange={(v) => setField("liveChatEnabled", v)} id="liveChat" />
                <Label htmlFor="liveChat" className="cursor-pointer">Live Chat</Label>
              </div>
            </div>
          </div>
          <DialogFooter className="pt-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Batal</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !form.name || !form.slug}>
              {saveMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editPlan ? "Simpan Perubahan" : "Buat Paket"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deletePlan} onOpenChange={(o) => !o && setDeletePlan(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Hapus Paket "{deletePlan?.name}"?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Paket akan dihapus secara permanen. Paket yang masih digunakan pengguna aktif tidak dapat dihapus.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => deletePlan && deleteMutation.mutate(deletePlan.id)}
            >
              {deleteMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Ticket, Plus, Trash2, Loader2, Copy, CheckCheck,
  RefreshCw, ToggleLeft, ToggleRight, Wand2, Calendar, Users, Clock,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface Voucher {
  id: number;
  code: string;
  type: string;
  planSlug: string;
  planName: string;
  durationDays: number;
  maxUses: number;
  usedCount: number;
  expiresAt: string | null;
  description: string | null;
  isActive: boolean;
  createdAt: string;
}

const PLAN_OPTIONS = [
  { value: "basic", label: "Basic" },
  { value: "pro", label: "Pro" },
  { value: "enterprise", label: "Enterprise" },
];

const TYPE_OPTIONS = [
  { value: "trial", label: "Trial (gratis)" },
  { value: "plan", label: "Upgrade Paket" },
];

const typeColors: Record<string, string> = {
  trial: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400",
  plan: "bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-400",
};

export default function AdminVouchers() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [showGenerate, setShowGenerate] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const { data: vouchers = [], isLoading } = useQuery<Voucher[]>({
    queryKey: ["admin-vouchers"],
    queryFn: () => apiFetch("/admin/vouchers").then((r) => r.json()),
  });

  function copyCode(code: string) {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
    toast({ title: "Kode disalin!" });
  }

  const toggleActive = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) =>
      apiFetch(`/admin/vouchers/${id}`, { method: "PUT", body: JSON.stringify({ isActive }) }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-vouchers"] }),
    onError: () => toast({ title: "Gagal mengubah status", variant: "destructive" }),
  });

  const deleteVoucher = useMutation({
    mutationFn: (id: number) => apiFetch(`/admin/vouchers/${id}`, { method: "DELETE" }).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-vouchers"] });
      toast({ title: "Voucher dihapus" });
      setDeleteId(null);
    },
    onError: () => toast({ title: "Gagal menghapus voucher", variant: "destructive" }),
  });

  const active = vouchers.filter((v) => v.isActive);
  const used = vouchers.reduce((s, v) => s + v.usedCount, 0);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={() => setShowGenerate(true)} className="gap-2 h-9 text-sm">
            <Wand2 className="w-4 h-4" /> Generate Bulk
          </Button>
          <Button onClick={() => setShowCreate(true)} className="gap-2 h-9 text-sm">
            <Plus className="w-4 h-4" /> Buat Voucher
          </Button>
      </div>

      {/* Stats — 3 compact cards in a row */}
      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        {[
          { label: "Total", value: vouchers.length, icon: Ticket, color: "text-primary", bg: "bg-primary/10" },
          { label: "Aktif", value: active.length, icon: ToggleRight, color: "text-green-600", bg: "bg-green-100 dark:bg-green-900/30" },
          { label: "Diredeem", value: used, icon: Users, color: "text-blue-600", bg: "bg-blue-100 dark:bg-blue-900/30" },
        ].map((s) => (
          <Card key={s.label} className="overflow-hidden">
            <CardContent className="p-3 sm:p-4">
              <div className={`w-7 h-7 rounded-lg ${s.bg} flex items-center justify-center mb-2`}>
                <s.icon className={`w-4 h-4 ${s.color}`} />
              </div>
              <p className="text-xl sm:text-2xl font-bold leading-none">{s.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Voucher list */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm">Daftar Voucher</CardTitle>
          <CardDescription className="text-xs">Ketuk kode untuk menyalin</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
            </div>
          ) : vouchers.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground px-4">
              <Ticket className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">Belum ada voucher. Buat yang pertama!</p>
            </div>
          ) : (
            <div className="divide-y">
              {vouchers.map((v) => {
                const usagePct = v.maxUses !== -1 ? Math.min(100, Math.round((v.usedCount / v.maxUses) * 100)) : 0;
                return (
                  <div key={v.id} className={`px-4 py-3 ${!v.isActive ? "opacity-50" : ""}`}>
                    {/* Row 1: code + actions */}
                    <div className="flex items-center gap-2 mb-2">
                      <button
                        onClick={() => copyCode(v.code)}
                        className="font-mono text-xs font-bold tracking-wider bg-muted px-2.5 py-1 rounded-md hover:bg-primary/10 hover:text-primary transition-colors flex items-center gap-1.5 min-w-0 flex-1 truncate"
                      >
                        <span className="truncate">{v.code}</span>
                        {copiedCode === v.code
                          ? <CheckCheck className="w-3 h-3 text-green-500 shrink-0" />
                          : <Copy className="w-3 h-3 opacity-40 shrink-0" />}
                      </button>

                      <Badge
                        variant="outline"
                        className={`text-xs px-2 py-0.5 shrink-0 ${typeColors[v.type] ?? ""}`}
                      >
                        {v.type === "trial" ? "Trial" : "Upgrade"}
                      </Badge>

                      <div className="flex items-center gap-0.5 shrink-0">
                        <Button
                          variant="ghost" size="sm"
                          onClick={() => toggleActive.mutate({ id: v.id, isActive: !v.isActive })}
                          className="h-7 w-7 p-0"
                          title={v.isActive ? "Nonaktifkan" : "Aktifkan"}
                        >
                          {v.isActive
                            ? <ToggleRight className="w-4 h-4 text-primary" />
                            : <ToggleLeft className="w-4 h-4 text-muted-foreground" />}
                        </Button>
                        <Button
                          variant="ghost" size="sm"
                          onClick={() => setDeleteId(v.id)}
                          className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>

                    {/* Row 2: plan + usage + status */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-medium text-foreground">
                        {v.planName} · {v.durationDays} hari
                      </span>

                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Users className="w-3 h-3" />
                        {v.usedCount}/{v.maxUses === -1 ? "∞" : v.maxUses}
                      </span>

                      {v.expiresAt && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {format(new Date(v.expiresAt), "dd MMM yy")}
                        </span>
                      )}

                      <Badge
                        variant={v.isActive ? "default" : "secondary"}
                        className="text-xs px-1.5 py-0 h-5 ml-auto"
                      >
                        {v.isActive ? "Aktif" : "Nonaktif"}
                      </Badge>
                    </div>

                    {/* Usage bar */}
                    {v.maxUses !== -1 && (
                      <div className="mt-2">
                        <div className="h-1 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary rounded-full transition-all"
                            style={{ width: `${usagePct}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {v.description && (
                      <p className="text-xs text-muted-foreground mt-1 truncate">{v.description}</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialogs */}
      <CreateVoucherDialog open={showCreate} onClose={() => setShowCreate(false)} />
      <GenerateBulkDialog open={showGenerate} onClose={() => setShowGenerate(false)} />

      <AlertDialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Voucher?</AlertDialogTitle>
            <AlertDialogDescription>
              Tindakan ini tidak bisa dibatalkan. Riwayat penggunaan juga akan dihapus.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && deleteVoucher.mutate(deleteId)}
              className="bg-destructive hover:bg-destructive/90"
            >
              Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ── Create Voucher Dialog ─────────────────────────────────────────────────────

function CreateVoucherDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [code, setCode] = useState("");
  const [type, setType] = useState("trial");
  const [planSlug, setPlanSlug] = useState("basic");
  const [planName, setPlanName] = useState("Basic");
  const [durationDays, setDurationDays] = useState("7");
  const [maxUses, setMaxUses] = useState("1");
  const [expiresAt, setExpiresAt] = useState("");
  const [description, setDescription] = useState("");

  function randomCode() {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    const part = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
    setCode(`WAG-${part()}-${part()}`);
  }

  function handleClose() {
    onClose();
    setCode(""); setDurationDays("7"); setMaxUses("1"); setDescription(""); setExpiresAt("");
  }

  const create = useMutation({
    mutationFn: () => apiFetch("/admin/vouchers", {
      method: "POST",
      body: JSON.stringify({
        code, type, planSlug, planName,
        durationDays: Number(durationDays),
        maxUses: Number(maxUses),
        expiresAt: expiresAt || null,
        description: description || null,
      }),
    }).then(async (r) => {
      if (!r.ok) { const d = await r.json(); throw new Error(d.message); }
      return r.json();
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-vouchers"] });
      toast({ title: "Voucher berhasil dibuat!" });
      handleClose();
    },
    onError: (e: any) => toast({ title: e.message ?? "Gagal membuat voucher", variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-sm mx-4 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Ticket className="w-4 h-4 text-primary" /> Buat Voucher Baru
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Kode Voucher</Label>
            <div className="flex gap-2">
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="WAG-XXXX-XXXX"
                className="font-mono text-sm"
              />
              <Button type="button" variant="outline" onClick={randomCode} size="icon" className="shrink-0" title="Generate acak">
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Tipe</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TYPE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Paket</Label>
              <Select value={planSlug} onValueChange={(v) => { setPlanSlug(v); setPlanName(PLAN_OPTIONS.find((p) => p.value === v)?.label ?? v); }}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PLAN_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1"><Clock className="w-3 h-3" /> Durasi (hari)</Label>
              <Input type="number" min="1" value={durationDays} onChange={(e) => setDurationDays(e.target.value)} className="h-9 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1"><Users className="w-3 h-3" /> Maks. Pakai</Label>
              <Input type="number" min="1" value={maxUses} onChange={(e) => setMaxUses(e.target.value)} className="h-9 text-sm" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs flex items-center gap-1"><Calendar className="w-3 h-3" /> Kedaluwarsa (opsional)</Label>
            <Input type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} className="h-9 text-sm" />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Deskripsi (opsional)</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Voucher untuk campaign Q1..."
              className="text-sm"
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={handleClose} className="h-9">Batal</Button>
          <Button onClick={() => create.mutate()} disabled={!code || create.isPending} className="gap-2 h-9">
            {create.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Buat
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Generate Bulk Dialog ──────────────────────────────────────────────────────

function GenerateBulkDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [prefix, setPrefix] = useState("WAG");
  const [count, setCount] = useState("5");
  const [type, setType] = useState("trial");
  const [planSlug, setPlanSlug] = useState("basic");
  const [planName, setPlanName] = useState("Basic");
  const [durationDays, setDurationDays] = useState("7");
  const [expiresAt, setExpiresAt] = useState("");
  const [generated, setGenerated] = useState<string[]>([]);
  const [copiedAll, setCopiedAll] = useState(false);

  const generate = useMutation({
    mutationFn: () => apiFetch("/admin/vouchers/generate", {
      method: "POST",
      body: JSON.stringify({ prefix, count: Number(count), type, planSlug, planName, durationDays: Number(durationDays), expiresAt: expiresAt || null }),
    }).then((r) => r.json()),
    onSuccess: (d) => {
      setGenerated(d.generated ?? []);
      qc.invalidateQueries({ queryKey: ["admin-vouchers"] });
      toast({ title: `${d.count} voucher berhasil dibuat!` });
    },
    onError: () => toast({ title: "Gagal generate voucher", variant: "destructive" }),
  });

  function copyAll() {
    navigator.clipboard.writeText(generated.join("\n"));
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2000);
    toast({ title: "Semua kode disalin!" });
  }

  function handleClose() { onClose(); setGenerated([]); }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-sm mx-4 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Wand2 className="w-4 h-4 text-primary" /> Generate Voucher Bulk
          </DialogTitle>
        </DialogHeader>

        {generated.length === 0 ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Prefix Kode</Label>
                <Input
                  value={prefix}
                  onChange={(e) => setPrefix(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
                  placeholder="WAG"
                  maxLength={8}
                  className="h-9 text-sm font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Jumlah (maks. 50)</Label>
                <Input
                  type="number" min="1" max="50"
                  value={count}
                  onChange={(e) => setCount(e.target.value)}
                  className="h-9 text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Tipe</Label>
                <Select value={type} onValueChange={setType}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TYPE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Paket</Label>
                <Select value={planSlug} onValueChange={(v) => { setPlanSlug(v); setPlanName(PLAN_OPTIONS.find((p) => p.value === v)?.label ?? v); }}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PLAN_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Durasi (hari)</Label>
                <Input type="number" min="1" value={durationDays} onChange={(e) => setDurationDays(e.target.value)} className="h-9 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Kedaluwarsa</Label>
                <Input type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} className="h-9 text-sm" />
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-green-600">{generated.length} kode berhasil dibuat</p>
              <Button variant="outline" size="sm" onClick={copyAll} className="gap-1.5 h-8 text-xs">
                {copiedAll ? <CheckCheck className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                Salin Semua
              </Button>
            </div>
            <div className="bg-muted rounded-xl p-3 max-h-48 overflow-y-auto">
              {generated.map((c) => (
                <p key={c} className="font-mono text-xs sm:text-sm py-0.5">{c}</p>
              ))}
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={handleClose} className="h-9">
            {generated.length > 0 ? "Tutup" : "Batal"}
          </Button>
          {generated.length === 0 && (
            <Button onClick={() => generate.mutate()} disabled={generate.isPending} className="gap-2 h-9">
              {generate.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
              Generate {count}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

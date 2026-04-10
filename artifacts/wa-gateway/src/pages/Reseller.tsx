import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Network, Users, Smartphone, MessageSquare, Plus, Trash2, Edit2, Eye, EyeOff,
  Loader2, ShieldCheck, AlertCircle, Copy, CheckCheck, ChevronRight, BarChart3,
  UserPlus, Key, Zap, ShieldOff, ShieldAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { id as localeId } from "date-fns/locale";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Quota {
  allocatedDevices: number;
  allocatedMessagesPerDay: number;
  allocatedContacts: number;
}

interface SubUser {
  id: number;
  name: string;
  email: string;
  plan: string;
  isSuspended: boolean;
  createdAt: string;
  quota: Quota;
}

interface Profile {
  totalSubUsers: number;
  totalDevices: number;
  messagesToday: number;
  subUsers: SubUser[];
}

// ── Stat Card ─────────────────────────────────────────────────────────────────

function StatCard({
  icon: Icon, label, value, color, loading,
}: { icon: any; label: string; value: any; color: string; loading?: boolean }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 flex items-center gap-4">
      <div className={cn("w-11 h-11 rounded-xl flex items-center justify-center text-white flex-shrink-0", color)}>
        <Icon size={20} />
      </div>
      <div>
        <p className="text-xs text-muted-foreground font-medium">{label}</p>
        {loading ? <Skeleton className="h-6 w-16 mt-1" /> : (
          <p className="text-2xl font-bold">{value ?? "—"}</p>
        )}
      </div>
    </div>
  );
}

// ── Create Sub-User Dialog ─────────────────────────────────────────────────────

function CreateSubUserDialog({
  open, onClose, onSuccess,
}: { open: boolean; onClose: () => void; onSuccess: () => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    name: "", email: "", password: "",
    allocatedDevices: 2,
    allocatedMessagesPerDay: 1000,
    allocatedContacts: 5000,
  });
  const [showPass, setShowPass] = useState(false);
  const [copied, setCopied] = useState(false);

  const mut = useMutation({
    mutationFn: async () => {
      const res = await apiFetch("/api/reseller/sub-users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? "Gagal membuat sub-akun"); }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Sub-akun berhasil dibuat", description: `${form.email} telah ditambahkan` });
      setForm({ name: "", email: "", password: "", allocatedDevices: 2, allocatedMessagesPerDay: 1000, allocatedContacts: 5000 });
      onSuccess();
      onClose();
    },
    onError: (e: any) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  const copyCredentials = () => {
    navigator.clipboard.writeText(`Email: ${form.email}\nPassword: ${form.password}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center">
              <UserPlus size={16} className="text-white" />
            </div>
            Tambah Sub-Akun
          </DialogTitle>
          <DialogDescription>Buat akun baru untuk sub-user reseller Anda</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label className="text-xs font-medium mb-1.5 block">Nama Lengkap</Label>
              <Input placeholder="Nama sub-user" value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="col-span-2">
              <Label className="text-xs font-medium mb-1.5 block">Email</Label>
              <Input type="email" placeholder="email@domain.com" value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="col-span-2">
              <Label className="text-xs font-medium mb-1.5 block">Password</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input type={showPass ? "text" : "password"} placeholder="Password akun"
                    value={form.password}
                    onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} />
                  <button onClick={() => setShowPass(!showPass)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                <Button variant="outline" size="sm" onClick={copyCredentials} disabled={!form.email || !form.password}>
                  {copied ? <CheckCheck size={14} className="text-emerald-500" /> : <Copy size={14} />}
                </Button>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Alokasi Kuota</p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs mb-1.5 block">Max Device</Label>
                <Input type="number" min={1} max={100} value={form.allocatedDevices}
                  onChange={(e) => setForm((f) => ({ ...f, allocatedDevices: parseInt(e.target.value) || 1 }))} />
              </div>
              <div>
                <Label className="text-xs mb-1.5 block">Pesan/Hari</Label>
                <Input type="number" min={100} value={form.allocatedMessagesPerDay}
                  onChange={(e) => setForm((f) => ({ ...f, allocatedMessagesPerDay: parseInt(e.target.value) || 100 }))} />
              </div>
              <div>
                <Label className="text-xs mb-1.5 block">Kontak</Label>
                <Input type="number" min={100} value={form.allocatedContacts}
                  onChange={(e) => setForm((f) => ({ ...f, allocatedContacts: parseInt(e.target.value) || 100 }))} />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={mut.isPending}>Batal</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending || !form.name || !form.email || !form.password}>
            {mut.isPending ? <><Loader2 size={14} className="mr-2 animate-spin" />Membuat...</> : "Buat Sub-Akun"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Edit Quota Dialog ─────────────────────────────────────────────────────────

function EditQuotaDialog({
  open, onClose, onSuccess, subUser,
}: { open: boolean; onClose: () => void; onSuccess: () => void; subUser: SubUser | null }) {
  const { toast } = useToast();
  const [quota, setQuota] = useState<Quota>({
    allocatedDevices: subUser?.quota?.allocatedDevices ?? 2,
    allocatedMessagesPerDay: subUser?.quota?.allocatedMessagesPerDay ?? 1000,
    allocatedContacts: subUser?.quota?.allocatedContacts ?? 5000,
  });

  const mut = useMutation({
    mutationFn: async () => {
      const res = await apiFetch(`/api/reseller/sub-users/${subUser?.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(quota),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? "Gagal memperbarui kuota"); }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Kuota berhasil diperbarui" });
      onSuccess();
      onClose();
    },
    onError: (e: any) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  if (!subUser) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-400 to-violet-600 flex items-center justify-center">
              <Edit2 size={14} className="text-white" />
            </div>
            Edit Kuota
          </DialogTitle>
          <DialogDescription className="text-xs">{subUser.email}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <div>
            <Label className="text-xs font-medium mb-1.5 block">Max Device</Label>
            <Input type="number" min={1} value={quota.allocatedDevices}
              onChange={(e) => setQuota((q) => ({ ...q, allocatedDevices: parseInt(e.target.value) || 1 }))} />
          </div>
          <div>
            <Label className="text-xs font-medium mb-1.5 block">Pesan per Hari</Label>
            <Input type="number" min={100} value={quota.allocatedMessagesPerDay}
              onChange={(e) => setQuota((q) => ({ ...q, allocatedMessagesPerDay: parseInt(e.target.value) || 100 }))} />
          </div>
          <div>
            <Label className="text-xs font-medium mb-1.5 block">Maks Kontak</Label>
            <Input type="number" min={100} value={quota.allocatedContacts}
              onChange={(e) => setQuota((q) => ({ ...q, allocatedContacts: parseInt(e.target.value) || 100 }))} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={mut.isPending}>Batal</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
            {mut.isPending ? <Loader2 size={14} className="mr-2 animate-spin" /> : null}Simpan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function Reseller() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<SubUser | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SubUser | null>(null);

  const { data: profile, isLoading, error } = useQuery<Profile>({
    queryKey: ["reseller-profile"],
    queryFn: async () => {
      const res = await apiFetch("/api/reseller/profile");
      if (!res.ok) {
        const err: any = new Error("Not a reseller");
        err.status = res.status;
        throw err;
      }
      return res.json();
    },
    retry: false,
  });

  const deleteMut = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiFetch(`/api/reseller/sub-users/${id}`, { method: "DELETE" });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? "Gagal menghapus sub-user"); }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Sub-user dihapus" });
      qc.invalidateQueries({ queryKey: ["reseller-profile"] });
      setDeleteTarget(null);
    },
    onError: (e: any) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  const suspendMut = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiFetch(`/api/reseller/sub-users/${id}/suspend`, { method: "POST" });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? "Gagal mengubah status"); }
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: data.message ?? "Status sub-user diperbarui" });
      qc.invalidateQueries({ queryKey: ["reseller-profile"] });
    },
    onError: (e: any) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["reseller-profile"] });

  // Not a reseller
  const isNotReseller = error || (profile && typeof (error as any)?.status === "number");

  if (!isLoading && (error as any)?.status === 403) {
    return (
      <div className="p-6 max-w-md mx-auto mt-20 text-center space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-amber-100 dark:bg-amber-900/20 flex items-center justify-center mx-auto">
          <ShieldCheck size={28} className="text-amber-500" />
        </div>
        <h2 className="text-xl font-bold">Fitur Reseller</h2>
        <p className="text-muted-foreground text-sm">
          Akun Anda belum terdaftar sebagai reseller. Hubungi admin untuk mengaktifkan fitur reseller dan mulai kelola sub-akun Anda.
        </p>
        <div className="rounded-xl border border-border bg-muted/30 p-4 text-left space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Keuntungan Reseller</p>
          {[
            "Kelola beberapa sub-akun dalam satu dashboard",
            "Atur kuota device & pesan per sub-user",
            "Monitor aktivitas semua sub-akun",
            "Pantau penggunaan secara real-time",
          ].map((b) => (
            <div key={b} className="flex items-start gap-2 text-sm">
              <ChevronRight size={14} className="text-blue-500 mt-0.5 flex-shrink-0" />
              <span>{b}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-end">
        <Button onClick={() => setCreateOpen(true)} className="gap-2">
          <Plus size={15} /> Tambah Sub-Akun
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard icon={Users} label="Total Sub-Akun" value={profile?.totalSubUsers} color="bg-blue-500" loading={isLoading} />
        <StatCard icon={Smartphone} label="Total Device" value={profile?.totalDevices} color="bg-violet-500" loading={isLoading} />
        <StatCard icon={MessageSquare} label="Pesan Hari Ini" value={profile?.messagesToday} color="bg-emerald-500" loading={isLoading} />
      </div>

      {/* Sub-user table */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="px-5 py-4 border-b border-border/60 flex items-center gap-2">
          <Users size={16} className="text-muted-foreground" />
          <span className="font-semibold text-sm">Daftar Sub-Akun</span>
          {profile?.totalSubUsers !== undefined && (
            <Badge variant="secondary" className="ml-auto">{profile.totalSubUsers} akun</Badge>
          )}
        </div>

        {isLoading ? (
          <div className="p-4 space-y-3">
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
          </div>
        ) : !profile?.subUsers?.length ? (
          <div className="py-16 flex flex-col items-center gap-3 text-muted-foreground">
            <div className="w-14 h-14 rounded-2xl bg-muted/50 flex items-center justify-center">
              <UserPlus size={24} className="opacity-30" />
            </div>
            <p className="text-sm font-medium">Belum ada sub-akun</p>
            <p className="text-xs">Klik "Tambah Sub-Akun" untuk memulai</p>
            <Button variant="outline" size="sm" onClick={() => setCreateOpen(true)} className="mt-2 gap-2">
              <Plus size={14} /> Buat Sub-Akun Pertama
            </Button>
          </div>
        ) : (
          <div className="divide-y divide-border/60">
            {profile.subUsers.map((su) => (
              <div key={su.id} className="px-5 py-4 flex items-center gap-4 hover:bg-muted/20 transition-colors">
                {/* Avatar */}
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-400 to-violet-500 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                  {su.name.charAt(0).toUpperCase()}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold truncate">{su.name}</p>
                    {su.isSuspended && <Badge variant="destructive" className="text-[10px]">Suspended</Badge>}
                    <Badge variant="secondary" className="text-[10px] capitalize">{su.plan}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{su.email}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Bergabung {su.createdAt ? format(new Date(su.createdAt), "dd MMM yyyy", { locale: localeId }) : "—"}
                  </p>
                </div>

                {/* Quota Badges */}
                <div className="hidden sm:flex gap-2 flex-shrink-0">
                  <div className="text-center px-3 py-1.5 rounded-lg bg-muted/50 border border-border/60">
                    <p className="text-xs font-bold">{su.quota?.allocatedDevices ?? "—"}</p>
                    <p className="text-[10px] text-muted-foreground">Device</p>
                  </div>
                  <div className="text-center px-3 py-1.5 rounded-lg bg-muted/50 border border-border/60">
                    <p className="text-xs font-bold">{(su.quota?.allocatedMessagesPerDay ?? 0).toLocaleString("id-ID")}</p>
                    <p className="text-[10px] text-muted-foreground">Pesan/hr</p>
                  </div>
                  <div className="text-center px-3 py-1.5 rounded-lg bg-muted/50 border border-border/60">
                    <p className="text-xs font-bold">{(su.quota?.allocatedContacts ?? 0).toLocaleString("id-ID")}</p>
                    <p className="text-[10px] text-muted-foreground">Kontak</p>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-1.5 flex-shrink-0">
                  <Button
                    variant="ghost" size="sm"
                    className={`h-8 w-8 p-0 ${su.isSuspended ? "text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-950/30" : "text-amber-500 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/30"}`}
                    onClick={() => suspendMut.mutate(su.id)}
                    disabled={suspendMut.isPending}
                    title={su.isSuspended ? "Aktifkan kembali" : "Suspend sub-user"}
                  >
                    {suspendMut.isPending ? <Loader2 size={14} className="animate-spin" /> : su.isSuspended ? <ShieldCheck size={14} /> : <ShieldAlert size={14} />}
                  </Button>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0"
                    onClick={() => setEditTarget(su)} title="Edit kuota">
                    <Edit2 size={14} />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                    onClick={() => setDeleteTarget(su)} title="Hapus sub-user">
                    <Trash2 size={14} />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Info Box */}
      <div className="rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/20 p-4 flex gap-3">
        <AlertCircle size={16} className="text-blue-500 mt-0.5 flex-shrink-0" />
        <div className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
          <p className="font-semibold">Cara kerja reseller:</p>
          <ul className="text-xs space-y-0.5 list-disc list-inside text-blue-600 dark:text-blue-400">
            <li>Sub-akun dapat login dan menggunakan fitur platform secara mandiri</li>
            <li>Kuota yang Anda atur sebagai batas maksimal penggunaan sub-user</li>
            <li>Menghapus sub-user dari jaringan tidak menghapus akun mereka</li>
          </ul>
        </div>
      </div>

      {/* Dialogs */}
      <CreateSubUserDialog open={createOpen} onClose={() => setCreateOpen(false)} onSuccess={refresh} />
      <EditQuotaDialog open={!!editTarget} onClose={() => setEditTarget(null)} onSuccess={refresh} subUser={editTarget} />

      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Sub-User?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{deleteTarget?.name}</strong> ({deleteTarget?.email}) akan dihapus dari jaringan reseller Anda.
              Akun mereka tetap ada namun tidak lagi terhubung ke akun Anda.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-500 hover:bg-red-600"
              onClick={() => deleteTarget && deleteMut.mutate(deleteTarget.id)}>
              {deleteMut.isPending ? <Loader2 size={14} className="mr-2 animate-spin" /> : null}
              Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

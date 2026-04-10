import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import {
  Loader2, Plus, Trash2, Pencil, Copy, Check,
  ShieldCheck, KeyRound, Search, Smartphone,
  UserCheck, UserX, Users, Network,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

interface User {
  id: string;
  name: string;
  email: string;
  plan: string;
  role: string;
  isSuspended: boolean;
  isReseller: boolean;
  deviceCount: number;
  isCurrentUser: boolean;
  createdAt: string;
}

const planColors: Record<string, string> = {
  free: "secondary",
  pro: "default",
  business: "default",
  enterprise: "default",
};

function initials(name: string) {
  return name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
}

export default function AdminUsers() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [deleteUser, setDeleteUser] = useState<User | null>(null);
  const [suspendUser, setSuspendUser] = useState<User | null>(null);
  const [newUserCreds, setNewUserCreds] = useState<{ email: string; password: string } | null>(null);
  const [resetCreds, setResetCreds] = useState<{ email: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [plan, setPlan] = useState("free");
  const [role, setRole] = useState("user");
  const [editPlan, setEditPlan] = useState("free");
  const [editRole, setEditRole] = useState("user");

  const { data: users = [], isLoading } = useQuery<User[]>({
    queryKey: ["admin-users", search],
    queryFn: () =>
      apiFetch(`/admin/users${search ? `?search=${encodeURIComponent(search)}` : ""}`).then((r) => r.json()),
  });

  const { register, handleSubmit, reset, formState: { errors } } = useForm<{ name: string; email: string }>();
  const { register: regEdit, handleSubmit: handleEdit, reset: resetEdit } = useForm<{ name: string; email: string }>();

  const addUser = useMutation({
    mutationFn: (body: any) =>
      apiFetch("/admin/users", { method: "POST", body: JSON.stringify(body) }).then((r) => r.json()),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      setAddOpen(false);
      reset();
      setPlan("free");
      setRole("user");
      setNewUserCreds({ email: data.email, password: data.tempPassword });
    },
    onError: () => toast({ title: "Gagal menambah user", variant: "destructive" }),
  });

  const updateUser = useMutation({
    mutationFn: ({ id, body }: { id: string; body: any }) =>
      apiFetch(`/admin/users/${id}`, { method: "PUT", body: JSON.stringify(body) }).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      setEditUser(null);
      toast({ title: "User diperbarui" });
    },
    onError: () => toast({ title: "Gagal memperbarui", variant: "destructive" }),
  });

  const suspendMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "suspend" | "activate" }) =>
      apiFetch(`/admin/users/${id}/${action}`, { method: "POST" }).then((r) => r.json()),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      setSuspendUser(null);
      toast({ title: vars.action === "suspend" ? "User disuspend" : "User diaktifkan kembali" });
    },
    onError: () => toast({ title: "Gagal mengubah status user", variant: "destructive" }),
  });

  const resetPasswordMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/admin/users/${id}/reset-password`, { method: "POST" }).then((r) => r.json()),
    onSuccess: (data) => {
      setResetCreds({ email: data.email, password: data.tempPassword });
    },
    onError: () => toast({ title: "Gagal reset password", variant: "destructive" }),
  });

  const delUser = useMutation({
    mutationFn: (id: string) => apiFetch(`/admin/users/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      setDeleteUser(null);
      toast({ title: "User dihapus" });
    },
    onError: () => toast({ title: "Gagal menghapus user", variant: "destructive" }),
  });

  const resellerMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/admin/users/${id}/toggle-reseller`, { method: "POST" }).then((r) => r.json()),
    onSuccess: (data: any, id: string) => {
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      toast({ title: data.isReseller ? "Reseller diaktifkan" : "Status reseller dinonaktifkan" });
    },
    onError: () => toast({ title: "Gagal mengubah status reseller", variant: "destructive" }),
  });

  function copyText(text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const totalUsers = users.length;
  const activeUsers = users.filter((u) => !u.isSuspended).length;
  const adminUsers = users.filter((u) => u.role === "admin").length;

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <Button onClick={() => setAddOpen(true)} className="gap-2">
          <Plus className="w-4 h-4" /> Tambah User
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4 flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg"><Users className="w-5 h-5 text-blue-600" /></div>
            <div>
              <p className="text-2xl font-bold">{totalUsers}</p>
              <p className="text-xs text-muted-foreground">Total User</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg"><UserCheck className="w-5 h-5 text-green-600" /></div>
            <div>
              <p className="text-2xl font-bold">{activeUsers}</p>
              <p className="text-xs text-muted-foreground">Aktif</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 flex items-center gap-3">
            <div className="p-2 bg-purple-100 rounded-lg"><ShieldCheck className="w-5 h-5 text-purple-600" /></div>
            <div>
              <p className="text-2xl font-bold">{adminUsers}</p>
              <p className="text-xs text-muted-foreground">Admin</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Cari nama atau email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Users List */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Daftar Pengguna ({users.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : users.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground text-sm">
              {search ? "Tidak ada user yang cocok" : "Belum ada user"}
            </div>
          ) : (
            <div className="divide-y">
              {users.map((user) => (
                <div
                  key={user.id}
                  className={`flex items-center gap-4 px-6 py-4 hover:bg-muted/30 transition-colors ${user.isSuspended ? "opacity-60" : ""}`}
                >
                  <Avatar className="h-10 w-10 shrink-0">
                    <AvatarFallback className="text-sm font-semibold bg-primary/10 text-primary">
                      {initials(user.name)}
                    </AvatarFallback>
                  </Avatar>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium truncate">{user.name}</span>
                      {user.isCurrentUser && <Badge variant="outline" className="text-xs">Saya</Badge>}
                      {user.role === "admin" && (
                        <Badge className="text-xs bg-purple-100 text-purple-700 hover:bg-purple-100 border-0">
                          <ShieldCheck className="w-3 h-3 mr-1" /> Admin
                        </Badge>
                      )}
                      {user.isSuspended && (
                        <Badge variant="destructive" className="text-xs">Disuspend</Badge>
                      )}
                      {user.isReseller && (
                        <Badge className="text-xs bg-blue-100 text-blue-700 hover:bg-blue-100 border-0">
                          <Network className="w-3 h-3 mr-1" /> Reseller
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground flex-wrap">
                      <span className="truncate">{user.email}</span>
                      <span className="flex items-center gap-1">
                        <Smartphone className="w-3 h-3" /> {user.deviceCount} device
                      </span>
                      <span>
                        {new Date(user.createdAt).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
                      </span>
                    </div>
                  </div>

                  <Badge variant={planColors[user.plan] as any ?? "secondary"} className="capitalize shrink-0 hidden sm:flex">
                    {user.plan}
                  </Badge>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="shrink-0 text-xs">
                        Aksi ▾
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuItem onClick={() => {
                        setEditUser(user);
                        resetEdit({ name: user.name, email: user.email });
                        setEditPlan(user.plan);
                        setEditRole(user.role);
                      }}>
                        <Pencil className="w-4 h-4 mr-2" /> Edit Info
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => resetPasswordMutation.mutate(user.id)}
                        disabled={resetPasswordMutation.isPending}
                      >
                        <KeyRound className="w-4 h-4 mr-2" />
                        {resetPasswordMutation.isPending ? "Mereset..." : "Reset Password"}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      {user.isSuspended ? (
                        <DropdownMenuItem
                          className="text-green-600 focus:text-green-600"
                          onClick={() => suspendMutation.mutate({ id: user.id, action: "activate" })}
                        >
                          <UserCheck className="w-4 h-4 mr-2" /> Aktifkan Akun
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem
                          className="text-orange-600 focus:text-orange-600"
                          disabled={user.isCurrentUser}
                          onClick={() => setSuspendUser(user)}
                        >
                          <UserX className="w-4 h-4 mr-2" /> Suspend Akun
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        className={user.isReseller ? "text-orange-600 focus:text-orange-600" : "text-blue-600 focus:text-blue-600"}
                        onClick={() => resellerMutation.mutate(user.id)}
                        disabled={resellerMutation.isPending}
                      >
                        <Network className="w-4 h-4 mr-2" />
                        {user.isReseller ? "Nonaktifkan Reseller" : "Aktifkan Reseller"}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        disabled={user.isCurrentUser}
                        onClick={() => setDeleteUser(user)}
                      >
                        <Trash2 className="w-4 h-4 mr-2" /> Hapus Akun
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add User Dialog */}
      <Dialog open={addOpen} onOpenChange={(o) => { if (!o) { setAddOpen(false); reset(); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Tambah Pengguna Baru</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit((data) => addUser.mutate({ ...data, plan, role }))} className="space-y-4">
            <div className="space-y-2">
              <Label>Nama Lengkap</Label>
              <Input {...register("name", { required: true })} placeholder="John Doe" />
              {errors.name && <p className="text-xs text-destructive">Nama wajib diisi</p>}
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input {...register("email", { required: true })} type="email" placeholder="john@example.com" />
              {errors.email && <p className="text-xs text-destructive">Email wajib diisi</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Paket</Label>
                <Select value={plan} onValueChange={setPlan}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="free">Free</SelectItem>
                    <SelectItem value="pro">Pro</SelectItem>
                    <SelectItem value="business">Business</SelectItem>
                    <SelectItem value="enterprise">Enterprise</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Role</Label>
                <Select value={role} onValueChange={setRole}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">User</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Password sementara akan digenerate otomatis.</p>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>Batal</Button>
              <Button type="submit" disabled={addUser.isPending} className="gap-2">
                {addUser.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                Buat Akun
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={!!editUser} onOpenChange={(o) => { if (!o) setEditUser(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Pengguna</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={handleEdit((data) =>
              updateUser.mutate({ id: editUser!.id, body: { ...data, plan: editPlan, role: editRole } })
            )}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label>Nama Lengkap</Label>
              <Input {...regEdit("name", { required: true })} />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input {...regEdit("email", { required: true })} type="email" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Paket</Label>
                <Select value={editPlan} onValueChange={setEditPlan}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="free">Free</SelectItem>
                    <SelectItem value="pro">Pro</SelectItem>
                    <SelectItem value="business">Business</SelectItem>
                    <SelectItem value="enterprise">Enterprise</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Role</Label>
                <Select value={editRole} onValueChange={setEditRole} disabled={editUser?.isCurrentUser}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">User</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
                {editUser?.isCurrentUser && (
                  <p className="text-xs text-muted-foreground">Tidak bisa mengubah role akun sendiri</p>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditUser(null)}>Batal</Button>
              <Button type="submit" disabled={updateUser.isPending} className="gap-2">
                {updateUser.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                Simpan
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Suspend Confirm */}
      <AlertDialog open={!!suspendUser} onOpenChange={(o) => { if (!o) setSuspendUser(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Suspend pengguna?</AlertDialogTitle>
            <AlertDialogDescription>
              Akun <strong>{suspendUser?.name}</strong> ({suspendUser?.email}) akan disuspend.
              User tidak bisa login sampai diaktifkan kembali.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => suspendMutation.mutate({ id: suspendUser!.id, action: "suspend" })}
              className="bg-orange-500 hover:bg-orange-600"
            >
              {suspendMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Suspend"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteUser} onOpenChange={(o) => { if (!o) setDeleteUser(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus pengguna?</AlertDialogTitle>
            <AlertDialogDescription>
              Akun <strong>{deleteUser?.name}</strong> ({deleteUser?.email}) akan dihapus permanen beserta semua datanya.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => delUser.mutate(deleteUser!.id)}
              className="bg-destructive hover:bg-destructive/90"
            >
              {delUser.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Hapus"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* New User Credentials */}
      <Dialog open={!!newUserCreds} onOpenChange={(o) => { if (!o) setNewUserCreds(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-green-600">User Berhasil Dibuat!</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Bagikan kredensial ini ke pengguna. Password hanya ditampilkan sekali.</p>
            <div className="bg-zinc-900 rounded-xl p-4 space-y-2 text-sm font-mono text-zinc-300">
              <div><span className="text-zinc-500">Email: </span>{newUserCreds?.email}</div>
              <div className="flex items-center gap-2">
                <span className="text-zinc-500">Pass: </span>
                <span className="text-green-400 flex-1">{newUserCreds?.password}</span>
                <Button variant="ghost" size="icon" className="h-6 w-6 text-zinc-400 hover:text-white"
                  onClick={() => copyText(`Email: ${newUserCreds?.email}\nPassword: ${newUserCreds?.password}`)}>
                  {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button className="w-full" onClick={() => setNewUserCreds(null)}>Sudah Disalin, Tutup</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset Password Credentials */}
      <Dialog open={!!resetCreds} onOpenChange={(o) => { if (!o) setResetCreds(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-blue-600">Password Berhasil Direset!</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Bagikan password baru ini ke pengguna. Password hanya ditampilkan sekali.</p>
            <div className="bg-zinc-900 rounded-xl p-4 space-y-2 text-sm font-mono text-zinc-300">
              <div><span className="text-zinc-500">Email: </span>{resetCreds?.email}</div>
              <div className="flex items-center gap-2">
                <span className="text-zinc-500">Pass Baru: </span>
                <span className="text-blue-400 flex-1">{resetCreds?.password}</span>
                <Button variant="ghost" size="icon" className="h-6 w-6 text-zinc-400 hover:text-white"
                  onClick={() => copyText(`Email: ${resetCreds?.email}\nPassword Baru: ${resetCreds?.password}`)}>
                  {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button className="w-full" onClick={() => setResetCreds(null)}>Sudah Disalin, Tutup</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

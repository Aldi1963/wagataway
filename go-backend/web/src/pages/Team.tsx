import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Plus, Trash2, X, Copy, Users, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dropdown } from "@/components/ui/dropdown";
import { Badge } from "@/components/ui/badge";
import { Toggle } from "@/components/Toggle";
import { apiGet, apiPost, apiDelete } from "@/lib/api";

interface Member {
  id: number;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden />
      <div className="relative bg-card text-card-foreground rounded-xl border border-border shadow-lg w-full max-w-lg max-h-[90vh] overflow-y-auto p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold">{title}</h3>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose} aria-label="Tutup">
            <X className="w-4 h-4" />
          </Button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function Team({ embedded = false }: { embedded?: boolean }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const [newPassword, setNewPassword] = useState<string | null>(null);
  const [showPw, setShowPw] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const r = await apiGet<{ members: Member[] } | Member[]>("/team");
      setMembers(Array.isArray(r) ? r : r.members ?? []);
    } catch (e: any) {
      toast.error(e.message || "Gagal memuat tim");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const invite = async () => {
    if (!name.trim() || !email.trim()) { toast.error("Nama dan email wajib diisi"); return; }
    try {
      const r = await apiPost<{ password?: string; member?: Member }>("/team", {
        name: name.trim(), email: email.trim(), role,
      });
      setNewPassword(r.password ?? null);
      toast.success("Anggota ditambahkan");
      setName(""); setEmail(""); setRole("member");
      load();
    } catch (e: any) { toast.error(e.message || "Gagal mengundang"); }
  };

  const toggleActive = async (m: Member, v: boolean) => {
    try {
      await apiPost(`/team/${m.id}/toggle`, {});
      setMembers((prev) => prev.map((x) => (x.id === m.id ? { ...x, isActive: v } : x)));
      toast.success(v ? "Anggota diaktifkan" : "Anggota dinonaktifkan");
    } catch (e: any) { toast.error(e.message || "Gagal mengubah status"); }
  };

  const confirmDelete = async () => {
    if (deleting == null) return;
    try {
      await apiDelete(`/team/${deleting}`);
      toast.success("Anggota dihapus");
      setDeleting(null);
      load();
    } catch (e: any) { toast.error(e.message || "Gagal menghapus"); }
  };

  const copyPw = () => {
    if (!newPassword) return;
    navigator.clipboard.writeText(newPassword)
      .then(() => toast.success("Password disalin"))
      .catch(() => toast.error("Gagal menyalin"));
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {!embedded && (
          <div>
            <h1 className="text-xl font-bold text-foreground">Tim</h1>
            <p className="text-sm text-muted-foreground">Kelola anggota tim / CS yang bisa akses akun ini.</p>
          </div>
        )}
        <Button size="sm" onClick={() => { setShowInvite(true); setNewPassword(null); }} className="gap-1.5">
          <Plus className="w-4 h-4" /> Undang Anggota
        </Button>
      </div>

      {loading ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">Memuat...</CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="py-3 px-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Nama</th>
                    <th className="py-3 px-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Email</th>
                    <th className="py-3 px-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Role</th>
                    <th className="py-3 px-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Aktif</th>
                    <th className="py-3 px-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {members.length === 0 && (
                    <tr><td colSpan={5} className="py-8 text-center text-muted-foreground">
                      <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      Belum ada anggota tim.
                    </td></tr>
                  )}
                  {members.map((m) => (
                    <tr key={m.id} className="border-b border-border last:border-0">
                      <td className="py-3 px-4 font-medium">{m.name}</td>
                      <td className="py-3 px-4 text-muted-foreground">{m.email}</td>
                      <td className="py-3 px-4"><Badge variant="secondary" className="capitalize">{m.role}</Badge></td>
                      <td className="py-3 px-4">
                        <Toggle checked={m.isActive} label={`Aktif ${m.name}`} onToggle={(v) => toggleActive(m, v)} />
                      </td>
                      <td className="py-3 px-4 text-right">
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleting(m.id)} aria-label="Hapus">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {showInvite && (
        <Modal title="Undang Anggota Tim" onClose={() => setShowInvite(false)}>
          {newPassword ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
                <p className="text-sm font-medium text-amber-700 dark:text-amber-400">Password sementara — hanya tampil sekali!</p>
                <p className="text-xs text-muted-foreground mt-1">Salin dan kirim ke anggota. Mereka wajib ganti setelah login pertama.</p>
              </div>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded-md bg-muted px-3 py-2.5 font-mono text-sm">
                  {showPw ? newPassword : "••••••••••••"}
                </code>
                <Button variant="outline" size="icon" className="h-10 w-10 shrink-0" onClick={() => setShowPw(!showPw)} aria-label="Tampilkan">
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </Button>
                <Button variant="outline" size="icon" className="h-10 w-10 shrink-0" onClick={copyPw} aria-label="Salin">
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
              <div className="flex justify-end">
                <Button onClick={() => { setShowInvite(false); setNewPassword(null); }}>Selesai</Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Nama</label>
                <Input className="mt-1.5" placeholder="Nama anggota" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div>
                <label className="text-sm font-medium">Email</label>
                <Input type="email" className="mt-1.5" placeholder="cs@perusahaan.com" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div>
                <label className="text-sm font-medium">Role</label>
                <Dropdown
                  value={role}
                  onChange={setRole}
                  ariaLabel="Role"
                  className="mt-1.5"
                  options={[
                    { value: "member", label: "Member — balas chat & kirim pesan" },
                    { value: "admin", label: "Admin — kelola semua kecuali billing" },
                    { value: "viewer", label: "Viewer — hanya lihat" },
                  ]}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setShowInvite(false)}>Batal</Button>
                <Button onClick={invite}>Undang</Button>
              </div>
            </div>
          )}
        </Modal>
      )}

      {deleting != null && (
        <Modal title="Hapus anggota?" onClose={() => setDeleting(null)}>
          <p className="text-sm text-muted-foreground">Akses anggota ini akan dicabut permanen.</p>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setDeleting(null)}>Batal</Button>
            <Button variant="destructive" onClick={confirmDelete}>Hapus</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

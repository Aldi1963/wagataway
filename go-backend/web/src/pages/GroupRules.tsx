import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, X, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Toggle } from "@/components/Toggle";
import { apiGet, apiPost, apiPut, apiDelete } from "@/lib/api";

interface GroupRule {
  id: number;
  group_name: string;
  group_jid?: string;
  welcome_message?: string;
  anti_link: boolean;
  anti_spam: boolean;
  active: boolean;
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

const inputCls =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring";

export default function GroupRules() {
  const [items, setItems] = useState<GroupRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<GroupRule | null>(null);
  const [groupName, setGroupName] = useState("");
  const [groupJid, setGroupJid] = useState("");
  const [welcome, setWelcome] = useState("");
  const [antiLink, setAntiLink] = useState(true);
  const [antiSpam, setAntiSpam] = useState(true);
  const [deleting, setDeleting] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const r = await apiGet<{ rules: GroupRule[] } | GroupRule[]>("/group-rules");
      setItems(Array.isArray(r) ? r : r.rules ?? []);
    } catch (e: any) {
      toast.error(e.message || "Gagal memuat aturan grup");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openModal = (g?: GroupRule) => {
    setEditing(g ?? null);
    setGroupName(g?.group_name ?? "");
    setGroupJid(g?.group_jid ?? "");
    setWelcome(g?.welcome_message ?? "");
    setAntiLink(g?.anti_link ?? true);
    setAntiSpam(g?.anti_spam ?? true);
    setShowModal(true);
  };

  const save = async () => {
    if (!groupName.trim()) { toast.error("Nama grup wajib diisi"); return; }
    try {
      const payload = {
        group_name: groupName.trim(),
        group_jid: groupJid.trim() || null,
        welcome_message: welcome.trim() || null,
        anti_link: antiLink,
        anti_spam: antiSpam,
      };
      if (editing) { await apiPut(`/group-rules/${editing.id}`, payload); toast.success("Diperbarui"); }
      else { await apiPost("/group-rules", payload); toast.success("Aturan ditambahkan"); }
      setShowModal(false);
      load();
    } catch (e: any) { toast.error(e.message || "Gagal menyimpan"); }
  };

  const toggleField = async (g: GroupRule, field: "active" | "anti_link" | "anti_spam", v: boolean) => {
    try {
      await apiPut(`/group-rules/${g.id}`, { [field]: v });
      setItems((prev) => prev.map((x) => (x.id === g.id ? { ...x, [field]: v } : x)));
      toast.success("Aturan diperbarui");
    } catch (e: any) { toast.error(e.message || "Gagal mengubah status"); }
  };

  const confirmDelete = async () => {
    if (deleting == null) return;
    try {
      await apiDelete(`/group-rules/${deleting}`);
      toast.success("Dihapus");
      setDeleting(null);
      load();
    } catch (e: any) { toast.error(e.message || "Gagal menghapus"); }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-foreground">Aturan Grup</h1>
          <p className="text-sm text-muted-foreground">Sambutan otomatis anggota baru, anti-link & anti-spam.</p>
        </div>
        <Button size="sm" onClick={() => openModal()} className="gap-1.5">
          <Plus className="w-4 h-4" /> Tambah Aturan
        </Button>
      </div>

      {loading ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">Memuat...</CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="py-3 px-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Grup</th>
                    <th className="py-3 px-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Welcome</th>
                    <th className="py-3 px-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Anti-Link</th>
                    <th className="py-3 px-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Anti-Spam</th>
                    <th className="py-3 px-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Aktif</th>
                    <th className="py-3 px-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {items.length === 0 && (
                    <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">Belum ada aturan grup.</td></tr>
                  )}
                  {items.map((g) => (
                    <tr key={g.id} className="border-b border-border last:border-0">
                      <td className="py-3 px-4 font-medium">
                        <span className="inline-flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5 text-muted-foreground" />{g.group_name}</span>
                      </td>
                      <td className="py-3 px-4 text-xs text-muted-foreground max-w-[220px] truncate" title={g.welcome_message}>{g.welcome_message || "-"}</td>
                      <td className="py-3 px-4"><Toggle checked={g.anti_link} label={`Anti-link ${g.group_name}`} onToggle={(v) => toggleField(g, "anti_link", v)} /></td>
                      <td className="py-3 px-4"><Toggle checked={g.anti_spam} label={`Anti-spam ${g.group_name}`} onToggle={(v) => toggleField(g, "anti_spam", v)} /></td>
                      <td className="py-3 px-4">
                        <Toggle checked={g.active} label={`Aktif ${g.group_name}`} onToggle={(v) => toggleField(g, "active", v)} />
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openModal(g)} aria-label="Ubah">
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleting(g.id)} aria-label="Hapus">
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

      {showModal && (
        <Modal title={editing ? "Ubah Aturan Grup" : "Tambah Aturan Grup"} onClose={() => setShowModal(false)}>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Nama Grup</label>
              <Input className="mt-1.5" placeholder="cth: Grup Reseller" value={groupName} onChange={(e) => setGroupName(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium">JID Grup <span className="text-muted-foreground font-normal">(opsional)</span></label>
              <Input className="mt-1.5 font-mono" placeholder="120363xxxx@g.us" value={groupJid} onChange={(e) => setGroupJid(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium">Pesan Welcome <span className="text-muted-foreground font-normal">(opsional)</span></label>
              <textarea value={welcome} onChange={(e) => setWelcome(e.target.value)} rows={3} placeholder="Selamat datang di grup, kak! 🙏" className={`${inputCls} mt-1.5 resize-y`} />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <p className="text-sm font-medium">Anti-Link</p>
                <p className="text-xs text-muted-foreground">Hapus pesan berisi link otomatis</p>
              </div>
              <Toggle checked={antiLink} label="Anti-link" onToggle={setAntiLink} />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <p className="text-sm font-medium">Anti-Spam</p>
                <p className="text-xs text-muted-foreground">Batasi pesan beruntun dari satu anggota</p>
              </div>
              <Toggle checked={antiSpam} label="Anti-spam" onToggle={setAntiSpam} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowModal(false)}>Batal</Button>
              <Button onClick={save}>Simpan</Button>
            </div>
          </div>
        </Modal>
      )}

      {deleting != null && (
        <Modal title="Hapus?" onClose={() => setDeleting(null)}>
          <p className="text-sm text-muted-foreground">Aturan yang dihapus tidak bisa dikembalikan.</p>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setDeleting(null)}>Batal</Button>
            <Button variant="destructive" onClick={confirmDelete}>Hapus</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

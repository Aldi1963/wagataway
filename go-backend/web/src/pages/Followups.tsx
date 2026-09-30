import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, X, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Toggle } from "@/components/Toggle";
import { apiGet, apiPost, apiPut, apiDelete } from "@/lib/api";

interface Followup {
  id: number;
  name: string;
  target: string;
  message: string;
  trigger_hours: number;
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

export default function Followups() {
  const [items, setItems] = useState<Followup[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Followup | null>(null);
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [message, setMessage] = useState("");
  const [triggerHours, setTriggerHours] = useState("24");
  const [deleting, setDeleting] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const r = await apiGet<{ followups: Followup[] } | Followup[]>("/followups");
      setItems(Array.isArray(r) ? r : r.followups ?? []);
    } catch (e: any) {
      toast.error(e.message || "Gagal memuat follow-up");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openModal = (f?: Followup) => {
    setEditing(f ?? null);
    setName(f?.name ?? "");
    setTarget(f?.target ?? "");
    setMessage(f?.message ?? "");
    setTriggerHours(String(f?.trigger_hours ?? 24));
    setShowModal(true);
  };

  const save = async () => {
    if (!name.trim() || !target.trim() || !message.trim()) { toast.error("Nama, target, dan pesan wajib diisi"); return; }
    const hours = Number(triggerHours);
    if (!hours || hours < 1) { toast.error("Trigger jam harus minimal 1"); return; }
    try {
      const payload = { name: name.trim(), target: target.trim(), message: message.trim(), trigger_hours: hours };
      if (editing) { await apiPut(`/followups/${editing.id}`, payload); toast.success("Diperbarui"); }
      else { await apiPost("/followups", payload); toast.success("Follow-up ditambahkan"); }
      setShowModal(false);
      load();
    } catch (e: any) { toast.error(e.message || "Gagal menyimpan"); }
  };

  const toggleActive = async (f: Followup, v: boolean) => {
    try {
      await apiPut(`/followups/${f.id}`, { active: v });
      setItems((prev) => prev.map((x) => (x.id === f.id ? { ...x, active: v } : x)));
      toast.success(v ? "Follow-up diaktifkan" : "Follow-up dinonaktifkan");
    } catch (e: any) { toast.error(e.message || "Gagal mengubah status"); }
  };

  const confirmDelete = async () => {
    if (deleting == null) return;
    try {
      await apiDelete(`/followups/${deleting}`);
      toast.success("Dihapus");
      setDeleting(null);
      load();
    } catch (e: any) { toast.error(e.message || "Gagal menghapus"); }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-foreground">Follow-up Otomatis</h1>
          <p className="text-sm text-muted-foreground">Kirim pesan lanjutan otomatis ke kontak yang belum merespons.</p>
        </div>
        <Button size="sm" onClick={() => openModal()} className="gap-1.5">
          <Plus className="w-4 h-4" /> Tambah Follow-up
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
                    <th className="py-3 px-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Nama</th>
                    <th className="py-3 px-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Target</th>
                    <th className="py-3 px-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Pesan</th>
                    <th className="py-3 px-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Trigger</th>
                    <th className="py-3 px-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Aktif</th>
                    <th className="py-3 px-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {items.length === 0 && (
                    <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">Belum ada follow-up.</td></tr>
                  )}
                  {items.map((f) => (
                    <tr key={f.id} className="border-b border-border last:border-0">
                      <td className="py-3 px-4 font-medium">
                        <span className="inline-flex items-center gap-1.5"><Timer className="w-3.5 h-3.5 text-muted-foreground" />{f.name}</span>
                      </td>
                      <td className="py-3 px-4 font-mono text-[13px]">{f.target}</td>
                      <td className="py-3 px-4 text-xs text-muted-foreground max-w-[220px] truncate" title={f.message}>{f.message}</td>
                      <td className="py-3 px-4 whitespace-nowrap text-xs">{f.trigger_hours} jam</td>
                      <td className="py-3 px-4">
                        <Toggle checked={f.active} label={`Aktif ${f.name}`} onToggle={(v) => toggleActive(f, v)} />
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openModal(f)} aria-label="Ubah">
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleting(f.id)} aria-label="Hapus">
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
        <Modal title={editing ? "Ubah Follow-up" : "Tambah Follow-up"} onClose={() => setShowModal(false)}>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Nama</label>
              <Input className="mt-1.5" placeholder="cth: Follow-up prospek" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">Target</label>
                <Input className="mt-1.5" placeholder="Label / nomor" value={target} onChange={(e) => setTarget(e.target.value)} />
              </div>
              <div>
                <label className="text-sm font-medium">Trigger (jam)</label>
                <Input type="number" min={1} className="mt-1.5" value={triggerHours} onChange={(e) => setTriggerHours(e.target.value)} />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">Isi Pesan</label>
              <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={4} placeholder="Halo kak, kemarin sempat tanya-tanya..." className={`${inputCls} mt-1.5 resize-y`} />
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
          <p className="text-sm text-muted-foreground">Follow-up yang dihapus tidak bisa dikembalikan.</p>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setDeleting(null)}>Batal</Button>
            <Button variant="destructive" onClick={confirmDelete}>Hapus</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, X, Copy, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { apiGet, apiPost, apiPut, apiDelete } from "@/lib/api";

interface Canned {
  id: number;
  shortcut: string;
  title: string;
  content: string;
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

export default function CannedResponses() {
  const [items, setItems] = useState<Canned[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Canned | null>(null);
  const [shortcut, setShortcut] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [deleting, setDeleting] = useState<number | null>(null);
  const [search, setSearch] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const r = await apiGet<{ responses: Canned[] } | Canned[]>("/canned-responses");
      setItems(Array.isArray(r) ? r : r.responses ?? []);
    } catch (e: any) {
      toast.error(e.message || "Gagal memuat canned responses");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openModal = (c?: Canned) => {
    setEditing(c ?? null);
    setShortcut(c?.shortcut ?? "");
    setTitle(c?.title ?? "");
    setContent(c?.content ?? "");
    setShowModal(true);
  };

  const save = async () => {
    if (!shortcut.trim() || !content.trim()) { toast.error("Shortcut dan isi wajib diisi"); return; }
    try {
      const payload = { shortcut: shortcut.trim(), title: title.trim() || shortcut.trim(), content: content.trim() };
      if (editing) {
        await apiPut(`/canned-responses/${editing.id}`, payload);
        toast.success("Diperbarui");
      } else {
        await apiPost("/canned-responses", payload);
        toast.success("Ditambahkan");
      }
      setShowModal(false);
      load();
    } catch (e: any) { toast.error(e.message || "Gagal menyimpan"); }
  };

  const confirmDelete = async () => {
    if (deleting == null) return;
    try {
      await apiDelete(`/canned-responses/${deleting}`);
      toast.success("Dihapus");
      setDeleting(null);
      load();
    } catch (e: any) { toast.error(e.message || "Gagal menghapus"); }
  };

  const copyContent = (c: Canned) => {
    navigator.clipboard.writeText(c.content)
      .then(() => toast.success("Isi disalin"))
      .catch(() => toast.error("Gagal menyalin"));
  };

  const filtered = items.filter((c) =>
    (c.shortcut + c.title + c.content).toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-foreground">Canned Responses</h1>
          <p className="text-sm text-muted-foreground">Template jawaban cepat untuk CS. Ketik shortcut untuk pakai.</p>
        </div>
        <Button size="sm" onClick={() => openModal()} className="gap-1.5">
          <Plus className="w-4 h-4" /> Tambah
        </Button>
      </div>

      <Input placeholder="Cari shortcut / judul / isi..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />

      {loading ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">Memuat...</CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="py-3 px-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Shortcut</th>
                    <th className="py-3 px-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Judul</th>
                    <th className="py-3 px-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Isi</th>
                    <th className="py-3 px-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 && (
                    <tr><td colSpan={4} className="py-8 text-center text-muted-foreground">Belum ada canned response.</td></tr>
                  )}
                  {filtered.map((c) => (
                    <tr key={c.id} className="border-b border-border last:border-0">
                      <td className="py-3 px-4">
                        <Badge variant="secondary" className="font-mono gap-1"><Zap className="w-3 h-3" />{c.shortcut}</Badge>
                      </td>
                      <td className="py-3 px-4 font-medium">{c.title}</td>
                      <td className="py-3 px-4 text-xs text-muted-foreground max-w-[280px] truncate" title={c.content}>{c.content}</td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => copyContent(c)} aria-label="Salin isi" title="Salin isi">
                          <Copy className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openModal(c)} aria-label="Ubah">
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleting(c.id)} aria-label="Hapus">
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
        <Modal title={editing ? "Ubah Canned Response" : "Tambah Canned Response"} onClose={() => setShowModal(false)}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">Shortcut</label>
                <Input className="mt-1.5 font-mono" placeholder="/salam" value={shortcut} onChange={(e) => setShortcut(e.target.value)} />
              </div>
              <div>
                <label className="text-sm font-medium">Judul</label>
                <Input className="mt-1.5" placeholder="Salam pembuka" value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">Isi Pesan</label>
              <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={5} placeholder="Halo kak, ada yang bisa kami bantu?" className={`${inputCls} mt-1.5 resize-y`} />
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
          <p className="text-sm text-muted-foreground">Canned response yang dihapus tidak bisa dikembalikan.</p>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setDeleting(null)}>Batal</Button>
            <Button variant="destructive" onClick={confirmDelete}>Hapus</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

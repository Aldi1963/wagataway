import { toast } from "sonner";
import { useEffect, useState, type ReactNode } from "react";
import { Plus, Copy, Trash2, FileText, Pencil, X, RefreshCw, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiGet, apiPost, apiPut, apiDelete } from "@/lib/api";

interface Template {
  id: number;
  name: string;
  category: string;
  content: string;
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-hidden
      />
      <div className="relative bg-card text-card-foreground rounded-xl border border-border shadow-lg w-full max-w-lg max-h-[90vh] overflow-y-auto p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold">{title}</h3>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={onClose}
            aria-label="Tutup"
          >
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

// ── Preview helpers ─────────────────────────────────────────────────────────
const varRegex = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;

function extractVars(content: string): string[] {
  const out: string[] = [];
  varRegex.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = varRegex.exec(content)) !== null) {
    if (!out.includes(m[1])) out.push(m[1]);
  }
  return out;
}

function exampleFor(name: string): string {
  const known: Record<string, string> = { nama: "Budi" };
  if (known[name]) return known[name];
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function renderPreview(
  content: string,
  values: Record<string, string>
): ReactNode[] {
  const parts: ReactNode[] = [];
  varRegex.lastIndex = 0;
  let last = 0;
  let i = 0;
  let m: RegExpExecArray | null;
  while ((m = varRegex.exec(content)) !== null) {
    if (m.index > last) parts.push(content.slice(last, m.index));
    const val = values[m[1]] ?? m[0];
    parts.push(
      <strong key={i++} className="text-foreground font-semibold">
        {val}
      </strong>
    );
    last = m.index + m[0].length;
  }
  if (last < content.length) parts.push(content.slice(last));
  return parts;
}

export default function Templates({ embedded = false }: { embedded?: boolean }) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showAdd, setShowAdd] = useState(false);
  const [addName, setAddName] = useState("");
  const [addCategory, setAddCategory] = useState("");
  const [addContent, setAddContent] = useState("");
  const [savingAdd, setSavingAdd] = useState(false);

  const [editing, setEditing] = useState<Template | null>(null);
  const [editName, setEditName] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editContent, setEditContent] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const [deleting, setDeleting] = useState<Template | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);

  const [previewing, setPreviewing] = useState<Template | null>(null);
  const [previewValues, setPreviewValues] = useState<Record<string, string>>(
    {}
  );

  const openPreview = (t: Template) => {
    const values: Record<string, string> = {};
    for (const v of extractVars(t.content)) values[v] = exampleFor(v);
    setPreviewValues(values);
    setPreviewing(t);
  };

  const previewVars = previewing ? extractVars(previewing.content) : [];

  const load = () => {
    setLoading(true);
    setError(null);
    apiGet<{ templates: Template[] }>("/templates")
      .then((res) => setTemplates(res.templates || []))
      .catch((e) => setError(e.message || "Gagal memuat template"))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleAdd = async () => {
    if (!addName.trim() || !addContent.trim()) {
      toast.error("Nama dan isi template wajib diisi");
      return;
    }
    setSavingAdd(true);
    try {
      await apiPost("/templates", {
        name: addName.trim(),
        category: addCategory.trim(),
        content: addContent.trim(),
      });
      toast.success("Template ditambahkan");
      setShowAdd(false);
      setAddName("");
      setAddCategory("");
      setAddContent("");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal menambah template");
    } finally {
      setSavingAdd(false);
    }
  };

  const openEdit = (t: Template) => {
    setEditing(t);
    setEditName(t.name);
    setEditCategory(t.category || "");
    setEditContent(t.content);
  };

  const handleEdit = async () => {
    if (!editing) return;
    if (!editName.trim() || !editContent.trim()) {
      toast.error("Nama dan isi template wajib diisi");
      return;
    }
    setSavingEdit(true);
    try {
      await apiPut(`/templates/${editing.id}`, {
        name: editName.trim(),
        category: editCategory.trim(),
        content: editContent.trim(),
      });
      toast.success("Template diperbarui");
      setEditing(null);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal memperbarui template");
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setDeletingBusy(true);
    try {
      await apiDelete(`/templates/${deleting.id}`);
      toast.success("Template dihapus");
      setDeleting(null);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal menghapus template");
    } finally {
      setDeletingBusy(false);
    }
  };

  const handleCopy = async (content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      toast.success("Template disalin ke clipboard");
    } catch {
      toast.error("Gagal menyalin");
    }
  };

  return (
    <div className="space-y-6"> <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {!embedded && (
          <div>
            <h2 className="text-lg font-semibold text-foreground">Template Pesan</h2>
            <p className="text-sm text-muted-foreground">
              Template reusable dengan variabel
            </p>
          </div>
        )}
        <Button size="sm" className="gap-1.5" onClick={() => setShowAdd(true)}>
          <Plus className="w-3.5 h-3.5" />
          Tambah Template
        </Button>
      </div>

      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <div className="animate-pulse space-y-3">
                  <div className="h-4 bg-secondary rounded w-1/2" />
                  <div className="h-12 bg-secondary rounded w-full" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {!loading && error && (
        <Card>
          <CardContent className="p-6 text-center space-y-3">
            <p className="text-sm text-destructive">{error}</p>
            <Button size="sm" variant="outline" onClick={load} className="gap-1.5">
              <RefreshCw className="w-3.5 h-3.5" /> Coba lagi
            </Button>
          </CardContent>
        </Card>
      )}

      {!loading && !error && templates.length === 0 && (
        <Card>
          <CardContent className="p-10 text-center space-y-3">
            <FileText className="w-8 h-8 mx-auto text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">
              Belum ada template
            </p>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              Buat template pesan yang bisa dipakai ulang dengan variabel seperti
              {" {{nama}}"}.
            </p>
            <Button size="sm" onClick={() => setShowAdd(true)} className="gap-1.5">
              <Plus className="w-3.5 h-3.5" /> Buat Template
            </Button>
          </CardContent>
        </Card>
      )}

      {!loading && !error && templates.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((tpl) => (
            <Card key={tpl.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-2 gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="w-4 h-4 shrink-0 text-muted-foreground" />
                    <span className="text-sm font-semibold text-foreground truncate">
                      {tpl.name}
                    </span>
                  </div>
                  {tpl.category && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded border border-border text-muted-foreground shrink-0">
                      {tpl.category}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed border-l-2 border-border pl-2 whitespace-pre-wrap break-words">
                  {tpl.content}
                </p>
                <div className="flex items-center gap-1 mt-3">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-[10px] gap-1"
                    onClick={() => handleCopy(tpl.content)}
                  >
                    <Copy className="w-3 h-3" /> Salin
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => openPreview(tpl)}
                    aria-label="Preview template"
                  >
                    <Eye className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => openEdit(tpl)}
                    aria-label="Edit template"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive"
                    onClick={() => setDeleting(tpl)}
                    aria-label="Hapus template"
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {showAdd && (
        <Modal title="Tambah Template" onClose={() => setShowAdd(false)}>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-foreground">Nama</label>
              <Input
                className="mt-1"
                placeholder="cth: Sapaan Pagi"
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-foreground">
                Kategori (opsional)
              </label>
              <Input
                className="mt-1"
                placeholder="cth: umum, order, sales"
                value={addCategory}
                onChange={(e) => setAddCategory(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-foreground">Isi</label>
              <textarea
                className={`${inputCls} mt-1 min-h-[120px]`}
                placeholder={"Halo {{nama}}, terima kasih..."}
                value={addContent}
                onChange={(e) => setAddContent(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAdd(false)}
              >
                Batal
              </Button>
              <Button size="sm" onClick={handleAdd} disabled={savingAdd}>
                {savingAdd ? "Menyimpan..." : "Simpan"}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {editing && (
        <Modal title="Edit Template" onClose={() => setEditing(null)}>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-foreground">Nama</label>
              <Input
                className="mt-1"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-foreground">
                Kategori (opsional)
              </label>
              <Input
                className="mt-1"
                value={editCategory}
                onChange={(e) => setEditCategory(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-foreground">Isi</label>
              <textarea
                className={`${inputCls} mt-1 min-h-[120px]`}
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditing(null)}
              >
                Batal
              </Button>
              <Button size="sm" onClick={handleEdit} disabled={savingEdit}>
                {savingEdit ? "Menyimpan..." : "Simpan"}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {previewing && (
        <Modal title="Preview Template" onClose={() => setPreviewing(null)}>
          <div className="space-y-4">
            <div>
              <p className="text-sm font-semibold text-foreground">
                {previewing.name}
              </p>
              {previewing.category && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  Kategori: {previewing.category}
                </p>
              )}
            </div>

            {previewVars.length === 0 ? (
              <>
                <div className="rounded-md border border-border bg-secondary/40 p-3 text-sm text-muted-foreground whitespace-pre-wrap break-words">
                  {previewing.content}
                </div>
                <p className="text-xs text-muted-foreground">
                  Template ini tidak memakai variabel.
                </p>
              </>
            ) : (
              <>
                <div className="space-y-3">
                  {previewVars.map((v) => (
                    <div key={v}>
                      <label className="text-xs font-medium text-foreground">
                        {`{{${v}}}`}
                      </label>
                      <Input
                        className="mt-1"
                        value={previewValues[v] ?? ""}
                        onChange={(e) =>
                          setPreviewValues((p) => ({
                            ...p,
                            [v]: e.target.value,
                          }))
                        }
                      />
                    </div>
                  ))}
                </div>
                <div>
                  <p className="text-xs font-medium text-foreground mb-1.5">
                    Hasil preview
                  </p>
                  <div className="rounded-md border border-border bg-secondary/40 p-3 text-sm text-muted-foreground whitespace-pre-wrap break-words">
                    {renderPreview(previewing.content, previewValues)}
                  </div>
                </div>
              </>
            )}

            <div className="flex justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPreviewing(null)}
              >
                Tutup
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {deleting && (
        <Modal title="Hapus Template" onClose={() => setDeleting(null)}>
          <p className="text-sm text-muted-foreground">
            Hapus template <b className="text-foreground">{deleting.name}</b>?
          </p>
          <div className="flex justify-end gap-2 mt-5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDeleting(null)}
            >
              Batal
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={handleDelete}
              disabled={deletingBusy}
            >
              {deletingBusy ? "Menghapus..." : "Hapus"}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

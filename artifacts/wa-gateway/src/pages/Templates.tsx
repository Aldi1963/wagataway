import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  FileText, Plus, Pencil, Trash2, Loader2, Copy, CheckCheck,
  Tag, Search, Hash, Sparkles, ChevronRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { id as localeId } from "date-fns/locale";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Template {
  id: string;
  name: string;
  category: string;
  content: string;
  variables: string[];
  usageCount: number;
  createdAt: string;
  updatedAt: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CATEGORIES = [
  { value: "general",    label: "Umum",          color: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" },
  { value: "greeting",   label: "Salam",          color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  { value: "promo",      label: "Promosi",        color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  { value: "followup",   label: "Follow Up",      color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  { value: "reminder",   label: "Pengingat",      color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" },
  { value: "support",    label: "Dukungan",       color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
  { value: "invoice",    label: "Invoice",        color: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" },
];

function getCategoryMeta(value: string) {
  return CATEGORIES.find((c) => c.value === value) ?? CATEGORIES[0];
}

// Extract {{variable}} placeholders from content
function extractVariables(content: string): string[] {
  const matches = content.match(/\{\{(\w+)\}\}/g) ?? [];
  return [...new Set(matches.map((m) => m.slice(2, -2)))];
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center gap-4">
      <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
        <FileText className="w-8 h-8 text-primary" />
      </div>
      <div>
        <p className="font-semibold text-lg">Belum ada template</p>
        <p className="text-sm text-muted-foreground mt-1">
          Buat template pesan agar bisa dipakai ulang kapan saja
        </p>
      </div>
      <Button onClick={onAdd} className="gap-2">
        <Plus className="w-4 h-4" />
        Buat Template Pertama
      </Button>
    </div>
  );
}

// ── Template Card ─────────────────────────────────────────────────────────────

function TemplateCard({ t, onEdit, onDelete, onCopy }: {
  t: Template;
  onEdit: (t: Template) => void;
  onDelete: (id: string) => void;
  onCopy: (content: string) => void;
}) {
  const cat = getCategoryMeta(t.category);

  return (
    <Card className="hover:shadow-md transition-shadow group">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <CardTitle className="text-base truncate">{t.name}</CardTitle>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cat.color}`}>
                {cat.label}
              </span>
            </div>
            {t.variables.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {t.variables.map((v) => (
                  <span key={v} className="inline-flex items-center gap-1 text-xs bg-muted px-1.5 py-0.5 rounded font-mono text-muted-foreground">
                    <Hash className="w-2.5 h-2.5" />
                    {v}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onCopy(t.content)} title="Salin isi">
              <Copy className="w-3.5 h-3.5" />
            </Button>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onEdit(t)} title="Edit">
              <Pencil className="w-3.5 h-3.5" />
            </Button>
            <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => onDelete(t.id)} title="Hapus">
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        <p className="text-sm text-muted-foreground line-clamp-3 whitespace-pre-line bg-muted/40 rounded-lg px-3 py-2 border text-xs font-mono leading-relaxed">
          {t.content}
        </p>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Sparkles className="w-3 h-3" />
            Dipakai {t.usageCount}×
          </span>
          <span>{format(new Date(t.createdAt), "d MMM yyyy", { locale: localeId })}</span>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Dialog form ───────────────────────────────────────────────────────────────

interface FormState {
  name: string;
  category: string;
  content: string;
}

function TemplateDialog({ open, initial, onClose, onSave, saving }: {
  open: boolean;
  initial: (Template & { isEdit: boolean }) | null;
  onClose: () => void;
  onSave: (data: FormState) => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<FormState>({
    name: initial?.name ?? "",
    category: initial?.category ?? "general",
    content: initial?.content ?? "",
  });

  const detectedVars = extractVariables(form.content);

  const isEdit = !!initial?.isEdit;

  function handleOpen(o: boolean) {
    if (!o) onClose();
  }

  // Sync form when initial changes
  if (open && initial && form.name !== initial.name && initial.isEdit) {
    setForm({ name: initial.name, category: initial.category, content: initial.content });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-4 h-4" />
            {isEdit ? "Edit Template" : "Buat Template Baru"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Nama Template <span className="text-destructive">*</span></Label>
            <Input
              placeholder="cth: Pesan Selamat Datang Pelanggan"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Kategori</Label>
            <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Isi Pesan <span className="text-destructive">*</span></Label>
            <Textarea
              rows={6}
              placeholder={"Halo {{nama}},\n\nTerima kasih telah menghubungi kami! 😊\n\nAda yang bisa kami bantu?"}
              value={form.content}
              onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
              className="font-mono text-sm resize-none"
            />
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Hash className="w-3 h-3" />
              Gunakan <code className="bg-muted px-1 rounded">{"{{variabel}}"}</code> untuk teks dinamis
            </p>
          </div>

          {detectedVars.length > 0 && (
            <div className="rounded-lg bg-primary/5 border border-primary/20 p-3 space-y-1.5">
              <p className="text-xs font-medium text-primary flex items-center gap-1">
                <Tag className="w-3 h-3" />
                Variabel terdeteksi:
              </p>
              <div className="flex flex-wrap gap-1.5">
                {detectedVars.map((v) => (
                  <span key={v} className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded font-mono">
                    {`{{${v}}}`}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Batal</Button>
          <Button
            disabled={saving || !form.name.trim() || !form.content.trim()}
            onClick={() => onSave({ ...form, })}
            className="gap-2"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCheck className="w-4 h-4" />}
            {isEdit ? "Simpan Perubahan" : "Buat Template"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Templates() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<(Template & { isEdit: boolean }) | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const { data: templates = [], isLoading } = useQuery<Template[]>({
    queryKey: ["templates"],
    queryFn: () => apiFetch("/templates").then((r) => r.json()),
  });

  const createMut = useMutation({
    mutationFn: (body: FormState) =>
      apiFetch("/templates", { method: "POST", body: JSON.stringify({ ...body, variables: extractVariables(body.content) }) }).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["templates"] });
      setDialogOpen(false);
      setEditTarget(null);
      toast({ title: "Template berhasil dibuat" });
    },
    onError: () => toast({ title: "Gagal membuat template", variant: "destructive" }),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: FormState }) =>
      apiFetch(`/templates/${id}`, { method: "PUT", body: JSON.stringify({ ...body, variables: extractVariables(body.content) }) }).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["templates"] });
      setDialogOpen(false);
      setEditTarget(null);
      toast({ title: "Template berhasil diperbarui" });
    },
    onError: () => toast({ title: "Gagal memperbarui template", variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => apiFetch(`/templates/${id}`, { method: "DELETE" }).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["templates"] });
      toast({ title: "Template dihapus" });
    },
    onError: () => toast({ title: "Gagal menghapus template", variant: "destructive" }),
  });

  function handleAdd() {
    setEditTarget(null);
    setDialogOpen(true);
  }

  function handleEdit(t: Template) {
    setEditTarget({ ...t, isEdit: true });
    setDialogOpen(true);
  }

  function handleCopy(content: string) {
    navigator.clipboard.writeText(content).then(() => {
      setCopiedId(content);
      toast({ title: "Isi template disalin" });
      setTimeout(() => setCopiedId(null), 2000);
    });
  }

  function handleSave(data: FormState) {
    if (editTarget?.isEdit) {
      updateMut.mutate({ id: editTarget.id, body: data });
    } else {
      createMut.mutate(data);
    }
  }

  // Filter + search
  const filtered = templates.filter((t) => {
    const matchCat = filterCat === "all" || t.category === filterCat;
    const q = search.toLowerCase();
    const matchSearch = !q || t.name.toLowerCase().includes(q) || t.content.toLowerCase().includes(q);
    return matchCat && matchSearch;
  });

  const saving = createMut.isPending || updateMut.isPending;

  // Stats
  const mostUsed = [...templates].sort((a, b) => b.usageCount - a.usageCount)[0];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <Button onClick={handleAdd} className="gap-2">
          <Plus className="w-4 h-4" />
          Tambah Template
        </Button>
      </div>

      {/* Stats */}
      {templates.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <FileText className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total Template</p>
                <p className="text-xl font-bold">{templates.length}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center shrink-0">
                <Sparkles className="w-5 h-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total Dipakai</p>
                <p className="text-xl font-bold">{templates.reduce((s, t) => s + t.usageCount, 0)}×</p>
              </div>
            </CardContent>
          </Card>
          {mostUsed && (
            <Card className="col-span-2 sm:col-span-1">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
                  <Tag className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Paling Sering Dipakai</p>
                  <p className="text-sm font-semibold truncate">{mostUsed.name}</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Filter & Search */}
      {templates.length > 0 && (
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Cari template..."
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={filterCat} onValueChange={setFilterCat}>
            <SelectTrigger className="w-full sm:w-44">
              <SelectValue placeholder="Semua Kategori" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Kategori</SelectItem>
              {CATEGORIES.map((c) => (
                <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Content */}
      {isLoading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-52" />)}
        </div>
      ) : templates.length === 0 ? (
        <EmptyState onAdd={handleAdd} />
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
          <Search className="w-8 h-8" />
          <p className="text-sm">Tidak ada template yang cocok</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((t) => (
            <TemplateCard
              key={t.id}
              t={t}
              onEdit={handleEdit}
              onDelete={(id) => deleteMut.mutate(id)}
              onCopy={handleCopy}
            />
          ))}
        </div>
      )}

      {/* Tips */}
      {templates.length > 0 && (
        <Card className="bg-muted/30 border-dashed">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground flex items-start gap-2">
              <ChevronRight className="w-3.5 h-3.5 mt-0.5 shrink-0 text-primary" />
              Gunakan <code className="bg-muted px-1 rounded mx-0.5">{"{{nama}}"}</code>,{" "}
              <code className="bg-muted px-1 rounded mx-0.5">{"{{nomor}}"}</code>, atau variabel lain. Template dapat dipakai langsung
              dari halaman <strong>Kirim Pesan</strong> dan <strong>Bulk Messages</strong> dengan tombol "Pilih Template".
            </p>
          </CardContent>
        </Card>
      )}

      {/* Dialog */}
      <TemplateDialog
        open={dialogOpen}
        initial={editTarget}
        onClose={() => { setDialogOpen(false); setEditTarget(null); }}
        onSave={handleSave}
        saving={saving}
      />
    </div>
  );
}

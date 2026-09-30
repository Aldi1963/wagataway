import { useEffect, useState } from "react";
import { Plus, Zap, Trash2, Pencil, X, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dropdown } from "@/components/ui/dropdown";
import { cn } from "@/lib/utils";
import { apiGet, apiPost, apiPut, apiDelete, apiFetch } from "@/lib/api";
import { toast } from "sonner";
import { useActiveDevice } from "@/hooks/use-active-device";

interface Rule {
  id: number;
  name: string;
  keyword: string;
  matchType: string;
  replyType: string;
  replyContent: string;
  deviceId: number | null;
  isActive: boolean;
  priority: number;
}

const matchTypeLabels: Record<string, string> = {
  contains: "Mengandung",
  exact: "Persis sama",
  startsWith: "Diawali",
};

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative bg-card text-card-foreground border border-border rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-border sticky top-0 bg-card rounded-t-xl">
          <h3 className="font-semibold">{title}</h3>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose} aria-label="Tutup">
            <X className="w-4 h-4" />
          </Button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

const emptyForm = { name: "", keyword: "", matchType: "contains", replyContent: "" };

export default function AutoReply({ embedded = false }: { embedded?: boolean }) {
  const { activeDeviceId, activeDevice } = useActiveDevice();
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Rule | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<Rule | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    apiGet<{ rules: Rule[] }>("/auto-reply")
      .then((r) => {
        setRules(r.rules || []);
      })
      .catch((e) => setError(e.message || "Gagal memuat data"))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const openAdd = () => {
    if (activeDeviceId == null) {
      toast.error("Pilih perangkat aktif di sidebar dulu");
      return;
    }
    setEditing(null);
    setForm(emptyForm);
    setShowForm(true);
  };

  const openEdit = (rule: Rule) => {
    setEditing(rule);
    setForm({
      name: rule.name,
      keyword: rule.keyword,
      matchType: rule.matchType || "contains",
      replyContent: rule.replyContent,
    });
    setShowForm(true);
  };

  const save = async () => {
    if (activeDeviceId == null) {
      toast.error("Pilih perangkat aktif di sidebar dulu");
      return;
    }
    if (!form.name.trim() || !form.keyword.trim() || !form.replyContent.trim()) {
      toast.error("Nama, keyword, dan isi balasan wajib diisi");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        keyword: form.keyword.trim(),
        matchType: form.matchType,
        replyContent: form.replyContent.trim(),
        deviceId: activeDeviceId,
      };
      if (editing) {
        const res = await apiPut<{ rule: Rule }>(`/auto-reply/${editing.id}`, payload);
        setRules((prev) => prev.map((r) => (r.id === editing.id ? res.rule : r)));
        toast.success("Rule diperbarui");
      } else {
        const res = await apiPost<{ rule: Rule }>("/auto-reply", payload);
        setRules((prev) => [res.rule, ...prev]);
        toast.success("Rule ditambahkan");
      }
      setShowForm(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal menyimpan");
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (rule: Rule) => {
    const next = !rule.isActive;
    setRules((prev) => prev.map((r) => (r.id === rule.id ? { ...r, isActive: next } : r)));
    try {
      const res = await apiFetch(`/auto-reply/${rule.id}/toggle`, { method: "PATCH" });
      if (!res.ok) throw new Error((await res.json()).message || "Gagal mengubah status");
      const data = await res.json();
      setRules((prev) =>
        prev.map((r) => (r.id === rule.id ? { ...r, isActive: data.isActive } : r))
      );
      toast.success(next ? "Rule diaktifkan" : "Rule dinonaktifkan");
    } catch (e) {
      setRules((prev) => prev.map((r) => (r.id === rule.id ? { ...r, isActive: rule.isActive } : r)));
      toast.error(e instanceof Error ? e.message : "Gagal mengubah status");
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await apiDelete(`/auto-reply/${deleting.id}`);
      setRules((prev) => prev.filter((r) => r.id !== deleting.id));
      toast.success("Rule dihapus");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal menghapus");
    } finally {
      setDeleting(null);
    }
  };

  // Hanya tampilkan rule milik perangkat aktif
  const visibleRules =
    activeDeviceId == null ? [] : rules.filter((r) => r.deviceId === activeDeviceId);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {!embedded && (
          <div>
            <h2 className="text-lg font-semibold text-foreground">Auto Reply</h2>
            <p className="text-sm text-muted-foreground">Balas pesan otomatis berdasarkan keyword</p>
          </div>
        )}
        <Button size="sm" className="gap-1.5" onClick={openAdd}>
          <Plus className="w-3.5 h-3.5" />
          Tambah Rule
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 rounded-lg bg-secondary animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-lg border border-border p-8 text-center space-y-3">
          <p className="text-sm text-destructive">{error}</p>
          <Button size="sm" variant="outline" onClick={load} className="gap-1.5">
            <RefreshCw className="w-3.5 h-3.5" /> Coba lagi
          </Button>
        </div>
      ) : activeDeviceId == null ? (
        <div className="rounded-lg border border-border p-8 text-center">
          <Zap className="w-8 h-8 mx-auto text-muted-foreground" />
          <p className="text-sm font-medium mt-2">Belum ada perangkat aktif</p>
          <p className="text-xs text-muted-foreground mt-1">Pilih perangkat aktif di sidebar untuk mengelola auto reply</p>
        </div>
      ) : visibleRules.length === 0 ? (
        <div className="rounded-lg border border-border p-8 text-center">
          <Zap className="w-8 h-8 mx-auto text-muted-foreground" />
          <p className="text-sm font-medium mt-2">Belum ada rule</p>
          <p className="text-xs text-muted-foreground mt-1">Tambah rule pertama untuk mulai membalas otomatis</p>
        </div>
      ) : (
        <div className="space-y-3">
          {visibleRules.map((rule) => (
            <Card key={rule.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-md bg-secondary flex items-center justify-center mt-0.5 shrink-0">
                      <Zap className="w-4 h-4 text-foreground" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-foreground">{rule.name}</p>
                        <Badge variant={rule.isActive ? "default" : "outline"} className="text-[10px]">
                          {rule.isActive ? "Aktif" : "Nonaktif"}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Keyword: <span className="font-mono">{rule.keyword}</span> (
                        {matchTypeLabels[rule.matchType] || rule.matchType})
                      </p>
                      <p className="text-xs text-muted-foreground mt-1 border-l-2 border-border pl-2 line-clamp-2">
                        {rule.replyContent}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={rule.isActive}
                      aria-label={rule.isActive ? "Nonaktifkan rule" : "Aktifkan rule"}
                      title={rule.isActive ? "Nonaktifkan rule" : "Aktifkan rule"}
                      onClick={() => toggle(rule)}
                      className={cn(
                        "relative h-5 w-9 shrink-0 rounded-full transition-colors",
                        rule.isActive ? "bg-[#243370]" : "bg-muted"
                      )}
                    >
                      <span
                        className={cn(
                          "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all",
                          rule.isActive ? "left-[18px]" : "left-0.5"
                        )}
                      />
                    </button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(rule)} aria-label="Edit">
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive"
                      onClick={() => setDeleting(rule)}
                      aria-label="Hapus"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {showForm && (
        <Modal title={editing ? "Edit Rule" : "Tambah Rule"} onClose={() => setShowForm(false)}>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium">Nama rule</label>
              <Input
                className="mt-1"
                placeholder="cth: Salam pembuka"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs font-medium">Keyword (pisahkan koma)</label>
              <Input
                className="mt-1 font-mono"
                placeholder="halo, hi, selamat pagi"
                value={form.keyword}
                onChange={(e) => setForm({ ...form, keyword: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs font-medium">Tipe kecocokan</label>
              <Dropdown
                value={form.matchType}
                onChange={(v) => setForm({ ...form, matchType: v })}
                ariaLabel="Tipe kecocokan keyword"
                className="mt-1"
                options={[
                  { value: "contains", label: "Mengandung keyword" },
                  { value: "exact", label: "Persis sama" },
                  { value: "startsWith", label: "Diawali keyword" },
                ]}
              />
            </div>
            <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
              Rule berlaku untuk perangkat{" "}
              <span className="font-medium text-foreground">
                {activeDevice?.name || `#${activeDeviceId}`}
              </span>
            </p>
            <div>
              <label className="text-xs font-medium">Isi balasan</label>
              <textarea
                className="mt-1 flex w-full rounded-md border border-border bg-background px-3 py-2 text-sm min-h-[100px]"
                placeholder="Tulis balasan otomatis..."
                value={form.replyContent}
                onChange={(e) => setForm({ ...form, replyContent: e.target.value })}
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setShowForm(false)} disabled={saving}>
                Batal
              </Button>
              <Button onClick={save} disabled={saving}>
                {saving ? "Menyimpan..." : editing ? "Simpan" : "Tambah"}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {deleting && (
        <Modal title="Hapus Rule" onClose={() => setDeleting(null)}>
          <p className="text-sm text-muted-foreground">
            Hapus rule <span className="font-semibold text-foreground">"{deleting.name}"</span>? Tindakan ini
            tidak bisa dibatalkan.
          </p>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setDeleting(null)}>
              Batal
            </Button>
            <Button variant="destructive" onClick={confirmDelete}>
              Hapus
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

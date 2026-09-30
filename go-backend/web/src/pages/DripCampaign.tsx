import { useEffect, useState } from "react";
import { Plus, Zap, Users, Clock, X, RefreshCw, Pencil, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dropdown } from "@/components/ui/dropdown";
import { apiGet, apiPost, apiPut, apiDelete, apiFetch } from "@/lib/api";
import { toast } from "sonner";

interface DripStep {
  id: number;
  campaignId: number;
  stepOrder: number;
  delayHours: number;
  content: string;
}

interface Campaign {
  id: number;
  deviceId: number;
  name: string;
  description: string;
  triggerType: string;
  triggerVal: string;
  isActive: boolean;
  enrolled: number;
  steps?: DripStep[];
}

interface Device {
  id: number;
  name: string;
}

interface DripAnalytics {
  enrollmentsByStatus: Record<string, number>;
  stepProgress: { stepOrder: number; count: number }[];
  totalEnrolled: number;
}

const enrollmentStatusLabel: Record<string, string> = {
  active: "Aktif",
  completed: "Selesai",
  cancelled: "Dibatalkan",
};

const triggerLabels: Record<string, string> = {
  manual: "Manual",
  keyword: "Keyword",
  webhook: "Webhook",
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

const emptyForm = { name: "", description: "", deviceId: "", triggerType: "manual", triggerVal: "" };

export default function DripCampaign({ embedded = false }: { embedded?: boolean }) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Campaign | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<Campaign | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [stepContent, setStepContent] = useState("");
  const [stepDelay, setStepDelay] = useState("24");
  const [addingStep, setAddingStep] = useState(false);
  const [analytics, setAnalytics] = useState<Record<number, DripAnalytics>>({});
  const [loadingAnalytics, setLoadingAnalytics] = useState<Record<number, boolean>>({});

  const load = () => {
    setLoading(true);
    setError(null);
    Promise.all([
      apiGet<{ campaigns: Campaign[] }>("/drip"),
      apiGet<{ devices: Device[] }>("/devices"),
    ])
      .then(([c, d]) => {
        setCampaigns(c.campaigns || []);
        setDevices(d.devices || []);
      })
      .catch((e) => setError(e.message || "Gagal memuat data"))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const openAdd = () => {
    setEditing(null);
    setForm({ ...emptyForm, deviceId: devices.length === 1 ? String(devices[0].id) : "" });
    setShowForm(true);
  };

  const openEdit = (c: Campaign) => {
    setEditing(c);
    setForm({
      name: c.name,
      description: c.description || "",
      deviceId: String(c.deviceId),
      triggerType: c.triggerType || "manual",
      triggerVal: c.triggerVal || "",
    });
    setShowForm(true);
  };

  const save = async () => {
    if (!form.name.trim()) {
      toast.error("Nama campaign wajib diisi");
      return;
    }
    if (!form.deviceId) {
      toast.error("Pilih perangkat dulu");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim(),
        deviceId: Number(form.deviceId),
        triggerType: form.triggerType,
        triggerVal: form.triggerVal.trim(),
      };
      if (editing) {
        const res = await apiPut<{ campaign: Campaign }>(`/drip/${editing.id}`, payload);
        setCampaigns((prev) => prev.map((c) => (c.id === editing.id ? { ...c, ...res.campaign } : c)));
        toast.success("Campaign diperbarui");
      } else {
        const res = await apiPost<{ campaign: Campaign }>("/drip", payload);
        setCampaigns((prev) => [{ ...res.campaign, steps: [] }, ...prev]);
        toast.success("Campaign dibuat");
      }
      setShowForm(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal menyimpan");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (c: Campaign) => {
    const next = !c.isActive;
    setCampaigns((prev) => prev.map((x) => (x.id === c.id ? { ...x, isActive: next } : x)));
    try {
      await apiPut(`/drip/${c.id}`, { isActive: next });
      toast.success(next ? "Campaign diaktifkan" : "Campaign dijeda");
    } catch (e) {
      setCampaigns((prev) => prev.map((x) => (x.id === c.id ? { ...x, isActive: c.isActive } : x)));
      toast.error(e instanceof Error ? e.message : "Gagal mengubah status");
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await apiDelete(`/drip/${deleting.id}`);
      setCampaigns((prev) => prev.filter((c) => c.id !== deleting.id));
      if (expanded === deleting.id) setExpanded(null);
      toast.success("Campaign dihapus");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal menghapus");
    } finally {
      setDeleting(null);
    }
  };

  const toggleExpand = (id: number) => {
    setExpanded((prev) => {
      const next = prev === id ? null : id;
      if (next !== null && !analytics[next]) {
        setLoadingAnalytics((p) => ({ ...p, [next]: true }));
        apiGet<DripAnalytics>(`/drip/${next}/analytics`)
          .then((a) => setAnalytics((p) => ({ ...p, [next]: a })))
          .catch(() => {})
          .finally(() => setLoadingAnalytics((p) => ({ ...p, [next]: false })));
      }
      return next;
    });
    setStepContent("");
    setStepDelay("24");
  };

  const addStep = async (campaignId: number) => {
    if (!stepContent.trim()) {
      toast.error("Isi step wajib diisi");
      return;
    }
    setAddingStep(true);
    try {
      const res = await apiPost<{ step: DripStep }>(`/drip/${campaignId}/steps`, {
        content: stepContent.trim(),
        delayHours: Number(stepDelay) || 24,
      });
      setCampaigns((prev) =>
        prev.map((c) =>
          c.id === campaignId ? { ...c, steps: [...(c.steps || []), res.step] } : c
        )
      );
      setStepContent("");
      setStepDelay("24");
      toast.success("Step ditambahkan");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal menambah step");
    } finally {
      setAddingStep(false);
    }
  };

  const deleteStep = async (campaignId: number, stepId: number) => {
    try {
      await apiFetch(`/drip/${campaignId}/steps/${stepId}`, { method: "DELETE" }).then((r) => {
        if (!r.ok) throw new Error("Gagal menghapus step");
      });
      setCampaigns((prev) =>
        prev.map((c) =>
          c.id === campaignId ? { ...c, steps: (c.steps || []).filter((s) => s.id !== stepId) } : c
        )
      );
      toast.success("Step dihapus");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal menghapus step");
    }
  };

  return (
    <div className="space-y-6">
      <div className={`flex gap-3 sm:flex-row sm:items-center ${embedded ? "justify-end" : "flex-col sm:justify-between"}`}>
        {!embedded && (
          <div>
            <h2 className="text-lg font-semibold text-foreground">Drip Campaign</h2>
            <p className="text-sm text-muted-foreground">Kirim pesan bertahap secara otomatis</p>
          </div>
        )}
        <Button size="sm" className="gap-1.5" onClick={openAdd}>
          <Plus className="w-3.5 h-3.5" />
          Buat Campaign
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-28 rounded-lg bg-secondary animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-lg border border-border p-8 text-center space-y-3">
          <p className="text-sm text-destructive">{error}</p>
          <Button size="sm" variant="outline" onClick={load} className="gap-1.5">
            <RefreshCw className="w-3.5 h-3.5" /> Coba lagi
          </Button>
        </div>
      ) : campaigns.length === 0 ? (
        <div className="rounded-lg border border-border p-8 text-center">
          <Zap className="w-8 h-8 mx-auto text-muted-foreground" />
          <p className="text-sm font-medium mt-2">Belum ada campaign</p>
          <p className="text-xs text-muted-foreground mt-1">Buat campaign drip pertamamu</p>
        </div>
      ) : (
        <div className="space-y-3">
          {campaigns.map((c) => {
            const isOpen = expanded === c.id;
            const steps = c.steps || [];
            return (
              <Card key={c.id}>
                <CardContent className="p-4 sm:p-5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                        <Zap className="w-5 h-5 text-foreground" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold text-foreground">{c.name}</p>
                          <Badge variant={c.isActive ? "default" : "outline"} className="text-[10px]">
                            {c.isActive ? "Aktif" : "Jeda"}
                          </Badge>
                          <Badge variant="outline" className="text-[10px]">
                            {triggerLabels[c.triggerType] || c.triggerType}
                            {c.triggerType === "keyword" && c.triggerVal ? `: ${c.triggerVal}` : ""}
                          </Badge>
                        </div>
                        {c.description && (
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{c.description}</p>
                        )}
                        <div className="flex items-center gap-4 mt-2">
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Users className="w-3 h-3" /> {c.enrolled} enrolled
                          </span>
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Clock className="w-3 h-3" /> {steps.length} steps
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => toggleActive(c)}
                        aria-label={c.isActive ? "Jeda" : "Aktifkan"}
                        title={c.isActive ? "Jeda campaign" : "Aktifkan campaign"}
                      >
                        <span
                          className={`w-3.5 h-3.5 rounded-full border-2 ${c.isActive ? "bg-green-600 border-green-600" : "border-muted-foreground"}`}
                        />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(c)} aria-label="Edit">
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive"
                        onClick={() => setDeleting(c)}
                        aria-label="Hapus"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => toggleExpand(c.id)}
                        aria-label={isOpen ? "Tutup steps" : "Lihat steps"}
                      >
                        {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </Button>
                    </div>
                  </div>

                  {isOpen && (
                    <div className="mt-4 pt-4 border-t border-border space-y-3">
                      {/* Analytics strip */}
                      {loadingAnalytics[c.id] ? (
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          {[0, 1, 2, 3].map((i) => (
                            <div key={i} className="h-14 rounded-md bg-secondary animate-pulse" />
                          ))}
                        </div>
                      ) : analytics[c.id] ? (
                        <div className="space-y-2">
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            <div className="rounded-md border border-border p-2.5">
                              <p className="text-lg font-bold text-foreground">
                                {analytics[c.id].totalEnrolled}
                              </p>
                              <p className="text-[10px] text-muted-foreground">Total Peserta</p>
                            </div>
                            {(["active", "completed", "cancelled"] as const).map((st) => (
                              <div key={st} className="rounded-md border border-border p-2.5">
                                <p className="text-lg font-bold text-foreground">
                                  {analytics[c.id].enrollmentsByStatus[st] || 0}
                                </p>
                                <p className="text-[10px] text-muted-foreground">
                                  {enrollmentStatusLabel[st]}
                                </p>
                              </div>
                            ))}
                          </div>
                          {analytics[c.id].stepProgress.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                              {analytics[c.id].stepProgress
                                .slice()
                                .sort((a, b) => a.stepOrder - b.stepOrder)
                                .map((sp) => (
                                  <Badge key={sp.stepOrder} variant="outline" className="text-[10px]">
                                    Step {sp.stepOrder}: {sp.count} kontak
                                  </Badge>
                                ))}
                            </div>
                          )}
                        </div>
                      ) : null}

                      {steps.length === 0 && (
                        <p className="text-xs text-muted-foreground">Belum ada step. Tambahkan step pertama di bawah.</p>
                      )}
                      {steps
                        .slice()
                        .sort((a, b) => a.stepOrder - b.stepOrder)
                        .map((s) => (
                          <div
                            key={s.id}
                            className="flex items-start justify-between gap-2 rounded-md border border-border p-3"
                          >
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-foreground">
                                Step {s.stepOrder} <span className="font-normal text-muted-foreground">· +{s.delayHours} jam</span>
                              </p>
                              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{s.content}</p>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive shrink-0"
                              onClick={() => deleteStep(c.id, s.id)}
                              aria-label="Hapus step"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        ))}
                      <div className="rounded-md border border-dashed border-border p-3 space-y-2">
                        <p className="text-xs font-medium">Tambah step</p>
                        <textarea
                          className="flex w-full rounded-md border border-border bg-background px-3 py-2 text-sm min-h-[70px]"
                          placeholder="Isi pesan step ini..."
                          value={stepContent}
                          onChange={(e) => setStepContent(e.target.value)}
                        />
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1.5">
                            <Input
                              type="number"
                              min={0}
                              className="w-20 h-8"
                              value={stepDelay}
                              onChange={(e) => setStepDelay(e.target.value)}
                            />
                            <span className="text-xs text-muted-foreground">jam setelah step sebelumnya</span>
                          </div>
                          <Button size="sm" className="ml-auto gap-1" onClick={() => addStep(c.id)} disabled={addingStep}>
                            <Plus className="w-3.5 h-3.5" /> {addingStep ? "..." : "Tambah"}
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {showForm && (
        <Modal title={editing ? "Edit Campaign" : "Buat Campaign"} onClose={() => setShowForm(false)}>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium">Nama campaign</label>
              <Input
                className="mt-1"
                placeholder="cth: Onboarding pelanggan baru"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs font-medium">Deskripsi (opsional)</label>
              <Input
                className="mt-1"
                placeholder="Deskripsi singkat"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium">Perangkat</label>
                <Dropdown
                  value={form.deviceId}
                  onChange={(v) => setForm({ ...form, deviceId: v })}
                  ariaLabel="Perangkat"
                  className="mt-1"
                  options={[
                    { value: "", label: "— Pilih perangkat —" },
                    ...devices.map((d) => ({ value: String(d.id), label: d.name })),
                  ]}
                />
              </div>
              <div>
                <label className="text-xs font-medium">Tipe trigger</label>
                <Dropdown
                  value={form.triggerType}
                  onChange={(v) => setForm({ ...form, triggerType: v })}
                  ariaLabel="Tipe trigger"
                  className="mt-1"
                  options={[
                    { value: "manual", label: "Manual" },
                    { value: "keyword", label: "Keyword" },
                    { value: "webhook", label: "Webhook" },
                  ]}
                />
              </div>
            </div>
            {form.triggerType === "keyword" && (
              <div>
                <label className="text-xs font-medium">Keyword trigger</label>
                <Input
                  className="mt-1 font-mono"
                  placeholder="cth: daftar"
                  value={form.triggerVal}
                  onChange={(e) => setForm({ ...form, triggerVal: e.target.value })}
                />
              </div>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setShowForm(false)} disabled={saving}>
                Batal
              </Button>
              <Button onClick={save} disabled={saving}>
                {saving ? "Menyimpan..." : editing ? "Simpan" : "Buat"}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {deleting && (
        <Modal title="Hapus Campaign" onClose={() => setDeleting(null)}>
          <p className="text-sm text-muted-foreground">
            Hapus campaign <span className="font-semibold text-foreground">"{deleting.name}"</span> beserta semua
            step-nya? Tindakan ini tidak bisa dibatalkan.
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

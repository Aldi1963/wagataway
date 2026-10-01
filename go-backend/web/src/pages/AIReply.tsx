import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, X, Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Toggle } from "@/components/Toggle";
import { apiGet, apiPost, apiPut, apiDelete, apiPatch } from "@/lib/api";
import { useActiveDevice } from "@/hooks/use-active-device";

interface AIReplyConfig {
  id: number;
  deviceId: number;
  isEnabled: boolean;
  systemPrompt: string;
  triggerKeywords: string;
  ignoreGroups: boolean;
  createdAt: string;
}

interface AIStatus {
  reachable: boolean;
  detail: string;
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

export default function AIReply({ embedded = false }: { embedded?: boolean }) {
  const { activeDeviceId, activeDevice } = useActiveDevice();
  const [items, setItems] = useState<AIReplyConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<AIStatus | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<AIReplyConfig | null>(null);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [triggerKeywords, setTriggerKeywords] = useState("");
  const [ignoreGroups, setIgnoreGroups] = useState(true);
  const [isEnabled, setIsEnabled] = useState(true);
  const [deleting, setDeleting] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [r, s] = await Promise.all([
        apiGet<{ configs: AIReplyConfig[] }>("/ai-reply"),
        apiGet<AIStatus>("/ai-reply/status").catch(() => null),
      ]);
      setItems(r.configs ?? []);
      if (s) setStatus(s);
    } catch (e: any) {
      toast.error(e.message || "Gagal memuat config AI");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // Config hanya untuk perangkat aktif (konsisten dengan tab Otomatisasi lain)
  const visibleItems =
    activeDeviceId == null ? [] : items.filter((c) => c.deviceId === activeDeviceId);

  const openModal = (c?: AIReplyConfig) => {
    if (activeDeviceId == null && !c) {
      toast.error("Pilih perangkat aktif di sidebar dulu");
      return;
    }
    setEditing(c ?? null);
    setSystemPrompt(c?.systemPrompt ?? "");
    setTriggerKeywords(c?.triggerKeywords ?? "");
    setIgnoreGroups(c?.ignoreGroups ?? true);
    setIsEnabled(c?.isEnabled ?? true);
    setShowModal(true);
  };

  const save = async () => {
    const targetDeviceId = editing ? editing.deviceId : activeDeviceId;
    if (targetDeviceId == null) { toast.error("Pilih perangkat aktif di sidebar dulu"); return; }
    try {
      const payload = {
        deviceId: targetDeviceId,
        systemPrompt: systemPrompt.trim(),
        triggerKeywords: triggerKeywords.trim(),
        ignoreGroups,
        ...(editing ? { isEnabled } : {}),
      };
      if (editing) { await apiPut(`/ai-reply/${editing.id}`, payload); toast.success("Config AI diperbarui"); }
      else { await apiPost("/ai-reply", payload); toast.success("Config AI ditambahkan"); }
      setShowModal(false);
      load();
    } catch (e: any) { toast.error(e.message || "Gagal menyimpan"); }
  };

  const toggleActive = async (c: AIReplyConfig) => {
    try {
      // Backend PATCH /:id/toggle membalik nilai, jadi pakai nilai dari respons.
      const r = await apiPatch<{ isEnabled: boolean }>(`/ai-reply/${c.id}/toggle`, {});
      setItems((prev) => prev.map((x) => (x.id === c.id ? { ...x, isEnabled: r.isEnabled } : x)));
      toast.success(r.isEnabled ? "AI auto-reply diaktifkan" : "AI auto-reply dinonaktifkan");
    } catch (e: any) { toast.error(e.message || "Gagal mengubah status"); }
  };

  const confirmDelete = async () => {
    if (deleting == null) return;
    try {
      await apiDelete(`/ai-reply/${deleting}`);
      toast.success("Config AI dihapus");
      setDeleting(null);
      load();
    } catch (e: any) { toast.error(e.message || "Gagal menghapus"); }
  };

  return (
    <div className="space-y-4">
      <div className={`flex gap-3 sm:flex-row sm:items-center ${embedded ? "justify-end" : "flex-col sm:justify-between"}`}>
        {!embedded && (
          <div>
            <h1 className="text-xl sm:text-2xl font-bold">AI Auto-Reply</h1>
            <p className="text-sm text-muted-foreground">Balas pesan masuk otomatis dengan AI.</p>
          </div>
        )}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          {status == null ? (
            <Badge variant="secondary">Memeriksa AI...</Badge>
          ) : status.reachable ? (
            <Badge variant="success">AI Terhubung</Badge>
          ) : (
            <Badge variant="destructive" className="max-w-[260px] text-left whitespace-normal">
              AI Tidak Terjangkau{status.detail ? `: ${status.detail}` : ""}
            </Badge>
          )}
          <Button size="sm" onClick={() => openModal()} className="gap-1.5">
            <Plus className="w-4 h-4" /> Tambah Config
          </Button>
        </div>
      </div>

      {loading ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">Memuat...</CardContent></Card>
      ) : activeDeviceId == null ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Bot className="w-8 h-8 mx-auto text-muted-foreground" />
            <p className="text-sm font-medium mt-2">Belum ada perangkat aktif</p>
            <p className="text-xs text-muted-foreground mt-1">Pilih perangkat aktif di sidebar untuk mengelola AI reply</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="py-3 px-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">System Prompt</th>
                    <th className="py-3 px-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Trigger</th>
                    <th className="py-3 px-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Grup</th>
                    <th className="py-3 px-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Aktif</th>
                    <th className="py-3 px-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleItems.length === 0 && (
                    <tr><td colSpan={5} className="py-8 text-center text-muted-foreground">Belum ada config AI untuk perangkat {activeDevice?.name || `#${activeDeviceId}`}.</td></tr>
                  )}
                  {visibleItems.map((c) => (
                    <tr key={c.id} className="border-b border-border last:border-0">
                      <td className="py-3 px-4 text-xs text-muted-foreground max-w-[220px] truncate" title={c.systemPrompt}>
                        {c.systemPrompt || <span className="italic">Default</span>}
                      </td>
                      <td className="py-3 px-4 text-xs text-muted-foreground max-w-[160px] truncate" title={c.triggerKeywords || undefined}>
                        {c.triggerKeywords ? c.triggerKeywords : <Badge variant="outline">Semua pesan</Badge>}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap text-xs">{c.ignoreGroups ? "Abaikan" : "Ikut"}</td>
                      <td className="py-3 px-4">
                        <Toggle checked={c.isEnabled} label={`Aktif ${activeDevice?.name || `#${activeDeviceId}`}`} onToggle={() => toggleActive(c)} />
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
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
        <Modal title={editing ? "Ubah Config AI" : "Tambah Config AI"} onClose={() => setShowModal(false)}>
          <div className="space-y-4">
            <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
              Config berlaku untuk perangkat{" "}
              <span className="font-medium text-foreground">
                {activeDevice?.name || (editing ? `#${editing.deviceId}` : "")}
              </span>
            </p>
            <div>
              <label className="text-sm font-medium">System Prompt</label>
              <textarea
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                rows={4}
                placeholder="Kamu adalah CS toko online yang ramah..."
                className={`${inputCls} mt-1.5 resize-y`}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Trigger Keywords</label>
              <Input
                className="mt-1.5"
                placeholder="harga, stok, order — kosongkan = semua pesan"
                value={triggerKeywords}
                onChange={(e) => setTriggerKeywords(e.target.value)}
              />
            </div>
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium">Abaikan Grup</p>
                <p className="text-xs text-muted-foreground">AI tidak membalas pesan dari grup WhatsApp</p>
              </div>
              <Toggle checked={ignoreGroups} label="Abaikan grup" onToggle={setIgnoreGroups} />
            </div>
            {editing && (
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">Aktif</p>
                  <p className="text-xs text-muted-foreground">Matikan tanpa menghapus config</p>
                </div>
                <Toggle checked={isEnabled} label="Aktif" onToggle={setIsEnabled} />
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowModal(false)}>Batal</Button>
              <Button onClick={save}>Simpan</Button>
            </div>
          </div>
        </Modal>
      )}

      {deleting != null && (
        <Modal title="Hapus?" onClose={() => setDeleting(null)}>
          <p className="text-sm text-muted-foreground">Config AI yang dihapus tidak bisa dikembalikan.</p>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setDeleting(null)}>Batal</Button>
            <Button variant="destructive" onClick={confirmDelete}>Hapus</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

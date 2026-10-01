import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, X, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dropdown } from "@/components/ui/dropdown";
import { Toggle } from "@/components/Toggle";
import { apiGet, apiPost, apiPut, apiDelete } from "@/lib/api";
import { useActiveDevice } from "@/hooks/use-active-device";

interface GroupRule {
  id: number;
  deviceId: number;
  groupJid: string;
  welcomeMsg?: string;
  antiLink: boolean;
  antiSpam: boolean;
  isActive: boolean;
}

interface SyncedGroup {
  id: number;
  name: string;
  waJid: string;
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

export default function GroupRules({ embedded = false }: { embedded?: boolean }) {
  const { activeDeviceId, activeDevice } = useActiveDevice();
  const [items, setItems] = useState<GroupRule[]>([]);
  const [syncedGroups, setSyncedGroups] = useState<SyncedGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<GroupRule | null>(null);
  const [groupJid, setGroupJid] = useState("");
  const [pickedGroup, setPickedGroup] = useState("");
  const [welcome, setWelcome] = useState("");
  const [antiLink, setAntiLink] = useState(true);
  const [antiSpam, setAntiSpam] = useState(true);
  const [deleting, setDeleting] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [r, g] = await Promise.all([
        apiGet<{ rules: GroupRule[] } | GroupRule[]>("/group-rules"),
        apiGet<{ groups: SyncedGroup[] }>("/contact-groups").catch(() => ({ groups: [] })),
      ]);
      setItems(Array.isArray(r) ? r : r.rules ?? []);
      setSyncedGroups((g.groups ?? []).filter((x) => x.waJid));
    } catch (e: any) {
      toast.error(e.message || "Gagal memuat aturan grup");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // Aturan hanya untuk perangkat aktif (konsisten dengan tab Otomatisasi lain)
  const visibleItems =
    activeDeviceId == null ? [] : items.filter((x) => x.deviceId === activeDeviceId);

  const groupName = (jid: string) =>
    syncedGroups.find((x) => x.waJid === jid)?.name;

  const openModal = (g?: GroupRule) => {
    if (activeDeviceId == null && !g) {
      toast.error("Pilih perangkat aktif di sidebar dulu");
      return;
    }
    setEditing(g ?? null);
    setGroupJid(g?.groupJid ?? "");
    setPickedGroup(g ? (syncedGroups.find((x) => x.waJid === g.groupJid)?.waJid ?? "") : "");
    setWelcome(g?.welcomeMsg ?? "");
    setAntiLink(g?.antiLink ?? true);
    setAntiSpam(g?.antiSpam ?? true);
    setShowModal(true);
  };

  const save = async () => {
    const targetDeviceId = editing ? editing.deviceId : activeDeviceId;
    if (targetDeviceId == null) { toast.error("Pilih perangkat aktif di sidebar dulu"); return; }
    if (!groupJid.trim()) { toast.error("Pilih grup atau isi JID grup"); return; }
    try {
      const payload = {
        deviceId: targetDeviceId,
        groupJid: groupJid.trim(),
        welcomeMsg: welcome.trim(),
        antiLink,
        antiSpam,
      };
      if (editing) { await apiPut(`/group-rules/${editing.id}`, payload); toast.success("Diperbarui"); }
      else { await apiPost("/group-rules", payload); toast.success("Aturan ditambahkan"); }
      setShowModal(false);
      load();
    } catch (e: any) { toast.error(e.message || "Gagal menyimpan"); }
  };

  // Toggle isActive via POST /:id/toggle
  const toggleActive = async (g: GroupRule, v: boolean) => {
    try {
      await apiPost(`/group-rules/${g.id}/toggle`, {});
      setItems((prev) => prev.map((x) => (x.id === g.id ? { ...x, isActive: v } : x)));
      toast.success(v ? "Aturan diaktifkan" : "Aturan dinonaktifkan");
    } catch (e: any) { toast.error(e.message || "Gagal mengubah status"); }
  };

  // Toggle antiLink/antiSpam via PUT dengan payload penuh
  const toggleField = async (g: GroupRule, field: "antiLink" | "antiSpam", v: boolean) => {
    try {
      await apiPut(`/group-rules/${g.id}`, {
        deviceId: g.deviceId,
        groupJid: g.groupJid,
        welcomeMsg: g.welcomeMsg ?? "",
        antiLink: field === "antiLink" ? v : g.antiLink,
        antiSpam: field === "antiSpam" ? v : g.antiSpam,
      });
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
        {!embedded && (
          <div>
            <h1 className="text-xl font-bold text-foreground">Aturan Grup</h1>
            <p className="text-sm text-muted-foreground">Sambutan otomatis anggota baru, anti-link & anti-spam.</p>
          </div>
        )}
        <Button size="sm" onClick={() => openModal()} className="gap-1.5">
          <Plus className="w-4 h-4" /> Tambah Aturan
        </Button>
      </div>

      {loading ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">Memuat...</CardContent></Card>
      ) : activeDeviceId == null ? (
        <Card>
          <CardContent className="p-8 text-center">
            <ShieldCheck className="w-8 h-8 mx-auto text-muted-foreground" />
            <p className="text-sm font-medium mt-2">Belum ada perangkat aktif</p>
            <p className="text-xs text-muted-foreground mt-1">Pilih perangkat aktif di sidebar untuk mengelola aturan grup</p>
          </CardContent>
        </Card>
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
                  {visibleItems.length === 0 && (
                    <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">Belum ada aturan grup untuk perangkat {activeDevice?.name || `#${activeDeviceId}`}.</td></tr>
                  )}
                  {visibleItems.map((g) => (
                    <tr key={g.id} className="border-b border-border last:border-0">
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center gap-1.5 text-[12px] font-medium">
                          <ShieldCheck className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                          <span className="min-w-0">
                            {groupName(g.groupJid) || <span className="font-mono">{g.groupJid}</span>}
                            {groupName(g.groupJid) && (
                              <span className="block font-mono text-[10px] font-normal text-muted-foreground truncate max-w-[180px]" title={g.groupJid}>{g.groupJid}</span>
                            )}
                          </span>
                        </span>
                      </td>
                      <td className="py-3 px-4 text-xs text-muted-foreground max-w-[200px] truncate" title={g.welcomeMsg}>{g.welcomeMsg || "-"}</td>
                      <td className="py-3 px-4"><Toggle checked={g.antiLink} label={`Anti-link ${g.groupJid}`} onToggle={(v) => toggleField(g, "antiLink", v)} /></td>
                      <td className="py-3 px-4"><Toggle checked={g.antiSpam} label={`Anti-spam ${g.groupJid}`} onToggle={(v) => toggleField(g, "antiSpam", v)} /></td>
                      <td className="py-3 px-4">
                        <Toggle checked={g.isActive} label={`Aktif ${g.groupJid}`} onToggle={(v) => toggleActive(g, v)} />
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
            <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
              Aturan berlaku untuk perangkat{" "}
              <span className="font-medium text-foreground">
                {activeDevice?.name || (editing ? `#${editing.deviceId}` : "")}
              </span>
            </p>
            {syncedGroups.length > 0 && (
              <div>
                <label className="text-sm font-medium">Pilih grup</label>
                <Dropdown
                  value={pickedGroup}
                  onChange={(v) => {
                    setPickedGroup(v);
                    if (v) setGroupJid(v);
                  }}
                  ariaLabel="Pilih grup WhatsApp"
                  className="mt-1.5"
                  options={[
                    { value: "", label: "— Pilih dari grup tersinkron —" },
                    ...syncedGroups.map((x) => ({ value: x.waJid, label: x.name })),
                  ]}
                />
              </div>
            )}
            <div>
              <label className="text-sm font-medium">JID Grup {syncedGroups.length > 0 && <span className="text-muted-foreground font-normal">(atau isi manual)</span>}</label>
              <Input className="mt-1.5 font-mono" placeholder="120363xxxx@g.us" value={groupJid} onChange={(e) => { setGroupJid(e.target.value); setPickedGroup(""); }} />
              {syncedGroups.length === 0 && (
                <p className="text-[11px] text-muted-foreground mt-1">
                  Tip: sinkronkan grup WA dulu di halaman Kontak → Grup agar bisa pilih dari daftar.
                </p>
              )}
            </div>
            <div>
              <label className="text-sm font-medium">Pesan Welcome <span className="text-muted-foreground font-normal">(opsional)</span></label>
              <textarea value={welcome} onChange={(e) => setWelcome(e.target.value)} rows={3} placeholder="Selamat datang di grup, kak! 🙏" className={`${inputCls} mt-1.5 resize-y`} />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <p className="text-sm font-medium">Anti-Link</p>
                <p className="text-xs text-muted-foreground">Peringatkan pengirim link otomatis</p>
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

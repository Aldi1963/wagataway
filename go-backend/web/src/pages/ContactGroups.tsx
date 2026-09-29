import { toast } from "sonner";
import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, X, Users, UserPlus, RefreshCw, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiGet, apiPost, apiPut, apiDelete } from "@/lib/api";
import SyncWAButton from "@/components/contacts/SyncWAButton";

interface Group {
  id: number;
  name: string;
  description: string;
  color: string;
  memberCount: number;
  createdAt: string;
}

interface Member {
  id: number;
  groupId: number;
  contactId: number;
  createdAt: string;
}

interface Contact {
  id: number;
  name: string;
  phone: string;
}

const emptyForm = { name: "", description: "", color: "#6366f1" };

function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className={`relative bg-card text-card-foreground border border-border rounded-xl w-full ${
          wide ? "max-w-2xl" : "max-w-lg"
        } max-h-[90vh] overflow-y-auto p-5 sm:p-6 shadow-xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-secondary"
            aria-label="Tutup"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function ContactGroups({ embedded = false }: { embedded?: boolean }) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Group | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<Group | null>(null);

  // Members dialog
  const [activeGroup, setActiveGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [contactMap, setContactMap] = useState<Record<number, Contact>>({});
  const [membersLoading, setMembersLoading] = useState(false);
  const [pickContact, setPickContact] = useState("");

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiGet<{ groups: Group[] }>("/contact-groups");
      setGroups(res.groups || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat grup");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm);
    setShowForm(true);
  };

  const openEdit = (g: Group) => {
    setEditing(g);
    setForm({
      name: g.name || "",
      description: g.description || "",
      color: g.color || "#6366f1",
    });
    setShowForm(true);
  };

  const saveGroup = async () => {
    if (!form.name.trim()) {
      toast.error("Nama grup wajib diisi");
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await apiPut(`/contact-groups/${editing.id}`, form);
        toast.success("Grup diperbarui");
      } else {
        await apiPost("/contact-groups", form);
        toast.success("Grup dibuat");
      }
      setShowForm(false);
      setEditing(null);
      setForm(emptyForm);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal menyimpan grup");
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await apiDelete(`/contact-groups/${deleting.id}`);
      toast.success("Grup dihapus");
      setDeleting(null);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal menghapus grup");
    }
  };

  const openMembers = async (g: Group) => {
    setActiveGroup(g);
    setMembersLoading(true);
    setPickContact("");
    try {
      const [mRes, cRes] = await Promise.all([
        apiGet<{ members: Member[] }>(`/contact-groups/${g.id}/members`),
        apiGet<{ contacts: Contact[] }>("/contacts?limit=200"),
      ]);
      setMembers(mRes.members || []);
      const map: Record<number, Contact> = {};
      (cRes.contacts || []).forEach((c) => {
        map[c.id] = c;
      });
      setContactMap(map);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal memuat anggota");
    } finally {
      setMembersLoading(false);
    }
  };

  const addMember = async () => {
    if (!pickContact || !activeGroup) return;
    try {
      await apiPost(`/contact-groups/${activeGroup.id}/members`, {
        contactIds: [Number(pickContact)],
      });
      toast.success("Anggota ditambahkan");
      setPickContact("");
      openMembers(activeGroup);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal menambah anggota");
    }
  };

  const removeMember = async (memberId: number) => {
    if (!activeGroup) return;
    try {
      await apiDelete(`/contact-groups/${activeGroup.id}/members/${memberId}`);
      toast.success("Anggota dihapus dari grup");
      openMembers(activeGroup);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal menghapus anggota");
    }
  };

  const memberContactIds = new Set(members.map((m) => m.contactId));
  const availableContacts = Object.values(contactMap).filter(
    (c) => !memberContactIds.has(c.id)
  );

  return (
    <div className="space-y-4 sm:space-y-6"> {/* Header */}
      <div className={`flex gap-3 sm:flex-row sm:items-center ${embedded ? "justify-end" : "flex-col sm:justify-between"}`}>
        {!embedded && (
          <div>
            <h1 className="text-xl sm:text-2xl font-bold">Grup Kontak</h1>
            <p className="text-sm text-muted-foreground">
              Kelompokkan kontak untuk broadcast yang lebih tepat sasaran
            </p>
          </div>
        )}
        <div className="flex gap-2 self-start sm:self-auto">
          <SyncWAButton kind="groups" onDone={load} />
          <Button onClick={openAdd} className="gap-1.5">
            <Plus className="w-4 h-4" />
            Buat Grup
          </Button>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <Card key={i}>
              <CardContent className="p-5">
                <div className="h-5 w-2/3 rounded bg-secondary animate-pulse mb-3" />
                <div className="h-4 w-full rounded bg-secondary animate-pulse" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : error ? (
        <Card>
          <CardContent className="p-10 text-center">
            <p className="text-sm text-muted-foreground mb-4">{error}</p>
            <Button variant="outline" onClick={load} className="gap-1.5">
              <RefreshCw className="w-4 h-4" />
              Coba lagi
            </Button>
          </CardContent>
        </Card>
      ) : groups.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center">
            <Users className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
            <p className="font-medium mb-1">Belum ada grup</p>
            <p className="text-sm text-muted-foreground">
              Buat grup pertama Anda dengan tombol di atas
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {groups.map((g) => (
            <Card key={g.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className="w-4 h-4 rounded-full shrink-0"
                      style={{ backgroundColor: g.color || "#6366f1" }}
                    />
                    <CardTitle className="text-base truncate">{g.name}</CardTitle>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => openEdit(g)}
                      aria-label={`Edit ${g.name}`}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setDeleting(g)}
                      aria-label={`Hapus ${g.name}`}
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                </div>
                {g.description && (
                  <CardDescription className="line-clamp-2">{g.description}</CardDescription>
                )}
              </CardHeader>
              <CardContent className="pt-0">
                <button
                  onClick={() => openMembers(g)}
                  className="w-full flex items-center justify-between text-sm px-3 py-2.5 rounded-lg bg-secondary/60 hover:bg-secondary transition-colors"
                >
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <Users className="w-4 h-4" />
                    {g.memberCount} anggota
                  </span>
                  <span className="flex items-center gap-1 text-foreground font-medium">
                    Kelola
                    <ChevronRight className="w-4 h-4" />
                  </span>
                </button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add/Edit dialog */}
      {showForm && (
        <Modal title={editing ? "Edit Grup" : "Buat Grup"} onClose={() => setShowForm(false)}>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Nama Grup *</label>
              <Input
                placeholder="Contoh: Pelanggan VIP"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Deskripsi</label>
              <Input
                placeholder="Keterangan grup (opsional)"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Warna</label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={form.color}
                  onChange={(e) => setForm({ ...form, color: e.target.value })}
                  className="w-10 h-10 rounded-md cursor-pointer bg-transparent"
                  aria-label="Pilih warna grup"
                />
                <Input
                  value={form.color}
                  onChange={(e) => setForm({ ...form, color: e.target.value })}
                  className="max-w-[140px]"
                  placeholder="#6366f1"
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" onClick={() => setShowForm(false)}>
                Batal
              </Button>
              <Button onClick={saveGroup} disabled={saving}>
                {saving ? "Menyimpan..." : editing ? "Simpan Perubahan" : "Buat Grup"}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Members dialog */}
      {activeGroup && (
        <Modal
          title={`Anggota — ${activeGroup.name}`}
          onClose={() => setActiveGroup(null)}
          wide
        >
          {/* Add member */}
          <div className="flex flex-col sm:flex-row gap-2 mb-5">
            <select
              value={pickContact}
              onChange={(e) => setPickContact(e.target.value)}
              className="flex-1 h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">Pilih kontak untuk ditambahkan...</option>
              {availableContacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} — {c.phone}
                </option>
              ))}
            </select>
            <Button onClick={addMember} disabled={!pickContact} className="gap-1.5">
              <UserPlus className="w-4 h-4" />
              Tambah
            </Button>
          </div>

          {/* Member list */}
          {membersLoading ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-11 rounded-lg bg-secondary animate-pulse" />
              ))}
            </div>
          ) : members.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              Belum ada anggota di grup ini
            </p>
          ) : (
            <div className="space-y-2 max-h-[40vh] overflow-y-auto">
              {members.map((m) => {
                const c = contactMap[m.contactId];
                return (
                  <div
                    key={m.id}
                    className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg border border-border"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">
                        {c ? c.name : `Kontak #${m.contactId}`}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {c ? c.phone : "kontak tidak ditemukan"}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      onClick={() => removeMember(m.id)}
                      aria-label="Hapus anggota"
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </Modal>
      )}

      {/* Delete confirm */}
      {deleting && (
        <Modal title="Hapus Grup" onClose={() => setDeleting(null)}>
          <p className="text-sm text-muted-foreground mb-5">
            Hapus grup <span className="font-medium text-foreground">{deleting.name}</span>?
            Anggota tidak ikut terhapus, hanya grupnya.
          </p>
          <div className="flex gap-2 justify-end">
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

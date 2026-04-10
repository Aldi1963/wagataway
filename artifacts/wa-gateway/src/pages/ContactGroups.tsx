import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Users, Plus, Trash2, Edit2, Loader2, UserPlus, UserMinus,
  Tag, Search, ChevronRight, X,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const GROUP_COLORS = [
  "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6",
  "#ec4899", "#06b6d4", "#84cc16", "#f97316", "#6366f1",
];

interface ContactGroup {
  id: string;
  name: string;
  color: string;
  description?: string;
  memberCount: number;
}

interface Contact {
  id: string;
  name: string;
  phone: string;
}

export default function ContactGroups() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editItem, setEditItem] = useState<ContactGroup | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ContactGroup | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<ContactGroup | null>(null);
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [searchContact, setSearchContact] = useState("");
  const [selectedContacts, setSelectedContacts] = useState<Set<string>>(new Set());
  const [form, setForm] = useState({ name: "", color: GROUP_COLORS[0], description: "" });

  const { data: groups, isLoading } = useQuery<ContactGroup[]>({
    queryKey: ["contact-groups"],
    queryFn: () => apiFetch("/contact-groups").then((r) => r.json()),
  });

  const { data: members } = useQuery<Contact[]>({
    queryKey: ["contact-group-members", selectedGroup?.id],
    queryFn: () => apiFetch(`/contact-groups/${selectedGroup!.id}/members`).then((r) => r.json()),
    enabled: !!selectedGroup,
  });

  const { data: allContacts } = useQuery<Contact[]>({
    queryKey: ["contacts-all"],
    queryFn: () => apiFetch("/contacts?limit=500").then((r) => r.json()).then((d) => d.data ?? d),
    enabled: addMemberOpen,
  });

  const createMut = useMutation({
    mutationFn: (data: any) => apiFetch("/contact-groups", { method: "POST", body: JSON.stringify(data) }).then((r) => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["contact-groups"] }); toast({ title: "Grup dibuat" }); setOpen(false); },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, ...data }: any) => apiFetch(`/contact-groups/${id}`, { method: "PUT", body: JSON.stringify(data) }).then((r) => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["contact-groups"] }); toast({ title: "Grup diperbarui" }); setOpen(false); setEditItem(null); },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => apiFetch(`/contact-groups/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["contact-groups"] }); toast({ title: "Grup dihapus" }); setDeleteTarget(null); if (selectedGroup?.id === deleteTarget?.id) setSelectedGroup(null); },
  });

  const addMembersMut = useMutation({
    mutationFn: ({ groupId, contactIds }: { groupId: string; contactIds: number[] }) =>
      apiFetch(`/contact-groups/${groupId}/members`, { method: "POST", body: JSON.stringify({ contactIds }) }).then((r) => r.json()),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["contact-groups"] });
      qc.invalidateQueries({ queryKey: ["contact-group-members", selectedGroup?.id] });
      toast({ title: `${data.added} kontak ditambahkan` });
      setAddMemberOpen(false);
      setSelectedContacts(new Set());
    },
  });

  const removeMemberMut = useMutation({
    mutationFn: ({ groupId, contactId }: { groupId: string; contactId: string }) =>
      apiFetch(`/contact-groups/${groupId}/members/${contactId}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["contact-group-members", selectedGroup?.id] }); qc.invalidateQueries({ queryKey: ["contact-groups"] }); },
  });

  function openCreate() {
    setEditItem(null);
    setForm({ name: "", color: GROUP_COLORS[0], description: "" });
    setOpen(true);
  }

  function openEdit(g: ContactGroup) {
    setEditItem(g);
    setForm({ name: g.name, color: g.color, description: g.description ?? "" });
    setOpen(true);
  }

  function handleSubmit() {
    if (!form.name.trim()) return;
    if (editItem) updateMut.mutate({ id: editItem.id, ...form });
    else createMut.mutate(form);
  }

  const filteredContacts = (allContacts ?? []).filter((c) => {
    const s = searchContact.toLowerCase();
    return c.name.toLowerCase().includes(s) || c.phone.includes(s);
  });

  const memberIds = new Set((members ?? []).map((m) => m.id));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end">
        <Button onClick={openCreate} className="gap-2 bg-blue-600 hover:bg-blue-700 text-white">
          <Plus className="w-4 h-4" /> Buat Grup
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Group list */}
        <div className="lg:col-span-1 space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Daftar Grup</h2>
          {isLoading ? (
            Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)
          ) : !groups?.length ? (
            <Card>
              <CardContent className="p-8 text-center">
                <Tag className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Belum ada grup</p>
                <Button size="sm" variant="outline" className="mt-3" onClick={openCreate}><Plus className="w-3 h-3 mr-1" />Buat sekarang</Button>
              </CardContent>
            </Card>
          ) : (
            groups.map((g) => (
              <Card
                key={g.id}
                className={cn("cursor-pointer transition-all hover:shadow-md", selectedGroup?.id === g.id && "ring-2 ring-blue-500")}
                onClick={() => setSelectedGroup(g)}
              >
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: g.color + "20" }}>
                    <div className="w-5 h-5 rounded-full" style={{ backgroundColor: g.color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{g.name}</p>
                    {g.description && <p className="text-xs text-muted-foreground truncate">{g.description}</p>}
                    <Badge variant="secondary" className="text-[10px] mt-1">{g.memberCount} kontak</Badge>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button size="icon" variant="ghost" className="w-7 h-7" onClick={(e) => { e.stopPropagation(); openEdit(g); }}>
                      <Edit2 className="w-3.5 h-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="w-7 h-7 text-destructive hover:text-destructive" onClick={(e) => { e.stopPropagation(); setDeleteTarget(g); }}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* Group members */}
        <div className="lg:col-span-2">
          {!selectedGroup ? (
            <Card className="h-full min-h-64">
              <CardContent className="p-10 flex flex-col items-center justify-center h-full gap-3 text-center">
                <Users className="w-10 h-10 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Pilih grup di sebelah kiri untuk melihat anggotanya</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full" style={{ backgroundColor: selectedGroup.color }} />
                    {selectedGroup.name}
                    <Badge variant="secondary">{members?.length ?? 0} kontak</Badge>
                  </CardTitle>
                  <Button size="sm" className="gap-2 bg-blue-600 hover:bg-blue-700 text-white" onClick={() => setAddMemberOpen(true)}>
                    <UserPlus className="w-3.5 h-3.5" /> Tambah
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {!members ? (
                  <Skeleton className="h-32 w-full rounded-lg" />
                ) : members.length === 0 ? (
                  <div className="text-center py-10">
                    <Users className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">Belum ada anggota</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {members.map((m) => (
                      <div key={m.id} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-sm font-semibold">
                            {m.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-medium">{m.name}</p>
                            <p className="text-xs text-muted-foreground">{m.phone}</p>
                          </div>
                        </div>
                        <Button
                          size="icon" variant="ghost"
                          className="w-7 h-7 text-destructive hover:text-destructive"
                          onClick={() => removeMemberMut.mutate({ groupId: selectedGroup.id, contactId: m.id })}
                        >
                          <UserMinus className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Create/Edit dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editItem ? "Edit Grup" : "Buat Grup Baru"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Nama Grup</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Pelanggan VIP" />
            </div>
            <div className="space-y-1.5">
              <Label>Deskripsi (opsional)</Label>
              <Input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Keterangan singkat" />
            </div>
            <div className="space-y-1.5">
              <Label>Warna Label</Label>
              <div className="flex gap-2 flex-wrap">
                {GROUP_COLORS.map((c) => (
                  <button
                    key={c}
                    className={cn("w-8 h-8 rounded-full border-2 transition-all", form.color === c ? "border-foreground scale-110" : "border-transparent")}
                    style={{ backgroundColor: c }}
                    onClick={() => setForm((f) => ({ ...f, color: c }))}
                  />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Batal</Button>
            <Button className="bg-blue-600 hover:bg-blue-700 text-white" onClick={handleSubmit} disabled={!form.name.trim() || createMut.isPending || updateMut.isPending}>
              {(createMut.isPending || updateMut.isPending) && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editItem ? "Simpan" : "Buat"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add members dialog */}
      <Dialog open={addMemberOpen} onOpenChange={setAddMemberOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Tambah Kontak ke "{selectedGroup?.name}"</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="Cari kontak..."
              value={searchContact}
              onChange={(e) => setSearchContact(e.target.value)}
              className="h-8 text-sm"
            />
            <div className="max-h-72 overflow-y-auto space-y-1">
              {filteredContacts.filter((c) => !memberIds.has(c.id)).map((c) => {
                const checked = selectedContacts.has(c.id);
                return (
                  <div
                    key={c.id}
                    className={cn("flex items-center gap-3 p-2 rounded-lg cursor-pointer hover:bg-muted", checked && "bg-blue-50 dark:bg-blue-950/30")}
                    onClick={() => setSelectedContacts((prev) => { const s = new Set(prev); checked ? s.delete(c.id) : s.add(c.id); return s; })}
                  >
                    <div className={cn("w-4 h-4 rounded border-2 flex items-center justify-center", checked ? "bg-blue-600 border-blue-600" : "border-border")}>
                      {checked && <X className="w-2.5 h-2.5 text-white" style={{ transform: "rotate(45deg)" }} />}
                    </div>
                    <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-xs font-bold shrink-0">
                      {c.name.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{c.name}</p>
                      <p className="text-xs text-muted-foreground">{c.phone}</p>
                    </div>
                  </div>
                );
              })}
            </div>
            {selectedContacts.size > 0 && (
              <p className="text-xs text-blue-600 font-medium">{selectedContacts.size} kontak dipilih</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAddMemberOpen(false); setSelectedContacts(new Set()); }}>Batal</Button>
            <Button
              className="bg-blue-600 hover:bg-blue-700 text-white"
              disabled={selectedContacts.size === 0 || addMembersMut.isPending}
              onClick={() => addMembersMut.mutate({ groupId: selectedGroup!.id, contactIds: [...selectedContacts].map(Number) })}
            >
              {addMembersMut.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Tambah {selectedContacts.size > 0 ? `(${selectedContacts.size})` : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Grup?</AlertDialogTitle>
            <AlertDialogDescription>Grup "{deleteTarget?.name}" dan semua keanggotaannya akan dihapus. Kontak tidak akan terhapus.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground" onClick={() => deleteTarget && deleteMut.mutate(deleteTarget.id)}>
              {deleteMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Hapus"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

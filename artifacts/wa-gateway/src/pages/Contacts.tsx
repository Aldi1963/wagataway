import { useState, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import {
  Users, Plus, Search, Trash2, Edit2, Loader2, Phone,
  ChevronLeft, ChevronRight, Upload, Download, Smartphone,
  BookX, Square, CheckSquare, Tag, X, FileSpreadsheet, AlertCircle,
  CheckCircle2, Table2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useDevice } from "@/contexts/DeviceContext";
import { LimitExceededDialog } from "@/components/LimitExceededDialog";

interface Contact {
  id: string;
  name: string;
  phone: string;
  email?: string;
  tags?: string[];
  notes?: string;
}

export default function Contacts() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { selectedDevice } = useDevice();
  const importRef = useRef<HTMLInputElement>(null);

  const [search, setSearch] = useState("");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [editItem, setEditItem] = useState<Contact | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", email: "", tags: "", notes: "" });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [clearConfirm, setClearConfirm] = useState(false);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [fetchResult, setFetchResult] = useState<{ fetched: number; imported: number; skipped: number; deviceName: string } | null>(null);
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number; errors: number } | null>(null);
  const [limitErr, setLimitErr] = useState<{ message: string; current?: number; limit?: number; planName?: string } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [previewContacts, setPreviewContacts] = useState<{ name: string; phone: string; email?: string; tags?: string }[] | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  // ── Queries ────────────────────────────────────────────────────────────────

  const { data: tagsData } = useQuery<string[]>({
    queryKey: ["contact-tags"],
    queryFn: () => apiFetch("/contacts/tags").then((r) => r.json()),
  });
  const allTags: string[] = Array.isArray(tagsData) ? tagsData : [];

  const { data, isLoading } = useQuery({
    queryKey: ["contacts", page, search, selectedTag],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), limit: "20" });
      if (search) params.set("search", search);
      if (selectedTag) params.set("tag", selectedTag);
      return apiFetch(`/contacts?${params}`).then((r) => r.json());
    },
  });

  const contacts: Contact[] = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;
  const allSelected = contacts.length > 0 && contacts.every((c) => selected.has(c.id));

  // ── Mutations ──────────────────────────────────────────────────────────────

  const createContact = useMutation({
    mutationFn: async (body: any) => {
      const r = await apiFetch("/contacts", { method: "POST", body: JSON.stringify(body) });
      const data = await r.json();
      if (!r.ok) { const err = Object.assign(new Error(data.message ?? "Error"), data); throw err; }
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["contacts"] }); qc.invalidateQueries({ queryKey: ["billing-usage"] }); setOpen(false); resetForm(); toast({ title: "Kontak ditambahkan" }); },
    onError: (err: any) => {
      if (err?.code === "LIMIT_EXCEEDED") setLimitErr({ message: err.message, current: err.current, limit: err.limit, planName: err.planName });
      else toast({ title: "Gagal menambahkan kontak", variant: "destructive" });
    },
  });

  const updateContact = useMutation({
    mutationFn: ({ id, body }: { id: string; body: any }) =>
      apiFetch(`/contacts/${id}`, { method: "PUT", body: JSON.stringify(body) }).then((r) => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["contacts"] }); setOpen(false); setEditItem(null); resetForm(); toast({ title: "Kontak diperbarui" }); },
  });

  const deleteContact = useMutation({
    mutationFn: (id: string) => apiFetch(`/contacts/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["contacts"] }); toast({ title: "Kontak dihapus" }); },
  });

  const bulkDelete = useMutation({
    mutationFn: () => apiFetch("/contacts/bulk-delete", { method: "POST", body: JSON.stringify({ ids: Array.from(selected) }) }).then((r) => r.json()),
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ["contacts"] });
      setSelected(new Set());
      setBulkDeleteConfirm(false);
      toast({ title: `${d.deleted} kontak dihapus` });
    },
    onError: () => toast({ title: "Gagal menghapus", variant: "destructive" }),
  });

  const clearPhonebook = useMutation({
    mutationFn: () => apiFetch("/contacts", { method: "DELETE" }).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contacts"] });
      setSelected(new Set());
      setClearConfirm(false);
      toast({ title: "Semua kontak berhasil dihapus" });
    },
    onError: () => toast({ title: "Gagal menghapus", variant: "destructive" }),
  });

  const fetchFromDevice = useMutation({
    mutationFn: () =>
      apiFetch("/contacts/fetch-device", { method: "POST", body: JSON.stringify({ deviceId: selectedDevice?.id }) }).then((r) => r.json()),
    onSuccess: (d) => { qc.invalidateQueries({ queryKey: ["contacts"] }); setFetchResult(d); },
    onError: () => toast({ title: "Gagal mengambil kontak dari device", variant: "destructive" }),
  });

  const importContacts = useMutation({
    mutationFn: async (contacts: any[]) => {
      const r = await apiFetch("/contacts/import", { method: "POST", body: JSON.stringify({ contacts }) });
      const data = await r.json();
      if (!r.ok) { const err = Object.assign(new Error(data.message ?? "Error"), data); throw err; }
      return data;
    },
    onSuccess: (d) => { qc.invalidateQueries({ queryKey: ["contacts"] }); qc.invalidateQueries({ queryKey: ["billing-usage"] }); setImportResult(d); },
    onError: (err: any) => {
      if (err?.code === "LIMIT_EXCEEDED") setLimitErr({ message: err.message, current: err.current, limit: err.limit, planName: err.planName });
      else toast({ title: "Gagal import kontak", variant: "destructive" });
    },
  });

  // ── File parsing helpers ───────────────────────────────────────────────────

  function parseRowsToContacts(rows: any[][]): { name: string; phone: string; email?: string; tags?: string }[] {
    if (!rows.length) return [];
    const header = rows[0].map((h: any) => String(h ?? "").toLowerCase().trim());
    const nameIdx = header.findIndex((h) => h.includes("name") || h.includes("nama"));
    const phoneIdx = header.findIndex((h) => h.includes("phone") || h.includes("nomor") || h.includes("hp") || h.includes("wa"));
    const emailIdx = header.findIndex((h) => h.includes("email"));
    const tagsIdx = header.findIndex((h) => h.includes("tag") || h.includes("grup"));

    if (nameIdx === -1 || phoneIdx === -1) {
      toast({ title: "Format file tidak valid. Perlu kolom name/nama dan phone/nomor/hp.", variant: "destructive" });
      return [];
    }

    return rows.slice(1).map((cols) => ({
      name: String(cols[nameIdx] ?? "").trim(),
      phone: String(cols[phoneIdx] ?? "").trim(),
      email: emailIdx >= 0 ? String(cols[emailIdx] ?? "").trim() || undefined : undefined,
      tags: tagsIdx >= 0 ? String(cols[tagsIdx] ?? "").trim() || undefined : undefined,
    })).filter((c) => c.name && c.phone);
  }

  function parseFile(file: File) {
    const ext = file.name.split(".").pop()?.toLowerCase();
    const reader = new FileReader();

    if (ext === "csv" || ext === "txt") {
      reader.onload = (ev) => {
        const text = ev.target?.result as string;
        const wb = XLSX.read(text, { type: "string" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
        const parsed = parseRowsToContacts(rows);
        if (parsed.length) { setPreviewContacts(parsed); setPreviewOpen(true); }
      };
      reader.readAsText(file);
    } else {
      reader.onload = (ev) => {
        const data = new Uint8Array(ev.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
        const parsed = parseRowsToContacts(rows);
        if (parsed.length) { setPreviewContacts(parsed); setPreviewOpen(true); }
      };
      reader.readAsArrayBuffer(file);
    }
  }

  function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    parseFile(file);
    e.target.value = "";
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) parseFile(file);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); }, []);
  const handleDragLeave = useCallback(() => setIsDragging(false), []);

  function confirmImport() {
    if (!previewContacts) return;
    importContacts.mutate(previewContacts);
    setPreviewOpen(false);
    setPreviewContacts(null);
  }

  function downloadTemplate() {
    const ws = XLSX.utils.aoa_to_sheet([
      ["name", "phone", "email", "tags"],
      ["Budi Santoso", "6281234567890", "budi@email.com", "pelanggan"],
      ["Siti Rahayu", "6289876543210", "", "vip, prospect"],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Contacts");
    XLSX.writeFile(wb, "template_contacts.xlsx");
  }

  function handleExport() {
    apiFetch("/contacts/export")
      .then((r) => r.blob())
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "contacts.csv";
        a.click();
        URL.revokeObjectURL(url);
        toast({ title: "Kontak berhasil diekspor" });
      });
  }

  // ── Selection helpers ──────────────────────────────────────────────────────

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(contacts.map((c) => c.id)));
  }

  // ── Form helpers ───────────────────────────────────────────────────────────

  function resetForm() { setForm({ name: "", phone: "", email: "", tags: "", notes: "" }); }

  function openEdit(contact: Contact) {
    setEditItem(contact);
    setForm({ name: contact.name, phone: contact.phone, email: contact.email ?? "", tags: contact.tags?.join(", ") ?? "", notes: contact.notes ?? "" });
    setOpen(true);
  }

  function handleSave() {
    const body = {
      name: form.name, phone: form.phone,
      email: form.email || undefined,
      tags: form.tags ? form.tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
      notes: form.notes || undefined,
    };
    if (editItem) updateContact.mutate({ id: editItem.id, body });
    else createContact.mutate(body);
  }

  const isPending = createContact.isPending || updateContact.isPending;

  return (
    <div className="space-y-6">
      {/* Top action row */}
      <div className="flex gap-2 flex-wrap">
        <Button
          onClick={() => fetchFromDevice.mutate()}
          disabled={fetchFromDevice.isPending || !selectedDevice}
          className="gap-2"
        >
          {fetchFromDevice.isPending
            ? <Loader2 className="w-4 h-4 animate-spin" />
            : <Smartphone className="w-4 h-4" />}
          Fetch Dari Device
        </Button>
        <Button
          variant="outline"
          onClick={() => setClearConfirm(true)}
          disabled={total === 0}
          className="gap-2 text-destructive border-destructive/30 hover:bg-destructive/5 hover:text-destructive"
        >
          <BookX className="w-4 h-4" />
          Clear Phonebook
        </Button>
      </div>

      {/* Toolbar card */}
      <Card>
        <CardContent className="p-4 space-y-3">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Cari nama atau nomor..."
              className="pl-9"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); setSelected(new Set()); }}
            />
          </div>

          {/* Tag filter chips */}
          {allTags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => { setSelectedTag(null); setPage(1); }}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                  !selectedTag
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                Semua
              </button>
              {allTags.map((tag) => (
                <button
                  key={tag}
                  onClick={() => { setSelectedTag(selectedTag === tag ? null : tag); setPage(1); }}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                    selectedTag === tag
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                >
                  <Tag className="w-2.5 h-2.5" />
                  {tag}
                  {selectedTag === tag && (
                    <X className="w-2.5 h-2.5 ml-0.5" />
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Drag-drop zone */}
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => importRef.current?.click()}
            className={`border-2 border-dashed rounded-xl px-4 py-3 flex items-center gap-3 cursor-pointer transition-colors ${
              isDragging
                ? "border-primary bg-primary/5 text-primary"
                : "border-border hover:border-primary/50 hover:bg-muted/30 text-muted-foreground hover:text-foreground"
            }`}
          >
            <FileSpreadsheet className={`w-5 h-5 shrink-0 ${isDragging ? "text-primary" : ""}`} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium leading-none">
                {isDragging ? "Lepaskan file di sini..." : "Drop file atau klik untuk import"}
              </p>
              <p className="text-xs mt-0.5 opacity-70">Mendukung .xlsx, .xls, .csv</p>
            </div>
            {importContacts.isPending && <Loader2 className="w-4 h-4 animate-spin shrink-0" />}
          </div>
          <input ref={importRef} type="file" accept=".csv,.txt,.xlsx,.xls" className="hidden" onChange={handleImportFile} />

          <Separator />

          {/* Actions row */}
          <div className="flex flex-wrap gap-2 items-center">
            {/* Add / Import / Export */}
            <Button
              size="sm"
              className="gap-1.5"
              onClick={() => { resetForm(); setEditItem(null); setOpen(true); }}
            >
              <Plus className="w-3.5 h-3.5" />
              Tambah
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={downloadTemplate}
            >
              <Download className="w-3.5 h-3.5" />
              Template Excel
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={handleExport}
              disabled={total === 0}
            >
              <Download className="w-3.5 h-3.5" />
              Export CSV
            </Button>

            {/* Divider visible on wider screens */}
            <div className="w-px h-5 bg-border hidden sm:block" />

            {/* Select-all + bulk delete */}
            <button
              onClick={toggleAll}
              disabled={contacts.length === 0}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
            >
              {allSelected
                ? <CheckSquare className="w-4 h-4 text-primary" />
                : <Square className="w-4 h-4" />}
              <span>{allSelected ? "Batal Semua" : "Pilih Semua"}</span>
            </button>

            {selected.size > 0 && (
              <Button
                size="sm"
                variant="destructive"
                className="gap-1.5 h-7 text-xs"
                onClick={() => setBulkDeleteConfirm(true)}
              >
                <Trash2 className="w-3.5 h-3.5" />
                Hapus {selected.size} Terpilih
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Contact list */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-[68px] w-full rounded-xl" />
          ))}
        </div>
      ) : !contacts.length ? (
        <Card>
          <CardContent className="py-16 flex flex-col items-center gap-4 text-center">
            <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center">
              <Users className="w-8 h-8 text-muted-foreground/50" />
            </div>
            <div>
              <p className="font-semibold">
                {search ? "Kontak tidak ditemukan" : "Belum ada kontak"}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {search
                  ? `Tidak ada hasil untuk "${search}"`
                  : "Tambah manual, import CSV, atau fetch dari device WhatsApp"}
              </p>
            </div>
            {!search && (
              <div className="flex gap-2 flex-wrap justify-center">
                <Button size="sm" onClick={() => setOpen(true)} className="gap-1.5">
                  <Plus className="w-3.5 h-3.5" /> Tambah Kontak
                </Button>
                <Button size="sm" variant="outline" onClick={() => importRef.current?.click()} className="gap-1.5">
                  <Upload className="w-3.5 h-3.5" /> Import CSV
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="space-y-2">
            {contacts.map((contact) => (
              <Card
                key={contact.id}
                className={
                  selected.has(contact.id)
                    ? "ring-2 ring-primary/40 bg-primary/[0.02]"
                    : "hover:bg-accent/30 transition-colors"
                }
              >
                <CardContent className="p-4 flex items-center gap-3">
                  <Checkbox
                    checked={selected.has(contact.id)}
                    onCheckedChange={() => toggleSelect(contact.id)}
                    className="shrink-0"
                  />
                  <Avatar className="h-9 w-9 shrink-0">
                    <AvatarFallback className="bg-primary/10 text-primary font-semibold text-sm">
                      {contact.name.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{contact.name}</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                      <Phone className="w-3 h-3 shrink-0" />
                      {contact.phone}
                    </p>
                    {contact.tags && contact.tags.length > 0 && (
                      <div className="flex gap-1 mt-1.5 flex-wrap">
                        {contact.tags.map((tag) => (
                          <Badge key={tag} variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost" size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-foreground"
                      onClick={() => openEdit(contact)}
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost" size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      onClick={() => deleteContact.mutate(contact.id)}
                      disabled={deleteContact.isPending}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3">
              <Button
                variant="outline" size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-sm text-muted-foreground">
                Halaman {page} dari {totalPages}
              </span>
              <Button
                variant="outline" size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          )}
        </>
      )}

      {/* ── Add / Edit Dialog ─────────────────────────────────────────────── */}
      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setEditItem(null); resetForm(); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editItem ? "Edit Kontak" : "Tambah Kontak Baru"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Nama <span className="text-destructive">*</span></Label>
              <Input
                placeholder="Nama kontak"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Nomor WhatsApp <span className="text-destructive">*</span></Label>
              <Input
                placeholder="628123456789"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">Format: kode negara + nomor tanpa tanda + atau spasi</p>
            </div>
            <div className="space-y-2">
              <Label className="text-muted-foreground">Email <span className="text-xs">(opsional)</span></Label>
              <Input
                type="email"
                placeholder="email@example.com"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-muted-foreground">Tag <span className="text-xs">(pisahkan dengan koma)</span></Label>
              <Input
                placeholder="pelanggan, vip, prospect"
                value={form.tags}
                onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-muted-foreground">Catatan <span className="text-xs">(opsional)</span></Label>
              <Input
                placeholder="Catatan..."
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Batal</Button>
            <Button onClick={handleSave} disabled={!form.name || !form.phone || isPending} className="gap-2">
              {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              {editItem ? "Simpan Perubahan" : "Tambahkan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Clear phonebook confirm ───────────────────────────────────────── */}
      <AlertDialog open={clearConfirm} onOpenChange={setClearConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Semua Kontak?</AlertDialogTitle>
            <AlertDialogDescription>
              Seluruh <strong>{total}</strong> kontak akan dihapus secara permanen. Tindakan ini tidak dapat dibatalkan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => clearPhonebook.mutate()}
            >
              {clearPhonebook.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Ya, Hapus Semua"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Bulk delete confirm ───────────────────────────────────────────── */}
      <AlertDialog open={bulkDeleteConfirm} onOpenChange={setBulkDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus {selected.size} Kontak?</AlertDialogTitle>
            <AlertDialogDescription>Kontak yang dipilih akan dihapus secara permanen.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => bulkDelete.mutate()}
            >
              {bulkDelete.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Ya, Hapus"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Fetch from device result ──────────────────────────────────────── */}
      <Dialog open={!!fetchResult} onOpenChange={(o) => { if (!o) setFetchResult(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Kontak Berhasil Diambil</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Mengambil kontak dari device <strong>{fetchResult?.deviceName}</strong>
            </p>
            <div className="grid grid-cols-3 gap-3 text-center">
              {[
                { label: "Ditemukan", value: fetchResult?.fetched, color: "text-primary" },
                { label: "Diimpor", value: fetchResult?.imported, color: "text-foreground" },
                { label: "Dilewati", value: fetchResult?.skipped, color: "text-muted-foreground" },
              ].map(({ label, value, color }) => (
                <div key={label} className="bg-muted rounded-xl p-3">
                  <p className={`text-2xl font-bold ${color}`}>{value}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">Kontak yang sudah ada dilewati untuk mencegah duplikasi.</p>
          </div>
          <DialogFooter>
            <Button className="w-full" onClick={() => setFetchResult(null)}>Tutup</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Import result ─────────────────────────────────────────────────── */}
      <Dialog open={!!importResult} onOpenChange={(o) => { if (!o) setImportResult(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Import Selesai</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-3 gap-3 text-center">
            {[
              { label: "Berhasil", value: importResult?.imported, color: "text-primary" },
              { label: "Dilewati", value: importResult?.skipped, color: "text-muted-foreground" },
              { label: "Error", value: importResult?.errors, color: "text-destructive" },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-muted rounded-xl p-3">
                <p className={`text-2xl font-bold ${color}`}>{value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button className="w-full" onClick={() => setImportResult(null)}>Tutup</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <LimitExceededDialog
        open={!!limitErr}
        onClose={() => setLimitErr(null)}
        message={limitErr?.message ?? ""}
        current={limitErr?.current}
        limit={limitErr?.limit}
        planName={limitErr?.planName}
        resource="Kontak"
      />

      {/* ── Import preview modal ──────────────────────────────────────────── */}
      <Dialog open={previewOpen} onOpenChange={(o) => { if (!o) { setPreviewOpen(false); setPreviewContacts(null); } }}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Table2 className="w-4 h-4" />
              Preview Import — {previewContacts?.length ?? 0} kontak
            </DialogTitle>
          </DialogHeader>

          <div className="overflow-auto flex-1 border rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-muted sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">#</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Nama</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Nomor</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Email</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Tags</th>
                </tr>
              </thead>
              <tbody>
                {previewContacts?.slice(0, 50).map((c, i) => (
                  <tr key={i} className="border-t hover:bg-muted/30">
                    <td className="px-3 py-1.5 text-muted-foreground">{i + 1}</td>
                    <td className="px-3 py-1.5 font-medium">{c.name}</td>
                    <td className="px-3 py-1.5 font-mono text-xs">{c.phone}</td>
                    <td className="px-3 py-1.5 text-muted-foreground">{c.email ?? "—"}</td>
                    <td className="px-3 py-1.5">
                      {c.tags ? (
                        <div className="flex gap-1 flex-wrap">
                          {c.tags.split(",").map((t) => t.trim()).filter(Boolean).map((tag) => (
                            <Badge key={tag} variant="secondary" className="text-[10px] px-1.5 py-0 h-4">{tag}</Badge>
                          ))}
                        </div>
                      ) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {(previewContacts?.length ?? 0) > 50 && (
              <p className="text-xs text-muted-foreground text-center py-2">
                Menampilkan 50 dari {previewContacts?.length} kontak
              </p>
            )}
          </div>

          <div className="flex items-center gap-2 pt-1">
            <AlertCircle className="w-4 h-4 text-muted-foreground shrink-0" />
            <p className="text-xs text-muted-foreground">
              Kontak dengan nomor yang sudah ada akan dilewati (tidak duplikat).
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setPreviewOpen(false); setPreviewContacts(null); }}>Batal</Button>
            <Button onClick={confirmImport} disabled={importContacts.isPending} className="gap-2">
              {importContacts.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Import {previewContacts?.length ?? 0} Kontak
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

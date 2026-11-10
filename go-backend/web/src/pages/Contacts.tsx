import { toast } from "sonner";
import { useEffect, useRef, useState } from "react";
import { Plus, Search, Pencil, Trash2, X, Upload, RefreshCw, Download, Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dropdown } from "@/components/ui/dropdown";
import { apiGet, apiPost, apiPut, apiDelete, apiFetch } from "@/lib/api";
import SyncWAButton from "@/components/contacts/SyncWAButton";
import { useLang } from "@/lib/i18n";

interface ContactGroup {
  id: number;
  name: string;
}

async function apiDeleteWithBody(path: string, body: unknown): Promise<void> {
  const res = await apiFetch(path, {
    method: "DELETE",
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let msg = "Request failed";
    try {
      msg = (await res.json()).message || msg;
    } catch {
      /* abaikan */
    }
    throw new Error(msg);
  }
}

interface Contact {
  id: number;
  name: string;
  phone: string;
  email: string;
  notes: string;
  tags: string;
  createdAt: string;
}

const emptyForm = { name: "", phone: "", email: "", notes: "", tags: "" };

function tagList(tags: string): string[] {
  if (!tags) return [];
  const t = tags.trim();
  if (t.startsWith("[")) {
    try {
      const a = JSON.parse(t);
      if (Array.isArray(a)) return a.map(String).filter(Boolean);
    } catch {
      /* fall through */
    }
  }
  return t.split(",").map((s) => s.trim()).filter(Boolean);
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const { t } = useLang();
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative bg-card text-card-foreground border border-border rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-5 sm:p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-secondary"
            aria-label={t("common.close")}
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function Contacts({ embedded = false }: { embedded?: boolean }) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Contact | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState("");
  const [importTab, setImportTab] = useState<"file" | "text">("file");
  const [importFileName, setImportFileName] = useState("");
  const [importParsed, setImportParsed] = useState<{ name: string; phone: string; email?: string }[]>([]);
  const [deleting, setDeleting] = useState<Contact | null>(null);

  // Bulk selection
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [groups, setGroups] = useState<ContactGroup[]>([]);
  const [bulkGroup, setBulkGroup] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [showBulkDelete, setShowBulkDelete] = useState(false);
  const [showClearAll, setShowClearAll] = useState(false);
  const [clearingAll, setClearingAll] = useState(false);

  const firstRun = useRef(true);
  const { t } = useLang();

  const load = async (q: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiGet<{ contacts: Contact[]; total: number }>(
        `/contacts?search=${encodeURIComponent(q)}&limit=100`
      );
      setContacts(res.contacts || []);
      setTotal(res.total ?? (res.contacts || []).length);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("contacts.loadFailed"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      load("");
      return;
    }
    const t = setTimeout(() => load(search), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  // Daftar grup untuk bulk "pindah ke grup"
  useEffect(() => {
    apiGet<{ groups: ContactGroup[] }>("/contact-groups")
      .then((res) => setGroups(res.groups || []))
      .catch(() => {
        /* abaikan — fitur grup opsional */
      });
  }, []);

  // Bersihkan pilihan saat data berubah
  useEffect(() => {
    setSelected((prev) => {
      const ids = new Set(contacts.map((c) => c.id));
      const next = new Set<number>();
      prev.forEach((id) => {
        if (ids.has(id)) next.add(id);
      });
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contacts]);

  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm);
    setShowForm(true);
  };

  const openEdit = (c: Contact) => {
    setEditing(c);
    setForm({
      name: c.name || "",
      phone: c.phone || "",
      email: c.email || "",
      notes: c.notes || "",
      tags: Array.isArray(tagList(c.tags)) ? tagList(c.tags).join(", ") : c.tags || "",
    });
    setShowForm(true);
  };

  const saveContact = async () => {
    if (!form.name.trim() || !form.phone.trim()) {
      toast.error(t("contacts.namePhoneRequired"));
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await apiPut(`/contacts/${editing.id}`, form);
        toast.success(t("contacts.updated"));
      } else {
        await apiPost("/contacts", form);
        toast.success(t("contacts.added"));
      }
      setShowForm(false);
      setEditing(null);
      setForm(emptyForm);
      load(search);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("contacts.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await apiDelete(`/contacts/${deleting.id}`);
      toast.success(t("contacts.deleted"));
      setDeleting(null);
      load(search);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("contacts.deleteFailed"));
    }
  };

  /* ── Bulk actions ─────────────────────────────────────── */
  const allSelected =
    contacts.length > 0 && contacts.every((c) => selected.has(c.id));

  const toggleOne = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(contacts.map((c) => c.id)));
  };

  const confirmBulkDelete = async () => {
    if (selected.size === 0) return;
    setBulkBusy(true);
    try {
      await apiDeleteWithBody("/contacts/bulk", { ids: Array.from(selected) });
      toast.success(t("contacts.bulkDeleted").replace("{count}", String(selected.size)));
      setSelected(new Set());
      setShowBulkDelete(false);
      load(search);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("contacts.deleteFailed"));
    } finally {
      setBulkBusy(false);
    }
  };

  const buildAndDownloadCsv = (rows: Contact[]) => {
    const esc = (v: string) => `"${(v ?? "").replace(/"/g, '""')}"`;
    const lines = [
      "nama,nomor,email,tag",
      ...rows.map((c) =>
        [c.name, c.phone, c.email || "", c.tags || ""].map(esc).join(",")
      ),
    ];
    const blob = new Blob([lines.join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `kontak-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success(t("contacts.exportedCsv").replace("{count}", String(rows.length)));
  };

  const exportCsv = () => {
    const rows =
      selected.size > 0
        ? contacts.filter((c) => selected.has(c.id))
        : contacts;
    if (rows.length === 0) {
      toast.error(t("contacts.nothingToExport"));
      return;
    }
    buildAndDownloadCsv(rows);
  };

  // Ambil SEMUA kontak (paginasi, limit maks backend 200) untuk export/clear-all
  const fetchAllContacts = async (): Promise<Contact[]> => {
    const all: Contact[] = [];
    let page = 1;
    for (;;) {
      const res = await apiGet<{ contacts: Contact[]; total: number }>(
        `/contacts?limit=200&page=${page}`
      );
      const list = res.contacts || [];
      all.push(...list);
      if (all.length >= (res.total || 0) || list.length === 0) break;
      page++;
    }
    return all;
  };

  const exportAllCsv = async () => {
    try {
      const all = await fetchAllContacts();
      if (all.length === 0) {
        toast.error(t("contacts.nothingToExport"));
        return;
      }
      buildAndDownloadCsv(all);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("contacts.exportFailed"));
    }
  };

  const confirmClearAll = async () => {
    setClearingAll(true);
    try {
      const all = await fetchAllContacts();
      if (all.length === 0) {
        toast.info(t("contacts.nothingToDelete"));
        setShowClearAll(false);
        return;
      }
      await apiDeleteWithBody("/contacts/bulk", { ids: all.map((c) => c.id) });
      toast.success(t("contacts.bulkDeleted").replace("{count}", String(all.length)));
      setSelected(new Set());
      setShowClearAll(false);
      load(search);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("contacts.clearAllFailed"));
    } finally {
      setClearingAll(false);
    }
  };

  const bulkAddToGroup = async () => {
    if (!bulkGroup || selected.size === 0) {
      toast.error(t("contacts.selectGroupFirst"));
      return;
    }
    setBulkBusy(true);
    try {
      await apiPost(`/contact-groups/${bulkGroup}/members`, {
        contactIds: Array.from(selected),
      });
      const g = groups.find((x) => String(x.id) === bulkGroup);
      toast.success(t("contacts.movedToGroup").replace("{count}", String(selected.size)).replace("{group}", g?.name || ""));
      setSelected(new Set());
      setBulkGroup("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("contacts.moveFailed"));
    } finally {
      setBulkBusy(false);
    }
  };

  // Buang semua karakter non-digit dari nomor (spasi, strip, +, dsb.)
  const normalizePhone = (raw: string) => raw.replace(/[^\d]/g, "");

  const parseImportLines = (text: string) => {
    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
    const parsed: { name: string; phone: string; email?: string }[] = [];
    lines.forEach((line, idx) => {
      const parts = line.split(",").map((p) => p.trim());
      if (parts.length < 2 || !parts[0] || !parts[1]) return;
      // Lewati baris header (kolom nomor berisi huruf, mis. "nomor")
      if (idx === 0 && !/\d/.test(parts[1])) return;
      const phone = normalizePhone(parts[1]);
      if (!phone) return;
      const item: { name: string; phone: string; email?: string } = {
        name: parts[0],
        phone,
      };
      if (parts[2]) item.email = parts[2];
      parsed.push(item);
    });
    return parsed;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === "string" ? reader.result : "";
      setImportParsed(parseImportLines(text));
    };
    reader.onerror = () => toast.error(t("contacts.readFileFailed"));
    reader.readAsText(file);
  };

  const resetImport = () => {
    setShowImport(false);
    setImportText("");
    setImportParsed([]);
    setImportFileName("");
    setImportTab("file");
  };

  const doImport = async () => {
    const parsed = importTab === "file" ? importParsed : parseImportLines(importText);
    if (parsed.length === 0) {
      toast.error(t("contacts.noValidRows"));
      return;
    }
    setSaving(true);
    try {
      const res = await apiPost<{ imported: number; message: string }>(
        "/contacts/import",
        { contacts: parsed }
      );
      const ok = res.imported || 0;
      const failed = parsed.length - ok;
      toast.success(t("contacts.importDone").replace("{ok}", String(ok)).replace("{failed}", String(failed)));
      resetImport();
      load(search);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("contacts.importFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6"> {/* Header */}
      <div className={`flex gap-3 sm:flex-row sm:items-center ${embedded ? "justify-end" : "flex-col sm:justify-between"}`}>
        {!embedded && (
          <div>
            <h1 className="text-xl sm:text-2xl font-bold">{t("title.contacts")}</h1>
            <p className="text-sm text-muted-foreground">
              {t("contacts.totalStored").replace("{count}", String(total))}
            </p>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <SyncWAButton kind="contacts" onDone={() => load(search)} />
          <Button variant="success" onClick={() => setShowImport(true)} className="gap-1.5">
            <Upload className="w-4 h-4" />
            {t("contacts.import")}
          </Button>
          <Button variant="warning" onClick={exportAllCsv} className="gap-1.5">
            <Download className="w-4 h-4" />
            {t("contacts.export")}
          </Button>
          <Button variant="destructive" onClick={() => setShowClearAll(true)} className="gap-1.5">
            <Trash2 className="w-4 h-4" />
            Clear All
          </Button>
          <Button onClick={openAdd} className="gap-1.5">
            <Plus className="w-4 h-4" />
            {t("contacts.addContact")}
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder={t("contacts.searchPlaceholder")}
          className="pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Bulk toolbar */}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
          <span className="text-sm font-medium">{t("contacts.selectedCount").replace("{count}", String(selected.size))}</span>
          <button
            className="text-xs text-muted-foreground hover:text-foreground underline"
            onClick={() => setSelected(new Set())}
          >
            {t("contacts.clearSelection")}
          </button>
          <div className="flex-1" />
          {groups.length > 0 && (
            <>
              <Dropdown
                value={bulkGroup}
                onChange={setBulkGroup}
                ariaLabel={t("contacts.moveToGroup")}
                className="w-auto min-w-[150px]"
                placeholder={t("contacts.moveToGroupPlaceholder")}
                options={[
                  { value: "", label: t("contacts.moveToGroupPlaceholder") },
                  ...groups.map((g) => ({ value: String(g.id), label: g.name })),
                ]}
              />
              <Button
                size="sm"
                variant="outline"
                disabled={!bulkGroup || bulkBusy}
                onClick={bulkAddToGroup}
              >
                {t("contacts.move")}
              </Button>
            </>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={exportCsv}
            className="gap-1.5"
          >
            <Download className="w-3.5 h-3.5" /> {t("contacts.exportCsv")}
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => setShowBulkDelete(true)}
            className="gap-1.5"
          >
            <Trash2 className="w-3.5 h-3.5" /> {t("contacts.deleteSelected")}
          </Button>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <Card>
          <CardContent className="p-5 space-y-3">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </CardContent>
        </Card>
      ) : error ? (
        <Card>
          <CardContent className="p-10 text-center">
            <p className="text-sm text-muted-foreground mb-4">{error}</p>
            <Button variant="outline" onClick={() => load(search)} className="gap-1.5">
              <RefreshCw className="w-4 h-4" />
              {t("common.retry")}
            </Button>
          </CardContent>
        </Card>
      ) : contacts.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center">
            {search ? (
              <EmptyState
                icon={Search}
                title={t("contacts.noSearchResults")}
                hint={t("contacts.tryOtherKeyword")}
              />
            ) : (
              <EmptyState
                icon={Users}
                title={t("contacts.noContacts")}
                hint={t("contacts.noContactsHint")}
                actionLabel={t("contacts.addContact")}
                onAction={openAdd}
              />
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px]">
                <thead>
                  <tr className="border-b border-border">
                    <th className="w-10 px-3 py-3">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={toggleAll}
                        aria-label={t("contacts.selectAll")}
                        className="w-4 h-4 accent-primary cursor-pointer"
                      />
                    </th>
                    <th className="text-left text-xs font-medium text-muted-foreground px-5 py-3">
                      {t("contacts.colName")}
                    </th>
                    <th className="text-left text-xs font-medium text-muted-foreground px-5 py-3">
                      {t("contacts.colPhone")}
                    </th>
                    <th className="text-left text-xs font-medium text-muted-foreground px-5 py-3">
                      {t("contacts.colEmail")}
                    </th>
                    <th className="text-left text-xs font-medium text-muted-foreground px-5 py-3">
                      {t("contacts.colTag")}
                    </th>
                    <th className="w-24"></th>
                  </tr>
                </thead>
                <tbody>
                  {contacts.map((c) => (
                    <tr
                      key={c.id}
                      className="border-b border-border last:border-0 hover:bg-secondary/50 transition-colors"
                    >
                      <td className="px-3 py-3">
                        <input
                          type="checkbox"
                          checked={selected.has(c.id)}
                          onChange={() => toggleOne(c.id)}
                          aria-label={t("contacts.selectContact").replace("{name}", c.name)}
                          className="w-4 h-4 accent-primary cursor-pointer"
                        />
                      </td>
                      <td className="px-5 py-3 font-medium">{c.name}</td>
                      <td className="px-5 py-3 text-sm text-muted-foreground">{c.phone}</td>
                      <td className="px-5 py-3 text-sm text-muted-foreground">
                        {c.email || "-"}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex flex-wrap gap-1">
                          {tagList(c.tags).map((t) => (
                            <span
                              key={t}
                              className="text-xs px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground"
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex gap-1 justify-end">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openEdit(c)}
                            aria-label={t("contacts.editContact").replace("{name}", c.name)}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDeleting(c)}
                            aria-label={t("contacts.deleteContact").replace("{name}", c.name)}
                          >
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Add/Edit dialog */}
      {showForm && (
        <Modal
          title={editing ? t("contacts.editContactTitle") : t("contacts.addContact")}
          onClose={() => setShowForm(false)}
        >
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1.5 block">{t("contacts.labelName")}</label>
              <Input
                placeholder={t("contacts.placeholderName")}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">{t("contacts.labelPhone")}</label>
              <Input
                placeholder="62812xxxxxxx"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">{t("contacts.colEmail")}</label>
              <Input
                type="email"
                placeholder="email@contoh.com"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">
                {t("contacts.labelTags")}
              </label>
              <Input
                placeholder={t("contacts.placeholderTags")}
                value={form.tags}
                onChange={(e) => setForm({ ...form, tags: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">{t("contacts.labelNotes")}</label>
              <Input
                placeholder={t("contacts.placeholderNotes")}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" onClick={() => setShowForm(false)}>
                {t("common.cancel")}
              </Button>
              <Button onClick={saveContact} disabled={saving}>
                {saving ? t("contacts.saving") : editing ? t("contacts.saveChanges") : t("contacts.add")}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Import dialog */}
      {showImport && (
        <Modal title={t("contacts.importTitle")} onClose={resetImport}>
          <div className="space-y-4">
            {/* Tabs */}
            <div className="flex rounded-md border border-border p-0.5 bg-secondary/50">
              <button
                className={`flex-1 rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                  importTab === "file" ? "bg-card shadow text-foreground" : "text-muted-foreground"
                }`}
                onClick={() => setImportTab("file")}
              >
                {t("contacts.tabFile")}
              </button>
              <button
                className={`flex-1 rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                  importTab === "text" ? "bg-card shadow text-foreground" : "text-muted-foreground"
                }`}
                onClick={() => setImportTab("text")}
              >
                {t("contacts.tabText")}
              </button>
            </div>

            <p className="text-sm text-muted-foreground">
              {t("contacts.formatPerLine")}{" "}
              <code className="bg-secondary px-1.5 py-0.5 rounded text-xs">
                nama,nomor[,email]
              </code>
            </p>

            {importTab === "file" ? (
              <div className="space-y-3">
                <label className="flex items-center justify-center gap-2 rounded-md border border-dashed border-border px-4 py-8 cursor-pointer hover:bg-secondary/50 transition-colors">
                  <Upload className="w-5 h-5 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
                    {importFileName || t("contacts.chooseFile")}
                  </span>
                  <input
                    type="file"
                    accept=".csv,.txt"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                </label>
                {importParsed.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-foreground">
                      {t("contacts.previewCount").replace("{count}", String(importParsed.length))}
                    </p>
                    <div className="overflow-x-auto rounded-md border border-border">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-border bg-secondary/50">
                            <th className="text-left font-medium text-muted-foreground px-3 py-2">{t("contacts.colName")}</th>
                            <th className="text-left font-medium text-muted-foreground px-3 py-2">{t("contacts.colPhone")}</th>
                            <th className="text-left font-medium text-muted-foreground px-3 py-2">{t("contacts.colEmail")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {importParsed.slice(0, 5).map((c, i) => (
                            <tr key={i} className="border-b border-border last:border-0">
                              <td className="px-3 py-2 font-medium">{c.name}</td>
                              <td className="px-3 py-2 font-mono text-muted-foreground">{c.phone}</td>
                              <td className="px-3 py-2 text-muted-foreground">{c.email || "-"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {importParsed.length > 5 && (
                      <p className="text-[11px] text-muted-foreground">
                        {t("contacts.moreRows").replace("{count}", String(importParsed.length - 5))}
                      </p>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <textarea
                className="w-full min-h-[160px] rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder={"Budi Santoso,6281234567890\nSiti Aminah,6289876543210,siti@contoh.com"}
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
              />
            )}

            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={resetImport}>
                {t("common.cancel")}
              </Button>
              <Button onClick={doImport} disabled={saving}>
                {saving
                  ? t("contacts.importing")
                  : t("contacts.importCount").replace("{count}", String(importTab === "file" ? importParsed.length : parseImportLines(importText).length))}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Delete confirm */}
      {deleting && (
        <Modal title={t("contacts.deleteTitle")} onClose={() => setDeleting(null)}>
          <p className="text-sm text-muted-foreground mb-5">
            {t("contacts.deleteConfirm").replace("{name}", deleting.name).replace("{phone}", deleting.phone)}
          </p>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setDeleting(null)}>
              {t("common.cancel")}
            </Button>
            <Button variant="destructive" onClick={confirmDelete}>
              {t("common.delete")}
            </Button>
          </div>
        </Modal>
      )}

      {/* Bulk delete confirm */}
      {showBulkDelete && (
        <Modal title={t("contacts.bulkDeleteTitle")} onClose={() => setShowBulkDelete(false)}>
          <p className="text-sm text-muted-foreground mb-5">
            {t("contacts.bulkDeleteConfirm").replace("{count}", String(selected.size))}
          </p>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setShowBulkDelete(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={confirmBulkDelete}
              disabled={bulkBusy}
            >
              {bulkBusy ? t("contacts.deleting") : t("contacts.deleteAll")}
            </Button>
          </div>
        </Modal>
      )}

      {/* Clear All confirm */}
      {showClearAll && (
        <Modal title={t("contacts.clearAllTitle")} onClose={() => setShowClearAll(false)}>
          <p className="text-sm text-muted-foreground mb-5">
            {t("contacts.clearAllConfirm")}
          </p>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setShowClearAll(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={confirmClearAll}
              disabled={clearingAll}
            >
              {clearingAll ? t("contacts.deleting") : t("contacts.confirmClearAll")}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, X, Copy, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { apiGet, apiPost, apiPut, apiDelete } from "@/lib/api";
import { useLang } from "@/lib/i18n";

interface Canned {
  id: number;
  shortcut: string;
  title: string;
  content: string;
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const { t } = useLang();
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden />
      <div className="relative bg-card text-card-foreground rounded-xl border border-border shadow-lg w-full max-w-lg max-h-[90vh] overflow-y-auto p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold">{title}</h3>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose} aria-label={t("common.close")}>
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

export default function CannedResponses({ embedded = false }: { embedded?: boolean }) {
  const { t } = useLang();
  const [items, setItems] = useState<Canned[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Canned | null>(null);
  const [shortcut, setShortcut] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [deleting, setDeleting] = useState<number | null>(null);
  const [search, setSearch] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const r = await apiGet<{ responses: Canned[] } | Canned[]>("/canned-responses");
      setItems(Array.isArray(r) ? r : r.responses ?? []);
    } catch (e: any) {
      toast.error(e.message || t("cannedResponses.loadFailed"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openModal = (c?: Canned) => {
    setEditing(c ?? null);
    setShortcut(c?.shortcut ?? "");
    setTitle(c?.title ?? "");
    setContent(c?.content ?? "");
    setShowModal(true);
  };

  const save = async () => {
    if (!shortcut.trim() || !content.trim()) { toast.error(t("cannedResponses.shortcutContentRequired")); return; }
    try {
      const payload = { shortcut: shortcut.trim(), title: title.trim() || shortcut.trim(), content: content.trim() };
      if (editing) {
        await apiPut(`/canned-responses/${editing.id}`, payload);
        toast.success(t("cannedResponses.updated"));
      } else {
        await apiPost("/canned-responses", payload);
        toast.success(t("cannedResponses.added"));
      }
      setShowModal(false);
      load();
    } catch (e: any) { toast.error(e.message || t("cannedResponses.saveFailed")); }
  };

  const confirmDelete = async () => {
    if (deleting == null) return;
    try {
      await apiDelete(`/canned-responses/${deleting}`);
      toast.success(t("cannedResponses.deleted"));
      setDeleting(null);
      load();
    } catch (e: any) { toast.error(e.message || t("cannedResponses.deleteFailed")); }
  };

  const copyContent = (c: Canned) => {
    navigator.clipboard.writeText(c.content)
      .then(() => toast.success(t("cannedResponses.copied")))
      .catch(() => toast.error(t("cannedResponses.copyFailed")));
  };

  const filtered = items.filter((c) =>
    (c.shortcut + c.title + c.content).toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {!embedded && (
          <div>
            <h1 className="text-xl font-bold text-foreground">Canned Responses</h1>
            <p className="text-sm text-muted-foreground">{t("cannedResponses.description")}</p>
          </div>
        )}
        <Button size="sm" onClick={() => openModal()} className="gap-1.5">
          <Plus className="w-4 h-4" /> {t("cannedResponses.add")}
        </Button>
      </div>

      <Input placeholder={t("cannedResponses.searchPlaceholder")} value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />

      {loading ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">{t("cannedResponses.loading")}</CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="py-3 px-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t("cannedResponses.colShortcut")}</th>
                    <th className="py-3 px-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t("cannedResponses.colTitle")}</th>
                    <th className="py-3 px-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t("cannedResponses.colContent")}</th>
                    <th className="py-3 px-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground text-right">{t("cannedResponses.colActions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 && (
                    <tr><td colSpan={4} className="py-8 text-center text-muted-foreground">{t("cannedResponses.noItems")}</td></tr>
                  )}
                  {filtered.map((c) => (
                    <tr key={c.id} className="border-b border-border last:border-0">
                      <td className="py-3 px-4">
                        <Badge variant="secondary" className="font-mono gap-1"><Zap className="w-3 h-3" />{c.shortcut}</Badge>
                      </td>
                      <td className="py-3 px-4 font-medium">{c.title}</td>
                      <td className="py-3 px-4 text-xs text-muted-foreground max-w-[280px] truncate" title={c.content}>{c.content}</td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => copyContent(c)} aria-label={t("cannedResponses.copyContent")} title={t("cannedResponses.copyContent")}>
                          <Copy className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openModal(c)} aria-label={t("cannedResponses.edit")}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleting(c.id)} aria-label={t("common.delete")}>
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
        <Modal title={editing ? t("cannedResponses.editTitle") : t("cannedResponses.addTitle")} onClose={() => setShowModal(false)}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">{t("cannedResponses.colShortcut")}</label>
                <Input className="mt-1.5 font-mono" placeholder="/salam" value={shortcut} onChange={(e) => setShortcut(e.target.value)} />
              </div>
              <div>
                <label className="text-sm font-medium">{t("cannedResponses.colTitle")}</label>
                <Input className="mt-1.5" placeholder={t("cannedResponses.placeholderTitle")} value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">{t("cannedResponses.labelContent")}</label>
              <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={5} placeholder={t("cannedResponses.placeholderContent")} className={`${inputCls} mt-1.5 resize-y`} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowModal(false)}>{t("common.cancel")}</Button>
              <Button onClick={save}>{t("common.save")}</Button>
            </div>
          </div>
        </Modal>
      )}

      {deleting != null && (
        <Modal title={t("cannedResponses.deleteTitle")} onClose={() => setDeleting(null)}>
          <p className="text-sm text-muted-foreground">{t("cannedResponses.deleteConfirm")}</p>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setDeleting(null)}>{t("common.cancel")}</Button>
            <Button variant="destructive" onClick={confirmDelete}>{t("common.delete")}</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

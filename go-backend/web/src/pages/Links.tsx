import { toast } from "sonner";
import { useEffect, useState, type ReactNode } from "react";
import {
  Plus,
  Link2,
  Copy,
  Trash2,
  BarChart3,
  Pencil,
  X,
  RefreshCw,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { apiGet, apiPost, apiPut, apiDelete } from "@/lib/api";
import { useLang } from "@/lib/i18n";

interface ShortLink {
  id: number;
  code: string;
  targetUrl: string;
  title: string;
  clickCount: number;
  isActive: boolean;
}

const shortUrl = (code: string) => `https://wa.clipku.com/api/l/${code}`;

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const { t } = useLang();
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-hidden
      />
      <div className="relative bg-card text-card-foreground rounded-xl border border-border shadow-lg w-full max-w-lg max-h-[90vh] overflow-y-auto p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold">{title}</h3>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={onClose}
            aria-label={t("common.close")}
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function Links() {
  const { t } = useLang();
  const [links, setLinks] = useState<ShortLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showAdd, setShowAdd] = useState(false);
  const [addTarget, setAddTarget] = useState("");
  const [addTitle, setAddTitle] = useState("");
  const [addCode, setAddCode] = useState("");
  const [savingAdd, setSavingAdd] = useState(false);

  const [editing, setEditing] = useState<ShortLink | null>(null);
  const [editTarget, setEditTarget] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editCode, setEditCode] = useState("");
  const [editActive, setEditActive] = useState(true);
  const [savingEdit, setSavingEdit] = useState(false);

  const [deleting, setDeleting] = useState<ShortLink | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);

  const load = () => {
    setLoading(true);
    setError(null);
    apiGet<{ links: ShortLink[] }>("/links")
      .then((res) => setLinks(res.links || []))
      .catch((e) => setError(e.message || t("links.loadFail")))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const validUrl = (u: string) => /^https?:\/\/.+/i.test(u.trim());

  const handleAdd = async () => {
    if (!validUrl(addTarget)) {
      toast.error(t("links.urlInvalid"));
      return;
    }
    setSavingAdd(true);
    try {
      await apiPost("/links", {
        targetUrl: addTarget.trim(),
        title: addTitle.trim(),
        code: addCode.trim(),
      });
      toast.success(t("links.created"));
      setShowAdd(false);
      setAddTarget("");
      setAddTitle("");
      setAddCode("");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("links.createFail"));
    } finally {
      setSavingAdd(false);
    }
  };

  const openEdit = (l: ShortLink) => {
    setEditing(l);
    setEditTarget(l.targetUrl);
    setEditTitle(l.title || "");
    setEditCode(l.code);
    setEditActive(l.isActive);
  };

  const handleEdit = async () => {
    if (!editing) return;
    if (!validUrl(editTarget)) {
      toast.error(t("links.urlInvalid"));
      return;
    }
    if (!editCode.trim()) {
      toast.error(t("links.codeRequired"));
      return;
    }
    setSavingEdit(true);
    try {
      // backend memakai map mentah ke GORM: kirim snake_case agar kolom cocok
      await apiPut(`/links/${editing.id}`, {
        target_url: editTarget.trim(),
        title: editTitle.trim(),
        code: editCode.trim(),
        is_active: editActive,
      });
      toast.success(t("links.updated"));
      setEditing(null);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("links.updateFail"));
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setDeletingBusy(true);
    try {
      await apiDelete(`/links/${deleting.id}`);
      toast.success(t("links.deleted"));
      setDeleting(null);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("links.deleteFail"));
    } finally {
      setDeletingBusy(false);
    }
  };

  const handleCopy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(shortUrl(code));
      toast.success(t("links.urlCopied"));
    } catch {
      toast.error(t("links.copyFail"));
    }
  };

  return (
    <div className="space-y-6"> <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            {t("links.title")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t("links.subtitle")}
          </p>
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => setShowAdd(true)}>
          <Plus className="w-3.5 h-3.5" />
          {t("links.createLink")}
        </Button>
      </div>

      {loading && (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <div className="animate-pulse space-y-2">
                  <div className="h-4 bg-secondary rounded w-1/3" />
                  <div className="h-3 bg-secondary rounded w-1/2" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {!loading && error && (
        <Card>
          <CardContent className="p-6 text-center space-y-3">
            <p className="text-sm text-destructive">{error}</p>
            <Button size="sm" variant="outline" onClick={load} className="gap-1.5">
              <RefreshCw className="w-3.5 h-3.5" /> {t("common.retry")}
            </Button>
          </CardContent>
        </Card>
      )}

      {!loading && !error && links.length === 0 && (
        <Card>
          <CardContent className="p-10 text-center">
            <EmptyState
              icon={Link2}
              title={t("links.empty")}
              hint={t("links.emptyHint")}
              actionLabel={t("links.createLink")}
              onAction={() => setShowAdd(true)}
            />
          </CardContent>
        </Card>
      )}

      {!loading && !error && links.length > 0 && (
        <div className="space-y-3">
          {links.map((link) => (
            <Card key={link.id} className={!link.isActive ? "opacity-60" : ""}>
              <CardContent className="p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 shrink-0 rounded-md bg-secondary flex items-center justify-center">
                      <Link2 className="w-4 h-4 text-foreground" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-foreground truncate">
                          {link.title || link.code}
                        </p>
                        {!link.isActive && (
                          <Badge variant="outline" className="text-[10px]">
                            {t("links.inactive")}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground font-mono truncate">
                        {shortUrl(link.code)}
                      </p>
                      <p className="text-[10px] text-muted-foreground truncate max-w-[300px]">
                        → {link.targetUrl}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <BarChart3 className="w-3 h-3" />
                      {t("links.clicks").replace("{count}", String(link.clickCount))}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => handleCopy(link.code)}
                      aria-label={t("links.copyUrlAria")}
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </Button>
                    <a
                      href={shortUrl(link.code)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                      aria-label={t("links.openLinkAria")}
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => openEdit(link)}
                      aria-label={t("links.editLinkAria")}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive"
                      onClick={() => setDeleting(link)}
                      aria-label={t("links.deleteLinkAria")}
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

      {showAdd && (
        <Modal title={t("links.modalCreate")} onClose={() => setShowAdd(false)}>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-foreground">
                {t("links.targetUrl")}
              </label>
              <Input
                className="mt-1"
                placeholder="https://..."
                value={addTarget}
                onChange={(e) => setAddTarget(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-foreground">
                {t("links.titleOptional")}
              </label>
              <Input
                className="mt-1"
                placeholder={t("links.titlePlaceholder")}
                value={addTitle}
                onChange={(e) => setAddTitle(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-foreground">
                {t("links.codeOptional")}
              </label>
              <Input
                className="mt-1"
                placeholder={t("links.codePlaceholder")}
                value={addCode}
                onChange={(e) => setAddCode(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAdd(false)}
              >
                {t("common.cancel")}
              </Button>
              <Button size="sm" onClick={handleAdd} disabled={savingAdd}>
                {savingAdd ? t("links.saving") : t("common.save")}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {editing && (
        <Modal title={t("links.modalEdit")} onClose={() => setEditing(null)}>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-foreground">
                {t("links.targetUrl")}
              </label>
              <Input
                className="mt-1"
                value={editTarget}
                onChange={(e) => setEditTarget(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-foreground">
                {t("links.titleOptional")}
              </label>
              <Input
                className="mt-1"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-foreground">{t("links.code")}</label>
              <Input
                className="mt-1"
                value={editCode}
                onChange={(e) => setEditCode(e.target.value)}
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={editActive}
                onChange={(e) => setEditActive(e.target.checked)}
                className="w-4 h-4 accent-primary"
              />
              {t("links.linkActive")}
            </label>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditing(null)}
              >
                {t("common.cancel")}
              </Button>
              <Button size="sm" onClick={handleEdit} disabled={savingEdit}>
                {savingEdit ? t("links.saving") : t("common.save")}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {deleting && (
        <Modal title={t("links.modalDelete")} onClose={() => setDeleting(null)}>
          <p className="text-sm text-muted-foreground">
            {t("links.deleteConfirm")}{" "}
            <b className="text-foreground font-mono">
              {shortUrl(deleting.code)}
            </b>
            ?
          </p>
          <div className="flex justify-end gap-2 mt-5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDeleting(null)}
            >
              {t("common.cancel")}
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={handleDelete}
              disabled={deletingBusy}
            >
              {deletingBusy ? t("links.deleting") : t("common.delete")}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

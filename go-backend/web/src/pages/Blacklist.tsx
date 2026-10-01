import { toast } from "sonner";
import { useEffect, useState } from "react";
import { Plus, Trash2, X, ShieldAlert, RefreshCw, Phone } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiGet, apiPost, apiDelete } from "@/lib/api";
import { useLang } from "@/lib/i18n";

interface BlacklistEntry {
  id: number;
  phone: string;
  reason: string;
  createdAt: string;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("id-ID", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
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

export default function Blacklist({ embedded = false }: { embedded?: boolean }) {
  const { t } = useLang();
  const [items, setItems] = useState<BlacklistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [phone, setPhone] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<BlacklistEntry | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiGet<{ blacklist: BlacklistEntry[] }>("/blacklist");
      setItems(res.blacklist || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("blacklist.loadFailed"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openAdd = () => {
    setPhone("");
    setReason("");
    setShowForm(true);
  };

  const saveEntry = async () => {
    if (!phone.trim()) {
      toast.error(t("blacklist.phoneRequired"));
      return;
    }
    setSaving(true);
    try {
      await apiPost("/blacklist", { phone: phone.trim(), reason: reason.trim() });
      toast.success(t("blacklist.added"));
      setShowForm(false);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("blacklist.addFailed"));
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await apiDelete(`/blacklist/${deleting.id}`);
      toast.success(t("blacklist.deleted"));
      setDeleting(null);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("blacklist.deleteFailed"));
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6"> {/* Header */}
      <div className={`flex gap-3 sm:flex-row sm:items-center ${embedded ? "justify-end" : "flex-col sm:justify-between"}`}>
        {!embedded && (
          <div>
            <h1 className="text-xl sm:text-2xl font-bold">{t("title.blacklist")}</h1>
            <p className="text-sm text-muted-foreground">
              {t("blacklist.description")}
            </p>
          </div>
        )}
        <Button onClick={openAdd} className="gap-1.5 self-start sm:self-auto">
          <Plus className="w-4 h-4" />
          {t("blacklist.addNumber")}
        </Button>
      </div>

      {/* Content */}
      {loading ? (
        <Card>
          <CardContent className="p-5 space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-12 rounded-lg bg-secondary animate-pulse" />
            ))}
          </CardContent>
        </Card>
      ) : error ? (
        <Card>
          <CardContent className="p-10 text-center">
            <p className="text-sm text-muted-foreground mb-4">{error}</p>
            <Button variant="outline" onClick={load} className="gap-1.5">
              <RefreshCw className="w-4 h-4" />
              {t("common.retry")}
            </Button>
          </CardContent>
        </Card>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center">
            <ShieldAlert className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
            <p className="font-medium mb-1">{t("blacklist.empty")}</p>
            <p className="text-sm text-muted-foreground">
              {t("blacklist.emptyHint")}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-3 sm:p-4 space-y-2">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-3 px-3 sm:px-4 py-3 rounded-lg border border-border"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-9 h-9 rounded-full bg-destructive/10 flex items-center justify-center shrink-0">
                    <Phone className="w-4 h-4 text-destructive" />
                  </span>
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{item.phone}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {item.reason || t("blacklist.noReason")} · {formatDate(item.createdAt)}
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={() => setDeleting(item)}
                  aria-label={t("blacklist.deleteNumber").replace("{phone}", item.phone)}
                >
                  <Trash2 className="w-4 h-4 text-destructive" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Add dialog */}
      {showForm && (
        <Modal title={t("blacklist.addTitle")} onClose={() => setShowForm(false)}>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1.5 block">{t("blacklist.labelPhone")}</label>
              <Input
                placeholder="62812xxxxxxx"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">{t("blacklist.labelReason")}</label>
              <Input
                placeholder={t("blacklist.placeholderReason")}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" onClick={() => setShowForm(false)}>
                {t("common.cancel")}
              </Button>
              <Button onClick={saveEntry} disabled={saving}>
                {saving ? t("blacklist.saving") : t("blacklist.add")}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Delete confirm */}
      {deleting && (
        <Modal title={t("blacklist.deleteTitle")} onClose={() => setDeleting(null)}>
          <p className="text-sm text-muted-foreground mb-5">
            {t("blacklist.deleteConfirm").replace("{phone}", deleting.phone)}
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
    </div>
  );
}

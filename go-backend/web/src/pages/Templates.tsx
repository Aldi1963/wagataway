import { toast } from "sonner";
import { useEffect, useState, type ReactNode } from "react";
import { Plus, Copy, Trash2, FileText, Pencil, X, RefreshCw, Eye, LayoutTemplate, Send, Check, History, SendHorizonal, ShieldCheck, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiGet, apiPost, apiPut, apiDelete } from "@/lib/api";
import { useLang } from "@/lib/i18n";
import { useAuth } from "@/hooks/use-auth";

interface Template {
  id: number;
  name: string;
  category: string;
  language: string;
  content: string;
  variables: string;
  exampleValues: string;
  status: string;
  rejectionReason: string;
}

interface HistoryRow {
  id: number;
  action: string;
  actorName: string;
  fromStatus: string;
  toStatus: string;
  reason: string;
  createdAt: string;
}

interface Device {
  id: number;
  name: string;
  phone: string;
  status: "connected" | "connecting" | "disconnected";
}

interface MetaConfig {
  phoneNumberId: string;
  namespace: string;
  tokenSet: boolean;
  enabled: boolean;
  configured: boolean;
}

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
            aria-label={t("templates.close")}
          >
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

const CATEGORIES = ["utility", "marketing", "authentication", "umum"] as const;

// ── Preview helpers ─────────────────────────────────────────────────────────
const varRegex = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;

function extractVars(content: string): string[] {
  const out: string[] = [];
  varRegex.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = varRegex.exec(content)) !== null) {
    if (!out.includes(m[1])) out.push(m[1]);
  }
  return out;
}

function exampleFor(name: string): string {
  const known: Record<string, string> = { nama: "Budi" };
  if (known[name]) return known[name];
  if (/^\d+$/.test(name)) return name;
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function parseExampleValues(raw: string): Record<string, string> {
  try {
    const v = JSON.parse(raw || "{}");
    if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, string>;
  } catch {
    // abaikan — kembali ke objek kosong
  }
  return {};
}

function renderPreview(
  content: string,
  values: Record<string, string>
): ReactNode[] {
  const parts: ReactNode[] = [];
  varRegex.lastIndex = 0;
  let last = 0;
  let i = 0;
  let m: RegExpExecArray | null;
  while ((m = varRegex.exec(content)) !== null) {
    if (m.index > last) parts.push(content.slice(last, m.index));
    const val = values[m[1]] ?? m[0];
    parts.push(
      <strong key={i++} className="text-foreground font-semibold">
        {val}
      </strong>
    );
    last = m.index + m[0].length;
  }
  if (last < content.length) parts.push(content.slice(last));
  return parts;
}

const STATUS_STYLES: Record<string, string> = {
  draft: "border-border text-muted-foreground",
  pending: "border-amber-500/50 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  approved: "border-emerald-500/50 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  rejected: "border-red-500/50 bg-red-500/10 text-red-600 dark:text-red-400",
};

function historyActionLabel(t: (k: string) => string, action: string): string {
  switch (action) {
    case "submitted":
      return t("templates.historyActionSubmitted");
    case "approved":
      return t("templates.historyActionApproved");
    case "rejected":
      return t("templates.historyActionRejected");
    case "edited":
      return t("templates.historyActionEdited");
    default:
      return action;
  }
}

function statusLabel(t: (k: string) => string, status: string): string {
  switch (status) {
    case "pending":
      return t("templates.statusPending");
    case "approved":
      return t("templates.statusApproved");
    case "rejected":
      return t("templates.statusRejected");
    default:
      return t("templates.statusDraft");
  }
}

function categoryLabel(t: (k: string) => string, category: string): string {
  switch (category) {
    case "utility":
      return t("templates.categoryUtility");
    case "marketing":
      return t("templates.categoryMarketing");
    case "authentication":
      return t("templates.categoryAuthentication");
    default:
      return category || t("templates.categoryGeneral");
  }
}

export default function Templates({ embedded = false }: { embedded?: boolean }) {
  const { t } = useLang();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");

  const [showAdd, setShowAdd] = useState(false);
  const [addName, setAddName] = useState("");
  const [addCategory, setAddCategory] = useState("utility");
  const [addLanguage, setAddLanguage] = useState("id");
  const [addContent, setAddContent] = useState("");
  const [addExamples, setAddExamples] = useState<Record<string, string>>({});
  const [savingAdd, setSavingAdd] = useState(false);

  const [editing, setEditing] = useState<Template | null>(null);
  const [editName, setEditName] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editLanguage, setEditLanguage] = useState("id");
  const [editContent, setEditContent] = useState("");
  const [editExamples, setEditExamples] = useState<Record<string, string>>({});
  const [savingEdit, setSavingEdit] = useState(false);

  const [deleting, setDeleting] = useState<Template | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);

  const [previewing, setPreviewing] = useState<Template | null>(null);
  const [previewValues, setPreviewValues] = useState<Record<string, string>>(
    {}
  );

  const [historyTpl, setHistoryTpl] = useState<Template | null>(null);
  const [historyRows, setHistoryRows] = useState<HistoryRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [rejecting, setRejecting] = useState<Template | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectingBusy, setRejectingBusy] = useState(false);

  const [sending, setSending] = useState<Template | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [sendDeviceId, setSendDeviceId] = useState("");
  const [sendPhone, setSendPhone] = useState("");
  const [sendValues, setSendValues] = useState<Record<string, string>>({});
  const [sendingBusy, setSendingBusy] = useState(false);

  const [metaConfig, setMetaConfig] = useState<MetaConfig | null>(null);
  const [wabaPhoneNumberId, setWabaPhoneNumberId] = useState("");
  const [wabaNamespace, setWabaNamespace] = useState("");
  const [wabaToken, setWabaToken] = useState("");
  const [wabaEnabled, setWabaEnabled] = useState(false);
  const [wabaSaving, setWabaSaving] = useState(false);

  const openPreview = (tpl: Template) => {
    const values: Record<string, string> = { ...parseExampleValues(tpl.exampleValues) };
    for (const v of extractVars(tpl.content)) {
      if (values[v] === undefined) values[v] = exampleFor(v);
    }
    setPreviewValues(values);
    setPreviewing(tpl);
  };

  const previewVars = previewing ? extractVars(previewing.content) : [];

  const load = (status = statusFilter) => {
    setLoading(true);
    setError(null);
    const q = status ? `?status=${encodeURIComponent(status)}` : "";
    apiGet<{ templates: Template[] }>(`/templates${q}`)
      .then((res) => setTemplates(res.templates || []))
      .catch((e) => setError(e.message || t("templates.loadError")))
      .finally(() => setLoading(false));
  };

  const loadMetaConfig = () => {
    apiGet<MetaConfig>("/templates/meta-config")
      .then((cfg) => {
        setMetaConfig(cfg);
        setWabaPhoneNumberId(cfg.phoneNumberId || "");
        setWabaNamespace(cfg.namespace || "");
        setWabaEnabled(cfg.enabled);
      })
      .catch(() => {});
  };

  useEffect(() => {
    load("");
    loadMetaConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const changeFilter = (status: string) => {
    setStatusFilter(status);
    load(status);
  };

  const handleAdd = async () => {
    if (!addName.trim() || !addContent.trim()) {
      toast.error(t("templates.validationError"));
      return;
    }
    setSavingAdd(true);
    try {
      await apiPost("/templates", {
        name: addName.trim(),
        category: addCategory,
        language: addLanguage,
        content: addContent.trim(),
        exampleValues: JSON.stringify(addExamples),
      });
      toast.success(t("templates.templateAdded"));
      setShowAdd(false);
      setAddName("");
      setAddCategory("utility");
      setAddLanguage("id");
      setAddContent("");
      setAddExamples({});
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("templates.addError"));
    } finally {
      setSavingAdd(false);
    }
  };

  const openEdit = (tpl: Template) => {
    setEditing(tpl);
    setEditName(tpl.name);
    setEditCategory(tpl.category || "umum");
    setEditLanguage(tpl.language || "id");
    setEditContent(tpl.content);
    const values: Record<string, string> = { ...parseExampleValues(tpl.exampleValues) };
    for (const v of extractVars(tpl.content)) {
      if (values[v] === undefined) values[v] = exampleFor(v);
    }
    setEditExamples(values);
  };

  const handleEdit = async () => {
    if (!editing) return;
    if (!editName.trim() || !editContent.trim()) {
      toast.error(t("templates.validationError"));
      return;
    }
    setSavingEdit(true);
    try {
      await apiPut(`/templates/${editing.id}`, {
        name: editName.trim(),
        category: editCategory,
        language: editLanguage,
        content: editContent.trim(),
        exampleValues: JSON.stringify(editExamples),
      });
      toast.success(t("templates.templateUpdated"));
      setEditing(null);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("templates.updateError"));
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setDeletingBusy(true);
    try {
      await apiDelete(`/templates/${deleting.id}`);
      toast.success(t("templates.templateDeleted"));
      setDeleting(null);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("templates.deleteError"));
    } finally {
      setDeletingBusy(false);
    }
  };

  const handleCopy = async (content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      toast.success(t("templates.copied"));
    } catch {
      toast.error(t("templates.copyError"));
    }
  };

  const handleSubmit = async (tpl: Template) => {
    try {
      await apiPost(`/templates/${tpl.id}/submit`, {});
      toast.success(t("templates.submitted"));
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("templates.submitError"));
    }
  };

  const handleApprove = async (tpl: Template) => {
    try {
      await apiPost(`/templates/${tpl.id}/approve`, {});
      toast.success(t("templates.approved"));
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("templates.approveError"));
    }
  };

  const handleReject = async () => {
    if (!rejecting) return;
    if (!rejectReason.trim()) {
      toast.error(t("templates.rejectReasonLabel"));
      return;
    }
    setRejectingBusy(true);
    try {
      await apiPost(`/templates/${rejecting.id}/reject`, { reason: rejectReason.trim() });
      toast.success(t("templates.rejected"));
      setRejecting(null);
      setRejectReason("");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("templates.rejectError"));
    } finally {
      setRejectingBusy(false);
    }
  };

  const openHistory = (tpl: Template) => {
    setHistoryTpl(tpl);
    setHistoryRows([]);
    setHistoryLoading(true);
    apiGet<{ history: HistoryRow[] }>(`/templates/${tpl.id}/history`)
      .then((res) => setHistoryRows(res.history || []))
      .catch(() => setHistoryRows([]))
      .finally(() => setHistoryLoading(false));
  };

  const openSend = (tpl: Template) => {
    const values: Record<string, string> = { ...parseExampleValues(tpl.exampleValues) };
    for (const v of extractVars(tpl.content)) {
      if (values[v] === undefined) values[v] = exampleFor(v);
    }
    setSendValues(values);
    setSendPhone("");
    setSending(tpl);
    apiGet<{ devices: Device[] }>("/devices")
      .then((res) => {
        const list = res.devices || [];
        setDevices(list);
        const def = list.find((d) => d.status === "connected") || list[0];
        setSendDeviceId(def ? String(def.id) : "");
      })
      .catch(() => setDevices([]));
  };

  const sendVars = sending ? extractVars(sending.content) : [];

  const handleSend = async () => {
    if (!sending) return;
    if (!sendDeviceId || !sendPhone.trim()) {
      toast.error(t("templates.sendPhonePlaceholder"));
      return;
    }
    setSendingBusy(true);
    try {
      await apiPost(`/templates/${sending.id}/send`, {
        deviceId: Number(sendDeviceId),
        to: sendPhone.trim(),
        variables: sendValues,
      });
      toast.success(t("templates.sent"));
      setSending(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("templates.sendError"));
    } finally {
      setSendingBusy(false);
    }
  };

  const handleSaveWaba = async () => {
    setWabaSaving(true);
    try {
      const body: Record<string, string> = {
        meta_waba_phone_number_id: wabaPhoneNumberId.trim(),
        meta_waba_namespace: wabaNamespace.trim(),
        meta_waba_enabled: wabaEnabled ? "true" : "false",
      };
      if (wabaToken.trim() !== "") body.meta_waba_access_token = wabaToken.trim();
      await apiPut("/admin/settings", body);
      toast.success(t("templates.wabaSaved"));
      setWabaToken("");
      loadMetaConfig();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("templates.wabaSaveError"));
    } finally {
      setWabaSaving(false);
    }
  };

  const addVars = extractVars(addContent);
  const editVars = editing ? extractVars(editContent) : [];

  return (
    <div className="space-y-6"> <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {!embedded && (
          <div>
            <h2 className="text-lg font-semibold text-foreground">{t("templates.title")}</h2>
            <p className="text-sm text-muted-foreground">
              {t("templates.subtitle")}
            </p>
          </div>
        )}
        <Button size="sm" className="gap-1.5" onClick={() => setShowAdd(true)}>
          <Plus className="w-3.5 h-3.5" />
          {t("templates.addTemplate")}
        </Button>
      </div>

      <Card>
        <CardContent className="p-4 flex gap-2 items-start">
          <Info className="w-4 h-4 shrink-0 mt-0.5 text-muted-foreground" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            {t("templates.metaNote")}
          </p>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-1.5">
        {["", "draft", "pending", "approved", "rejected"].map((s) => (
          <Button
            key={s || "all"}
            variant={statusFilter === s ? "default" : "outline"}
            size="sm"
            className="h-7 text-xs"
            onClick={() => changeFilter(s)}
          >
            {s === "" ? t("templates.filterAll") : statusLabel(t, s)}
          </Button>
        ))}
      </div>

      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <div className="space-y-3">
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-12 w-full" />
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
            <Button size="sm" variant="outline" onClick={() => load()} className="gap-1.5">
              <RefreshCw className="w-3.5 h-3.5" /> {t("templates.retry")}
            </Button>
          </CardContent>
        </Card>
      )}

      {!loading && !error && templates.length === 0 && (
        <Card>
          <CardContent className="p-10 text-center">
            <EmptyState
              icon={LayoutTemplate}
              title={t("templates.empty")}
              hint={`${t("templates.emptyHint").replace("{var}", "{{nama}}")}.`}
              actionLabel={t("templates.createTemplate")}
              onAction={() => setShowAdd(true)}
            />
          </CardContent>
        </Card>
      )}

      {!loading && !error && templates.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((tpl) => (
            <Card key={tpl.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-2 gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="w-4 h-4 shrink-0 text-muted-foreground" />
                    <span className="text-sm font-semibold text-foreground truncate">
                      {tpl.name}
                    </span>
                  </div>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border shrink-0 ${STATUS_STYLES[tpl.status] || STATUS_STYLES.draft}`}>
                    {statusLabel(t, tpl.status)}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1 mb-2">
                  {tpl.category && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded border border-border text-muted-foreground">
                      {categoryLabel(t, tpl.category)}
                    </span>
                  )}
                  <span className="text-[10px] px-1.5 py-0.5 rounded border border-border text-muted-foreground uppercase">
                    {tpl.language || "id"}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed border-l-2 border-border pl-2 whitespace-pre-wrap break-words">
                  {tpl.content}
                </p>
                {tpl.status === "rejected" && tpl.rejectionReason && (
                  <p className="text-xs text-red-600 dark:text-red-400 mt-2">
                    {t("templates.rejectionReasonLabel")}: {tpl.rejectionReason}
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-1 mt-3">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-[10px] gap-1"
                    onClick={() => handleCopy(tpl.content)}
                  >
                    <Copy className="w-3 h-3" /> {t("templates.copy")}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => openPreview(tpl)}
                    aria-label={t("templates.previewAria")}
                  >
                    <Eye className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => openHistory(tpl)}
                    aria-label={t("templates.historyAria")}
                  >
                    <History className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => openEdit(tpl)}
                    aria-label={t("templates.editAria")}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive"
                    onClick={() => setDeleting(tpl)}
                    aria-label={t("templates.deleteAria")}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-border">
                  {(tpl.status === "draft" || tpl.status === "rejected") && (
                    <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1" onClick={() => handleSubmit(tpl)}>
                      <Send className="w-3 h-3" /> {t("templates.submit")}
                    </Button>
                  )}
                  {tpl.status === "pending" && (
                    <>
                      <Button
                        size="sm"
                        className="h-7 text-[11px] gap-1"
                        onClick={() => handleApprove(tpl)}
                        title={t("templates.approveHint")}
                      >
                        <Check className="w-3 h-3" /> {t("templates.approve")}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-[11px] gap-1"
                        onClick={() => { setRejecting(tpl); setRejectReason(""); }}
                      >
                        <X className="w-3 h-3" /> {t("templates.reject")}
                      </Button>
                    </>
                  )}
                  {tpl.status === "approved" && (
                    <Button size="sm" className="h-7 text-[11px] gap-1" onClick={() => openSend(tpl)}>
                      <SendHorizonal className="w-3 h-3" /> {t("templates.send")}
                    </Button>
                  )}
                  {tpl.status !== "approved" && (
                    <span className="text-[11px] text-muted-foreground self-center">
                      {t("templates.sendOnlyApproved")}
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-foreground">{t("templates.wabaTitle")}</h3>
            {metaConfig && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded border ${metaConfig.configured ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "border-border text-muted-foreground"}`}>
                {metaConfig.configured ? t("templates.wabaConfigured") : t("templates.wabaNotConfigured")}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">{t("templates.wabaDesc")}</p>
          {isAdmin ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs font-medium text-foreground">{t("templates.wabaPhoneNumberIdLabel")}</label>
                <Input className="mt-1" value={wabaPhoneNumberId} onChange={(e) => setWabaPhoneNumberId(e.target.value)} placeholder="123456789012345" />
              </div>
              <div>
                <label className="text-xs font-medium text-foreground">{t("templates.wabaNamespaceLabel")}</label>
                <Input className="mt-1" value={wabaNamespace} onChange={(e) => setWabaNamespace(e.target.value)} placeholder="cth: abcdef12_3456" />
              </div>
              <div>
                <label className="text-xs font-medium text-foreground">
                  {t("templates.wabaTokenLabel")}
                  {metaConfig?.tokenSet && <span className="ml-1 text-muted-foreground font-normal">({t("templates.wabaTokenSet")})</span>}
                </label>
                <Input
                  className="mt-1"
                  type="password"
                  value={wabaToken}
                  onChange={(e) => setWabaToken(e.target.value)}
                  placeholder={metaConfig?.tokenSet ? "••••••••" : t("templates.wabaTokenEmpty")}
                />
              </div>
              <div className="flex items-end gap-2 pb-1">
                <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer">
                  <input type="checkbox" checked={wabaEnabled} onChange={(e) => setWabaEnabled(e.target.checked)} />
                  {t("templates.wabaEnabledLabel")}
                </label>
              </div>
              <div className="sm:col-span-2 flex justify-end">
                <Button size="sm" onClick={handleSaveWaba} disabled={wabaSaving}>
                  {wabaSaving ? t("templates.saving") : t("templates.wabaSave")}
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">{t("templates.wabaAdminOnly")}</p>
          )}
        </CardContent>
      </Card>

      {showAdd && (
        <Modal title={t("templates.addTemplate")} onClose={() => setShowAdd(false)}>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-foreground">{t("templates.nameLabel")}</label>
              <Input
                className="mt-1"
                placeholder="cth: Sapaan Pagi"
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-foreground">{t("templates.categoryLabel")}</label>
                <select className={`${inputCls} mt-1`} value={addCategory} onChange={(e) => setAddCategory(e.target.value)}>
                  <option value="utility">{t("templates.categoryUtility")}</option>
                  <option value="marketing">{t("templates.categoryMarketing")}</option>
                  <option value="authentication">{t("templates.categoryAuthentication")}</option>
                  <option value="umum">{t("templates.categoryGeneral")}</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-foreground">{t("templates.languageLabel")}</label>
                <select className={`${inputCls} mt-1`} value={addLanguage} onChange={(e) => setAddLanguage(e.target.value)}>
                  <option value="id">Indonesia (id)</option>
                  <option value="en">English (en)</option>
                </select>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-foreground">{t("templates.contentLabel")}</label>
              <textarea
                className={`${inputCls} mt-1 min-h-[120px]`}
                placeholder={"Halo {{nama}}, terima kasih..."}
                value={addContent}
                onChange={(e) => setAddContent(e.target.value)}
              />
            </div>
            {addVars.length > 0 && (
              <div>
                <label className="text-xs font-medium text-foreground">{t("templates.exampleValuesLabel")}</label>
                <p className="text-[11px] text-muted-foreground">{t("templates.exampleValuesHint")}</p>
                <div className="space-y-2 mt-2">
                  {addVars.map((v) => (
                    <div key={v} className="flex items-center gap-2">
                      <span className="text-xs font-mono text-muted-foreground w-24 shrink-0 truncate">{`{{${v}}}`}</span>
                      <Input
                        value={addExamples[v] ?? ""}
                        placeholder={exampleFor(v)}
                        onChange={(e) => setAddExamples((p) => ({ ...p, [v]: e.target.value }))}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAdd(false)}
              >
                {t("templates.cancel")}
              </Button>
              <Button size="sm" onClick={handleAdd} disabled={savingAdd}>
                {savingAdd ? t("templates.saving") : t("templates.save")}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {editing && (
        <Modal title={t("templates.editTemplate")} onClose={() => setEditing(null)}>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-foreground">{t("templates.nameLabel")}</label>
              <Input
                className="mt-1"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-foreground">{t("templates.categoryLabel")}</label>
                <select className={`${inputCls} mt-1`} value={editCategory} onChange={(e) => setEditCategory(e.target.value)}>
                  {(!CATEGORIES.includes(editCategory as (typeof CATEGORIES)[number]) && editCategory !== "") && (
                    <option value={editCategory}>{editCategory}</option>
                  )}
                  <option value="utility">{t("templates.categoryUtility")}</option>
                  <option value="marketing">{t("templates.categoryMarketing")}</option>
                  <option value="authentication">{t("templates.categoryAuthentication")}</option>
                  <option value="umum">{t("templates.categoryGeneral")}</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-foreground">{t("templates.languageLabel")}</label>
                <select className={`${inputCls} mt-1`} value={editLanguage} onChange={(e) => setEditLanguage(e.target.value)}>
                  <option value="id">Indonesia (id)</option>
                  <option value="en">English (en)</option>
                </select>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-foreground">{t("templates.contentLabel")}</label>
              <textarea
                className={`${inputCls} mt-1 min-h-[120px]`}
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
              />
            </div>
            {editVars.length > 0 && (
              <div>
                <label className="text-xs font-medium text-foreground">{t("templates.exampleValuesLabel")}</label>
                <div className="space-y-2 mt-2">
                  {editVars.map((v) => (
                    <div key={v} className="flex items-center gap-2">
                      <span className="text-xs font-mono text-muted-foreground w-24 shrink-0 truncate">{`{{${v}}}`}</span>
                      <Input
                        value={editExamples[v] ?? ""}
                        placeholder={exampleFor(v)}
                        onChange={(e) => setEditExamples((p) => ({ ...p, [v]: e.target.value }))}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
            {(editing.status === "approved" || editing.status === "pending") && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                {t("templates.historyActionEdited")}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditing(null)}
              >
                {t("templates.cancel")}
              </Button>
              <Button size="sm" onClick={handleEdit} disabled={savingEdit}>
                {savingEdit ? t("templates.saving") : t("templates.save")}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {previewing && (
        <Modal title={t("templates.previewTitle")} onClose={() => setPreviewing(null)}>
          <div className="space-y-4">
            <div>
              <p className="text-sm font-semibold text-foreground">
                {previewing.name}
              </p>
              {previewing.category && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {t("templates.categoryPrefix").replace("{category}", categoryLabel(t, previewing.category))}
                </p>
              )}
              <p className="text-xs text-muted-foreground mt-0.5">
                {statusLabel(t, previewing.status)}
              </p>
            </div>

            {previewVars.length === 0 ? (
              <>
                <div className="rounded-md border border-border bg-secondary/40 p-3 text-sm text-muted-foreground whitespace-pre-wrap break-words">
                  {previewing.content}
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("templates.noVariables")}
                </p>
              </>
            ) : (
              <>
                <div className="space-y-3">
                  {previewVars.map((v) => (
                    <div key={v}>
                      <label className="text-xs font-medium text-foreground">
                        {`{{${v}}}`}
                      </label>
                      <Input
                        className="mt-1"
                        value={previewValues[v] ?? ""}
                        onChange={(e) =>
                          setPreviewValues((p) => ({
                            ...p,
                            [v]: e.target.value,
                          }))
                        }
                      />
                    </div>
                  ))}
                </div>
                <div>
                  <p className="text-xs font-medium text-foreground mb-1.5">
                    {t("templates.previewResult")}
                  </p>
                  <div className="rounded-md border border-border bg-secondary/40 p-3 text-sm text-muted-foreground whitespace-pre-wrap break-words">
                    {renderPreview(previewing.content, previewValues)}
                  </div>
                </div>
              </>
            )}

            <div className="flex justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPreviewing(null)}
              >
                Tutup
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {historyTpl && (
        <Modal title={t("templates.historyTitle")} onClose={() => setHistoryTpl(null)}>
          <div className="space-y-3">
            <p className="text-sm font-semibold text-foreground">{historyTpl.name}</p>
            {historyLoading && <p className="text-sm text-muted-foreground">{t("templates.saving")}</p>}
            {!historyLoading && historyRows.length === 0 && (
              <p className="text-sm text-muted-foreground">{t("templates.historyEmpty")}</p>
            )}
            {!historyLoading && historyRows.map((h) => (
              <div key={h.id} className="rounded-md border border-border p-3 space-y-1">
                <p className="text-sm text-foreground">
                  <span className="font-semibold">{historyActionLabel(t, h.action)}</span>
                  {" "}{statusLabel(t, h.fromStatus)} → {statusLabel(t, h.toStatus)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("templates.historyBy").replace("{actor}", h.actorName || "-")}
                  {" · "}
                  {new Date(h.createdAt).toLocaleString()}
                </p>
                {h.reason && (
                  <p className="text-xs text-muted-foreground whitespace-pre-wrap break-words">{h.reason}</p>
                )}
              </div>
            ))}
            <div className="flex justify-end">
              <Button variant="outline" size="sm" onClick={() => setHistoryTpl(null)}>
                Tutup
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {rejecting && (
        <Modal title={t("templates.reject")} onClose={() => setRejecting(null)}>
          <div className="space-y-4">
            <p className="text-sm font-semibold text-foreground">{rejecting.name}</p>
            <div>
              <label className="text-xs font-medium text-foreground">{t("templates.rejectReasonLabel")}</label>
              <textarea
                className={`${inputCls} mt-1 min-h-[80px]`}
                placeholder={t("templates.rejectReasonPlaceholder")}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setRejecting(null)}>
                {t("templates.cancel")}
              </Button>
              <Button size="sm" variant="destructive" onClick={handleReject} disabled={rejectingBusy}>
                {rejectingBusy ? t("templates.saving") : t("templates.reject")}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {sending && (
        <Modal title={t("templates.sendTitle")} onClose={() => setSending(null)}>
          <div className="space-y-4">
            <p className="text-sm font-semibold text-foreground">{sending.name}</p>
            {devices.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("templates.sendNoDevices")}</p>
            ) : (
              <>
                <div>
                  <label className="text-xs font-medium text-foreground">{t("templates.sendDeviceLabel")}</label>
                  <select className={`${inputCls} mt-1`} value={sendDeviceId} onChange={(e) => setSendDeviceId(e.target.value)}>
                    {devices.map((d) => (
                      <option key={d.id} value={String(d.id)}>
                        {d.name} ({d.phone}) — {d.status}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-foreground">{t("templates.sendPhoneLabel")}</label>
                  <Input
                    className="mt-1"
                    placeholder={t("templates.sendPhonePlaceholder")}
                    value={sendPhone}
                    onChange={(e) => setSendPhone(e.target.value)}
                  />
                </div>
                {sendVars.length > 0 && (
                  <div>
                    <label className="text-xs font-medium text-foreground">{t("templates.sendVariablesLabel")}</label>
                    <div className="space-y-2 mt-2">
                      {sendVars.map((v) => (
                        <div key={v} className="flex items-center gap-2">
                          <span className="text-xs font-mono text-muted-foreground w-24 shrink-0 truncate">{`{{${v}}}`}</span>
                          <Input
                            value={sendValues[v] ?? ""}
                            placeholder={exampleFor(v)}
                            onChange={(e) => setSendValues((p) => ({ ...p, [v]: e.target.value }))}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div>
                  <p className="text-xs font-medium text-foreground mb-1.5">
                    {t("templates.sendPreviewLabel")}
                  </p>
                  <div className="rounded-md border border-border bg-secondary/40 p-3 text-sm text-muted-foreground whitespace-pre-wrap break-words">
                    {renderPreview(sending.content, sendValues)}
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => setSending(null)}>
                    {t("templates.cancel")}
                  </Button>
                  <Button size="sm" onClick={handleSend} disabled={sendingBusy}>
                    {sendingBusy ? t("templates.sending") : t("templates.sendButton")}
                  </Button>
                </div>
              </>
            )}
          </div>
        </Modal>
      )}

      {deleting && (
        <Modal title={t("templates.deleteTitle")} onClose={() => setDeleting(null)}>
          <p className="text-sm text-muted-foreground">
            {t("templates.deleteConfirm").replace("{name}", deleting.name)}
          </p>
          <div className="flex justify-end gap-2 mt-5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDeleting(null)}
            >
              {t("templates.cancel")}
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={handleDelete}
              disabled={deletingBusy}
            >
              {deletingBusy ? t("templates.deleting") : t("templates.delete")}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

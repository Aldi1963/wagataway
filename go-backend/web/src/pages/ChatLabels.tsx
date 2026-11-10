import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, X, Tag, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dropdown } from "@/components/ui/dropdown";
import { apiGet, apiPost, apiPut, apiDelete } from "@/lib/api";
import { useLang } from "@/lib/i18n";

interface ChatLabel {
  id: number;
  name: string;
  color: string;
}

interface Assignment {
  id: number;
  chatJid: string;
  labelId?: number | null;
  label?: { name: string; color: string } | null;
  assignedTo?: string;
  note?: string;
}

const LABEL_COLORS = [
  "#243370", "#0ea5e9", "#8b5cf6", "#ec4899",
  "#f59e0b", "#10b981", "#ef4444", "#6b7280",
];

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

export default function ChatLabels({ embedded = false }: { embedded?: boolean }) {
  const { t } = useLang();
  const [tab, setTab] = useState<"labels" | "assign">("labels");
  const [labels, setLabels] = useState<ChatLabel[]>([]);
  const [assigns, setAssigns] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);

  const [showLabelModal, setShowLabelModal] = useState(false);
  const [editingLabel, setEditingLabel] = useState<ChatLabel | null>(null);
  const [labelName, setLabelName] = useState("");
  const [labelColor, setLabelColor] = useState(LABEL_COLORS[0]);

  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assignJid, setAssignJid] = useState("");
  const [assignLabelId, setAssignLabelId] = useState("");
  const [assignCs, setAssignCs] = useState("");
  const [assignNote, setAssignNote] = useState("");

  const [deleting, setDeleting] = useState<{ kind: "label" | "assign"; id: number } | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [l, a] = await Promise.all([
        apiGet<{ labels: ChatLabel[] }>("/chat-labels").then((r) => r.labels ?? []).catch(() => []),
        apiGet<{ assignments: Assignment[] }>("/chat-assignments").then((r) => r.assignments ?? []).catch(() => []),
      ]);
      setLabels(l);
      setAssigns(a);
    } catch (e: any) {
      toast.error(e.message || t("chatLabels.loadFailed"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openLabelModal = (l?: ChatLabel) => {
    setEditingLabel(l ?? null);
    setLabelName(l?.name ?? "");
    setLabelColor(l?.color ?? LABEL_COLORS[0]);
    setShowLabelModal(true);
  };

  const saveLabel = async () => {
    if (!labelName.trim()) { toast.error(t("chatLabels.nameRequired")); return; }
    try {
      if (editingLabel) {
        await apiPut(`/chat-labels/${editingLabel.id}`, { name: labelName.trim(), color: labelColor });
        toast.success(t("chatLabels.labelUpdated"));
      } else {
        await apiPost("/chat-labels", { name: labelName.trim(), color: labelColor });
        toast.success(t("chatLabels.labelAdded"));
      }
      setShowLabelModal(false);
      load();
    } catch (e: any) { toast.error(e.message || t("chatLabels.labelSaveFailed")); }
  };

  const saveAssign = async () => {
    if (!assignJid.trim()) { toast.error(t("chatLabels.jidRequired")); return; }
    try {
      await apiPost("/chat-assignments", {
        chatJid: assignJid.trim(),
        labelId: assignLabelId ? Number(assignLabelId) : null,
        assignedTo: assignCs.trim(),
        note: assignNote.trim(),
      });
      toast.success(t("chatLabels.assigned"));
      setShowAssignModal(false);
      setAssignJid(""); setAssignLabelId(""); setAssignCs(""); setAssignNote("");
      load();
    } catch (e: any) { toast.error(e.message || t("chatLabels.assignFailed")); }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      if (deleting.kind === "label") await apiDelete(`/chat-labels/${deleting.id}`);
      else await apiDelete(`/chat-assignments/${deleting.id}`);
      toast.success(t("chatLabels.deleted"));
      setDeleting(null);
      load();
    } catch (e: any) { toast.error(e.message || t("chatLabels.deleteFailed")); }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {!embedded && (
          <h1 className="text-xl font-bold text-foreground">{t("chatLabels.title")}</h1>
        )}
        <div className="flex flex-wrap gap-2">
          {tab === "labels" ? (
            <Button size="sm" onClick={() => openLabelModal()} className="gap-1.5">
              <Plus className="w-4 h-4" /> {t("chatLabels.addLabel")}
            </Button>
          ) : (
            <Button size="sm" onClick={() => setShowAssignModal(true)} className="gap-1.5">
              <Plus className="w-4 h-4" /> {t("chatLabels.assignChat")}
            </Button>
          )}
        </div>
      </div>

      <div className="flex gap-1 rounded-lg bg-muted p-1 w-fit">
        {(["labels", "assign"] as const).map((k) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              tab === k ? "bg-background text-foreground shadow" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {k === "labels" ? t("chatLabels.tabLabels") : t("chatLabels.tabAssign")}
          </button>
        ))}
      </div>

      {loading ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">{t("chatLabels.loading")}</CardContent></Card>
      ) : tab === "labels" ? (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="py-3 px-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t("chatLabels.colLabel")}</th>
                    <th className="py-3 px-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground text-right">{t("chatLabels.colActions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {labels.length === 0 && (
                    <tr><td colSpan={2} className="py-8 text-center text-muted-foreground">{t("chatLabels.noLabels")}</td></tr>
                  )}
                  {labels.map((l) => (
                    <tr key={l.id} className="border-b border-border last:border-0">
                      <td className="py-3 px-4">
                        <span
                          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium text-white"
                          style={{ backgroundColor: l.color }}
                        >
                          <Tag className="w-3 h-3" /> {l.name}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openLabelModal(l)} aria-label={t("chatLabels.edit")}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleting({ kind: "label", id: l.id })} aria-label={t("common.delete")}>
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
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="py-3 px-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t("chatLabels.colJid")}</th>
                    <th className="py-3 px-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t("chatLabels.colLabel")}</th>
                    <th className="py-3 px-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t("chatLabels.colCs")}</th>
                    <th className="py-3 px-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t("chatLabels.colNotes")}</th>
                    <th className="py-3 px-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground text-right">{t("chatLabels.colActions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {assigns.length === 0 && (
                    <tr><td colSpan={5} className="py-8 text-center text-muted-foreground">{t("chatLabels.noAssigns")}</td></tr>
                  )}
                  {assigns.map((a) => (
                    <tr key={a.id} className="border-b border-border last:border-0">
                      <td className="py-3 px-4 font-mono text-[13px]">{a.chatJid}</td>
                      <td className="py-3 px-4">
                        {a.label ? (
                          <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium text-white" style={{ backgroundColor: a.label.color || "#243370" }}>
                            {a.label.name}
                          </span>
                        ) : <span className="text-muted-foreground text-xs">-</span>}
                      </td>
                      <td className="py-3 px-4">
                        {a.assignedTo ? (
                          <span className="inline-flex items-center gap-1 text-xs"><UserCheck className="w-3.5 h-3.5" />{a.assignedTo}</span>
                        ) : <span className="text-muted-foreground text-xs">-</span>}
                      </td>
                      <td className="py-3 px-4 text-xs text-muted-foreground max-w-[200px] truncate">{a.note || "-"}</td>
                      <td className="py-3 px-4 text-right">
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleting({ kind: "assign", id: a.id })} aria-label={t("common.delete")}>
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

      {showLabelModal && (
        <Modal title={editingLabel ? t("chatLabels.editLabel") : t("chatLabels.addLabel")} onClose={() => setShowLabelModal(false)}>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">{t("chatLabels.labelName")}</label>
              <Input className="mt-1.5" placeholder={t("chatLabels.placeholderName")} value={labelName} onChange={(e) => setLabelName(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium">{t("chatLabels.labelColor")}</label>
              <div className="mt-2 flex flex-wrap gap-2">
                {LABEL_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setLabelColor(c)}
                    className={`w-9 h-9 rounded-full transition-transform ${labelColor === c ? "ring-2 ring-offset-2 ring-foreground scale-110" : "hover:scale-105"}`}
                    style={{ backgroundColor: c }}
                    aria-label={t("chatLabels.colorAria").replace("{color}", c)}
                  />
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowLabelModal(false)}>{t("common.cancel")}</Button>
              <Button onClick={saveLabel}>{t("common.save")}</Button>
            </div>
          </div>
        </Modal>
      )}

      {showAssignModal && (
        <Modal title={t("chatLabels.assignChat")} onClose={() => setShowAssignModal(false)}>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">{t("chatLabels.colJid")}</label>
              <Input className="mt-1.5" placeholder="62812xxxxxxx" value={assignJid} onChange={(e) => setAssignJid(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium">{t("chatLabels.colLabel")}</label>
              <Dropdown
                value={assignLabelId}
                onChange={setAssignLabelId}
                ariaLabel={t("chatLabels.colLabel")}
                className="mt-1.5"
                options={[
                  { value: "", label: t("chatLabels.noLabel") },
                  ...labels.map((l) => ({ value: String(l.id), label: l.name })),
                ]}
              />
            </div>
            <div>
              <label className="text-sm font-medium">{t("chatLabels.assignToCs")}</label>
              <Input className="mt-1.5" placeholder={t("chatLabels.placeholderCs")} value={assignCs} onChange={(e) => setAssignCs(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium">{t("chatLabels.colNotes")}</label>
              <textarea value={assignNote} onChange={(e) => setAssignNote(e.target.value)} rows={2} placeholder={t("chatLabels.placeholderNotes")} className={`${inputCls} mt-1.5 resize-none`} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowAssignModal(false)}>{t("common.cancel")}</Button>
              <Button onClick={saveAssign}>{t("common.save")}</Button>
            </div>
          </div>
        </Modal>
      )}

      {deleting && (
        <Modal title={t("chatLabels.deleteTitle")} onClose={() => setDeleting(null)}>
          <p className="text-sm text-muted-foreground">{t("chatLabels.deleteConfirm")}</p>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setDeleting(null)}>{t("common.cancel")}</Button>
            <Button variant="destructive" onClick={confirmDelete}>{t("common.delete")}</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

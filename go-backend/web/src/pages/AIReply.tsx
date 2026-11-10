import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, X, Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Toggle } from "@/components/Toggle";
import { apiGet, apiPost, apiPut, apiDelete, apiPatch } from "@/lib/api";
import { useLang } from "@/lib/i18n";
import { useActiveDevice } from "@/hooks/use-active-device";
import AIConnectionCard from "@/components/AIConnectionCard";

interface AIReplyConfig {
  id: number;
  deviceId: number;
  isEnabled: boolean;
  systemPrompt: string;
  triggerKeywords: string;
  ignoreGroups: boolean;
  injectionGuard: boolean;
  createdAt: string;
}

interface AIStatus {
  reachable: boolean;
  detail: string;
  configured?: boolean;
  provider?: string;
  model?: string;
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const { t } = useLang();
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden />
      <div className="relative bg-card text-card-foreground rounded-xl border border-border shadow-lg w-full max-w-lg max-h-[90vh] overflow-y-auto p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold">{title}</h3>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose} aria-label={t("aiReply.close")}>
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

export default function AIReply({ embedded = false }: { embedded?: boolean }) {
  const { t } = useLang();
  const { activeDeviceId, activeDevice } = useActiveDevice();
  const [items, setItems] = useState<AIReplyConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<AIStatus | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<AIReplyConfig | null>(null);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [triggerKeywords, setTriggerKeywords] = useState("");
  const [ignoreGroups, setIgnoreGroups] = useState(true);
  const [injectionGuard, setInjectionGuard] = useState(true);
  const [isEnabled, setIsEnabled] = useState(true);
  const [deleting, setDeleting] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [r, s] = await Promise.all([
        apiGet<{ configs: AIReplyConfig[] }>("/ai-reply"),
        apiGet<AIStatus>("/ai-reply/status").catch(() => null),
      ]);
      setItems(r.configs ?? []);
      if (s) setStatus(s);
    } catch (e: any) {
      toast.error(e.message || t("aiReply.loadError"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // Config hanya untuk perangkat aktif (konsisten dengan tab Otomatisasi lain)
  const visibleItems =
    activeDeviceId == null ? [] : items.filter((c) => c.deviceId === activeDeviceId);

  const openModal = (c?: AIReplyConfig) => {
    if (activeDeviceId == null && !c) {
      toast.error(t("aiReply.selectDeviceFirst"));
      return;
    }
    setEditing(c ?? null);
    setSystemPrompt(c?.systemPrompt ?? "");
    setTriggerKeywords(c?.triggerKeywords ?? "");
    setIgnoreGroups(c?.ignoreGroups ?? true);
    setInjectionGuard(c?.injectionGuard ?? true);
    setIsEnabled(c?.isEnabled ?? true);
    setShowModal(true);
  };

  const save = async () => {
    const targetDeviceId = editing ? editing.deviceId : activeDeviceId;
    if (targetDeviceId == null) { toast.error(t("aiReply.selectDeviceFirst")); return; }
    try {
      const payload = {
        deviceId: targetDeviceId,
        systemPrompt: systemPrompt.trim(),
        triggerKeywords: triggerKeywords.trim(),
        ignoreGroups,
        injectionGuard,
        ...(editing ? { isEnabled } : {}),
      };
      if (editing) { await apiPut(`/ai-reply/${editing.id}`, payload); toast.success(t("aiReply.configUpdated")); }
      else { await apiPost("/ai-reply", payload); toast.success(t("aiReply.configAdded")); }
      setShowModal(false);
      load();
    } catch (e: any) { toast.error(e.message || t("aiReply.saveError")); }
  };

  const toggleActive = async (c: AIReplyConfig) => {
    try {
      // Backend PATCH /:id/toggle membalik nilai, jadi pakai nilai dari respons.
      const r = await apiPatch<{ isEnabled: boolean }>(`/ai-reply/${c.id}/toggle`, {});
      setItems((prev) => prev.map((x) => (x.id === c.id ? { ...x, isEnabled: r.isEnabled } : x)));
      toast.success(r.isEnabled ? t("aiReply.aiEnabled") : t("aiReply.aiDisabled"));
    } catch (e: any) { toast.error(e.message || t("aiReply.toggleError")); }
  };

  const confirmDelete = async () => {
    if (deleting == null) return;
    try {
      await apiDelete(`/ai-reply/${deleting}`);
      toast.success(t("aiReply.configDeleted"));
      setDeleting(null);
      load();
    } catch (e: any) { toast.error(e.message || t("aiReply.deleteError")); }
  };

  return (
    <div className="space-y-4">
      <AIConnectionCard onChanged={load} />
      <div className={`flex gap-3 sm:flex-row sm:items-center ${embedded ? "justify-end" : "flex-col sm:justify-between"}`}>
        {!embedded && (
          <div>
            <h1 className="text-xl sm:text-2xl font-bold">AI Auto-Reply</h1>
            <p className="text-sm text-muted-foreground">{t("aiReply.subtitle")}</p>
          </div>
        )}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          {status == null ? (
            <Badge variant="secondary">{t("aiReply.checkingAI")}</Badge>
          ) : status.reachable ? (
            <Badge variant="success">
              {status.configured && status.provider
                ? `${status.provider} • ${status.model ?? ""}`
                : t("aiReply.aiConnected")}
            </Badge>
          ) : (
            <Badge variant="destructive" className="max-w-[260px] text-left whitespace-normal">
              {t("aiReply.aiUnreachable")}{status.detail ? `: ${status.detail}` : ""}
            </Badge>
          )}
          <Button size="sm" onClick={() => openModal()} className="gap-1.5">
            <Plus className="w-4 h-4" /> {t("aiReply.addConfig")}
          </Button>
        </div>
      </div>

      {loading ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">{t("aiReply.loading")}</CardContent></Card>
      ) : activeDeviceId == null ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Bot className="w-8 h-8 mx-auto text-muted-foreground" />
            <p className="text-sm font-medium mt-2">{t("aiReply.noDevice")}</p>
            <p className="text-xs text-muted-foreground mt-1">{t("aiReply.noDeviceHint")}</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="py-3 px-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">System Prompt</th>
                    <th className="py-3 px-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Trigger</th>
                    <th className="py-3 px-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t("aiReply.colGroup")}</th>
                    <th className="py-3 px-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t("aiReply.colActive")}</th>
                    <th className="py-3 px-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground text-right">{t("aiReply.colActions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleItems.length === 0 && (
                    <tr><td colSpan={5} className="py-8 text-center text-muted-foreground">{t("aiReply.emptyForDevice").replace("{device}", activeDevice?.name || `#${activeDeviceId}`)}</td></tr>
                  )}
                  {visibleItems.map((c) => (
                    <tr key={c.id} className="border-b border-border last:border-0">
                      <td className="py-3 px-4 text-xs text-muted-foreground max-w-[220px] truncate" title={c.systemPrompt}>
                        {c.systemPrompt || <span className="italic">Default</span>}
                      </td>
                      <td className="py-3 px-4 text-xs text-muted-foreground max-w-[160px] truncate" title={c.triggerKeywords || undefined}>
                        {c.triggerKeywords ? c.triggerKeywords : <Badge variant="outline">{t("aiReply.allMessages")}</Badge>}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap text-xs">{c.ignoreGroups ? t("aiReply.ignore") : t("aiReply.include")}</td>
                      <td className="py-3 px-4">
                        <Toggle checked={c.isEnabled} label={t("aiReply.enableForDevice").replace("{device}", activeDevice?.name || `#${activeDeviceId}`)} onToggle={() => toggleActive(c)} />
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openModal(c)} aria-label={t("aiReply.edit")}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleting(c.id)} aria-label={t("aiReply.delete")}>
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
        <Modal title={editing ? t("aiReply.editConfig") : t("aiReply.addConfigTitle")} onClose={() => setShowModal(false)}>
          <div className="space-y-4">
            <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
              {t("aiReply.configForDevice")}{" "}
              <span className="font-medium text-foreground">
                {activeDevice?.name || (editing ? `#${editing.deviceId}` : "")}
              </span>
            </p>
            <div>
              <label className="text-sm font-medium">System Prompt</label>
              <textarea
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                rows={4}
                placeholder="Kamu adalah CS toko online yang ramah..."
                className={`${inputCls} mt-1.5 resize-y`}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Trigger Keywords</label>
              <Input
                className="mt-1.5"
                placeholder="harga, stok, order — kosongkan = semua pesan"
                value={triggerKeywords}
                onChange={(e) => setTriggerKeywords(e.target.value)}
              />
            </div>
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium">{t("aiReply.ignoreGroups")}</p>
                <p className="text-xs text-muted-foreground">{t("aiReply.ignoreGroupsHint")}</p>
              </div>
              <Toggle checked={ignoreGroups} label={t("aiReply.ignoreGroupsAria")} onToggle={setIgnoreGroups} />
            </div>
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium">{t("aiReply.guardTitle")}</p>
                <p className="text-xs text-muted-foreground">{t("aiReply.guardHint")}</p>
              </div>
              <Toggle checked={injectionGuard} label={t("aiReply.guardTitle")} onToggle={setInjectionGuard} />
            </div>
            {editing && (
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">{t("aiReply.active")}</p>
                  <p className="text-xs text-muted-foreground">{t("aiReply.activeHint")}</p>
                </div>
                <Toggle checked={isEnabled} label={t("aiReply.active")} onToggle={setIsEnabled} />
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowModal(false)}>{t("aiReply.cancel")}</Button>
              <Button onClick={save}>{t("aiReply.save")}</Button>
            </div>
          </div>
        </Modal>
      )}

      {deleting != null && (
        <Modal title={t("aiReply.deleteTitle")} onClose={() => setDeleting(null)}>
          <p className="text-sm text-muted-foreground">{t("aiReply.deleteConfirm")}</p>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setDeleting(null)}>{t("aiReply.cancel")}</Button>
            <Button variant="destructive" onClick={confirmDelete}>{t("aiReply.delete")}</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

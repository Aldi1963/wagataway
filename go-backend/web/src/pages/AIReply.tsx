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
  useFaq: boolean;
  strictFaq: boolean;
  maxReplyLength: number;
  contextMessages: number;
  createdAt: string;
}

interface ChatbotFAQ {
  id: number;
  deviceId: number | null;
  question: string;
  answer: string;
  keywords: string;
  isActive: boolean;
  priority: number;
  createdAt: string;
}

interface ChatbotLog {
  id: number;
  deviceId: number;
  phone: string;
  question: string;
  answer: string;
  source: string;
  faqId: number | null;
  createdAt: string;
}

interface ChatbotStatus {
  chatbotAllowed: boolean;
  planName: string;
  faqCount: number;
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
  const [chatbotStatus, setChatbotStatus] = useState<ChatbotStatus | null>(null);
  const [faqs, setFaqs] = useState<ChatbotFAQ[]>([]);
  const [logs, setLogs] = useState<ChatbotLog[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<AIReplyConfig | null>(null);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [triggerKeywords, setTriggerKeywords] = useState("");
  const [ignoreGroups, setIgnoreGroups] = useState(true);
  const [injectionGuard, setInjectionGuard] = useState(true);
  const [useFaq, setUseFaq] = useState(true);
  const [strictFaq, setStrictFaq] = useState(false);
  const [maxReplyLength, setMaxReplyLength] = useState(1000);
  const [contextMessages, setContextMessages] = useState(10);
  const [isEnabled, setIsEnabled] = useState(true);
  const [deleting, setDeleting] = useState<number | null>(null);
  // FAQ (knowledge base chatbot)
  const [showFaqModal, setShowFaqModal] = useState(false);
  const [editingFaq, setEditingFaq] = useState<ChatbotFAQ | null>(null);
  const [faqQuestion, setFaqQuestion] = useState("");
  const [faqAnswer, setFaqAnswer] = useState("");
  const [faqKeywords, setFaqKeywords] = useState("");
  const [faqPriority, setFaqPriority] = useState(0);
  const [faqIsActive, setFaqIsActive] = useState(true);
  const [deletingFaq, setDeletingFaq] = useState<number | null>(null);
  const [logSource, setLogSource] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const [r, s, cs, f, l] = await Promise.all([
        apiGet<{ configs: AIReplyConfig[] }>("/ai-reply"),
        apiGet<AIStatus>("/ai-reply/status").catch(() => null),
        apiGet<ChatbotStatus>("/ai-chatbot/status").catch(() => null),
        apiGet<{ faqs: ChatbotFAQ[] }>(`/ai-chatbot/faqs${activeDeviceId != null ? `?deviceId=${activeDeviceId}` : ""}`).catch(() => ({ faqs: [] })),
        apiGet<{ logs: ChatbotLog[] }>(`/ai-chatbot/logs?limit=50${activeDeviceId != null ? `&deviceId=${activeDeviceId}` : ""}`).catch(() => ({ logs: [] })),
      ]);
      setItems(r.configs ?? []);
      if (s) setStatus(s);
      if (cs) setChatbotStatus(cs);
      setFaqs(f.faqs ?? []);
      setLogs(l.logs ?? []);
    } catch (e: any) {
      toast.error(e.message || t("aiReply.loadError"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [activeDeviceId]);

  const loadLogs = async (source: string) => {
    try {
      const l = await apiGet<{ logs: ChatbotLog[] }>(
        `/ai-chatbot/logs?limit=50${activeDeviceId != null ? `&deviceId=${activeDeviceId}` : ""}${source ? `&source=${source}` : ""}`,
      );
      setLogs(l.logs ?? []);
    } catch { /* biarkan log lama tampil */ }
  };

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
    setUseFaq(c?.useFaq ?? true);
    setStrictFaq(c?.strictFaq ?? false);
    setMaxReplyLength(c?.maxReplyLength || 1000);
    setContextMessages(c?.contextMessages ?? 10);
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
        useFaq,
        strictFaq,
        maxReplyLength: Math.max(100, Math.min(4000, maxReplyLength || 1000)),
        contextMessages: Math.max(0, Math.min(20, contextMessages || 0)),
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

  // ── FAQ knowledge base ──────────────────────────────────────────────
  const visibleFaqs =
    activeDeviceId == null ? [] : faqs.filter((f) => f.deviceId == null || f.deviceId === activeDeviceId);

  const openFaqModal = (f?: ChatbotFAQ) => {
    if (activeDeviceId == null && !f) {
      toast.error(t("aiReply.selectDeviceFirst"));
      return;
    }
    setEditingFaq(f ?? null);
    setFaqQuestion(f?.question ?? "");
    setFaqAnswer(f?.answer ?? "");
    setFaqKeywords(f?.keywords ?? "");
    setFaqPriority(f?.priority ?? 0);
    setFaqIsActive(f?.isActive ?? true);
    setShowFaqModal(true);
  };

  const saveFaq = async () => {
    if (!faqQuestion.trim() || !faqAnswer.trim()) {
      toast.error(t("aiReply.faqRequired"));
      return;
    }
    try {
      const payload = {
        deviceId: editingFaq ? editingFaq.deviceId ?? activeDeviceId : activeDeviceId,
        question: faqQuestion.trim(),
        answer: faqAnswer.trim(),
        keywords: faqKeywords.trim(),
        priority: faqPriority || 0,
        ...(editingFaq ? { isActive: faqIsActive } : {}),
      };
      if (editingFaq) {
        await apiPut(`/ai-chatbot/faqs/${editingFaq.id}`, payload);
        toast.success(t("aiReply.faqUpdated"));
      } else {
        await apiPost("/ai-chatbot/faqs", payload);
        toast.success(t("aiReply.faqAdded"));
      }
      setShowFaqModal(false);
      load();
    } catch (e: any) { toast.error(e.message || t("aiReply.saveError")); }
  };

  const toggleFaqActive = async (f: ChatbotFAQ) => {
    try {
      const r = await apiPatch<{ isActive: boolean }>(`/ai-chatbot/faqs/${f.id}/toggle`, {});
      setFaqs((prev) => prev.map((x) => (x.id === f.id ? { ...x, isActive: r.isActive } : x)));
    } catch (e: any) { toast.error(e.message || t("aiReply.toggleError")); }
  };

  const confirmDeleteFaq = async () => {
    if (deletingFaq == null) return;
    try {
      await apiDelete(`/ai-chatbot/faqs/${deletingFaq}`);
      toast.success(t("aiReply.faqDeleted"));
      setDeletingFaq(null);
      load();
    } catch (e: any) { toast.error(e.message || t("aiReply.deleteError")); }
  };

  const sourceLabel = (s: string) =>
    s === "faq" ? t("aiReply.sourceFaq")
    : s === "llm" ? t("aiReply.sourceLlm")
    : s === "refused" ? t("aiReply.sourceRefused")
    : s === "blocked" ? t("aiReply.sourceBlocked")
    : s;

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

      {/* ── Chatbot AI: FAQ/katalog + log percakapan (Pro/Master) ── */}
      {!loading && activeDeviceId != null && (
        <>
          {chatbotStatus && !chatbotStatus.chatbotAllowed && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
              {t("aiReply.chatbotProOnly").replace("{plan}", chatbotStatus.planName || "Free")}
            </div>
          )}
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h2 className="text-base font-semibold">{t("aiReply.faqTitle")}</h2>
                  <p className="text-xs text-muted-foreground">{t("aiReply.faqSubtitle")}</p>
                </div>
                <Button size="sm" onClick={() => openFaqModal()} className="gap-1.5" disabled={chatbotStatus != null && !chatbotStatus.chatbotAllowed}>
                  <Plus className="w-4 h-4" /> {t("aiReply.faqAdd")}
                </Button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="border-b border-border text-left">
                      <th className="py-2 px-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t("aiReply.colQuestion")}</th>
                      <th className="py-2 px-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t("aiReply.colAnswer")}</th>
                      <th className="py-2 px-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t("aiReply.colPriority")}</th>
                      <th className="py-2 px-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t("aiReply.colActive")}</th>
                      <th className="py-2 px-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground text-right">{t("aiReply.colActions")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleFaqs.length === 0 && (
                      <tr><td colSpan={5} className="py-8 text-center text-muted-foreground">{t("aiReply.faqEmpty")}</td></tr>
                    )}
                    {visibleFaqs.map((f) => (
                      <tr key={f.id} className="border-b border-border last:border-0">
                        <td className="py-3 px-3 text-xs max-w-[220px] truncate" title={f.question}>{f.question}</td>
                        <td className="py-3 px-3 text-xs text-muted-foreground max-w-[260px] truncate" title={f.answer}>{f.answer}</td>
                        <td className="py-3 px-3 text-xs whitespace-nowrap">{f.priority}</td>
                        <td className="py-3 px-3">
                          <Toggle checked={f.isActive} label={t("aiReply.active")} onToggle={() => toggleFaqActive(f)} />
                        </td>
                        <td className="py-3 px-3 text-right whitespace-nowrap">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openFaqModal(f)} aria-label={t("aiReply.edit")}>
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeletingFaq(f.id)} aria-label={t("aiReply.delete")}>
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

          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h2 className="text-base font-semibold">{t("aiReply.logsTitle")}</h2>
                  <p className="text-xs text-muted-foreground">{t("aiReply.logsSubtitle")}</p>
                </div>
                <select
                  value={logSource}
                  onChange={(e) => { setLogSource(e.target.value); loadLogs(e.target.value); }}
                  className="rounded-md border border-input bg-background px-2 py-1.5 text-xs"
                  aria-label={t("aiReply.logsSource")}
                >
                  <option value="">{t("aiReply.logsAll")}</option>
                  <option value="faq">{t("aiReply.sourceFaq")}</option>
                  <option value="llm">{t("aiReply.sourceLlm")}</option>
                  <option value="refused">{t("aiReply.sourceRefused")}</option>
                  <option value="blocked">{t("aiReply.sourceBlocked")}</option>
                </select>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="border-b border-border text-left">
                      <th className="py-2 px-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t("aiReply.colTime")}</th>
                      <th className="py-2 px-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t("aiReply.colPhone")}</th>
                      <th className="py-2 px-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t("aiReply.colQuestion")}</th>
                      <th className="py-2 px-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t("aiReply.logsSource")}</th>
                      <th className="py-2 px-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t("aiReply.colAnswer")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.length === 0 && (
                      <tr><td colSpan={5} className="py-8 text-center text-muted-foreground">{t("aiReply.logsEmpty")}</td></tr>
                    )}
                    {logs.map((l) => (
                      <tr key={l.id} className="border-b border-border last:border-0">
                        <td className="py-3 px-3 text-xs text-muted-foreground whitespace-nowrap">{new Date(l.createdAt).toLocaleString()}</td>
                        <td className="py-3 px-3 text-xs whitespace-nowrap">{l.phone}</td>
                        <td className="py-3 px-3 text-xs max-w-[200px] truncate" title={l.question}>{l.question}</td>
                        <td className="py-3 px-3 whitespace-nowrap"><Badge variant="outline">{sourceLabel(l.source)}</Badge></td>
                        <td className="py-3 px-3 text-xs text-muted-foreground max-w-[260px] truncate" title={l.answer}>{l.answer}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
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
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium">{t("aiReply.useFaq")}</p>
                <p className="text-xs text-muted-foreground">{t("aiReply.useFaqHint")}</p>
              </div>
              <Toggle checked={useFaq} label={t("aiReply.useFaq")} onToggle={setUseFaq} />
            </div>
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium">{t("aiReply.strictFaq")}</p>
                <p className="text-xs text-muted-foreground">{t("aiReply.strictFaqHint")}</p>
              </div>
              <Toggle checked={strictFaq} label={t("aiReply.strictFaq")} onToggle={setStrictFaq} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">{t("aiReply.maxReplyLength")}</label>
                <Input
                  className="mt-1.5"
                  type="number"
                  min={100}
                  max={4000}
                  value={maxReplyLength}
                  onChange={(e) => setMaxReplyLength(Number(e.target.value))}
                />
              </div>
              <div>
                <label className="text-sm font-medium">{t("aiReply.contextMessages")}</label>
                <Input
                  className="mt-1.5"
                  type="number"
                  min={0}
                  max={20}
                  value={contextMessages}
                  onChange={(e) => setContextMessages(Number(e.target.value))}
                />
              </div>
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

      {showFaqModal && (
        <Modal title={editingFaq ? t("aiReply.faqEditTitle") : t("aiReply.faqAddTitle")} onClose={() => setShowFaqModal(false)}>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">{t("aiReply.faqQuestion")}</label>
              <textarea
                value={faqQuestion}
                onChange={(e) => setFaqQuestion(e.target.value)}
                rows={2}
                placeholder={t("aiReply.faqQuestionPlaceholder")}
                className={`${inputCls} mt-1.5 resize-y`}
              />
            </div>
            <div>
              <label className="text-sm font-medium">{t("aiReply.faqAnswer")}</label>
              <textarea
                value={faqAnswer}
                onChange={(e) => setFaqAnswer(e.target.value)}
                rows={4}
                placeholder={t("aiReply.faqAnswerPlaceholder")}
                className={`${inputCls} mt-1.5 resize-y`}
              />
            </div>
            <div>
              <label className="text-sm font-medium">{t("aiReply.faqKeywords")}</label>
              <Input
                className="mt-1.5"
                placeholder={t("aiReply.faqKeywordsPlaceholder")}
                value={faqKeywords}
                onChange={(e) => setFaqKeywords(e.target.value)}
              />
              <p className="text-xs text-muted-foreground mt-1">{t("aiReply.faqKeywordsHint")}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">{t("aiReply.colPriority")}</label>
                <Input
                  className="mt-1.5"
                  type="number"
                  value={faqPriority}
                  onChange={(e) => setFaqPriority(Number(e.target.value))}
                />
              </div>
              {editingFaq && (
                <div className="flex items-end justify-between gap-2 pb-1">
                  <p className="text-sm font-medium">{t("aiReply.active")}</p>
                  <Toggle checked={faqIsActive} label={t("aiReply.active")} onToggle={setFaqIsActive} />
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowFaqModal(false)}>{t("aiReply.cancel")}</Button>
              <Button onClick={saveFaq}>{t("aiReply.save")}</Button>
            </div>
          </div>
        </Modal>
      )}

      {deletingFaq != null && (
        <Modal title={t("aiReply.deleteTitle")} onClose={() => setDeletingFaq(null)}>
          <p className="text-sm text-muted-foreground">{t("aiReply.faqDeleteConfirm")}</p>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setDeletingFaq(null)}>{t("aiReply.cancel")}</Button>
            <Button variant="destructive" onClick={confirmDeleteFaq}>{t("aiReply.delete")}</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

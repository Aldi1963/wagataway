import { useEffect, useState } from "react";
import { Plus, Trash2, Pencil, X, RefreshCw, ListOrdered, Bot, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dropdown } from "@/components/ui/dropdown";
import { cn } from "@/lib/utils";
import { useLang, timeAgo } from "@/lib/i18n";
import { apiGet, apiPost, apiPut, apiDelete, apiFetch } from "@/lib/api";
import { toast } from "sonner";
import { useActiveDevice } from "@/hooks/use-active-device";

interface MenuBotItem {
  id: number;
  menuBotId: number;
  position: number;
  label: string;
  actionType: string;
  replyText: string;
  subMenuId: number | null;
  subMenu?: { id: number; name: string } | null;
}

interface MenuBot {
  id: number;
  name: string;
  deviceId: number | null;
  triggerKeyword: string;
  introText: string;
  alwaysActive: boolean;
  isActive: boolean;
  items: MenuBotItem[];
}

interface BotEntry {
  bot: MenuBot;
  activeSessions: number;
}

interface MenuSession {
  id: number;
  phone: string;
  lastActiveAt: string;
}

function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  const { t } = useLang();
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className={cn(
          "relative bg-card text-card-foreground border border-border rounded-xl w-full max-h-[90vh] overflow-y-auto shadow-xl",
          wide ? "max-w-2xl" : "max-w-lg"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-border sticky top-0 bg-card rounded-t-xl z-10">
          <h3 className="font-semibold">{title}</h3>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose} aria-label={t("menuBot.close")}>
            <X className="w-4 h-4" />
          </Button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={label}
      onClick={onChange}
      className={cn(
        "relative h-5 w-9 shrink-0 rounded-full transition-colors",
        checked ? "bg-[#243370]" : "bg-muted"
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all",
          checked ? "left-[18px]" : "left-0.5"
        )}
      />
    </button>
  );
}

const emptyForm = { name: "", triggerKeyword: "", introText: "", alwaysActive: false };
const emptyItemForm = { label: "", actionType: "reply", replyText: "", subMenuId: "" };

export default function MenuBot({ embedded = false }: { embedded?: boolean }) {
  const { t, lang } = useLang();
  const { activeDeviceId, activeDevice } = useActiveDevice();
  const [entries, setEntries] = useState<BotEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<MenuBot | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<MenuBot | null>(null);

  const [itemsBot, setItemsBot] = useState<MenuBot | null>(null);
  const [itemForm, setItemForm] = useState(emptyItemForm);
  const [editingItem, setEditingItem] = useState<MenuBotItem | null>(null);
  const [editItemForm, setEditItemForm] = useState(emptyItemForm);
  const [itemSaving, setItemSaving] = useState(false);
  const [deletingItem, setDeletingItem] = useState<MenuBotItem | null>(null);

  const [sessionsBot, setSessionsBot] = useState<MenuBot | null>(null);
  const [sessions, setSessions] = useState<MenuSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);

  const load = () => {
    setLoading(true);
    setError(null);
    apiGet<{ menuBots: BotEntry[] }>("/menu-bots")
      .then((r) => setEntries(r.menuBots || []))
      .catch((e) => setError(e.message || t("menuBot.loadError")))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const updateEntry = (botId: number, patch: Partial<MenuBot>) => {
    setEntries((prev) =>
      prev.map((e) => (e.bot.id === botId ? { ...e, bot: { ...e.bot, ...patch } } : e))
    );
  };

  const visibleEntries =
    activeDeviceId == null ? [] : entries.filter((e) => e.bot.deviceId === activeDeviceId);

  /* ── CRUD menu bot ── */

  const openAdd = () => {
    if (activeDeviceId == null) {
      toast.error(t("menuBot.selectDeviceFirst"));
      return;
    }
    setEditing(null);
    setForm(emptyForm);
    setShowForm(true);
  };

  const openEdit = (bot: MenuBot) => {
    setEditing(bot);
    setForm({
      name: bot.name,
      triggerKeyword: bot.triggerKeyword,
      introText: bot.introText || "",
      alwaysActive: bot.alwaysActive,
    });
    setShowForm(true);
  };

  const save = async () => {
    if (activeDeviceId == null) {
      toast.error(t("menuBot.selectDeviceFirst"));
      return;
    }
    if (!form.name.trim() || !form.triggerKeyword.trim()) {
      toast.error(t("menuBot.validationError"));
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        const payload = {
          name: form.name.trim(),
          triggerKeyword: form.triggerKeyword.trim(),
          introText: form.introText,
          alwaysActive: form.alwaysActive,
        };
        const res = await apiPut<{ menuBot: MenuBot }>(`/menu-bots/${editing.id}`, payload);
        updateEntry(editing.id, res.menuBot);
        if (itemsBot?.id === editing.id) setItemsBot(res.menuBot);
        toast.success(t("menuBot.botUpdated"));
      } else {
        const payload = {
          name: form.name.trim(),
          triggerKeyword: form.triggerKeyword.trim(),
          introText: form.introText,
          alwaysActive: form.alwaysActive,
          deviceId: activeDeviceId,
        };
        const res = await apiPost<{ menuBot: MenuBot }>("/menu-bots", payload);
        setEntries((prev) => [{ bot: { ...res.menuBot, items: [] }, activeSessions: 0 }, ...prev]);
        toast.success(t("menuBot.botAdded"));
      }
      setShowForm(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("menuBot.saveError"));
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (bot: MenuBot, field: "isActive" | "alwaysActive") => {
    const next = !(field === "isActive" ? bot.isActive : bot.alwaysActive);
    updateEntry(bot.id, { [field]: next } as Partial<MenuBot>);
    try {
      if (field === "isActive") {
        const res = await apiFetch(`/menu-bots/${bot.id}/toggle`, { method: "PATCH" });
        if (!res.ok) throw new Error((await res.json()).message || t("menuBot.toggleError"));
        const data = await res.json();
        updateEntry(bot.id, { isActive: data.isActive });
        toast.success(data.isActive ? t("menuBot.botEnabled") : t("menuBot.botDisabled"));
      } else {
        const res = await apiPut<{ menuBot: MenuBot }>(`/menu-bots/${bot.id}`, { alwaysActive: next });
        updateEntry(bot.id, { alwaysActive: res.menuBot.alwaysActive });
        toast.success(next ? t("menuBot.alwaysOnEnabled") : t("menuBot.alwaysOnDisabled"));
      }
    } catch (e) {
      updateEntry(bot.id, { [field]: field === "isActive" ? bot.isActive : bot.alwaysActive } as Partial<MenuBot>);
      toast.error(e instanceof Error ? e.message : t("menuBot.toggleError"));
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await apiDelete(`/menu-bots/${deleting.id}`);
      setEntries((prev) => prev.filter((e) => e.bot.id !== deleting.id));
      toast.success(t("menuBot.botDeleted"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("menuBot.deleteError"));
    } finally {
      setDeleting(null);
    }
  };

  /* ── CRUD opsi menu ── */

  const openItems = (bot: MenuBot) => {
    setItemsBot(bot);
    setItemForm(emptyItemForm);
    setEditingItem(null);
  };

  const refreshItemsBot = (botId: number) => {
    apiGet<{ menuBot: MenuBot }>(`/menu-bots/${botId}`)
      .then((r) => {
        setItemsBot(r.menuBot);
        updateEntry(botId, { items: r.menuBot.items });
      })
      .catch(() => {});
  };

  const addItem = async () => {
    if (!itemsBot) return;
    if (!itemForm.label.trim()) {
      toast.error(t("menuBot.itemLabelRequired"));
      return;
    }
    if (itemForm.actionType === "reply" && !itemForm.replyText.trim()) {
      toast.error(t("menuBot.itemReplyRequired"));
      return;
    }
    if (itemForm.actionType === "submenu" && !itemForm.subMenuId) {
      toast.error(t("menuBot.itemSubmenuRequired"));
      return;
    }
    setItemSaving(true);
    try {
      const payload: Record<string, unknown> = {
        label: itemForm.label.trim(),
        actionType: itemForm.actionType,
        replyText: itemForm.replyText,
        subMenuId: itemForm.actionType === "submenu" ? Number(itemForm.subMenuId) : null,
      };
      await apiPost(`/menu-bots/${itemsBot.id}/items`, payload);
      setItemForm(emptyItemForm);
      refreshItemsBot(itemsBot.id);
      toast.success(t("menuBot.itemAdded"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("menuBot.itemAddError"));
    } finally {
      setItemSaving(false);
    }
  };

  const startEditItem = (item: MenuBotItem) => {
    setEditingItem(item);
    setEditItemForm({
      label: item.label,
      actionType: item.actionType || "reply",
      replyText: item.replyText || "",
      subMenuId: item.subMenuId != null ? String(item.subMenuId) : "",
    });
  };

  const saveEditItem = async () => {
    if (!itemsBot || !editingItem) return;
    if (!editItemForm.label.trim()) {
      toast.error(t("menuBot.itemLabelRequired"));
      return;
    }
    setItemSaving(true);
    try {
      const payload: Record<string, unknown> = {
        label: editItemForm.label.trim(),
        actionType: editItemForm.actionType,
        replyText: editItemForm.replyText,
        subMenuId: editItemForm.actionType === "submenu" ? Number(editItemForm.subMenuId) : null,
        clearSubMenuId: editItemForm.actionType !== "submenu",
      };
      await apiPut(`/menu-bots/${itemsBot.id}/items/${editingItem.id}`, payload);
      setEditingItem(null);
      refreshItemsBot(itemsBot.id);
      toast.success(t("menuBot.itemUpdated"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("menuBot.itemSaveError"));
    } finally {
      setItemSaving(false);
    }
  };

  const confirmDeleteItem = async () => {
    if (!itemsBot || !deletingItem) return;
    try {
      await apiDelete(`/menu-bots/${itemsBot.id}/items/${deletingItem.id}`);
      refreshItemsBot(itemsBot.id);
      toast.success(t("menuBot.itemDeleted"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("menuBot.itemDeleteError"));
    } finally {
      setDeletingItem(null);
    }
  };

  /* ── Sesi aktif ── */

  const openSessions = (bot: MenuBot) => {
    setSessionsBot(bot);
    setSessions([]);
    setSessionsLoading(true);
    apiGet<{ sessions: MenuSession[] }>(`/menu-bots/${bot.id}/sessions`)
      .then((r) => setSessions(r.sessions || []))
      .catch((e) => toast.error(e.message || t("menuBot.sessionsLoadError")))
      .finally(() => setSessionsLoading(false));
  };

  const endSession = async (sessionId: number, phone: string) => {
    try {
      await apiDelete(`/menu-bots/sessions/${sessionId}`);
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      load();
      toast.success(t("menuBot.sessionEnded").replace("{phone}", phone));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("menuBot.endSessionError"));
    }
  };

  const submenuOptions = (excludeId: number) =>
    entries
      .filter((e) => e.bot.id !== excludeId && (e.bot.deviceId === activeDeviceId || e.bot.deviceId == null))
      .map((e) => ({ value: String(e.bot.id), label: e.bot.name }));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {!embedded && (
          <div>
            <h2 className="text-lg font-semibold text-foreground">Menu Bot</h2>
            <p className="text-sm text-muted-foreground">
              {t("menuBot.subtitle")}
            </p>
          </div>
        )}
        <Button size="sm" className="gap-1.5" onClick={openAdd}>
          <Plus className="w-3.5 h-3.5" />
          {t("menuBot.addMenu")}
        </Button>
      </div>

      <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
        {t("menuBot.usageHint")
          .split(/(\{menu\}|\{zero\}|\{back\})/g)
          .map((part, i) =>
            part === "{menu}" || part === "{zero}" || part === "{back}" ? (
              <span key={i} className="font-mono">{part.slice(1, -1)}</span>
            ) : (
              part
            )
          )}
      </p>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 rounded-lg bg-secondary animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-lg border border-border p-8 text-center space-y-3">
          <p className="text-sm text-destructive">{error}</p>
          <Button size="sm" variant="outline" onClick={load} className="gap-1.5">
            <RefreshCw className="w-3.5 h-3.5" /> {t("menuBot.retry")}
          </Button>
        </div>
      ) : activeDeviceId == null ? (
        <div className="rounded-lg border border-border p-8 text-center">
          <Bot className="w-8 h-8 mx-auto text-muted-foreground" />
          <p className="text-sm font-medium mt-2">{t("menuBot.noDevice")}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {t("menuBot.noDeviceHint")}
          </p>
        </div>
      ) : visibleEntries.length === 0 ? (
        <div className="rounded-lg border border-border p-8 text-center">
          <Bot className="w-8 h-8 mx-auto text-muted-foreground" />
          <p className="text-sm font-medium mt-2">{t("menuBot.empty")}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {t("menuBot.emptyHint").replace("{device}", activeDevice?.name || `#${activeDeviceId}`)}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {visibleEntries.map(({ bot, activeSessions }) => (
            <Card key={bot.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-md bg-secondary flex items-center justify-center mt-0.5 shrink-0">
                      <ListOrdered className="w-4 h-4 text-foreground" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-foreground">{bot.name}</p>
                        <Badge variant={bot.isActive ? "default" : "outline"} className="text-[10px]">
                          {bot.isActive ? t("menuBot.active") : t("menuBot.inactive")}
                        </Badge>
                        {bot.alwaysActive && (
                          <Badge variant="secondary" className="text-[10px]">
                            {t("menuBot.alwaysActive")}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Keyword: <span className="font-mono">{bot.triggerKeyword}</span>
                        {" · "}
                        {t("menuBot.optionsCount").replace("{count}", String((bot.items || []).length))}
                        {activeSessions > 0 && (
                          <span>
                            {" · "}
                            <span className="font-medium text-foreground">{t("menuBot.activeSessions").replace("{count}", String(activeSessions))}</span>
                          </span>
                        )}
                      </p>
                      {bot.introText && (
                        <p className="text-xs text-muted-foreground mt-1 border-l-2 border-border pl-2 line-clamp-2 whitespace-pre-line">
                          {bot.introText}
                        </p>
                      )}
                      <div className="flex items-center gap-4 mt-2">
                        <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                          <Switch checked={bot.isActive} onChange={() => toggle(bot, "isActive")} label={t("menuBot.toggleActiveLabel")} />
                          {t("menuBot.active")}
                        </label>
                        <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                          <Switch checked={bot.alwaysActive} onChange={() => toggle(bot, "alwaysActive")} label={t("menuBot.alwaysActive")} />
                          {t("menuBot.alwaysActive")}
                        </label>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openItems(bot)} aria-label={t("menuBot.manageOptions")} title={t("menuBot.manageOptions")}>
                      <ListOrdered className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openSessions(bot)} aria-label={t("menuBot.activeSessionsLabel")} title={t("menuBot.activeSessionsLabel")}>
                      <Users className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(bot)} aria-label={t("menuBot.edit")}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive"
                      onClick={() => setDeleting(bot)}
                      aria-label={t("menuBot.delete")}
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

      {showForm && (
        <Modal title={editing ? t("menuBot.editMenuBot") : t("menuBot.addMenuBot")} onClose={() => setShowForm(false)}>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium">{t("menuBot.menuName")}</label>
              <Input
                className="mt-1"
                placeholder="cth: Menu Utama"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs font-medium">{t("menuBot.triggerKeyword")}</label>
              <Input
                className="mt-1 font-mono"
                placeholder="cth: menu"
                value={form.triggerKeyword}
                onChange={(e) => setForm({ ...form, triggerKeyword: e.target.value })}
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                {t("menuBot.triggerKeywordHint")}
              </p>
            </div>
            <div>
              <label className="text-xs font-medium">{t("menuBot.introText")}</label>
              <textarea
                className="mt-1 flex w-full rounded-md border border-border bg-background px-3 py-2 text-sm min-h-[80px]"
                placeholder="cth: Halo! Selamat datang di layanan kami. Silakan pilih:"
                value={form.introText}
                onChange={(e) => setForm({ ...form, introText: e.target.value })}
              />
            </div>
            <label className="flex items-start gap-2.5 rounded-md border border-border p-3 cursor-pointer">
              <Switch
                checked={form.alwaysActive}
                onChange={() => setForm({ ...form, alwaysActive: !form.alwaysActive })}
                label={t("menuBot.alwaysActive")}
              />
              <span>
                <span className="text-xs font-medium block">{t("menuBot.alwaysActive")}</span>
                <span className="text-[11px] text-muted-foreground block">
                  {t("menuBot.alwaysActiveHint")}
                </span>
              </span>
            </label>
            <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
              {t("menuBot.menuForDevice").replace("{device}", activeDevice?.name || `#${activeDeviceId}`)}
            </p>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setShowForm(false)} disabled={saving}>
                {t("menuBot.cancel")}
              </Button>
              <Button onClick={save} disabled={saving}>
                {saving ? t("menuBot.saving") : editing ? t("menuBot.save") : t("menuBot.add")}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {itemsBot && (
        <Modal wide title={t("menuBot.menuOptionsTitle").replace("{name}", itemsBot.name)} onClose={() => { setItemsBot(null); setEditingItem(null); }}>
          <div className="space-y-3">
            {(itemsBot.items || []).length === 0 ? (
              <p className="text-xs text-muted-foreground rounded-md border border-dashed border-border p-4 text-center">
                {t("menuBot.noOptions")}
              </p>
            ) : (
              (itemsBot.items || []).map((item, idx) => (
                <div key={item.id} className="rounded-md border border-border p-3">
                  {editingItem?.id === item.id ? (
                    <div className="space-y-3">
                      <div>
                        <label className="text-xs font-medium">{t("menuBot.optionLabel")}</label>
                        <Input
                          className="mt-1"
                          value={editItemForm.label}
                          onChange={(e) => setEditItemForm({ ...editItemForm, label: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium">{t("menuBot.action")}</label>
                        <Dropdown
                          value={editItemForm.actionType}
                          onChange={(v) => setEditItemForm({ ...editItemForm, actionType: v })}
                          ariaLabel={t("menuBot.actionAria")}
                          className="mt-1"
                          options={[
                            { value: "reply", label: t("menuBot.actionReply") },
                            { value: "submenu", label: t("menuBot.actionSubmenu") },
                          ]}
                        />
                      </div>
                      {editItemForm.actionType === "reply" ? (
                        <div>
                          <label className="text-xs font-medium">{t("menuBot.replyContent")}</label>
                          <textarea
                            className="mt-1 flex w-full rounded-md border border-border bg-background px-3 py-2 text-sm min-h-[70px]"
                            value={editItemForm.replyText}
                            onChange={(e) => setEditItemForm({ ...editItemForm, replyText: e.target.value })}
                          />
                        </div>
                      ) : (
                        <div>
                          <label className="text-xs font-medium">{t("menuBot.submenuTarget")}</label>
                          <Dropdown
                            value={editItemForm.subMenuId}
                            onChange={(v) => setEditItemForm({ ...editItemForm, subMenuId: v })}
                            ariaLabel={t("menuBot.submenuTarget")}
                            className="mt-1"
                            options={[{ value: "", label: t("menuBot.selectMenu") }, ...submenuOptions(itemsBot.id)]}
                          />
                        </div>
                      )}
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => setEditingItem(null)} disabled={itemSaving}>
                          {t("menuBot.cancel")}
                        </Button>
                        <Button size="sm" onClick={saveEditItem} disabled={itemSaving}>
                          {itemSaving ? t("menuBot.saving") : t("menuBot.save")}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2.5 min-w-0">
                        <span className="w-6 h-6 rounded-md bg-[#243370] text-white text-[11px] font-semibold flex items-center justify-center shrink-0">
                          {idx + 1}
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{item.label}</p>
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            {item.actionType === "submenu" ? (
                              <span>
                                {t("menuBot.toSubmenu")}{" "}
                                <span className="font-medium text-foreground">
                                  {item.subMenu?.name || entries.find((e) => e.bot.id === item.subMenuId)?.bot.name || `#${item.subMenuId}`}
                                </span>
                              </span>
                            ) : (
                              <span className="line-clamp-2">{t("menuBot.replyPrefix")} {item.replyText}</span>
                            )}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEditItem(item)} aria-label={t("menuBot.editOption")}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive"
                          onClick={() => setDeletingItem(item)}
                          aria-label={t("menuBot.deleteOption")}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}

            <div className="rounded-md border border-dashed border-border p-3 space-y-3">
              <p className="text-xs font-medium">{t("menuBot.addNewOption")}</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-medium">{t("menuBot.optionLabel")}</label>
                  <Input
                    className="mt-1"
                    placeholder="cth: Jam operasional"
                    value={itemForm.label}
                    onChange={(e) => setItemForm({ ...itemForm, label: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium">{t("menuBot.action")}</label>
                  <Dropdown
                    value={itemForm.actionType}
                    onChange={(v) => setItemForm({ ...itemForm, actionType: v })}
                    ariaLabel={t("menuBot.actionAria")}
                    className="mt-1"
                    options={[
                      { value: "reply", label: t("menuBot.actionReply") },
                      { value: "submenu", label: t("menuBot.actionSubmenu") },
                    ]}
                  />
                </div>
              </div>
              {itemForm.actionType === "reply" ? (
                <div>
                  <label className="text-xs font-medium">{t("menuBot.replyContent")}</label>
                  <textarea
                    className="mt-1 flex w-full rounded-md border border-border bg-background px-3 py-2 text-sm min-h-[70px]"
                    placeholder={t("menuBot.replyPlaceholder")}
                    value={itemForm.replyText}
                    onChange={(e) => setItemForm({ ...itemForm, replyText: e.target.value })}
                  />
                </div>
              ) : (
                <div>
                  <label className="text-xs font-medium">{t("menuBot.submenuTarget")}</label>
                  <Dropdown
                    value={itemForm.subMenuId}
                    onChange={(v) => setItemForm({ ...itemForm, subMenuId: v })}
                    ariaLabel={t("menuBot.submenuTarget")}
                    className="mt-1"
                    options={[{ value: "", label: t("menuBot.selectMenu") }, ...submenuOptions(itemsBot.id)]}
                  />
                </div>
              )}
              <div className="flex justify-end">
                <Button size="sm" onClick={addItem} disabled={itemSaving} className="gap-1.5">
                  <Plus className="w-3.5 h-3.5" />
                  {itemSaving ? t("menuBot.adding") : t("menuBot.addOption")}
                </Button>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {sessionsBot && (
        <Modal title={t("menuBot.activeSessionsTitle").replace("{name}", sessionsBot.name)} onClose={() => setSessionsBot(null)}>
          {sessionsLoading ? (
            <div className="space-y-2">
              {[1, 2].map((i) => (
                <div key={i} className="h-12 rounded-md bg-secondary animate-pulse" />
              ))}
            </div>
          ) : sessions.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center p-4">
              {t("menuBot.noActiveSessions")}
            </p>
          ) : (
            <div className="space-y-2">
              {sessions.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-2 rounded-md border border-border p-3">
                  <div className="min-w-0">
                    <p className="text-sm font-mono">{s.phone}</p>
                    <p className="text-[11px] text-muted-foreground">{t("menuBot.lastActive").replace("{time}", timeAgo(s.lastActiveAt, lang))}</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => endSession(s.id, s.phone)}>
                    {t("menuBot.endSession")}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}

      {deleting && (
        <Modal title={t("menuBot.deleteMenuBot")} onClose={() => setDeleting(null)}>
          <p className="text-sm text-muted-foreground">
            {t("menuBot.deleteBotConfirm").replace("{name}", deleting.name)}
          </p>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setDeleting(null)}>
              {t("menuBot.cancel")}
            </Button>
            <Button variant="destructive" onClick={confirmDelete}>
              {t("menuBot.delete")}
            </Button>
          </div>
        </Modal>
      )}

      {deletingItem && (
        <Modal title={t("menuBot.deleteOptionTitle")} onClose={() => setDeletingItem(null)}>
          <p className="text-sm text-muted-foreground">
            {t("menuBot.deleteOptionConfirm").replace("{label}", deletingItem.label)}
          </p>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setDeletingItem(null)}>
              {t("menuBot.cancel")}
            </Button>
            <Button variant="destructive" onClick={confirmDeleteItem}>
              {t("menuBot.delete")}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

import { toast } from "sonner";
import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, X, Users, UserPlus, RefreshCw, ChevronRight, MessageCircleHeart } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dropdown } from "@/components/ui/dropdown";
import { Toggle } from "@/components/Toggle";
import { apiGet, apiPost, apiPut, apiDelete } from "@/lib/api";
import SyncWAButton from "@/components/contacts/SyncWAButton";
import { useLang } from "@/lib/i18n";

interface Group {
  id: number;
  name: string;
  description: string;
  color: string;
  memberCount: number;
  createdAt: string;
  waJid?: string;
  welcomeDmEnabled?: boolean;
  welcomeDmTemplate?: string;
}

interface Member {
  id: number;
  groupId: number;
  contactId: number;
  createdAt: string;
}

interface Contact {
  id: number;
  name: string;
  phone: string;
}

const emptyForm = { name: "", description: "", color: "#6366f1" };

function Modal({
  title,
  onClose,
  children,
  wide,
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
        className={`relative bg-card text-card-foreground border border-border rounded-xl w-full ${
          wide ? "max-w-2xl" : "max-w-lg"
        } max-h-[90vh] overflow-y-auto p-5 sm:p-6 shadow-xl`}
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

export default function ContactGroups({ embedded = false }: { embedded?: boolean }) {
  const { t } = useLang();
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Group | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<Group | null>(null);

  // Members dialog
  const [activeGroup, setActiveGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [contactMap, setContactMap] = useState<Record<number, Contact>>({});
  const [membersLoading, setMembersLoading] = useState(false);
  const [pickContact, setPickContact] = useState("");

  // Welcome DM dialog (Fitur 5)
  const [welcomeGroup, setWelcomeGroup] = useState<Group | null>(null);
  const [welcomeEnabled, setWelcomeEnabled] = useState(false);
  const [welcomeTemplate, setWelcomeTemplate] = useState("");
  const [welcomeSaving, setWelcomeSaving] = useState(false);

  const openWelcomeDM = async (g: Group) => {
    setWelcomeGroup(g);
    try {
      const res = await apiGet<{ enabled: boolean; template: string }>("/contact-groups/" + g.id + "/welcome-dm");
      setWelcomeEnabled(res.enabled ?? false);
      setWelcomeTemplate(res.template ?? "");
    } catch {
      setWelcomeEnabled(g.welcomeDmEnabled ?? false);
      setWelcomeTemplate(g.welcomeDmTemplate ?? "");
    }
  };

  const renderPreview = (tpl: string, groupName: string) =>
    tpl.replace(/\{nama\}/g, "Budi").replace(/\{grup\}/g, groupName || "Grup Contoh");

  const saveWelcomeDM = async () => {
    if (!welcomeGroup) return;
    if (welcomeEnabled && !welcomeTemplate.trim()) {
      toast.error(t("contactGroups.welcomeTemplateRequired"));
      return;
    }
    setWelcomeSaving(true);
    try {
      await apiPut(`/contact-groups/${welcomeGroup.id}/welcome-dm`, {
        enabled: welcomeEnabled,
        template: welcomeTemplate,
      });
      toast.success(t("contactGroups.welcomeSaved"));
      setWelcomeGroup(null);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("contactGroups.saveFailed"));
    } finally {
      setWelcomeSaving(false);
    }
  };

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiGet<{ groups: Group[] }>("/contact-groups");
      setGroups(res.groups || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("contactGroups.loadFailed"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm);
    setShowForm(true);
  };

  const openEdit = (g: Group) => {
    setEditing(g);
    setForm({
      name: g.name || "",
      description: g.description || "",
      color: g.color || "#6366f1",
    });
    setShowForm(true);
  };

  const saveGroup = async () => {
    if (!form.name.trim()) {
      toast.error(t("contactGroups.nameRequired"));
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await apiPut(`/contact-groups/${editing.id}`, form);
        toast.success(t("contactGroups.updated"));
      } else {
        await apiPost("/contact-groups", form);
        toast.success(t("contactGroups.created"));
      }
      setShowForm(false);
      setEditing(null);
      setForm(emptyForm);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("contactGroups.saveGroupFailed"));
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await apiDelete(`/contact-groups/${deleting.id}`);
      toast.success(t("contactGroups.deleted"));
      setDeleting(null);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("contactGroups.deleteFailed"));
    }
  };

  const openMembers = async (g: Group) => {
    setActiveGroup(g);
    setMembersLoading(true);
    setPickContact("");
    try {
      const [mRes, cRes] = await Promise.all([
        apiGet<{ members: Member[] }>(`/contact-groups/${g.id}/members`),
        apiGet<{ contacts: Contact[] }>("/contacts?limit=200"),
      ]);
      setMembers(mRes.members || []);
      const map: Record<number, Contact> = {};
      (cRes.contacts || []).forEach((c) => {
        map[c.id] = c;
      });
      setContactMap(map);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("contactGroups.membersLoadFailed"));
    } finally {
      setMembersLoading(false);
    }
  };

  const addMember = async () => {
    if (!pickContact || !activeGroup) return;
    try {
      await apiPost(`/contact-groups/${activeGroup.id}/members`, {
        contactIds: [Number(pickContact)],
      });
      toast.success(t("contactGroups.memberAdded"));
      setPickContact("");
      openMembers(activeGroup);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("contactGroups.memberAddFailed"));
    }
  };

  const removeMember = async (memberId: number) => {
    if (!activeGroup) return;
    try {
      await apiDelete(`/contact-groups/${activeGroup.id}/members/${memberId}`);
      toast.success(t("contactGroups.memberRemoved"));
      openMembers(activeGroup);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("contactGroups.memberRemoveFailed"));
    }
  };

  const memberContactIds = new Set(members.map((m) => m.contactId));
  const availableContacts = Object.values(contactMap).filter(
    (c) => !memberContactIds.has(c.id)
  );

  return (
    <div className="space-y-4 sm:space-y-6"> {/* Header */}
      <div className={`flex gap-3 sm:flex-row sm:items-center ${embedded ? "justify-end" : "flex-col sm:justify-between"}`}>
        {!embedded && (
          <div>
            <h1 className="text-xl sm:text-2xl font-bold">{t("title.contactGroups")}</h1>
            <p className="text-sm text-muted-foreground">
              {t("contactGroups.description")}
            </p>
          </div>
        )}
        <div className="flex flex-wrap gap-2 self-start sm:self-auto">
          <SyncWAButton kind="groups" onDone={load} />
          <Button onClick={openAdd} className="gap-1.5">
            <Plus className="w-4 h-4" />
            {t("contactGroups.createGroup")}
          </Button>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <Card key={i}>
              <CardContent className="p-5">
                <div className="h-5 w-2/3 rounded bg-secondary animate-pulse mb-3" />
                <div className="h-4 w-full rounded bg-secondary animate-pulse" />
              </CardContent>
            </Card>
          ))}
        </div>
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
      ) : groups.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center">
            <Users className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
            <p className="font-medium mb-1">{t("contactGroups.noGroups")}</p>
            <p className="text-sm text-muted-foreground">
              {t("contactGroups.noGroupsHint")}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {groups.map((g) => (
            <Card key={g.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className="w-4 h-4 rounded-full shrink-0"
                      style={{ backgroundColor: g.color || "#6366f1" }}
                    />
                    <CardTitle className="text-base truncate">{g.name}</CardTitle>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => openEdit(g)}
                      aria-label={t("contactGroups.editGroup").replace("{name}", g.name)}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setDeleting(g)}
                      aria-label={t("contactGroups.deleteGroup").replace("{name}", g.name)}
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                </div>
                {g.description && (
                  <CardDescription className="line-clamp-2">{g.description}</CardDescription>
                )}
              </CardHeader>
              <CardContent className="pt-0 space-y-2">
                <button
                  onClick={() => openMembers(g)}
                  className="w-full flex items-center justify-between text-sm px-3 py-2.5 rounded-lg bg-secondary/60 hover:bg-secondary transition-colors"
                >
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <Users className="w-4 h-4" />
                    {t("contactGroups.memberCount").replace("{count}", String(g.memberCount))}
                  </span>
                  <span className="flex items-center gap-1 text-foreground font-medium">
                    {t("contactGroups.manage")}
                    <ChevronRight className="w-4 h-4" />
                  </span>
                </button>
                {g.waJid && (
                  <button
                    onClick={() => openWelcomeDM(g)}
                    className="w-full flex items-center justify-between text-sm px-3 py-2.5 rounded-lg border border-border hover:bg-secondary/60 transition-colors"
                  >
                    <span className="flex items-center gap-2 text-muted-foreground">
                      <MessageCircleHeart className="w-4 h-4" />
                      Welcome DM
                    </span>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${g.welcomeDmEnabled ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-secondary text-muted-foreground"}`}>
                      {g.welcomeDmEnabled ? t("contactGroups.active") : t("contactGroups.inactive")}
                    </span>
                  </button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add/Edit dialog */}
      {showForm && (
        <Modal title={editing ? t("contactGroups.editTitle") : t("contactGroups.createGroup")} onClose={() => setShowForm(false)}>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1.5 block">{t("contactGroups.labelName")}</label>
              <Input
                placeholder={t("contactGroups.placeholderName")}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">{t("contactGroups.labelDescription")}</label>
              <Input
                placeholder={t("contactGroups.placeholderDescription")}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">{t("contactGroups.labelColor")}</label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={form.color}
                  onChange={(e) => setForm({ ...form, color: e.target.value })}
                  className="w-10 h-10 rounded-md cursor-pointer bg-transparent"
                  aria-label={t("contactGroups.pickColor")}
                />
                <Input
                  value={form.color}
                  onChange={(e) => setForm({ ...form, color: e.target.value })}
                  className="max-w-[140px]"
                  placeholder="#6366f1"
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" onClick={() => setShowForm(false)}>
                {t("common.cancel")}
              </Button>
              <Button onClick={saveGroup} disabled={saving}>
                {saving ? t("contactGroups.saving") : editing ? t("contactGroups.saveChanges") : t("contactGroups.createGroup")}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Members dialog */}
      {activeGroup && (
        <Modal
          title={t("contactGroups.membersTitle").replace("{name}", activeGroup.name)}
          onClose={() => setActiveGroup(null)}
          wide
        >
          {/* Add member */}
          <div className="flex flex-col sm:flex-row gap-2 mb-5">
            <Dropdown
              value={pickContact}
              onChange={setPickContact}
              ariaLabel={t("contactGroups.pickContact")}
              placeholder={t("contactGroups.pickContactPlaceholder")}
              className="flex-1"
              options={[
                { value: "", label: t("contactGroups.pickContactPlaceholder") },
                ...availableContacts.map((c) => ({ value: String(c.id), label: `${c.name} — ${c.phone}` })),
              ]}
            />
            <Button onClick={addMember} disabled={!pickContact} className="gap-1.5">
              <UserPlus className="w-4 h-4" />
              {t("contactGroups.add")}
            </Button>
          </div>

          {/* Member list */}
          {membersLoading ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-11 rounded-lg bg-secondary animate-pulse" />
              ))}
            </div>
          ) : members.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              {t("contactGroups.noMembers")}
            </p>
          ) : (
            <div className="space-y-2 max-h-[40vh] overflow-y-auto">
              {members.map((m) => {
                const c = contactMap[m.contactId];
                return (
                  <div
                    key={m.id}
                    className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg border border-border"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">
                        {c ? c.name : t("contactGroups.contactHash").replace("{id}", String(m.contactId))}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {c ? c.phone : t("contactGroups.contactNotFound")}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      onClick={() => removeMember(m.id)}
                      aria-label={t("contactGroups.removeMember")}
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </Modal>
      )}

      {/* Welcome DM dialog (Fitur 5) */}
      {welcomeGroup && (
        <Modal
          title={t("contactGroups.welcomeTitle").replace("{name}", welcomeGroup.name)}
          onClose={() => setWelcomeGroup(null)}
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <p className="text-sm font-medium">{t("contactGroups.welcomeHeading")}</p>
                <p className="text-xs text-muted-foreground">
                  {t("contactGroups.welcomeDesc")}
                </p>
              </div>
              <Toggle checked={welcomeEnabled} label="Welcome DM" onToggle={setWelcomeEnabled} />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">{t("contactGroups.templateLabel")}</label>
              <textarea
                value={welcomeTemplate}
                onChange={(e) => setWelcomeTemplate(e.target.value)}
                rows={4}
                placeholder={t("contactGroups.templatePlaceholder")}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-y"
              />
              <p className="text-xs text-muted-foreground mt-1.5">
                {t("contactGroups.variables")}{" "}<code className="font-mono bg-secondary px-1 rounded">{"{nama}"}</code> = {t("contactGroups.variablesNameHint")}, <code className="font-mono bg-secondary px-1 rounded">{"{grup}"}</code> = {t("contactGroups.variablesGroupHint")}.
              </p>
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">{t("contactGroups.preview")}</label>
              <div className="rounded-lg border border-border bg-secondary/40 p-3 text-sm whitespace-pre-wrap">
                {welcomeTemplate.trim() ? renderPreview(welcomeTemplate, welcomeGroup.name) : (
                  <span className="text-muted-foreground">{t("contactGroups.previewEmpty")}</span>
                )}
              </div>
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" onClick={() => setWelcomeGroup(null)}>
                {t("common.cancel")}
              </Button>
              <Button onClick={saveWelcomeDM} disabled={welcomeSaving}>
                {welcomeSaving ? t("contactGroups.saving") : t("common.save")}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Delete confirm */}
      {deleting && (
        <Modal title={t("contactGroups.deleteTitle")} onClose={() => setDeleting(null)}>
          <p className="text-sm text-muted-foreground mb-5">
            {t("contactGroups.deleteConfirm").replace("{name}", deleting.name)}
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

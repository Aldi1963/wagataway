import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, X, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dropdown } from "@/components/ui/dropdown";
import { Toggle } from "@/components/Toggle";
import { apiGet, apiPost, apiPut, apiDelete } from "@/lib/api";
import { useLang } from "@/lib/i18n";

interface Followup {
  id: number;
  name: string;
  deviceId: number;
  targetPhone: string;
  message: string;
  triggerAfterHours: number;
  isActive: boolean;
}

interface Device {
  id: number;
  name: string;
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const { t } = useLang();
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden />
      <div className="relative bg-card text-card-foreground rounded-xl border border-border shadow-lg w-full max-w-lg max-h-[90vh] overflow-y-auto p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold">{title}</h3>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose} aria-label={t("followups.close")}>
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

export default function Followups({ embedded = false }: { embedded?: boolean }) {
  const { t } = useLang();
  const [items, setItems] = useState<Followup[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Followup | null>(null);
  const [name, setName] = useState("");
  const [deviceId, setDeviceId] = useState("");
  const [targetPhone, setTargetPhone] = useState("");
  const [message, setMessage] = useState("");
  const [triggerHours, setTriggerHours] = useState("24");
  const [deleting, setDeleting] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [r, d] = await Promise.all([
        apiGet<{ followups: Followup[] } | Followup[]>("/followups"),
        apiGet<{ devices: Device[] }>("/devices"),
      ]);
      setItems(Array.isArray(r) ? r : r.followups ?? []);
      setDevices(d.devices ?? []);
    } catch (e: any) {
      toast.error(e.message || t("followups.loadFail"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const deviceName = (id: number) => devices.find((x) => x.id === id)?.name ?? `#${id}`;

  const openModal = (f?: Followup) => {
    setEditing(f ?? null);
    setName(f?.name ?? "");
    setDeviceId(f ? String(f.deviceId) : devices.length === 1 ? String(devices[0].id) : "");
    setTargetPhone(f?.targetPhone ?? "");
    setMessage(f?.message ?? "");
    setTriggerHours(String(f?.triggerAfterHours ?? 24));
    setShowModal(true);
  };

  const save = async () => {
    if (!name.trim() || !targetPhone.trim() || !message.trim()) { toast.error(t("followups.fieldsRequired")); return; }
    if (!deviceId) { toast.error(t("followups.selectDevice")); return; }
    const hours = Number(triggerHours);
    if (!hours || hours < 1) { toast.error(t("followups.triggerMin")); return; }
    try {
      const payload = {
        name: name.trim(),
        deviceId: Number(deviceId),
        targetPhone: targetPhone.trim(),
        message: message.trim(),
        triggerAfterHours: hours,
      };
      if (editing) { await apiPut(`/followups/${editing.id}`, payload); toast.success(t("followups.updated")); }
      else { await apiPost("/followups", payload); toast.success(t("followups.added")); }
      setShowModal(false);
      load();
    } catch (e: any) { toast.error(e.message || t("followups.saveFail")); }
  };

  const toggleActive = async (f: Followup, v: boolean) => {
    try {
      await apiPost(`/followups/${f.id}/toggle`, {});
      setItems((prev) => prev.map((x) => (x.id === f.id ? { ...x, isActive: v } : x)));
      toast.success(v ? t("followups.activated") : t("followups.deactivated"));
    } catch (e: any) { toast.error(e.message || t("followups.statusFail")); }
  };

  const confirmDelete = async () => {
    if (deleting == null) return;
    try {
      await apiDelete(`/followups/${deleting}`);
      toast.success(t("followups.deleted"));
      setDeleting(null);
      load();
    } catch (e: any) { toast.error(e.message || t("followups.deleteFail")); }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {!embedded && (
          <div>
            <h1 className="text-xl font-bold text-foreground">{t("followups.title")}</h1>
            <p className="text-sm text-muted-foreground">{t("followups.subtitle")}</p>
          </div>
        )}
        <Button size="sm" onClick={() => openModal()} className="gap-1.5">
          <Plus className="w-4 h-4" /> {t("followups.addFollowup")}
        </Button>
      </div>

      {loading ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">{t("followups.loading")}</CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="py-3 px-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t("followups.colName")}</th>
                    <th className="py-3 px-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t("followups.colDevice")}</th>
                    <th className="py-3 px-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t("followups.colTarget")}</th>
                    <th className="py-3 px-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t("followups.colMessage")}</th>
                    <th className="py-3 px-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t("followups.colTrigger")}</th>
                    <th className="py-3 px-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t("followups.colActive")}</th>
                    <th className="py-3 px-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground text-right">{t("followups.colAction")}</th>
                  </tr>
                </thead>
                <tbody>
                  {items.length === 0 && (
                    <tr><td colSpan={7} className="py-8 text-center text-muted-foreground">{t("followups.empty")}</td></tr>
                  )}
                  {items.map((f) => (
                    <tr key={f.id} className="border-b border-border last:border-0">
                      <td className="py-3 px-4 font-medium">
                        <span className="inline-flex items-center gap-1.5"><Timer className="w-3.5 h-3.5 text-muted-foreground" />{f.name}</span>
                      </td>
                      <td className="py-3 px-4 text-xs text-muted-foreground whitespace-nowrap">{deviceName(f.deviceId)}</td>
                      <td className="py-3 px-4 font-mono text-[13px]">{f.targetPhone}</td>
                      <td className="py-3 px-4 text-xs text-muted-foreground max-w-[220px] truncate" title={f.message}>{f.message}</td>
                      <td className="py-3 px-4 whitespace-nowrap text-xs">{t("followups.triggerHours").replace("{hours}", String(f.triggerAfterHours))}</td>
                      <td className="py-3 px-4">
                        <Toggle checked={f.isActive} label={t("followups.activeLabel").replace("{name}", f.name)} onToggle={(v) => toggleActive(f, v)} />
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openModal(f)} aria-label={t("followups.editAria")}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleting(f.id)} aria-label={t("followups.deleteAria")}>
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
        <Modal title={editing ? t("followups.editTitle") : t("followups.addTitle")} onClose={() => setShowModal(false)}>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">{t("followups.nameLabel")}</label>
              <Input className="mt-1.5" placeholder={t("followups.namePlaceholder")} value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">{t("followups.deviceLabel")}</label>
                <Dropdown
                  value={deviceId}
                  onChange={setDeviceId}
                  ariaLabel={t("followups.deviceAria")}
                  className="mt-1.5"
                  options={[
                    { value: "", label: t("followups.selectDeviceOption") },
                    ...devices.map((d) => ({ value: String(d.id), label: d.name })),
                  ]}
                />
              </div>
              <div>
                <label className="text-sm font-medium">{t("followups.targetLabel")}</label>
                <Input className="mt-1.5" placeholder="62812xxxxxxx" value={targetPhone} onChange={(e) => setTargetPhone(e.target.value)} />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">{t("followups.triggerLabel")}</label>
              <Input type="number" min={1} className="mt-1.5" value={triggerHours} onChange={(e) => setTriggerHours(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium">{t("followups.messageLabel")}</label>
              <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={4} placeholder={t("followups.messagePlaceholder")} className={`${inputCls} mt-1.5 resize-y`} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowModal(false)}>{t("followups.cancel")}</Button>
              <Button onClick={save}>{t("followups.save")}</Button>
            </div>
          </div>
        </Modal>
      )}

      {deleting != null && (
        <Modal title={t("followups.deleteTitle")} onClose={() => setDeleting(null)}>
          <p className="text-sm text-muted-foreground">{t("followups.deleteConfirm")}</p>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setDeleting(null)}>{t("followups.cancel")}</Button>
            <Button variant="destructive" onClick={confirmDelete}>{t("followups.delete")}</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

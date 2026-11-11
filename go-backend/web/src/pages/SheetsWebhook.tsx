import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Webhook,
  ArrowDownToLine,
  ArrowUpFromLine,
  Table2,
  Plus,
  Copy,
  RefreshCw,
  Trash2,
  Pencil,
  ScrollText,
  Send,
  FlaskConical,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dropdown } from "@/components/ui/dropdown";
import { Toggle } from "@/components/Toggle";
import { apiGet, apiPost, apiPut, apiDelete } from "@/lib/api";
import { useLang } from "@/lib/i18n";

// ── Item 8: Google Sheets + webhook dua arah ──────────────────────────────
// Tiga tab: webhook keluar (daftar + uji kirim), webhook masuk (endpoint
// HMAC + log), Google Sheets (koneksi service account + sinkronisasi).

const OUT_EVENTS = [
  "message.received",
  "message.sent",
  "message.failed",
  "order.created",
  "subscription.activated",
] as const;

interface Device {
  id: number;
  name: string;
  status: string;
}

interface OutWebhook {
  id: number;
  url: string;
  secret?: string;
  events?: string;
  deviceId?: number | null;
  isActive: boolean;
  triggerCount: number;
  lastTriggered?: string | null;
  createdAt: string;
}

interface Delivery {
  id: number;
  event: string;
  statusCode: number;
  success: boolean;
  errorMsg?: string;
  durationMs: number;
  payload: string;
  createdAt: string;
}

interface Inbound {
  id: number;
  name: string;
  deviceId: number;
  template: string;
  isActive: boolean;
  secretMasked: string;
  deviceName?: string;
  hookPath: string;
  createdAt: string;
}

interface InLog {
  id: number;
  status: string;
  to: string;
  payloadSummary: string;
  errorMsg?: string;
  createdAt: string;
}

interface SheetsConn {
  configured: boolean;
  spreadsheetId?: string;
  serviceAccountEmail?: string;
  isActive: boolean;
}

interface SheetsSync {
  id: number;
  kind: string;
  direction: string;
  sheetName: string;
  status: string;
  rowsTotal: number;
  rowsOk: number;
  rowsFailed: number;
  errorMsg?: string;
  createdAt: string;
}

function fmtTime(s?: string | null) {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch {
    return s;
  }
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function parseEvents(raw?: string): string[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export default function SheetsWebhook({ embedded = false }: { embedded?: boolean }) {
  const { t } = useLang();
  const [tab, setTab] = useState<"out" | "in" | "sheets">("out");
  const [devices, setDevices] = useState<Device[]>([]);

  // ── Outbound ──
  const [hooks, setHooks] = useState<OutWebhook[]>([]);
  const [loadingHooks, setLoadingHooks] = useState(true);
  const [showCreateHook, setShowCreateHook] = useState(false);
  const [newUrl, setNewUrl] = useState("");
  const [newSecret, setNewSecret] = useState("");
  const [newDevice, setNewDevice] = useState("all");
  const [newEvents, setNewEvents] = useState<string[]>([]);
  const [creatingHook, setCreatingHook] = useState(false);
  const [testingId, setTestingId] = useState<number | null>(null);
  const [openDeliveries, setOpenDeliveries] = useState<number | null>(null);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);

  // ── Inbound ──
  const [inbounds, setInbounds] = useState<Inbound[]>([]);
  const [loadingIn, setLoadingIn] = useState(true);
  const [showCreateIn, setShowCreateIn] = useState(false);
  const [inName, setInName] = useState("");
  const [inDevice, setInDevice] = useState("");
  const [inTemplate, setInTemplate] = useState("");
  const [creatingIn, setCreatingIn] = useState(false);
  const [fullSecret, setFullSecret] = useState<{ id: number; secret: string; hookPath: string } | null>(null);
  const [openLogs, setOpenLogs] = useState<number | null>(null);
  const [inLogs, setInLogs] = useState<InLog[]>([]);
  const [editingIn, setEditingIn] = useState<Inbound | null>(null);

  // ── Sheets ──
  const [conn, setConn] = useState<SheetsConn>({ configured: false, isActive: true });
  const [loadingConn, setLoadingConn] = useState(true);
  const [sheetId, setSheetId] = useState("");
  const [saJson, setSaJson] = useState("");
  const [savingConn, setSavingConn] = useState(false);
  const [testingConn, setTestingConn] = useState(false);
  const [syncKind, setSyncKind] = useState("contacts");
  const [syncDir, setSyncDir] = useState("export");
  const [sheetName, setSheetName] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncs, setSyncs] = useState<SheetsSync[]>([]);

  const loadDevices = async () => {
    try {
      const d = await apiGet<{ devices: Device[] }>("/devices");
      setDevices(d.devices ?? []);
    } catch {
      setDevices([]);
    }
  };

  const loadHooks = async () => {
    setLoadingHooks(true);
    try {
      const r = await apiGet<{ webhooks: OutWebhook[] }>("/webhooks");
      setHooks(r.webhooks ?? []);
    } catch (e: any) {
      toast.error(e.message || t("sheetsWebhook.loadFail"));
    } finally {
      setLoadingHooks(false);
    }
  };

  const loadInbounds = async () => {
    setLoadingIn(true);
    try {
      const r = await apiGet<{ inboundWebhooks: Inbound[] }>("/inbound-webhooks");
      setInbounds(r.inboundWebhooks ?? []);
    } catch (e: any) {
      toast.error(e.message || t("sheetsWebhook.loadFail"));
    } finally {
      setLoadingIn(false);
    }
  };

  const loadConn = async () => {
    setLoadingConn(true);
    try {
      const r = await apiGet<{ connection: SheetsConn }>("/sheets/connection");
      setConn(r.connection);
      setSheetId(r.connection.spreadsheetId ?? "");
    } catch (e: any) {
      toast.error(e.message || t("sheetsWebhook.loadFail"));
    } finally {
      setLoadingConn(false);
    }
  };

  const loadSyncs = async () => {
    try {
      const r = await apiGet<{ syncs: SheetsSync[] }>("/sheets/syncs");
      setSyncs(r.syncs ?? []);
    } catch {
      setSyncs([]);
    }
  };

  useEffect(() => {
    loadDevices();
    loadHooks();
    loadInbounds();
    loadConn();
    loadSyncs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const deviceName = (id?: number | null) =>
    id ? devices.find((d) => d.id === id)?.name ?? `#${id}` : t("sheetsWebhook.deviceAll");

  // ── Outbound actions ──
  const createHook = async () => {
    if (!newUrl.trim()) return;
    setCreatingHook(true);
    try {
      await apiPost("/webhooks", {
        url: newUrl.trim(),
        secret: newSecret.trim() || undefined,
        events: newEvents,
        deviceId: newDevice === "all" ? undefined : Number(newDevice),
      });
      toast.success(t("sheetsWebhook.created"));
      setNewUrl("");
      setNewSecret("");
      setNewEvents([]);
      setNewDevice("all");
      setShowCreateHook(false);
      loadHooks();
    } catch (e: any) {
      toast.error(e.message || t("sheetsWebhook.saveFail"));
    } finally {
      setCreatingHook(false);
    }
  };

  const toggleHook = async (h: OutWebhook) => {
    try {
      await apiPut(`/webhooks/${h.id}`, { isActive: !h.isActive });
      loadHooks();
    } catch (e: any) {
      toast.error(e.message || t("sheetsWebhook.saveFail"));
    }
  };

  const deleteHook = async (h: OutWebhook) => {
    if (!window.confirm(t("sheetsWebhook.deleteConfirm"))) return;
    try {
      await apiDelete(`/webhooks/${h.id}`);
      toast.success(t("sheetsWebhook.deleted"));
      loadHooks();
    } catch (e: any) {
      toast.error(e.message || t("sheetsWebhook.saveFail"));
    }
  };

  const testHook = async (h: OutWebhook) => {
    setTestingId(h.id);
    try {
      const r = await apiPost<{ delivery: Delivery }>(`/webhooks/${h.id}/test`);
      if (r.delivery.success) toast.success(t("sheetsWebhook.testOk"));
      else toast.error(`${t("sheetsWebhook.testFail")}: HTTP ${r.delivery.statusCode || "?"} ${r.delivery.errorMsg || ""}`);
      loadHooks();
    } catch (e: any) {
      toast.error(e.message || t("sheetsWebhook.testFail"));
    } finally {
      setTestingId(null);
    }
  };

  const toggleDeliveries = async (h: OutWebhook) => {
    if (openDeliveries === h.id) {
      setOpenDeliveries(null);
      return;
    }
    setOpenDeliveries(h.id);
    try {
      const r = await apiGet<{ deliveries: Delivery[] }>(`/webhooks/${h.id}/deliveries`);
      setDeliveries(r.deliveries ?? []);
    } catch {
      setDeliveries([]);
    }
  };

  // ── Inbound actions ──
  const createInbound = async () => {
    if (!inName.trim() || !inDevice) return;
    setCreatingIn(true);
    try {
      const r = await apiPost<{ inboundWebhook: Inbound; fullSecret: string; hookPath: string }>("/inbound-webhooks", {
        name: inName.trim(),
        deviceId: Number(inDevice),
        template: inTemplate.trim() || undefined,
      });
      setFullSecret({ id: r.inboundWebhook.id, secret: r.fullSecret, hookPath: r.hookPath });
      toast.success(t("sheetsWebhook.created"));
      setInName("");
      setInDevice("");
      setInTemplate("");
      setShowCreateIn(false);
      loadInbounds();
    } catch (e: any) {
      toast.error(e.message || t("sheetsWebhook.saveFail"));
    } finally {
      setCreatingIn(false);
    }
  };

  const saveInboundEdit = async () => {
    if (!editingIn) return;
    try {
      await apiPut(`/inbound-webhooks/${editingIn.id}`, {
        name: editingIn.name,
        deviceId: editingIn.deviceId,
        template: editingIn.template,
        isActive: editingIn.isActive,
      });
      toast.success(t("sheetsWebhook.saved"));
      setEditingIn(null);
      loadInbounds();
    } catch (e: any) {
      toast.error(e.message || t("sheetsWebhook.saveFail"));
    }
  };

  const deleteInbound = async (ib: Inbound) => {
    if (!window.confirm(t("sheetsWebhook.deleteConfirm"))) return;
    try {
      await apiDelete(`/inbound-webhooks/${ib.id}`);
      toast.success(t("sheetsWebhook.deleted"));
      loadInbounds();
    } catch (e: any) {
      toast.error(e.message || t("sheetsWebhook.saveFail"));
    }
  };

  const regenerateInbound = async (ib: Inbound) => {
    try {
      const r = await apiPost<{ fullSecret: string; hookPath: string }>(`/inbound-webhooks/${ib.id}/regenerate`);
      setFullSecret({ id: ib.id, secret: r.fullSecret, hookPath: r.hookPath });
      toast.success(t("sheetsWebhook.regenerated"));
    } catch (e: any) {
      toast.error(e.message || t("sheetsWebhook.saveFail"));
    }
  };

  const toggleLogs = async (ib: Inbound) => {
    if (openLogs === ib.id) {
      setOpenLogs(null);
      return;
    }
    setOpenLogs(ib.id);
    try {
      const r = await apiGet<{ logs: InLog[] }>(`/inbound-webhooks/${ib.id}/logs`);
      setInLogs(r.logs ?? []);
    } catch {
      setInLogs([]);
    }
  };

  const hookUrl = (ib: Inbound) => `${window.location.origin}${ib.hookPath}`;

  // ── Sheets actions ──
  const saveConn = async () => {
    if (!sheetId.trim()) return;
    setSavingConn(true);
    try {
      const r = await apiPut<{ connection: SheetsConn }>("/sheets/connection", {
        spreadsheetId: sheetId.trim(),
        serviceAccountJson: saJson.trim() || undefined,
      });
      setConn(r.connection);
      setSaJson("");
      toast.success(t("sheetsWebhook.shSaved"));
    } catch (e: any) {
      toast.error(e.message || t("sheetsWebhook.saveFail"));
    } finally {
      setSavingConn(false);
    }
  };

  const testConn = async () => {
    setTestingConn(true);
    try {
      const r = await apiPost<{ title: string }>("/sheets/test");
      toast.success(`${t("sheetsWebhook.shTestOk")}: ${r.title}`);
    } catch (e: any) {
      toast.error(e.message || t("sheetsWebhook.shTestFail"));
    } finally {
      setTestingConn(false);
    }
  };

  const deleteConn = async () => {
    if (!window.confirm(t("sheetsWebhook.shDeleteConfirm"))) return;
    try {
      await apiDelete("/sheets/connection");
      setConn({ configured: false, isActive: true });
      setSheetId("");
      toast.success(t("sheetsWebhook.shDeleted"));
    } catch (e: any) {
      toast.error(e.message || t("sheetsWebhook.saveFail"));
    }
  };

  const runSync = async () => {
    setSyncing(true);
    try {
      const r = await apiPost<{ sync: SheetsSync }>("/sheets/sync", {
        kind: syncKind,
        direction: syncDir,
        sheetName: sheetName.trim() || undefined,
      });
      toast.success(`${t("sheetsWebhook.syncDone")} (${r.sync.rowsOk}/${r.sync.rowsTotal})`);
      loadSyncs();
    } catch (e: any) {
      toast.error(e.message || t("sheetsWebhook.syncFail"));
      loadSyncs();
    } finally {
      setSyncing(false);
    }
  };

  const tabs = [
    { id: "out" as const, label: t("sheetsWebhook.tabOutbound") },
    { id: "in" as const, label: t("sheetsWebhook.tabInbound") },
    { id: "sheets" as const, label: t("sheetsWebhook.tabSheets") },
  ];

  return (
    <div className="space-y-4">
      {!embedded && (
        <div>
          <h1 className="text-xl font-bold text-foreground">{t("sheetsWebhook.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("sheetsWebhook.subtitle")}</p>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {tabs.map((tb) => (
          <Button
            key={tb.id}
            variant={tab === tb.id ? "default" : "outline"}
            size="sm"
            onClick={() => setTab(tb.id)}
          >
            {tb.label}
          </Button>
        ))}
      </div>

      {fullSecret && (
        <Card className="border-amber-500/50 bg-amber-50 dark:bg-amber-950/30">
          <CardContent className="p-4 space-y-2 text-sm">
            <p className="font-medium">{t("sheetsWebhook.secretSavedOnce")}</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 break-all rounded bg-background px-2 py-1 text-xs">{fullSecret.secret}</code>
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  if (await copyText(fullSecret.secret)) toast.success(t("sheetsWebhook.copied"));
                }}
              >
                <Copy className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setFullSecret(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {t("sheetsWebhook.hookUrlLabel")}: <code className="break-all">{window.location.origin}{fullSecret.hookPath}</code>
            </p>
          </CardContent>
        </Card>
      )}

      {/* ── Webhook keluar ── */}
      {tab === "out" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">{t("sheetsWebhook.outDesc")}</p>
            <Button size="sm" onClick={() => setShowCreateHook(!showCreateHook)}>
              <Plus className="h-4 w-4 mr-1" /> {t("sheetsWebhook.createBtn")}
            </Button>
          </div>

          {showCreateHook && (
            <Card>
              <CardContent className="p-4 space-y-3">
                <div>
                  <label className="text-xs font-medium">{t("sheetsWebhook.urlLabel")}</label>
                  <Input value={newUrl} onChange={(e) => setNewUrl(e.target.value)} placeholder={t("sheetsWebhook.urlPlaceholder")} />
                </div>
                <div>
                  <label className="text-xs font-medium">{t("sheetsWebhook.secretLabel")}</label>
                  <Input value={newSecret} onChange={(e) => setNewSecret(e.target.value)} placeholder={t("sheetsWebhook.secretPlaceholder")} />
                  <p className="text-xs text-muted-foreground mt-1">{t("sheetsWebhook.secretHint")}</p>
                </div>
                <div>
                  <label className="text-xs font-medium">{t("sheetsWebhook.deviceLabel")}</label>
                  <Dropdown
                    value={newDevice}
                    onChange={setNewDevice}
                    ariaLabel={t("sheetsWebhook.deviceLabel")}
                    options={[{ value: "all", label: t("sheetsWebhook.deviceAll") }, ...devices.map((d) => ({ value: String(d.id), label: d.name }))]}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium">{t("sheetsWebhook.eventsLabel")}</label>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {OUT_EVENTS.map((ev) => (
                      <label key={ev} className="flex items-center gap-1 text-xs border rounded-full px-2 py-1 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={newEvents.includes(ev)}
                          onChange={() =>
                            setNewEvents(newEvents.includes(ev) ? newEvents.filter((x) => x !== ev) : [...newEvents, ev])
                          }
                        />
                        {ev}
                      </label>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{t("sheetsWebhook.eventsAll")}</p>
                </div>
                <Button size="sm" onClick={createHook} disabled={creatingHook || !newUrl.trim()}>
                  {creatingHook ? t("sheetsWebhook.creating") : t("sheetsWebhook.createBtn")}
                </Button>
              </CardContent>
            </Card>
          )}

          {loadingHooks ? (
            <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">{t("sheetsWebhook.loading")}</CardContent></Card>
          ) : hooks.length === 0 ? (
            <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">{t("sheetsWebhook.outEmpty")}</CardContent></Card>
          ) : (
            hooks.map((h) => (
              <Card key={h.id}>
                <CardContent className="p-4 space-y-2">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium break-all">{h.url}</p>
                      <p className="text-xs text-muted-foreground">
                        {t("sheetsWebhook.deviceLabel")}: {deviceName(h.deviceId)} · {t("sheetsWebhook.colTriggers")}: {h.triggerCount}
                        {h.lastTriggered ? ` · ${fmtTime(h.lastTriggered)}` : ""}
                      </p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {(parseEvents(h.events).length ? parseEvents(h.events) : [t("sheetsWebhook.eventsAllShort")]).map((ev) => (
                          <Badge key={ev} variant="secondary">{ev}</Badge>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Toggle checked={h.isActive} onToggle={() => toggleHook(h)} label={t("sheetsWebhook.active")} />
                      <Button size="sm" variant="outline" onClick={() => testHook(h)} disabled={testingId === h.id}>
                        <FlaskConical className="h-4 w-4 mr-1" /> {testingId === h.id ? t("sheetsWebhook.testing") : t("sheetsWebhook.testBtn")}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => toggleDeliveries(h)}>
                        <ScrollText className="h-4 w-4 mr-1" /> {t("sheetsWebhook.deliveriesTitle")}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => deleteHook(h)} aria-label={t("sheetsWebhook.delete")}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  {openDeliveries === h.id && (
                    <div className="border-t pt-2">
                      {deliveries.length === 0 ? (
                        <p className="text-xs text-muted-foreground">{t("sheetsWebhook.deliveriesEmpty")}</p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full min-w-[560px] text-xs">
                            <thead>
                              <tr className="border-b text-left text-muted-foreground">
                                <th className="py-1 px-2">{t("sheetsWebhook.colTime")}</th>
                                <th className="py-1 px-2">{t("sheetsWebhook.colEvent")}</th>
                                <th className="py-1 px-2">{t("sheetsWebhook.colHttp")}</th>
                                <th className="py-1 px-2">{t("sheetsWebhook.colResult")}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {deliveries.map((d) => (
                                <tr key={d.id} className="border-b">
                                  <td className="py-1 px-2">{fmtTime(d.createdAt)}</td>
                                  <td className="py-1 px-2">{d.event}</td>
                                  <td className="py-1 px-2">{d.statusCode || "—"}</td>
                                  <td className="py-1 px-2">
                                    <Badge variant={d.success ? "default" : "destructive"}>
                                      {d.success ? t("sheetsWebhook.success") : `${t("sheetsWebhook.failed")} ${d.errorMsg || ""}`}
                                    </Badge>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {/* ── Webhook masuk ── */}
      {tab === "in" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">{t("sheetsWebhook.inDesc")}</p>
            <Button size="sm" onClick={() => setShowCreateIn(!showCreateIn)}>
              <Plus className="h-4 w-4 mr-1" /> {t("sheetsWebhook.createBtn")}
            </Button>
          </div>

          {showCreateIn && (
            <Card>
              <CardContent className="p-4 space-y-3">
                <div>
                  <label className="text-xs font-medium">{t("sheetsWebhook.nameLabel")}</label>
                  <Input value={inName} onChange={(e) => setInName(e.target.value)} placeholder={t("sheetsWebhook.namePlaceholder")} />
                </div>
                <div>
                  <label className="text-xs font-medium">{t("sheetsWebhook.deviceLabel")}</label>
                  <Dropdown
                    value={inDevice}
                    onChange={setInDevice}
                    ariaLabel={t("sheetsWebhook.deviceLabel")}
                    placeholder={t("sheetsWebhook.deviceRequired")}
                    options={devices.map((d) => ({ value: String(d.id), label: `${d.name} (${d.status})` }))}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium">{t("sheetsWebhook.templateLabel")}</label>
                  <Input value={inTemplate} onChange={(e) => setInTemplate(e.target.value)} placeholder={t("sheetsWebhook.templatePlaceholder")} />
                  <p className="text-xs text-muted-foreground mt-1">{t("sheetsWebhook.templateHint")}</p>
                </div>
                <Button size="sm" onClick={createInbound} disabled={creatingIn || !inName.trim() || !inDevice}>
                  {creatingIn ? t("sheetsWebhook.creating") : t("sheetsWebhook.createBtn")}
                </Button>
              </CardContent>
            </Card>
          )}

          {loadingIn ? (
            <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">{t("sheetsWebhook.loading")}</CardContent></Card>
          ) : inbounds.length === 0 ? (
            <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">{t("sheetsWebhook.inEmpty")}</CardContent></Card>
          ) : (
            inbounds.map((ib) => (
              <Card key={ib.id}>
                <CardContent className="p-4 space-y-2">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{ib.name}</p>
                      <p className="text-xs text-muted-foreground break-all">
                        {t("sheetsWebhook.hookUrlLabel")}: {hookUrl(ib)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {t("sheetsWebhook.deviceLabel")}: {ib.deviceName ?? deviceName(ib.deviceId)} · {t("sheetsWebhook.secretLabel")}: {ib.secretMasked}
                      </p>
                      {ib.template && <p className="text-xs text-muted-foreground break-all">{t("sheetsWebhook.templateLabel")}: {ib.template}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      <Toggle
                        checked={ib.isActive}
                        onToggle={async () => {
                          try {
                            await apiPut(`/inbound-webhooks/${ib.id}`, { isActive: !ib.isActive });
                            loadInbounds();
                          } catch (e: any) {
                            toast.error(e.message || t("sheetsWebhook.saveFail"));
                          }
                        }}
                        label={t("sheetsWebhook.active")}
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          if (await copyText(hookUrl(ib))) toast.success(t("sheetsWebhook.copied"));
                        }}
                      >
                        <Copy className="h-4 w-4 mr-1" /> {t("sheetsWebhook.copyUrl")}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => regenerateInbound(ib)}>
                        <RefreshCw className="h-4 w-4 mr-1" /> {t("sheetsWebhook.regenerateBtn")}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setEditingIn(ib)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => toggleLogs(ib)}>
                        <ScrollText className="h-4 w-4 mr-1" /> {t("sheetsWebhook.logsTitle")}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => deleteInbound(ib)} aria-label={t("sheetsWebhook.delete")}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {editingIn?.id === ib.id && (
                    <div className="border-t pt-3 space-y-3">
                      <div>
                        <label className="text-xs font-medium">{t("sheetsWebhook.nameLabel")}</label>
                        <Input value={editingIn.name} onChange={(e) => setEditingIn({ ...editingIn, name: e.target.value })} />
                      </div>
                      <div>
                        <label className="text-xs font-medium">{t("sheetsWebhook.deviceLabel")}</label>
                        <Dropdown
                          value={String(editingIn.deviceId)}
                          onChange={(v) => setEditingIn({ ...editingIn, deviceId: Number(v) })}
                          ariaLabel={t("sheetsWebhook.deviceLabel")}
                          options={devices.map((d) => ({ value: String(d.id), label: `${d.name} (${d.status})` }))}
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium">{t("sheetsWebhook.templateLabel")}</label>
                        <Input value={editingIn.template} onChange={(e) => setEditingIn({ ...editingIn, template: e.target.value })} placeholder={t("sheetsWebhook.templatePlaceholder")} />
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={saveInboundEdit}>{t("sheetsWebhook.save")}</Button>
                        <Button size="sm" variant="outline" onClick={() => setEditingIn(null)}>{t("sheetsWebhook.cancel")}</Button>
                      </div>
                    </div>
                  )}

                  {openLogs === ib.id && (
                    <div className="border-t pt-2">
                      {inLogs.length === 0 ? (
                        <p className="text-xs text-muted-foreground">{t("sheetsWebhook.logsEmpty")}</p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full min-w-[560px] text-xs">
                            <thead>
                              <tr className="border-b text-left text-muted-foreground">
                                <th className="py-1 px-2">{t("sheetsWebhook.colTime")}</th>
                                <th className="py-1 px-2">{t("sheetsWebhook.colTo")}</th>
                                <th className="py-1 px-2">{t("sheetsWebhook.colResult")}</th>
                                <th className="py-1 px-2">{t("sheetsWebhook.colSummary")}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {inLogs.map((l) => (
                                <tr key={l.id} className="border-b align-top">
                                  <td className="py-1 px-2 whitespace-nowrap">{fmtTime(l.createdAt)}</td>
                                  <td className="py-1 px-2">{l.to || "—"}</td>
                                  <td className="py-1 px-2">
                                    <Badge variant={l.status === "sent" ? "default" : "destructive"}>
                                      {l.status === "sent" ? t("sheetsWebhook.success") : `${t("sheetsWebhook.failed")} ${l.errorMsg || ""}`}
                                    </Badge>
                                  </td>
                                  <td className="py-1 px-2 break-all">{l.payloadSummary}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                      <p className="text-xs text-muted-foreground mt-2">{t("sheetsWebhook.exampleHint")}</p>
                      <pre className="mt-1 overflow-x-auto rounded bg-muted p-2 text-[11px]">{`curl -X POST ${hookUrl(ib)} \\
  -H 'Content-Type: application/json' \\
  -H 'X-Webhook-Secret: <secret>' \\
  -d '{"to":"62812xxxxxxx","message":"Halo dari sistem luar"}'`}</pre>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {/* ── Google Sheets ── */}
      {tab === "sheets" && (
        <div className="space-y-4">
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Table2 className="h-5 w-5" />
                <h2 className="font-medium">{t("sheetsWebhook.shTitle")}</h2>
                {conn.configured && <Badge>{t("sheetsWebhook.shConfigured")}</Badge>}
                {conn.configured && conn.serviceAccountEmail && (
                  <span className="text-xs text-muted-foreground">{conn.serviceAccountEmail}</span>
                )}
              </div>
              <p className="text-sm text-muted-foreground">{t("sheetsWebhook.shDesc")}</p>
              {loadingConn ? (
                <p className="text-sm text-muted-foreground">{t("sheetsWebhook.loading")}</p>
              ) : (
                <>
                  <div>
                    <label className="text-xs font-medium">{t("sheetsWebhook.shSpreadsheetLabel")}</label>
                    <Input value={sheetId} onChange={(e) => setSheetId(e.target.value)} placeholder={t("sheetsWebhook.shSpreadsheetPlaceholder")} />
                  </div>
                  <div>
                    <label className="text-xs font-medium">{t("sheetsWebhook.shSaLabel")}</label>
                    <textarea
                      value={saJson}
                      onChange={(e) => setSaJson(e.target.value)}
                      placeholder={t("sheetsWebhook.shSaPlaceholder")}
                      rows={4}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono"
                    />
                    <p className="text-xs text-muted-foreground mt-1">{t("sheetsWebhook.shSaHint")}</p>
                    <p className="text-xs text-muted-foreground">{t("sheetsWebhook.shSaHint2")}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={saveConn} disabled={savingConn || !sheetId.trim()}>
                      {savingConn ? t("sheetsWebhook.shSaving") : t("sheetsWebhook.save")}
                    </Button>
                    <Button size="sm" variant="outline" onClick={testConn} disabled={testingConn || !conn.configured}>
                      <FlaskConical className="h-4 w-4 mr-1" /> {testingConn ? t("sheetsWebhook.shTesting") : t("sheetsWebhook.shTest")}
                    </Button>
                    {conn.configured && (
                      <Button size="sm" variant="ghost" onClick={deleteConn}>
                        <Trash2 className="h-4 w-4 mr-1" /> {t("sheetsWebhook.shDelete")}
                      </Button>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Send className="h-5 w-5" />
                <h2 className="font-medium">{t("sheetsWebhook.syncTitle")}</h2>
              </div>
              <p className="text-sm text-muted-foreground">{t("sheetsWebhook.syncDesc")}</p>
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <label className="text-xs font-medium">{t("sheetsWebhook.kindLabel")}</label>
                  <Dropdown
                    value={syncKind}
                    onChange={(v) => { setSyncKind(v); if (v === "orders") setSyncDir("export"); }}
                    ariaLabel={t("sheetsWebhook.kindLabel")}
                    options={[
                      { value: "contacts", label: t("sheetsWebhook.kindContacts") },
                      { value: "orders", label: t("sheetsWebhook.kindOrders") },
                    ]}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium">{t("sheetsWebhook.directionLabel")}</label>
                  <Dropdown
                    value={syncDir}
                    onChange={setSyncDir}
                    ariaLabel={t("sheetsWebhook.directionLabel")}
                    options={[
                      { value: "export", label: t("sheetsWebhook.dirExport") },
                      ...(syncKind === "orders" ? [] : [{ value: "import", label: t("sheetsWebhook.dirImport") }]),
                    ]}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium">{t("sheetsWebhook.sheetLabel")}</label>
                  <Input value={sheetName} onChange={(e) => setSheetName(e.target.value)} placeholder={syncKind === "contacts" ? "Kontak" : "Order"} />
                </div>
              </div>
              <Button size="sm" onClick={runSync} disabled={syncing || !conn.configured}>
                {syncDir === "export" ? <ArrowUpFromLine className="h-4 w-4 mr-1" /> : <ArrowDownToLine className="h-4 w-4 mr-1" />}
                {syncing ? t("sheetsWebhook.running") : t("sheetsWebhook.runBtn")}
              </Button>
              {!conn.configured && (
                <p className="text-xs text-muted-foreground">{t("sheetsWebhook.shNotConfigured")}</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <Webhook className="h-5 w-5" />
                <h2 className="font-medium">{t("sheetsWebhook.syncHistory")}</h2>
              </div>
              {syncs.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("sheetsWebhook.syncEmpty")}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="py-2 px-2 text-[11px] uppercase">{t("sheetsWebhook.syncColTime")}</th>
                        <th className="py-2 px-2 text-[11px] uppercase">{t("sheetsWebhook.syncColKind")}</th>
                        <th className="py-2 px-2 text-[11px] uppercase">{t("sheetsWebhook.syncColDir")}</th>
                        <th className="py-2 px-2 text-[11px] uppercase">{t("sheetsWebhook.syncColStatus")}</th>
                        <th className="py-2 px-2 text-[11px] uppercase">{t("sheetsWebhook.syncColRows")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {syncs.map((s) => (
                        <tr key={s.id} className="border-b align-top">
                          <td className="py-2 px-2 whitespace-nowrap text-xs">{fmtTime(s.createdAt)}</td>
                          <td className="py-2 px-2 text-xs">{s.kind} · {s.sheetName}</td>
                          <td className="py-2 px-2 text-xs">{s.direction}</td>
                          <td className="py-2 px-2">
                            <Badge variant={s.status === "success" ? "default" : s.status === "running" ? "secondary" : "destructive"}>
                              {s.status === "success" ? t("sheetsWebhook.statusSuccess") : s.status === "running" ? t("sheetsWebhook.statusRunning") : t("sheetsWebhook.statusFailed")}
                            </Badge>
                            {s.errorMsg && <p className="text-xs text-destructive mt-1 break-all">{s.errorMsg}</p>}
                          </td>
                          <td className="py-2 px-2 text-xs">{s.rowsOk}/{s.rowsTotal}{s.rowsFailed ? ` (${t("sheetsWebhook.failed")}: ${s.rowsFailed})` : ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

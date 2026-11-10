import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  PlugZap,
  Plus,
  Copy,
  RefreshCw,
  Trash2,
  Pencil,
  ScrollText,
  Search,
  X,
  Check,
  BookOpen,
  Unplug,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dropdown } from "@/components/ui/dropdown";
import { Toggle } from "@/components/Toggle";
import { apiGet, apiPost, apiPut, apiDelete } from "@/lib/api";
import { useLang } from "@/lib/i18n";
import {
  PLATFORMS,
  getPlatform,
  platformLogoUrl,
  INBOX_PLACEHOLDER,
  type PlatformGuide,
} from "@/lib/integration-platforms";
import { cn } from "@/lib/utils";

// ── Ikon platform: logo asli, fallback ke tile inisial ───────────────────

function PlatformIcon({ slug, size = "w-9 h-9" }: { slug: string; size?: string }) {
  const p = getPlatform(slug);
  const url = platformLogoUrl(p);
  const [failed, setFailed] = useState(false);
  if (url && !failed) {
    return (
      <img
        src={url}
        alt={p?.name ?? slug}
        onError={() => setFailed(true)}
        className={cn(
          size,
          "rounded-lg object-contain bg-white border border-border p-1 shrink-0"
        )}
      />
    );
  }
  return (
    <span
      className={cn(
        size,
        "rounded-lg text-white text-xs font-bold flex items-center justify-center shrink-0",
        p?.tile ?? "bg-[#243370]"
      )}
    >
      {p?.initials ?? slug.slice(0, 2).toUpperCase()}
    </span>
  );
}

// ── Tipe ────────────────────────────────────────────────────────────────

interface Integration {
  id: number;
  name: string;
  platform: string;
  deviceId: number;
  template: string;
  isActive: boolean;
  createdAt: string;
  tokenMasked: string;
  deviceName?: string;
}

interface Device {
  id: number;
  name: string;
  status: string;
}

interface IntLog {
  id: number;
  createdAt: string;
  status: string;
  to: string;
  payloadSummary: string;
  errorMsg?: string;
}

// ── Util ────────────────────────────────────────────────────────────────

function fmtTime(s: string) {
  try {
    return new Date(s).toLocaleString("id-ID", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
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

function inboxUrl(token: string) {
  return `${window.location.origin}/api/integrations/inbox/${token}`;
}

function platformName(slug: string) {
  return getPlatform(slug)?.name ?? slug;
}

// ── Modal generik ───────────────────────────────────────────────────────

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
        className={cn(
          "relative bg-card text-card-foreground border border-border rounded-xl w-full max-h-[90vh] overflow-y-auto shadow-xl",
          wide ? "max-w-3xl" : "max-w-lg"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-border sticky top-0 bg-card rounded-t-xl z-10">
          <h3 className="font-semibold">{title}</h3>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose} aria-label={t("integrations.close")}>
            <X className="w-4 h-4" />
          </Button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

function CodeBlock({ title, code }: { title: string; code: string }) {
  const { t } = useLang();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if (await copyText(code)) {
      toast.success(t("integrations.codeCopied"));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } else {
      toast.error(t("integrations.copyFailed"));
    }
  };
  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-secondary/60 border-b border-border">
        <p className="text-xs font-semibold">{title}</p>
        <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={copy}>
          {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
          {copied ? t("integrations.copied") : t("integrations.copy")}
        </Button>
      </div>
      <pre className="p-3 text-[11px] font-mono overflow-x-auto whitespace-pre bg-card max-h-72 overflow-y-auto">
        {code}
      </pre>
    </div>
  );
}

// ── Panduan platform ────────────────────────────────────────────────────

function GuideView({ guide, inbox }: { guide: PlatformGuide; inbox?: string }) {
  const { t } = useLang();
  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-sm font-semibold mb-2">{t("integrations.setupSteps")}</h4>
        <ol className="space-y-2">
          {guide.steps.map((s, i) => (
            <li key={i} className="flex gap-2 text-sm">
              <span className="shrink-0 w-5 h-5 rounded-full bg-[#243370] text-white text-[11px] flex items-center justify-center font-semibold">
                {i + 1}
              </span>
              <span className="text-muted-foreground">
                {inbox ? s.split(INBOX_PLACEHOLDER).join(inbox) : s}
              </span>
            </li>
          ))}
        </ol>
      </div>
      <div>
        <h4 className="text-sm font-semibold mb-2">{t("integrations.payloadExample")}</h4>
        <CodeBlock title="payload.json" code={guide.payloadExample} />
      </div>
      {guide.codes?.map((c, i) => (
        <CodeBlock
          key={i}
          title={c.title}
          code={inbox ? c.code.split(INBOX_PLACEHOLDER).join(inbox) : c.code}
        />
      ))}
      <p className="text-xs text-muted-foreground">
        {t("integrations.guideFormat1")} <code className="font-mono">"to"</code>{" "}
        {t("integrations.guideFormat2")} <code className="font-mono">"message"</code>{" "}
        {t("integrations.guideFormat3")} <code className="font-mono">{"{{path.ke.field}}"}</code>.
      </p>
    </div>
  );
}

// ── Halaman utama ───────────────────────────────────────────────────────

interface CreatedResult {
  integration: Integration;
  fullToken: string;
  inboxPath: string;
  tokenWarning: string;
}

export default function Integrations({ embedded = false }: { embedded?: boolean }) {
  const { t } = useLang();
  const [items, setItems] = useState<Integration[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);

  const [createFor, setCreateFor] = useState<string | null>(null); // slug platform | "__custom__"
  const [guideFor, setGuideFor] = useState<PlatformGuide | null>(null);
  const [editItem, setEditItem] = useState<Integration | null>(null);
  const [logsFor, setLogsFor] = useState<Integration | null>(null);
  const [created, setCreated] = useState<CreatedResult | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Integration | null>(null);
  const [confirmRegen, setConfirmRegen] = useState<Integration | null>(null);
  const [catalogQuery, setCatalogQuery] = useState("");

  const connectedSlugs = new Set(items.filter((it) => it.isActive).map((it) => it.platform));
  const filteredPlatforms = PLATFORMS.filter((p) =>
    p.name.toLowerCase().includes(catalogQuery.trim().toLowerCase())
  );

  const load = async () => {
    setLoading(true);
    try {
      const [r, d] = await Promise.all([
        apiGet<{ integrations: Integration[] }>("/integrations"),
        apiGet<{ devices: Device[] }>("/devices").catch(() => ({ devices: [] as Device[] })),
      ]);
      setItems(r.integrations ?? []);
      setDevices(d.devices ?? []);
    } catch (e: any) {
      toast.error(e.message || t("integrations.loadError"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const copyInboxUrl = async (id: number) => {
    try {
      const r = await apiGet<{ fullToken: string }>(`/integrations/${id}`);
      if (await copyText(inboxUrl(r.fullToken))) {
        toast.success(t("integrations.urlInboxCopied"));
      } else {
        toast.error(t("integrations.copyFailed"));
      }
    } catch (e: any) {
      toast.error(e.message || t("integrations.fetchUrlError"));
    }
  };

  const toggleActive = async (it: Integration) => {
    try {
      await apiPut(`/integrations/${it.id}`, { isActive: !it.isActive });
      toast.success(it.isActive ? t("integrations.integrationDisabled") : t("integrations.integrationEnabled"));
      load();
    } catch (e: any) {
      toast.error(e.message || t("integrations.toggleError"));
    }
  };

  const doDelete = async () => {
    if (!confirmDelete) return;
    try {
      await apiDelete(`/integrations/${confirmDelete.id}`);
      toast.success(t("integrations.integrationDeleted"));
      setConfirmDelete(null);
      load();
    } catch (e: any) {
      toast.error(e.message || t("integrations.deleteError"));
    }
  };

  const doRegen = async () => {
    if (!confirmRegen) return;
    try {
      const r = await apiPost<CreatedResult>(`/integrations/${confirmRegen.id}/regenerate`);
      setConfirmRegen(null);
      setCreated({
        integration: items.find((x) => x.id === confirmRegen.id) ?? ({} as Integration),
        fullToken: r.fullToken,
        inboxPath: r.inboxPath,
        tokenWarning: r.tokenWarning,
      });
      load();
    } catch (e: any) {
      toast.error(e.message || t("integrations.regenError"));
    }
  };

  return (
    <div className="space-y-6">
      {!embedded && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              <PlugZap className="w-5 h-5 text-[#243370] dark:text-white" /> {t("integrations.title")}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t("integrations.subtitle")}
            </p>
          </div>
          <Button onClick={() => setCreateFor("__custom__")} className="gap-1">
            <Plus className="w-4 h-4" /> {t("integrations.addIntegration")}
          </Button>
        </div>
      )}
      {embedded && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            {t("integrations.embeddedSubtitle")}
          </p>
          <Button onClick={() => setCreateFor("__custom__")} className="gap-1" size="sm">
            <Plus className="w-4 h-4" /> {t("integrations.addIntegration")}
          </Button>
        </div>
      )}

      {/* ── Integrasi saya ── */}
      <section>
        <h2 className="text-sm font-semibold mb-3">{t("integrations.myIntegrations").replace("{count}", String(items.length))}</h2>
        {loading ? (
          <Card>
            <CardContent className="p-8 text-center text-sm text-muted-foreground">{t("integrations.loading")}</CardContent>
          </Card>
        ) : items.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              {t("integrations.emptyText1")}{" "}
              <span className="font-semibold text-foreground">{t("integrations.connectAction")}</span>
              {t("integrations.emptyText2")}
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((it) => {
              return (
                <Card key={it.id} className={!it.isActive ? "opacity-70" : ""}>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <PlatformIcon slug={it.platform} />
                        <div className="min-w-0">
                          <p className="font-semibold text-sm truncate">{it.name}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {platformName(it.platform)}
                            {it.deviceName ? ` • ${it.deviceName}` : ""}
                          </p>
                        </div>
                      </div>
                      <Badge variant={it.isActive ? "success" : "secondary"}>
                        {it.isActive ? t("integrations.active") : t("integrations.inactive")}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 min-w-0 truncate text-xs font-mono bg-secondary/60 rounded px-2 py-1.5">
                        {it.tokenMasked}
                      </code>
                      <Button
                        variant="outline"
                        size="sm"
                        className="shrink-0 gap-1"
                        onClick={() => copyInboxUrl(it.id)}
                      >
                        <Copy className="w-3 h-3" /> {t("integrations.urlInbox")}
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <Button variant="ghost" size="sm" className="h-8 gap-1 text-xs" onClick={() => setLogsFor(it)}>
                        <ScrollText className="w-3.5 h-3.5" /> {t("integrations.log")}
                      </Button>
                      <Button variant="ghost" size="sm" className="h-8 gap-1 text-xs" onClick={() => setEditItem(it)}>
                        <Pencil className="w-3.5 h-3.5" /> {t("integrations.edit")}
                      </Button>
                      <Button variant="ghost" size="sm" className="h-8 gap-1 text-xs" onClick={() => setConfirmRegen(it)}>
                        <RefreshCw className="w-3.5 h-3.5" /> {t("integrations.token")}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 gap-1 text-xs"
                        onClick={() => toggleActive(it)}
                      >
                        <Unplug className="w-3.5 h-3.5" /> {it.isActive ? t("integrations.deactivate") : t("integrations.activate")}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 gap-1 text-xs text-red-600 dark:text-red-400"
                        onClick={() => setConfirmDelete(it)}
                      >
                        <Trash2 className="w-3.5 h-3.5" /> {t("integrations.delete")}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Katalog platform ── */}
      <section>
        <div className="flex items-center justify-between gap-3 mb-1">
          <h2 className="text-sm font-semibold">{t("integrations.catalogTitle")}</h2>
          <div className="relative w-44 sm:w-56">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <Input
              value={catalogQuery}
              onChange={(e) => setCatalogQuery(e.target.value)}
              placeholder={t("integrations.searchPlaceholder")}
              className="h-8 pl-8 text-xs"
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          {t("integrations.catalogHint")}
        </p>
        {filteredPlatforms.length === 0 ? (
          <p className="text-xs text-muted-foreground py-6 text-center">
            {t("integrations.noPlatformMatch").replace("{query}", catalogQuery)}
          </p>
        ) : (
        <div className="grid gap-3 grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
          {filteredPlatforms.map((p) => {
            const connected = connectedSlugs.has(p.slug);
            return (
            <Card key={p.slug} className="hover:border-[#243370]/50 transition-colors">
              <CardContent className="p-4 flex flex-col gap-2 h-full">
                <div className="flex items-center gap-2">
                  <PlatformIcon slug={p.slug} />
                  <p className="font-semibold text-sm leading-tight flex-1">{p.name}</p>
                  {connected && (
                    <Badge variant="success" className="text-[10px] shrink-0">
                      <Check className="w-3 h-3 mr-0.5" /> {t("integrations.connected")}
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground flex-1">{p.desc}</p>
                <div className="flex gap-1.5">
                  <Button size="sm" className="flex-1 h-8 text-xs" onClick={() => setCreateFor(p.slug)}>
                    {t("integrations.connect")}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 px-2"
                    aria-label={t("integrations.guideAria").replace("{name}", p.name)}
                    onClick={() => setGuideFor(p)}
                  >
                    <BookOpen className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
            );
          })}
        </div>
        )}
      </section>

      {/* ── Modal buat ── */}
      {createFor && (
        <CreateModal
          platformSlug={createFor === "__custom__" ? undefined : createFor}
          devices={devices}
          onClose={() => setCreateFor(null)}
          onCreated={(r) => {
            setCreateFor(null);
            setCreated(r);
            load();
          }}
        />
      )}

      {/* ── Modal panduan ── */}
      {guideFor && (
        <Modal title={t("integrations.guideTitle").replace("{name}", guideFor.name)} onClose={() => setGuideFor(null)} wide>
          <GuideView guide={guideFor} />
        </Modal>
      )}

      {/* ── Modal sukses (token + panduan) ── */}
      {created && (
        <Modal
          title={t("integrations.createdTitle")}
          onClose={() => setCreated(null)}
          wide
        >
          <div className="space-y-4">
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
              {created.tokenWarning}
            </div>
            <div>
              <p className="text-xs font-semibold mb-1">{t("integrations.inboxUrlLabel")}</p>
              <div className="flex gap-2">
                <code className="flex-1 min-w-0 break-all text-xs font-mono bg-secondary/60 rounded px-2 py-2">
                  {inboxUrl(created.fullToken)}
                </code>
                <Button size="sm" variant="outline" onClick={async () => { if (await copyText(inboxUrl(created.fullToken))) toast.success(t("integrations.urlInboxCopied")); else toast.error(t("integrations.copyFailed")); }}>
                  <Copy className="w-3 h-3" />
                </Button>
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold mb-1">{t("integrations.tokenLabel")}</p>
              <div className="flex gap-2">
                <code className="flex-1 min-w-0 break-all text-xs font-mono bg-secondary/60 rounded px-2 py-2">
                  {created.fullToken}
                </code>
                <Button size="sm" variant="outline" onClick={async () => { if (await copyText(created.fullToken)) toast.success(t("integrations.tokenCopied")); else toast.error(t("integrations.copyFailed")); }}>
                  <Copy className="w-3 h-3" />
                </Button>
              </div>
            </div>
            {(() => {
              const g = getPlatform(created.integration.platform);
              return g ? (
                <div className="border-t border-border pt-4">
                  <h4 className="text-sm font-semibold mb-3">{t("integrations.guideSetupTitle").replace("{name}", g.name)}</h4>
                  <GuideView guide={g} inbox={inboxUrl(created.fullToken)} />
                </div>
              ) : null;
            })()}
            <Button className="w-full" onClick={() => setCreated(null)}>
              {t("integrations.done")}
            </Button>
          </div>
        </Modal>
      )}

      {/* ── Modal edit ── */}
      {editItem && (
        <EditModal
          item={editItem}
          devices={devices}
          onClose={() => setEditItem(null)}
          onSaved={() => {
            setEditItem(null);
            load();
          }}
        />
      )}

      {/* ── Modal log ── */}
      {logsFor && (
        <LogsModal item={logsFor} onClose={() => setLogsFor(null)} />
      )}

      {/* ── Konfirmasi hapus ── */}
      {confirmDelete && (
        <Modal title={t("integrations.deleteTitle")} onClose={() => setConfirmDelete(null)}>
          <p className="text-sm text-muted-foreground mb-4">
            {t("integrations.deleteConfirm").replace("{name}", confirmDelete.name)}
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>{t("integrations.cancel")}</Button>
            <Button variant="destructive" onClick={doDelete}>{t("integrations.delete")}</Button>
          </div>
        </Modal>
      )}

      {/* ── Konfirmasi regenerate ── */}
      {confirmRegen && (
        <Modal title={t("integrations.regenTitle")} onClose={() => setConfirmRegen(null)}>
          <p className="text-sm text-muted-foreground mb-4">
            {t("integrations.regenConfirm").replace("{name}", confirmRegen.name)}
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirmRegen(null)}>{t("integrations.cancel")}</Button>
            <Button onClick={doRegen}>{t("integrations.regenButton")}</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── Modal buat integrasi ────────────────────────────────────────────────

function CreateModal({
  platformSlug,
  devices,
  onClose,
  onCreated,
}: {
  platformSlug?: string;
  devices: Device[];
  onClose: () => void;
  onCreated: (r: CreatedResult) => void;
}) {
  const { t } = useLang();
  const [name, setName] = useState(
    platformSlug ? `${platformName(platformSlug)}` : ""
  );
  const [platform, setPlatform] = useState(platformSlug ?? PLATFORMS[0].slug);
  const [deviceId, setDeviceId] = useState(devices[0]?.id.toString() ?? "");
  const [template, setTemplate] = useState("");
  const [saving, setSaving] = useState(false);

  const guide = getPlatform(platform);

  const submit = async () => {
    if (!name.trim()) return toast.error(t("integrations.nameRequired"));
    if (!deviceId) return toast.error(t("integrations.deviceRequired"));
    setSaving(true);
    try {
      const r = await apiPost<CreatedResult>("/integrations", {
        name: name.trim(),
        platform,
        deviceId: Number(deviceId),
        template,
      });
      toast.success(t("integrations.created"));
      onCreated(r);
    } catch (e: any) {
      toast.error(e.message || t("integrations.createError"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={platformSlug ? t("integrations.connectTitle").replace("{name}", platformName(platformSlug)) : t("integrations.addIntegration")} onClose={onClose} wide>
      <div className="space-y-4">
        {!platformSlug && (
          <div>
            <label className="text-xs font-semibold mb-1 block">{t("integrations.platformLabel")}</label>
            <Dropdown
              value={platform}
              onChange={(v) => {
                setPlatform(v);
                setName(platformName(v));
              }}
              ariaLabel={t("integrations.platformLabel")}
              options={PLATFORMS.map((p) => ({ value: p.slug, label: p.name }))}
            />
          </div>
        )}
        <div>
          <label className="text-xs font-semibold mb-1 block">{t("integrations.integrationName")}</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="cth. Notif Order Toko" />
        </div>
        <div>
          <label className="text-xs font-semibold mb-1 block">{t("integrations.senderDevice")}</label>
          <Dropdown
            value={deviceId}
            onChange={setDeviceId}
            ariaLabel={t("integrations.senderDevice")}
            placeholder={devices.length ? t("integrations.selectDevice") : t("integrations.noDevices")}
            options={devices.map((d) => ({
              value: d.id.toString(),
              label: `${d.name}${d.status === "connected" ? t("integrations.deviceConnectedSuffix") : ` (${d.status})`}`,
            }))}
          />
        </div>
        <div>
          <label className="text-xs font-semibold mb-1 block">
            {t("integrations.messageTemplate")} <span className="font-normal text-muted-foreground">({t("integrations.optional")})</span>
          </label>
          <textarea
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#243370]/40"
            placeholder='cth. Order baru #{{order.id}} dari {{order.customer}} (Rp{{order.total}})'
          />
          <p className="text-xs text-muted-foreground mt-1">
            {t("integrations.templateVarHint1")} <code className="font-mono">{"{{path.ke.field}}"}</code>{" "}
            {t("integrations.templateVarHint2")} <code className="font-mono">"message"</code>{t("integrations.templateVarHint3")}
          </p>
        </div>
        {guide && (
          <details className="rounded-lg border border-border">
            <summary className="cursor-pointer px-3 py-2 text-xs font-semibold">
              {t("integrations.viewGuideFirst").replace("{name}", guide.name)}
            </summary>
            <div className="p-3 pt-0">
              <GuideView guide={guide} />
            </div>
          </details>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>{t("integrations.cancel")}</Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? t("integrations.saving") : t("integrations.createAndShowUrl")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ── Modal edit ──────────────────────────────────────────────────────────

function EditModal({
  item,
  devices,
  onClose,
  onSaved,
}: {
  item: Integration;
  devices: Device[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useLang();
  const [name, setName] = useState(item.name);
  const [deviceId, setDeviceId] = useState(item.deviceId.toString());
  const [template, setTemplate] = useState(item.template ?? "");
  const [isActive, setIsActive] = useState(item.isActive);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!name.trim()) return toast.error(t("integrations.nameRequired"));
    setSaving(true);
    try {
      await apiPut(`/integrations/${item.id}`, {
        name: name.trim(),
        deviceId: Number(deviceId),
        template,
        isActive,
      });
      toast.success(t("integrations.integrationUpdated"));
      onSaved();
    } catch (e: any) {
      toast.error(e.message || t("integrations.saveError"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={t("integrations.editIntegration")} onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="text-xs font-semibold mb-1 block">{t("integrations.nameLabel")}</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="text-xs font-semibold mb-1 block">{t("integrations.senderDevice")}</label>
          <Dropdown
            value={deviceId}
            onChange={setDeviceId}
            ariaLabel={t("integrations.senderDevice")}
            options={devices.map((d) => ({ value: d.id.toString(), label: d.name }))}
          />
        </div>
        <div>
          <label className="text-xs font-semibold mb-1 block">{t("integrations.messageTemplate")}</label>
          <textarea
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#243370]/40"
            placeholder='cth. Order baru #{{order.id}} dari {{order.customer}}'
          />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">{t("integrations.active")}</span>
          <Toggle checked={isActive} onToggle={setIsActive} label={t("integrations.active")} />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>{t("integrations.cancel")}</Button>
          <Button onClick={submit} disabled={saving}>{saving ? t("integrations.saving") : t("integrations.save")}</Button>
        </div>
      </div>
    </Modal>
  );
}

// ── Modal log ───────────────────────────────────────────────────────────

function LogsModal({ item, onClose }: { item: Integration; onClose: () => void }) {
  const { t } = useLang();
  const [logs, setLogs] = useState<IntLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const r = await apiGet<{ logs: IntLog[] }>(`/integrations/${item.id}/logs?limit=50`);
        setLogs(r.logs ?? []);
      } catch (e: any) {
        toast.error(e.message || t("integrations.logsLoadError"));
      } finally {
        setLoading(false);
      }
    })();
  }, [item.id]);

  return (
    <Modal title={t("integrations.logsTitle").replace("{name}", item.name)} onClose={onClose} wide>
      {loading ? (
        <p className="text-sm text-muted-foreground text-center py-8">{t("integrations.loading")}</p>
      ) : logs.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">
          {t("integrations.noLogs")}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="py-2 pr-3 font-medium">{t("integrations.colTime")}</th>
                <th className="py-2 pr-3 font-medium">{t("integrations.colTarget")}</th>
                <th className="py-2 pr-3 font-medium">{t("integrations.colStatus")}</th>
                <th className="py-2 pr-3 font-medium">{t("integrations.colPayload")}</th>
                <th className="py-2 font-medium">{t("integrations.colError")}</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id} className="border-b border-border/60 align-top">
                  <td className="py-2 pr-3 whitespace-nowrap text-xs">{fmtTime(l.createdAt)}</td>
                  <td className="py-2 pr-3 font-mono text-xs">{l.to || "-"}</td>
                  <td className="py-2 pr-3">
                    <Badge variant={l.status === "sent" ? "success" : "destructive"}>
                      {l.status === "sent" ? t("integrations.sent") : t("integrations.failed")}
                    </Badge>
                  </td>
                  <td className="py-2 pr-3 max-w-[280px]">
                    <code className="block truncate text-[11px] font-mono text-muted-foreground" title={l.payloadSummary}>
                      {l.payloadSummary}
                    </code>
                  </td>
                  <td className="py-2 text-xs text-red-600 dark:text-red-400 max-w-[200px] truncate" title={l.errorMsg}>
                    {l.errorMsg || "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}

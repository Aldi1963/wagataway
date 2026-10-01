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

async function copyText(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(label + " disalin");
  } catch {
    toast.error("Gagal menyalin");
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
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose} aria-label="Tutup">
            <X className="w-4 h-4" />
          </Button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

function CodeBlock({ title, code }: { title: string; code: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await copyText(code, "Kode");
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-secondary/60 border-b border-border">
        <p className="text-xs font-semibold">{title}</p>
        <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={copy}>
          {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
          {copied ? "Disalin" : "Salin"}
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
  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-sm font-semibold mb-2">Langkah setup</h4>
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
        <h4 className="text-sm font-semibold mb-2">Contoh payload JSON</h4>
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
        Format umum: kirim POST JSON ke URL inbox berisi <code className="font-mono">"to"</code> (wajib,
        mis. 62812xxxxxxx) dan <code className="font-mono">"message"</code> — atau biarkan template
        integrasi yang merender pesan dari field lain via <code className="font-mono">{"{{path.ke.field}}"}</code>.
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
      toast.error(e.message || "Gagal memuat integrasi");
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
      await copyText(inboxUrl(r.fullToken), "URL inbox");
    } catch (e: any) {
      toast.error(e.message || "Gagal mengambil URL");
    }
  };

  const toggleActive = async (it: Integration) => {
    try {
      await apiPut(`/integrations/${it.id}`, { isActive: !it.isActive });
      toast.success(it.isActive ? "Integrasi dinonaktifkan" : "Integrasi diaktifkan");
      load();
    } catch (e: any) {
      toast.error(e.message || "Gagal mengubah status");
    }
  };

  const doDelete = async () => {
    if (!confirmDelete) return;
    try {
      await apiDelete(`/integrations/${confirmDelete.id}`);
      toast.success("Integrasi dihapus");
      setConfirmDelete(null);
      load();
    } catch (e: any) {
      toast.error(e.message || "Gagal menghapus");
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
      toast.error(e.message || "Gagal regenerate token");
    }
  };

  return (
    <div className="space-y-6">
      {!embedded && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              <PlugZap className="w-5 h-5 text-[#243370] dark:text-white" /> Integrasi
            </h1>
            <p className="text-sm text-muted-foreground">
              Hubungkan Google Forms, WooCommerce, WordPress, Zapier, dan 20+ platform lain ke WhatsApp —
              tanpa coding, cukup tempel URL inbox.
            </p>
          </div>
          <Button onClick={() => setCreateFor("__custom__")} className="gap-1">
            <Plus className="w-4 h-4" /> Tambah Integrasi
          </Button>
        </div>
      )}
      {embedded && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            Hubungkan 20+ platform ke WhatsApp tanpa coding — cukup tempel URL inbox.
          </p>
          <Button onClick={() => setCreateFor("__custom__")} className="gap-1" size="sm">
            <Plus className="w-4 h-4" /> Tambah Integrasi
          </Button>
        </div>
      )}

      {/* ── Integrasi saya ── */}
      <section>
        <h2 className="text-sm font-semibold mb-3">Integrasi Saya ({items.length})</h2>
        {loading ? (
          <Card>
            <CardContent className="p-8 text-center text-sm text-muted-foreground">Memuat...</CardContent>
          </Card>
        ) : items.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              Belum ada integrasi. Pilih platform di bawah lalu tekan{" "}
              <span className="font-semibold text-foreground">Hubungkan</span>.
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
                        {it.isActive ? "Aktif" : "Nonaktif"}
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
                        <Copy className="w-3 h-3" /> URL Inbox
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <Button variant="ghost" size="sm" className="h-8 gap-1 text-xs" onClick={() => setLogsFor(it)}>
                        <ScrollText className="w-3.5 h-3.5" /> Log
                      </Button>
                      <Button variant="ghost" size="sm" className="h-8 gap-1 text-xs" onClick={() => setEditItem(it)}>
                        <Pencil className="w-3.5 h-3.5" /> Edit
                      </Button>
                      <Button variant="ghost" size="sm" className="h-8 gap-1 text-xs" onClick={() => setConfirmRegen(it)}>
                        <RefreshCw className="w-3.5 h-3.5" /> Token
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 gap-1 text-xs"
                        onClick={() => toggleActive(it)}
                      >
                        <Unplug className="w-3.5 h-3.5" /> {it.isActive ? "Nonaktifkan" : "Aktifkan"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 gap-1 text-xs text-red-600 dark:text-red-400"
                        onClick={() => setConfirmDelete(it)}
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Hapus
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
          <h2 className="text-sm font-semibold">Katalog Platform</h2>
          <div className="relative w-44 sm:w-56">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <Input
              value={catalogQuery}
              onChange={(e) => setCatalogQuery(e.target.value)}
              placeholder="Cari platform…"
              className="h-8 pl-8 text-xs"
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          Pilih platform → Hubungkan → salin URL inbox → ikuti panduan setup. Semua lewat webhook generik,
          tanpa klaim integrasi native palsu.
        </p>
        {filteredPlatforms.length === 0 ? (
          <p className="text-xs text-muted-foreground py-6 text-center">
            Tidak ada platform yang cocok dengan “{catalogQuery}”.
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
                      <Check className="w-3 h-3 mr-0.5" /> Terhubung
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground flex-1">{p.desc}</p>
                <div className="flex gap-1.5">
                  <Button size="sm" className="flex-1 h-8 text-xs" onClick={() => setCreateFor(p.slug)}>
                    Hubungkan
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 px-2"
                    aria-label={`Panduan ${p.name}`}
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
        <Modal title={`Panduan: ${guideFor.name}`} onClose={() => setGuideFor(null)} wide>
          <GuideView guide={guideFor} />
        </Modal>
      )}

      {/* ── Modal sukses (token + panduan) ── */}
      {created && (
        <Modal
          title="Integrasi berhasil dibuat"
          onClose={() => setCreated(null)}
          wide
        >
          <div className="space-y-4">
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
              {created.tokenWarning}
            </div>
            <div>
              <p className="text-xs font-semibold mb-1">URL Inbox (tempel ke platform)</p>
              <div className="flex gap-2">
                <code className="flex-1 min-w-0 break-all text-xs font-mono bg-secondary/60 rounded px-2 py-2">
                  {inboxUrl(created.fullToken)}
                </code>
                <Button size="sm" variant="outline" onClick={() => copyText(inboxUrl(created.fullToken), "URL inbox")}>
                  <Copy className="w-3 h-3" />
                </Button>
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold mb-1">Token</p>
              <div className="flex gap-2">
                <code className="flex-1 min-w-0 break-all text-xs font-mono bg-secondary/60 rounded px-2 py-2">
                  {created.fullToken}
                </code>
                <Button size="sm" variant="outline" onClick={() => copyText(created.fullToken, "Token")}>
                  <Copy className="w-3 h-3" />
                </Button>
              </div>
            </div>
            {(() => {
              const g = getPlatform(created.integration.platform);
              return g ? (
                <div className="border-t border-border pt-4">
                  <h4 className="text-sm font-semibold mb-3">Panduan setup {g.name}</h4>
                  <GuideView guide={g} inbox={inboxUrl(created.fullToken)} />
                </div>
              ) : null;
            })()}
            <Button className="w-full" onClick={() => setCreated(null)}>
              Selesai
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
        <Modal title="Hapus integrasi?" onClose={() => setConfirmDelete(null)}>
          <p className="text-sm text-muted-foreground mb-4">
            Integrasi <span className="font-semibold text-foreground">"{confirmDelete.name}"</span> akan
            dihapus dan URL inbox-nya berhenti berfungsi. Log lama tetap tersimpan.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>Batal</Button>
            <Button variant="destructive" onClick={doDelete}>Hapus</Button>
          </div>
        </Modal>
      )}

      {/* ── Konfirmasi regenerate ── */}
      {confirmRegen && (
        <Modal title="Buat token baru?" onClose={() => setConfirmRegen(null)}>
          <p className="text-sm text-muted-foreground mb-4">
            URL inbox lama untuk <span className="font-semibold text-foreground">"{confirmRegen.name}"</span> akan{" "}
            <span className="font-semibold text-foreground">berhenti berfungsi</span>. Anda harus menempel
            URL baru ke platform.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirmRegen(null)}>Batal</Button>
            <Button onClick={doRegen}>Buat Token Baru</Button>
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
  const [name, setName] = useState(
    platformSlug ? `${platformName(platformSlug)}` : ""
  );
  const [platform, setPlatform] = useState(platformSlug ?? PLATFORMS[0].slug);
  const [deviceId, setDeviceId] = useState(devices[0]?.id.toString() ?? "");
  const [template, setTemplate] = useState("");
  const [saving, setSaving] = useState(false);

  const guide = getPlatform(platform);

  const submit = async () => {
    if (!name.trim()) return toast.error("Nama wajib diisi");
    if (!deviceId) return toast.error("Pilih perangkat pengirim");
    setSaving(true);
    try {
      const r = await apiPost<CreatedResult>("/integrations", {
        name: name.trim(),
        platform,
        deviceId: Number(deviceId),
        template,
      });
      toast.success("Integrasi dibuat");
      onCreated(r);
    } catch (e: any) {
      toast.error(e.message || "Gagal membuat integrasi");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={platformSlug ? `Hubungkan ${platformName(platformSlug)}` : "Tambah Integrasi"} onClose={onClose} wide>
      <div className="space-y-4">
        {!platformSlug && (
          <div>
            <label className="text-xs font-semibold mb-1 block">Platform</label>
            <Dropdown
              value={platform}
              onChange={(v) => {
                setPlatform(v);
                setName(platformName(v));
              }}
              ariaLabel="Platform"
              options={PLATFORMS.map((p) => ({ value: p.slug, label: p.name }))}
            />
          </div>
        )}
        <div>
          <label className="text-xs font-semibold mb-1 block">Nama integrasi</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="cth. Notif Order Toko" />
        </div>
        <div>
          <label className="text-xs font-semibold mb-1 block">Perangkat pengirim</label>
          <Dropdown
            value={deviceId}
            onChange={setDeviceId}
            ariaLabel="Perangkat pengirim"
            placeholder={devices.length ? "Pilih perangkat" : "Tidak ada perangkat"}
            options={devices.map((d) => ({
              value: d.id.toString(),
              label: `${d.name}${d.status === "connected" ? " (terhubung)" : ` (${d.status})`}`,
            }))}
          />
        </div>
        <div>
          <label className="text-xs font-semibold mb-1 block">
            Template pesan <span className="font-normal text-muted-foreground">(opsional)</span>
          </label>
          <textarea
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#243370]/40"
            placeholder='cth. Order baru #{{order.id}} dari {{order.customer}} (Rp{{order.total}})'
          />
          <p className="text-xs text-muted-foreground mt-1">
            Variabel <code className="font-mono">{"{{path.ke.field}}"}</code> diisi dari JSON yang masuk.
            Bila payload sudah berisi <code className="font-mono">"message"</code>, template diabaikan.
          </p>
        </div>
        {guide && (
          <details className="rounded-lg border border-border">
            <summary className="cursor-pointer px-3 py-2 text-xs font-semibold">
              Lihat panduan setup {guide.name} dulu
            </summary>
            <div className="p-3 pt-0">
              <GuideView guide={guide} />
            </div>
          </details>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Batal</Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Menyimpan..." : "Buat & Tampilkan URL Inbox"}
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
  const [name, setName] = useState(item.name);
  const [deviceId, setDeviceId] = useState(item.deviceId.toString());
  const [template, setTemplate] = useState(item.template ?? "");
  const [isActive, setIsActive] = useState(item.isActive);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!name.trim()) return toast.error("Nama wajib diisi");
    setSaving(true);
    try {
      await apiPut(`/integrations/${item.id}`, {
        name: name.trim(),
        deviceId: Number(deviceId),
        template,
        isActive,
      });
      toast.success("Integrasi diperbarui");
      onSaved();
    } catch (e: any) {
      toast.error(e.message || "Gagal menyimpan");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Edit integrasi" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="text-xs font-semibold mb-1 block">Nama</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="text-xs font-semibold mb-1 block">Perangkat pengirim</label>
          <Dropdown
            value={deviceId}
            onChange={setDeviceId}
            ariaLabel="Perangkat pengirim"
            options={devices.map((d) => ({ value: d.id.toString(), label: d.name }))}
          />
        </div>
        <div>
          <label className="text-xs font-semibold mb-1 block">Template pesan</label>
          <textarea
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#243370]/40"
            placeholder='cth. Order baru #{{order.id}} dari {{order.customer}}'
          />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Aktif</span>
          <Toggle checked={isActive} onToggle={setIsActive} label="Aktif" />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Batal</Button>
          <Button onClick={submit} disabled={saving}>{saving ? "Menyimpan..." : "Simpan"}</Button>
        </div>
      </div>
    </Modal>
  );
}

// ── Modal log ───────────────────────────────────────────────────────────

function LogsModal({ item, onClose }: { item: Integration; onClose: () => void }) {
  const [logs, setLogs] = useState<IntLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const r = await apiGet<{ logs: IntLog[] }>(`/integrations/${item.id}/logs?limit=50`);
        setLogs(r.logs ?? []);
      } catch (e: any) {
        toast.error(e.message || "Gagal memuat log");
      } finally {
        setLoading(false);
      }
    })();
  }, [item.id]);

  return (
    <Modal title={`Log: ${item.name}`} onClose={onClose} wide>
      {loading ? (
        <p className="text-sm text-muted-foreground text-center py-8">Memuat...</p>
      ) : logs.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">
          Belum ada event masuk untuk integrasi ini.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Waktu</th>
                <th className="py-2 pr-3 font-medium">Tujuan</th>
                <th className="py-2 pr-3 font-medium">Status</th>
                <th className="py-2 pr-3 font-medium">Payload (ringkas)</th>
                <th className="py-2 font-medium">Error</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id} className="border-b border-border/60 align-top">
                  <td className="py-2 pr-3 whitespace-nowrap text-xs">{fmtTime(l.createdAt)}</td>
                  <td className="py-2 pr-3 font-mono text-xs">{l.to || "-"}</td>
                  <td className="py-2 pr-3">
                    <Badge variant={l.status === "sent" ? "success" : "destructive"}>
                      {l.status === "sent" ? "Terkirim" : "Gagal"}
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

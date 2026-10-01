import { Fragment, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Send, Upload, Users, UsersRound, Loader2, Smartphone, Filter, X, ChevronDown, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dropdown } from "@/components/ui/dropdown";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { apiGet, apiPost } from "@/lib/api";
import { useActiveDevice } from "@/hooks/use-active-device";

interface SimpleContact {
  id: number;
  phone: string;
}

interface SimpleGroup {
  id: number;
  name: string;
  memberCount: number;
}

interface SimpleMember {
  contactId: number;
}

interface Device {
  id: number;
  name: string;
  phone: string;
  status: "connected" | "connecting" | "disconnected";
}

interface CheckResult {
  total: number;
  valid: string[];
  validCount: number;
  excluded: string[];
  excludedCount: number;
  duplicates: number;
}

interface BulkJobItem {
  id: number;
  status: string;
  totalCount: number;
  sentCount: number;
  failedCount: number;
  autoClean: boolean;
  skippedCount: number;
  skippedNumbers: string[];
  contentPreview: string;
  createdAt: string;
}

export default function BulkMessages({ embedded = false }: { embedded?: boolean }) {
  const { activeDeviceId } = useActiveDevice();
  const [devices, setDevices] = useState<Device[]>([]);
  const [devicesLoading, setDevicesLoading] = useState(true);
  const [selectedDevices, setSelectedDevices] = useState<number[]>([]);
  const [recipients, setRecipients] = useState("");
  const [message, setMessage] = useState("");
  const [minDelay, setMinDelay] = useState("3");
  const [maxDelay, setMaxDelay] = useState("15");
  const [groups, setGroups] = useState<SimpleGroup[]>([]);
  const [groupsLoaded, setGroupsLoaded] = useState(false);
  const [groupId, setGroupId] = useState("");
  const [loadingNumbers, setLoadingNumbers] = useState(false);
  const [sending, setSending] = useState(false);
  // Fitur 4 — pembersih nomor otomatis sebelum blast
  const [autoClean, setAutoClean] = useState(false);
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<CheckResult | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [history, setHistory] = useState<BulkJobItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [expandedJob, setExpandedJob] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadHistory = async () => {
    setHistoryLoading(true);
    try {
      const res = await apiGet<{ jobs: BulkJobItem[] }>("/messages/bulk-jobs?limit=20");
      setHistory(res.jobs ?? []);
    } catch {
      // riwayat opsional — gagal dimuat tidak mengganggu form
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    loadHistory();
  }, []);

  useEffect(() => {
    (async () => {
      setDevicesLoading(true);
      try {
        const res = await apiGet<{ devices: Device[] }>("/devices");
        const list = res.devices ?? [];
        setDevices(list);
        // Default: device aktif bila connected, kalau tidak semua device yang connected.
        const connected = list.filter((d) => d.status === "connected");
        const preselect =
          activeDeviceId && connected.some((d) => d.id === activeDeviceId)
            ? [activeDeviceId]
            : connected.map((d) => d.id);
        setSelectedDevices(preselect);
      } catch {
        // gagal dimuat — user bisa coba lagi
      } finally {
        setDevicesLoading(false);
      }
    })();
  }, [activeDeviceId]);

  const toggleDevice = (id: number) => {
    setSelectedDevices((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const ensureGroups = async () => {
    if (groupsLoaded) return;
    try {
      const res = await apiGet<{ groups: SimpleGroup[] }>("/contact-groups");
      setGroups(res.groups ?? []);
      setGroupsLoaded(true);
    } catch {
      // gagal dimuat — user bisa coba lagi saat memilih
    }
  };

  const handleLoadContacts = async () => {
    setLoadingNumbers(true);
    try {
      const res = await apiGet<{ contacts: SimpleContact[] }>(
        "/contacts?limit=1000"
      );
      const phones = (res.contacts ?? [])
        .map((c) => (c.phone || "").trim())
        .filter(Boolean);
      if (phones.length === 0) {
        toast.error("Belum ada kontak dengan nomor");
        return;
      }
      setRecipients(phones.join("\n"));
      toast.success(`${phones.length} nomor diambil dari kontak`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal memuat kontak");
    } finally {
      setLoadingNumbers(false);
    }
  };

  const handleLoadGroup = async () => {
    if (!groupId) {
      toast.error("Pilih grup terlebih dahulu");
      return;
    }
    setLoadingNumbers(true);
    try {
      const [mRes, cRes] = await Promise.all([
        apiGet<{ members: SimpleMember[] }>(
          `/contact-groups/${groupId}/members`
        ),
        apiGet<{ contacts: SimpleContact[] }>("/contacts?limit=1000"),
      ]);
      const phoneById = new Map<number, string>(
        (cRes.contacts ?? []).map((c) => [c.id, (c.phone || "").trim()])
      );
      const memberIds = new Set(
        (mRes.members ?? []).map((m) => m.contactId)
      );
      const phones = [...memberIds]
        .map((id) => phoneById.get(id) ?? "")
        .filter(Boolean);
      if (phones.length === 0) {
        toast.error("Grup ini belum punya anggota dengan nomor");
        return;
      }
      setRecipients(phones.join("\n"));
      toast.success(`${phones.length} nomor diambil dari grup`);
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Gagal memuat anggota grup"
      );
    } finally {
      setLoadingNumbers(false);
    }
  };

  const handleImportCsv = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      const phones = text
        .split(/[\r\n,;]+/)
        .map((s) => s.replace(/[^\d+]/g, "").trim())
        .filter((s) => s.length >= 8);
      if (phones.length === 0) {
        toast.error("Tidak ada nomor valid di file CSV");
        return;
      }
      setRecipients(phones.join("\n"));
      toast.success(`${phones.length} nomor diimpor dari CSV`);
    };
    reader.onerror = () => toast.error("Gagal membaca file");
    reader.readAsText(file);
  };

  const collectPhones = () =>
    recipients
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);

  const validateForm = (phones: string[], min: number, max: number): string | null => {
    if (selectedDevices.length === 0) return "Pilih minimal satu perangkat pengirim";
    if (phones.length === 0) return "Isi minimal satu nomor tujuan";
    if (!message.trim()) return "Isi pesan blast";
    if (Number.isNaN(min) || Number.isNaN(max) || min < 0 || max < 0 || min > 3600 || max > 3600)
      return "Jeda harus angka 0–3600 detik";
    if (max < min) return "Jeda maks tidak boleh lebih kecil dari jeda min";
    return null;
  };

  const handleSend = async () => {
    const phones = collectPhones();
    const min = parseInt(minDelay, 10);
    const max = parseInt(maxDelay, 10);
    const err = validateForm(phones, min, max);
    if (err) {
      toast.error(err);
      return;
    }

    // Fitur 4: bila toggle aktif, validasi dulu lalu minta konfirmasi.
    if (autoClean) {
      setChecking(true);
      try {
        const res = await apiPost<CheckResult>("/messages/check-recipients", {
          deviceId: selectedDevices[0],
          numbers: phones,
        });
        if (res.validCount === 0) {
          toast.error("Semua nomor tidak terdaftar di WhatsApp — blast dibatalkan");
          return;
        }
        setCheckResult(res);
        setShowConfirm(true);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Gagal memeriksa nomor");
      } finally {
        setChecking(false);
      }
      return;
    }

    await doSend(phones, min, max, false);
  };

  const doSend = async (phones: string[], min: number, max: number, cleaned: boolean) => {
    setSending(true);
    try {
      const res = await apiPost<{
        message: string;
        job: { id: number };
        cleaned: { applied: boolean; valid: number; excluded: number; duplicates: number };
      }>("/messages/send-bulk", {
        deviceIds: selectedDevices,
        recipients: phones,
        content: message.trim(),
        minDelay: min,
        maxDelay: max,
        autoClean: cleaned,
      });
      const c = res.cleaned;
      if (c?.applied) {
        toast.success(
          `Blast dijadwalkan: ${c.valid} nomor valid dikirim, ${c.excluded} nomor dicoret (tidak terdaftar di WA) — job #${res.job?.id}`
        );
      } else {
        toast.success(
          `Blast dijadwalkan ke ${phones.length} nomor via ${selectedDevices.length} perangkat (job #${res.job?.id})`
        );
      }
      setRecipients("");
      setMessage("");
      setCheckResult(null);
      loadHistory();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal menjadwalkan blast");
    } finally {
      setSending(false);
    }
  };

  const handleConfirmSend = async () => {
    const phones = collectPhones();
    const min = parseInt(minDelay, 10);
    const max = parseInt(maxDelay, 10);
    setShowConfirm(false);
    await doSend(phones, min, max, true);
  };

  const connectedCount = devices.filter((d) => d.status === "connected").length;

  return (
    <div className="max-w-3xl space-y-6">
      {!embedded && (
        <div>
          <h2 className="text-lg font-semibold text-foreground">Blast Pesan</h2>
          <p className="text-sm text-muted-foreground">Kirim pesan ke banyak nomor sekaligus</p>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Kirim Blast</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-medium text-foreground">
              Perangkat Pengirim <span className="text-muted-foreground font-normal">(bisa pilih lebih dari satu — pesan dibagi rata round-robin)</span>
            </label>
            {devicesLoading ? (
              <p className="text-xs text-muted-foreground">Memuat perangkat…</p>
            ) : devices.length === 0 ? (
              <p className="text-xs text-muted-foreground">Belum ada perangkat. Tambahkan dulu di Dashboard.</p>
            ) : (
              <div className="space-y-1.5">
                {devices.map((d) => {
                  const isConnected = d.status === "connected";
                  const checked = selectedDevices.includes(d.id);
                  return (
                    <label
                      key={d.id}
                      className={`flex items-center gap-3 rounded-lg border border-border px-3 py-2 text-sm ${
                        isConnected ? "cursor-pointer hover:bg-muted/50" : "opacity-50 cursor-not-allowed"
                      } ${checked ? "border-[#243370] bg-[#243370]/5" : ""}`}
                      title={isConnected ? undefined : "Perangkat tidak terhubung — tidak bisa dipilih"}
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 shrink-0 accent-[#243370]"
                        checked={checked}
                        disabled={!isConnected}
                        onChange={() => toggleDevice(d.id)}
                      />
                      <Smartphone className="w-4 h-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{d.name}</span>
                        <span className="block text-xs text-muted-foreground font-mono">{d.phone || "-"}</span>
                      </span>
                      <Badge variant={isConnected ? "success" : "secondary"}>
                        {isConnected ? "Terhubung" : "Terputus"}
                      </Badge>
                    </label>
                  );
                })}
                <p className="text-[10px] text-muted-foreground pt-1">
                  {connectedCount === 0
                    ? "Tidak ada perangkat yang terhubung — hubungkan dulu sebelum blast."
                    : `${selectedDevices.length} perangkat dipilih. Bila satu perangkat terputus di tengah jalan, sisa pesannya otomatis dialihkan ke perangkat lain.`}
                </p>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-foreground">Nomor Tujuan</label>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-[11px] gap-1.5"
                onClick={handleLoadContacts}
                disabled={loadingNumbers}
              >
                <Users className="w-3.5 h-3.5" />
                Ambil dari Kontak
              </Button>
              <Dropdown
                value={groupId}
                onChange={setGroupId}
                onOpen={ensureGroups}
                disabled={loadingNumbers}
                aria-label="Pilih grup"
                className="w-auto min-w-[140px]"
                placeholder="Pilih grup…"
                options={[
                  { value: "", label: "Pilih grup…" },
                  ...groups.map((g) => ({ value: String(g.id), label: `${g.name} (${g.memberCount})` })),
                ]}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-[11px] gap-1.5"
                onClick={handleLoadGroup}
                disabled={loadingNumbers || !groupId}
              >
                <UsersRound className="w-3.5 h-3.5" />
                Ambil dari Grup
              </Button>
            </div>
            <textarea
              className="flex w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring min-h-[100px] resize-y font-mono"
              placeholder="Satu nomor per baris:&#10;628123456789&#10;628987654321&#10;628111222333"
              value={recipients}
              onChange={(e) => setRecipients(e.target.value)}
            />
            <p className="text-[10px] text-muted-foreground">
              {recipients.split("\n").filter(Boolean).length} nomor
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-foreground">Pesan</label>
            <textarea
              className="flex w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring min-h-[100px] resize-y"
              placeholder="Tulis pesan blast..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-foreground">
              Jeda antar pesan <span className="text-muted-foreground font-normal">(acak, detik, berlaku per perangkat)</span>
            </label>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <span className="text-[11px] text-muted-foreground">Min</span>
                <Input value={minDelay} onChange={(e) => setMinDelay(e.target.value)} type="number" min={0} />
              </div>
              <div className="space-y-1">
                <span className="text-[11px] text-muted-foreground">Maks</span>
                <Input value={maxDelay} onChange={(e) => setMaxDelay(e.target.value)} type="number" min={0} />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pt-2">
            <Button className="gap-2" onClick={handleSend} disabled={sending || checking || devicesLoading}>
              {sending || checking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {checking ? "Memeriksa nomor…" : sending ? "Menjadwalkan…" : "Kirim Blast"}
            </Button>
            <Button variant="outline" className="gap-2" onClick={() => fileRef.current?.click()} disabled={loadingNumbers}>
              <Upload className="w-4 h-4" />
              Import CSV
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.txt"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleImportCsv(f);
                e.target.value = "";
              }}
            />
          </div>

          <label
            className={`flex items-start gap-3 rounded-lg border border-border px-3 py-2.5 text-sm cursor-pointer hover:bg-muted/50 ${
              autoClean ? "border-[#243370] bg-[#243370]/5" : ""
            }`}
          >
            <input
              type="checkbox"
              className="h-4 w-4 mt-0.5 shrink-0 accent-[#243370]"
              checked={autoClean}
              onChange={(e) => setAutoClean(e.target.checked)}
            />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 font-medium">
                <Filter className="w-3.5 h-3.5 text-[#243370]" />
                Coret otomatis nomor tidak valid
              </span>
              <span className="block text-xs text-muted-foreground mt-0.5">
                Sebelum blast dikirim, semua nomor dicek ke WhatsApp — nomor yang tidak terdaftar otomatis
                dikeluarkan dari daftar kirim. Minta konfirmasi dulu sebelum mengirim.
              </span>
            </span>
          </label>
        </CardContent>
      </Card>

      {showConfirm && checkResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowConfirm(false)}>
          <div className="absolute inset-0 bg-black/50" />
          <div
            className="relative bg-card text-card-foreground border border-border rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-5 sm:p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Konfirmasi Blast</h3>
              <button onClick={() => setShowConfirm(false)} className="p-1.5 rounded-md hover:bg-secondary" aria-label="Tutup">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm">
              <span className="font-semibold text-[#243370]">{checkResult.validCount} nomor valid</span>
              {checkResult.excludedCount > 0 && (
                <span>, <span className="font-semibold text-red-600">{checkResult.excludedCount} nomor dicoret</span> (tidak terdaftar di WA)</span>
              )}
              {checkResult.duplicates > 0 && (
                <span className="text-muted-foreground">, {checkResult.duplicates} duplikat dibuang</span>
              )}
              . Lanjutkan?
            </p>
            {checkResult.excludedCount > 0 && (
              <div className="mt-3">
                <p className="text-xs font-medium text-muted-foreground mb-1">Nomor yang dicoret:</p>
                <div className="max-h-40 overflow-y-auto rounded-md border border-border bg-muted/30 p-2 font-mono text-xs space-y-0.5">
                  {checkResult.excluded.map((n) => (
                    <div key={n} className="text-red-600">{n}</div>
                  ))}
                </div>
              </div>
            )}
            <div className="flex justify-end gap-2 mt-5">
              <Button variant="outline" onClick={() => setShowConfirm(false)} disabled={sending}>
                Batal
              </Button>
              <Button onClick={handleConfirmSend} disabled={sending} className="gap-2">
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {sending ? "Menjadwalkan…" : "Lanjutkan kirim"}
              </Button>
            </div>
          </div>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <History className="w-4 h-4" />
            Riwayat Blast
          </CardTitle>
        </CardHeader>
        <CardContent>
          {historyLoading ? (
            <p className="text-xs text-muted-foreground">Memuat riwayat…</p>
          ) : history.length === 0 ? (
            <p className="text-xs text-muted-foreground">Belum ada blast yang pernah dikirim.</p>
          ) : (
            <div className="overflow-x-auto -mx-5 px-5">
              <table className="w-full text-xs whitespace-nowrap">
                <thead>
                  <tr className="text-left text-muted-foreground border-b border-border">
                    <th className="py-2 pr-3 font-medium">Job</th>
                    <th className="py-2 pr-3 font-medium">Status</th>
                    <th className="py-2 pr-3 font-medium text-right">Total</th>
                    <th className="py-2 pr-3 font-medium text-right">Terkirim</th>
                    <th className="py-2 pr-3 font-medium text-right">Gagal</th>
                    <th className="py-2 pr-3 font-medium text-right">Dicoret</th>
                    <th className="py-2 pr-3 font-medium">Dibuat</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((j) => (
                    <Fragment key={j.id}>
                      <tr className="border-b border-border/60">
                        <td className="py-2 pr-3 font-mono">#{j.id}</td>
                        <td className="py-2 pr-3">
                          <Badge variant={j.status === "completed" ? "success" : j.status === "failed" ? "destructive" : "secondary"}>
                            {j.status}
                          </Badge>
                        </td>
                        <td className="py-2 pr-3 text-right">{j.totalCount}</td>
                        <td className="py-2 pr-3 text-right text-green-600">{j.sentCount}</td>
                        <td className="py-2 pr-3 text-right text-red-600">{j.failedCount}</td>
                        <td className="py-2 pr-3 text-right">
                          {j.skippedCount > 0 ? (
                            <button
                              className="inline-flex items-center gap-1 font-semibold text-amber-600 hover:underline"
                              onClick={() => setExpandedJob(expandedJob === j.id ? null : j.id)}
                            >
                              {j.skippedCount}
                              <ChevronDown className={`w-3 h-3 transition-transform ${expandedJob === j.id ? "rotate-180" : ""}`} />
                            </button>
                          ) : (
                            <span className="text-muted-foreground">0</span>
                          )}
                        </td>
                        <td className="py-2 pr-3 text-muted-foreground">
                          {new Date(j.createdAt).toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                        </td>
                      </tr>
                      {expandedJob === j.id && j.skippedNumbers.length > 0 && (
                        <tr>
                          <td colSpan={7} className="py-2 pr-3">
                            <div className="rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900 p-2">
                              <p className="text-[11px] font-medium text-amber-700 dark:text-amber-400 mb-1">
                                {j.skippedCount} nomor dicoret (tidak terdaftar di WA):
                              </p>
                              <div className="max-h-32 overflow-y-auto font-mono text-[11px] space-y-0.5 text-foreground whitespace-normal break-all">
                                {j.skippedNumbers.join(", ")}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

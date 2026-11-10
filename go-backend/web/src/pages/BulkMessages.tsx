import { Fragment, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Send, Upload, Users, UsersRound, Loader2, Smartphone, Filter, X, ChevronDown, History, CalendarClock, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dropdown } from "@/components/ui/dropdown";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { apiGet, apiPost } from "@/lib/api";
import { useLang } from "@/lib/i18n";
import { useActiveDevice } from "@/hooks/use-active-device";
import { DateTimePicker } from "@/components/DateTimePicker";
import { TemplatePicker, TemplatePickerLabel } from "@/components/TemplatePicker";

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
  scheduledAt: string | null;
  createdAt: string;
}

export default function BulkMessages({ embedded = false }: { embedded?: boolean }) {
  const { t } = useLang();
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
  const [retrying, setRetrying] = useState<number | null>(null);
  // Blast terjadwal
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduledAt, setScheduledAt] = useState("");
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
        toast.error(t("bulkMessages.noContactNumbers"));
        return;
      }
      setRecipients(phones.join("\n"));
      toast.success(t("bulkMessages.contactsLoaded").replace("{n}", String(phones.length)));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("bulkMessages.loadContactsFailed"));
    } finally {
      setLoadingNumbers(false);
    }
  };

  const handleLoadGroup = async () => {
    if (!groupId) {
      toast.error(t("bulkMessages.selectGroupFirst"));
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
        toast.error(t("bulkMessages.groupNoMembers"));
        return;
      }
      setRecipients(phones.join("\n"));
      toast.success(t("bulkMessages.groupLoaded").replace("{n}", String(phones.length)));
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : t("bulkMessages.loadGroupFailed")
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
        toast.error(t("bulkMessages.csvNoValid"));
        return;
      }
      setRecipients(phones.join("\n"));
      toast.success(t("bulkMessages.csvImported").replace("{n}", String(phones.length)));
    };
    reader.onerror = () => toast.error(t("bulkMessages.csvReadFailed"));
    reader.readAsText(file);
  };

  const collectPhones = () =>
    recipients
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);

  const validateForm = (phones: string[], min: number, max: number): string | null => {
    if (selectedDevices.length === 0) return t("bulkMessages.errSelectDevice");
    if (phones.length === 0) return t("bulkMessages.errNoRecipients");
    if (!message.trim()) return t("bulkMessages.errNoMessage");
    if (Number.isNaN(min) || Number.isNaN(max) || min < 0 || max < 0 || min > 3600 || max > 3600)
      return t("bulkMessages.errDelayRange");
    if (max < min) return t("bulkMessages.errDelayOrder");
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
    if (scheduleEnabled && !scheduledAt) {
      toast.error(t("bulkMessages.errNoScheduleTime"));
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
          toast.error(t("bulkMessages.allInvalid"));
          return;
        }
        setCheckResult(res);
        setShowConfirm(true);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : t("bulkMessages.checkFailed"));
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
        scheduledAt: scheduleEnabled && scheduledAt ? scheduledAt : "",
      });
      const c = res.cleaned;
      if (c?.applied) {
        toast.success(
          t("bulkMessages.blastScheduledCleaned")
            .replace("{valid}", String(c.valid))
            .replace("{excluded}", String(c.excluded))
            .replace("{jobId}", String(res.job?.id))
        );
      } else if (scheduleEnabled && scheduledAt) {
        toast.success(
          t("bulkMessages.blastPlanned").replace("{jobId}", String(res.job?.id))
        );
      } else {
        toast.success(
          t("bulkMessages.blastScheduled")
            .replace("{total}", String(phones.length))
            .replace("{devices}", String(selectedDevices.length))
            .replace("{jobId}", String(res.job?.id))
        );
      }
      setRecipients("");
      setMessage("");
      setCheckResult(null);
      setScheduleEnabled(false);
      setScheduledAt("");
      loadHistory();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("bulkMessages.scheduleFailed"));
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

  const handleRetry = async (jobId: number) => {
    setRetrying(jobId);
    try {
      const res = await apiPost<{ message: string; retried: number }>(
        `/messages/bulk-jobs/${jobId}/retry`,
        {}
      );
      toast.success(
        t("bulkMessages.retryDone").replace("{n}", String(res.retried))
      );
      loadHistory();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("bulkMessages.retryFailed"));
    } finally {
      setRetrying(null);
    }
  };

  return (
    <div className="max-w-3xl space-y-6">
      {!embedded && (
        <div>
          <h2 className="text-lg font-semibold text-foreground">{t("bulkMessages.title")}</h2>
          <p className="text-sm text-muted-foreground">{t("bulkMessages.subtitle")}</p>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">{t("bulkMessages.cardTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-medium text-foreground">
              {t("bulkMessages.labelDevices")} <span className="text-muted-foreground font-normal">{t("bulkMessages.devicesHint")}</span>
            </label>
            {devicesLoading ? (
              <p className="text-xs text-muted-foreground">{t("bulkMessages.devicesLoading")}</p>
            ) : devices.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t("bulkMessages.noDevices")}</p>
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
                      title={isConnected ? undefined : t("bulkMessages.deviceOfflineTitle")}
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
                        {isConnected ? t("bulkMessages.connectedBadge") : t("bulkMessages.disconnectedBadge")}
                      </Badge>
                    </label>
                  );
                })}
                <p className="text-[10px] text-muted-foreground pt-1">
                  {connectedCount === 0
                    ? t("bulkMessages.noConnected")
                    : t("bulkMessages.devicesSelectedNote").replace("{n}", String(selectedDevices.length))}
                </p>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-foreground">{t("bulkMessages.labelRecipients")}</label>
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
                {t("bulkMessages.loadContacts")}
              </Button>
              <Dropdown
                value={groupId}
                onChange={setGroupId}
                onOpen={ensureGroups}
                disabled={loadingNumbers}
                aria-label={t("bulkMessages.ariaGroup")}
                className="w-auto min-w-[140px]"
                placeholder={t("bulkMessages.groupPlaceholder")}
                options={[
                  { value: "", label: t("bulkMessages.groupPlaceholder") },
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
                {t("bulkMessages.loadGroup")}
              </Button>
            </div>
            <textarea
              className="flex w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring min-h-[100px] resize-y font-mono"
              placeholder="Satu nomor per baris:&#10;628123456789&#10;628987654321&#10;628111222333"
              value={recipients}
              onChange={(e) => setRecipients(e.target.value)}
            />
            <p className="text-[10px] text-muted-foreground">
              {t("bulkMessages.recipientCount").replace("{n}", String(recipients.split("\n").filter(Boolean).length))}
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <label className="text-xs font-medium text-foreground">{t("bulkMessages.labelMessage")}</label>
              <TemplatePicker onSelect={(c) => setMessage(c)} />
            </div>
            <textarea
              className="flex w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring min-h-[100px] resize-y"
              placeholder={t("bulkMessages.messagePlaceholder")}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
            <TemplatePickerLabel />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-foreground">
              {t("bulkMessages.labelDelay")} <span className="text-muted-foreground font-normal">{t("bulkMessages.delayHint")}</span>
            </label>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <span className="text-[11px] text-muted-foreground">{t("bulkMessages.minDelayLabel")}</span>
                <Input value={minDelay} onChange={(e) => setMinDelay(e.target.value)} type="number" min={0} />
              </div>
              <div className="space-y-1">
                <span className="text-[11px] text-muted-foreground">{t("bulkMessages.maxDelayLabel")}</span>
                <Input value={maxDelay} onChange={(e) => setMaxDelay(e.target.value)} type="number" min={0} />
              </div>
            </div>
          </div>

          <label
            className={`flex items-start gap-3 rounded-lg border border-border px-3 py-2.5 text-sm cursor-pointer hover:bg-muted/50 ${
              scheduleEnabled ? "border-[#243370] bg-[#243370]/5" : ""
            }`}
          >
            <input
              type="checkbox"
              className="h-4 w-4 mt-0.5 shrink-0 accent-[#243370]"
              checked={scheduleEnabled}
              onChange={(e) => setScheduleEnabled(e.target.checked)}
            />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 font-medium">
                <CalendarClock className="w-3.5 h-3.5 text-[#243370]" />
                {t("bulkMessages.scheduleTitle")}
              </span>
              <span className="block text-xs text-muted-foreground mt-0.5">
                {t("bulkMessages.scheduleDesc")}
              </span>
              {scheduleEnabled && (
                <span className="block mt-2" onClick={(e) => e.stopPropagation()}>
                  <DateTimePicker value={scheduledAt} onChange={setScheduledAt} />
                </span>
              )}
            </span>
          </label>

          <div className="flex flex-wrap gap-2 pt-2">
            <Button className="gap-2" onClick={handleSend} disabled={sending || checking || devicesLoading}>
              {sending || checking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {checking
                ? t("bulkMessages.checkingLabel")
                : sending
                  ? t("bulkMessages.schedulingLabel")
                  : scheduleEnabled
                    ? t("bulkMessages.scheduleBlast")
                    : t("bulkMessages.sendBlast")}
            </Button>
            <Button variant="outline" className="gap-2" onClick={() => fileRef.current?.click()} disabled={loadingNumbers}>
              <Upload className="w-4 h-4" />
              {t("bulkMessages.importCsv")}
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
                {t("bulkMessages.autoCleanTitle")}
              </span>
              <span className="block text-xs text-muted-foreground mt-0.5">
                {t("bulkMessages.autoCleanDesc")}
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
              <h3 className="text-lg font-semibold">{t("bulkMessages.confirmTitle")}</h3>
              <button onClick={() => setShowConfirm(false)} className="p-1.5 rounded-md hover:bg-secondary" aria-label={t("bulkMessages.closeLabel")}>
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm">
              <span className="font-semibold text-[#243370]">{t("bulkMessages.confirmSummary").replace("{valid}", String(checkResult.validCount))}</span>
              {checkResult.excludedCount > 0 && (
                <span>, <span className="font-semibold text-red-600">{t("bulkMessages.confirmExcluded").replace("{excluded}", String(checkResult.excludedCount))}</span></span>
              )}
              {checkResult.duplicates > 0 && (
                <span className="text-muted-foreground">{t("bulkMessages.confirmDuplicates").replace("{duplicates}", String(checkResult.duplicates))}</span>
              )}
              {t("bulkMessages.confirmAsk")}
            </p>
            {checkResult.excludedCount > 0 && (
              <div className="mt-3">
                <p className="text-xs font-medium text-muted-foreground mb-1">{t("bulkMessages.excludedNumbers")}</p>
                <div className="max-h-40 overflow-y-auto rounded-md border border-border bg-muted/30 p-2 font-mono text-xs space-y-0.5">
                  {checkResult.excluded.map((n) => (
                    <div key={n} className="text-red-600">{n}</div>
                  ))}
                </div>
              </div>
            )}
            <div className="flex justify-end gap-2 mt-5">
              <Button variant="outline" onClick={() => setShowConfirm(false)} disabled={sending}>
                {t("bulkMessages.cancel")}
              </Button>
              <Button onClick={handleConfirmSend} disabled={sending} className="gap-2">
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {sending ? t("bulkMessages.schedulingLabel") : t("bulkMessages.confirmSend")}
              </Button>
            </div>
          </div>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <History className="w-4 h-4" />
            {t("bulkMessages.historyTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {historyLoading ? (
            <p className="text-xs text-muted-foreground">{t("bulkMessages.historyLoading")}</p>
          ) : history.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t("bulkMessages.historyEmpty")}</p>
          ) : (
            <div className="overflow-x-auto -mx-5 px-5">
              <table className="w-full text-xs whitespace-nowrap">
                <thead>
                  <tr className="text-left text-muted-foreground border-b border-border">
                    <th className="py-2 pr-3 font-medium">{t("bulkMessages.headerJob")}</th>
                    <th className="py-2 pr-3 font-medium">{t("bulkMessages.headerStatus")}</th>
                    <th className="py-2 pr-3 font-medium text-right">{t("bulkMessages.headerTotal")}</th>
                    <th className="py-2 pr-3 font-medium text-right">{t("bulkMessages.headerSent")}</th>
                    <th className="py-2 pr-3 font-medium text-right">{t("bulkMessages.headerFailed")}</th>
                    <th className="py-2 pr-3 font-medium text-right">{t("bulkMessages.headerExcluded")}</th>
                    <th className="py-2 pr-3 font-medium">{t("bulkMessages.headerCreated")}</th>
                    <th className="py-2 pr-3 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((j) => (
                    <Fragment key={j.id}>
                      <tr className="border-b border-border/60">
                        <td className="py-2 pr-3 font-mono">#{j.id}</td>
                        <td className="py-2 pr-3">
                          <Badge variant={j.status === "completed" ? "success" : j.status === "failed" ? "destructive" : "secondary"}>
                            {j.status === "scheduled" && j.scheduledAt
                              ? `${t("bulkMessages.statusScheduled")} ${new Date(j.scheduledAt).toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}`
                              : j.status}
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
                        <td className="py-2 pr-3 text-right">
                          {j.failedCount > 0 && (j.status === "completed" || j.status === "failed") && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-[11px] gap-1"
                              onClick={() => handleRetry(j.id)}
                              disabled={retrying === j.id}
                            >
                              {retrying === j.id ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <RotateCcw className="w-3 h-3" />
                              )}
                              {t("bulkMessages.retryFailed")}
                            </Button>
                          )}
                        </td>
                      </tr>
                      {expandedJob === j.id && j.skippedNumbers.length > 0 && (
                        <tr>
                          <td colSpan={8} className="py-2 pr-3">
                            <div className="rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900 p-2">
                              <p className="text-[11px] font-medium text-amber-700 dark:text-amber-400 mb-1">
                                {t("bulkMessages.excludedListTitle").replace("{n}", String(j.skippedCount))}
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

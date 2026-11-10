import { Fragment, useEffect, useState } from "react";
import { toast } from "sonner";
import { X, Check, CheckCircle2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiGet, apiPost } from "@/lib/api";
import { useLang } from "@/lib/i18n";

const DONE_KEY = "wg_onboard_done";

/** True bila user sudah pernah menyelesaikan/melewati onboarding. */
export function isOnboardingDone(): boolean {
  try {
    return localStorage.getItem(DONE_KEY) === "1";
  } catch {
    return true;
  }
}

function markDone() {
  try {
    localStorage.setItem(DONE_KEY, "1");
  } catch {
    /* abaikan */
  }
}

interface DeviceItem {
  id: number;
  name: string;
}

export default function OnboardingWizard({ onDone }: { onDone: () => void }) {
  const { t } = useLang();
  const [step, setStep] = useState(1);
  const stepLabels = [
    t("onboardingWizard.step1"),
    t("onboardingWizard.step2"),
    t("onboardingWizard.step3"),
  ];

  // Langkah 1
  const [deviceName, setDeviceName] = useState("");
  const [deviceId, setDeviceId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  // Langkah 2
  const [qr, setQr] = useState("");
  const [qrLoading, setQrLoading] = useState(false);
  const [qrError, setQrError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  // Langkah 3
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState(
    "Halo! Ini pesan tes dari WaGataway 👋"
  );
  const [sending, setSending] = useState(false);

  const skip = () => {
    if (step < 3) {
      setStep(step + 1);
    } else {
      markDone();
      onDone();
    }
  };

  const finish = () => {
    markDone();
    onDone();
  };

  /* ── Langkah 1: buat perangkat ─────────────────────────── */
  const createDevice = async () => {
    const name = deviceName.trim();
    if (!name) {
      toast.error(t("onboardingWizard.errDeviceNameRequired"));
      return;
    }
    setSaving(true);
    try {
      const created = await apiPost<{ device?: DeviceItem; id?: number }>(
        "/devices",
        { name }
      );
      let id = created.device?.id ?? created.id;
      if (!id) {
        const list = await apiGet<{ devices: DeviceItem[] }>("/devices");
        id = (list.devices || []).filter((d) => d.name === name).pop()?.id;
      }
      if (!id) throw new Error(t("onboardingWizard.errDeviceIdNotFound"));
      setDeviceId(id);
      setStep(2);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("onboardingWizard.errAddDeviceFailed"));
    } finally {
      setSaving(false);
    }
  };

  /* ── Langkah 2: QR + polling status ────────────────────── */
  const startConnect = async (id: number) => {
    setQrLoading(true);
    setQrError(null);
    setQr("");
    try {
      await apiPost(`/devices/${id}/connect`);
      // beri jeda agar sesi sempat membuat QR
      await new Promise((r) => setTimeout(r, 1500));
      const q = await apiGet<{ qr: string }>(`/devices/${id}/qr`);
      if (q.qr) setQr(q.qr);
      else setQrError(t("onboardingWizard.errQrNotReady"));
    } catch (e) {
      setQrError(e instanceof Error ? e.message : t("onboardingWizard.errConnectFailed"));
    } finally {
      setQrLoading(false);
    }
  };

  useEffect(() => {
    if (step !== 2 || !deviceId) return;
    startConnect(deviceId);
    const startedAt = Date.now();
    const iv = setInterval(async () => {
      if (Date.now() - startedAt > 90000) {
        clearInterval(iv);
        return;
      }
      try {
        const s = await apiGet<{ status: string }>(
          `/devices/${deviceId}/status`
        );
        if (s.status === "connected") {
          clearInterval(iv);
          toast.success(t("onboardingWizard.deviceConnected"));
          setStep(3);
        } else {
          const q = await apiGet<{ qr: string }>(
            `/devices/${deviceId}/qr`
          ).catch(() => null);
          if (q?.qr) setQr((prev) => (prev === q.qr ? prev : q.qr));
        }
      } catch {
        /* abaikan, coba lagi di tick berikutnya */
      }
    }, 3000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, deviceId]);

  const checkConnected = async () => {
    if (!deviceId) return;
    setChecking(true);
    try {
      const s = await apiGet<{ status: string }>(
        `/devices/${deviceId}/status`
      );
      if (s.status === "connected") {
        toast.success(t("onboardingWizard.deviceConnected"));
        setStep(3);
      } else {
        toast.error(t("onboardingWizard.errNotConnected"));
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("onboardingWizard.errCheckStatus"));
    } finally {
      setChecking(false);
    }
  };

  /* ── Langkah 3: kirim pesan tes ─────────────────────────── */
  const sendTest = async () => {
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 9) {
      toast.error(t("onboardingWizard.errInvalidPhone"));
      return;
    }
    if (!message.trim()) {
      toast.error(t("onboardingWizard.errMessageEmpty"));
      return;
    }
    if (!deviceId) {
      toast.error(t("onboardingWizard.errDeviceNotFound"));
      return;
    }
    setSending(true);
    try {
      await apiPost("/chat/send", {
        deviceId,
        phone: digits,
        content: message.trim(),
        type: "text",
      });
      toast.success(t("onboardingWizard.testMessageSent"));
      setStep(4);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("onboardingWizard.errSendTest"));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" aria-hidden />
      <div className="relative bg-card text-card-foreground rounded-xl border border-border shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto p-5 sm:p-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-1">
          <div>
            <h3 className="text-base font-semibold">{t("onboardingWizard.welcome")}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t("onboardingWizard.welcomeSub")}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={skip}
            aria-label={t("onboardingWizard.skipAria")}
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Indikator langkah */}
        <div className="flex items-start my-5">
          {stepLabels.map((label, i) => {
            const n = i + 1;
            const active = step === n;
            const done = step > n;
            const last = i === stepLabels.length - 1;
            return (
              <Fragment key={i}>
                <div className="flex flex-col items-center gap-1.5 shrink-0">
                  <div
                    className={`w-9 h-9 rounded-full flex items-center justify-center border transition-colors ${
                      done
                        ? "bg-primary border-primary text-white"
                        : active
                          ? "bg-primary/10 border-primary text-primary"
                          : "border-border text-muted-foreground"
                    }`}
                  >
                    {done ? (
                      <Check className="w-4 h-4" />
                    ) : (
                      <span className="text-sm font-semibold">{n}</span>
                    )}
                  </div>
                  <span
                    className={`text-[10px] text-center leading-tight max-w-[92px] ${
                      active ? "font-semibold text-foreground" : "text-muted-foreground"
                    }`}
                  >
                    {label}
                  </span>
                </div>
                {!last && (
                  <div
                    aria-hidden
                    className={`flex-1 h-px mx-1 mt-[17px] ${
                      done ? "bg-primary" : "bg-border"
                    }`}
                  />
                )}
              </Fragment>
            );
          })}
        </div>

        {/* Isi langkah */}
        {step === 1 && (
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-foreground">
                {t("onboardingWizard.deviceNameLabel")}
              </label>
              <Input
                className="mt-1"
                placeholder={t("onboardingWizard.deviceNamePlaceholder")}
                value={deviceName}
                onChange={(e) => setDeviceName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && createDevice()}
              />
              <p className="text-[11px] text-muted-foreground mt-1.5">
                {t("onboardingWizard.deviceHint")}
              </p>
            </div>
            <div className="flex flex-col-reverse sm:flex-row sm:justify-between gap-2">
              <Button variant="ghost" size="sm" onClick={skip} className="w-full sm:w-auto">
                {t("onboardingWizard.skip")}
              </Button>
              <Button size="sm" onClick={createDevice} disabled={saving} className="w-full sm:w-auto">
                {saving ? t("onboardingWizard.saving") : t("onboardingWizard.next")}
              </Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div className="flex flex-col items-center space-y-3">
              {qrLoading && (
                <p className="text-sm text-muted-foreground py-8">
                  {t("onboardingWizard.preparingQr")}
                </p>
              )}
              {!qrLoading && qrError && (
                <>
                  <p className="text-sm text-destructive text-center">{qrError}</p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => deviceId && startConnect(deviceId)}
                    className="gap-1.5"
                  >
                    <RefreshCw className="w-3.5 h-3.5" /> {t("onboardingWizard.reloadQr")}
                  </Button>
                </>
              )}
              {!qrLoading && !qrError && qr && (
                <>
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=8&data=${encodeURIComponent(
                      qr
                    )}`}
                    alt={t("onboardingWizard.qrAlt")}
                    className="w-48 h-48 sm:w-56 sm:h-56 rounded-lg border border-border"
                  />
                  <p className="text-xs text-muted-foreground text-center">
                    {t("onboardingWizard.scanHint")}
                  </p>
                </>
              )}
            </div>
            <div className="flex flex-col-reverse sm:flex-row sm:justify-between gap-2">
              <Button variant="ghost" size="sm" onClick={skip} className="w-full sm:w-auto">
                {t("onboardingWizard.skip")}
              </Button>
              <Button
                size="sm"
                onClick={checkConnected}
                disabled={checking}
                className="w-full sm:w-auto"
              >
                {checking ? t("onboardingWizard.checking") : t("onboardingWizard.alreadyConnected")}
              </Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-foreground">
                {t("onboardingWizard.phoneLabel")}
              </label>
              <Input
                className="mt-1 font-mono"
                placeholder="62812xxxxxxx"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-foreground">
                {t("onboardingWizard.messageLabel")}
              </label>
              <textarea
                className="mt-1 flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring min-h-[90px] resize-y"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
            </div>
            <div className="flex flex-col-reverse sm:flex-row sm:justify-between gap-2">
              <Button variant="ghost" size="sm" onClick={skip} className="w-full sm:w-auto">
                {t("onboardingWizard.skip")}
              </Button>
              <Button size="sm" onClick={sendTest} disabled={sending} className="w-full sm:w-auto">
                {sending ? t("onboardingWizard.sending") : t("onboardingWizard.sendTest")}
              </Button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-5 py-2 text-center">
            <div className="flex justify-center">
              <div className="bg-primary/10 rounded-full p-4">
                <CheckCircle2 className="w-14 h-14 text-primary" />
              </div>
            </div>
            <div>
              <h4 className="text-base font-semibold">
                {t("onboardingWizard.successTitle")}
              </h4>
              <div className="mt-4 space-y-2.5 text-left max-w-[240px] mx-auto">
                <div className="flex items-center gap-2.5 text-sm">
                  <span className="bg-primary/10 rounded-full p-1 shrink-0">
                    <Check className="w-3.5 h-3.5 text-primary" />
                  </span>
                  <span>{t("onboardingWizard.successDevice")}</span>
                </div>
                <div className="flex items-center gap-2.5 text-sm">
                  <span className="bg-primary/10 rounded-full p-1 shrink-0">
                    <Check className="w-3.5 h-3.5 text-primary" />
                  </span>
                  <span>{t("onboardingWizard.successMessage")}</span>
                </div>
              </div>
            </div>
            <Button className="w-full" onClick={finish}>
              {t("onboardingWizard.startUsing")}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

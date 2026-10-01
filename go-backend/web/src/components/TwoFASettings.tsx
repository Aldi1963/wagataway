import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/PasswordInput";
import { ShieldCheck, ShieldOff, Copy, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { apiGet, apiPost } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useLang } from "@/lib/i18n";

type Step = "loading" | "off" | "setup" | "show-codes" | "on";

export default function TwoFASettings() {
  const { t } = useLang();
  const [step, setStep] = useState<Step>("loading");
  const [qr, setQr] = useState("");
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [codes, setCodes] = useState<string[]>([]);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiGet<{ enabled: boolean }>("/2fa/status")
      .then((d) => setStep(d.enabled ? "on" : "off"))
      .catch(() => setStep("off"));
  }, []);

  const startSetup = async () => {
    setBusy(true);
    try {
      const d = await apiPost<{ qr: string; secret: string }>("/2fa/setup");
      setQr(d.qr);
      setSecret(d.secret);
      setCode("");
      setStep("setup");
    } catch (e: any) {
      toast.error(e.message || t("twoFASettings.errStartSetup"));
    } finally {
      setBusy(false);
    }
  };

  const confirmEnable = async () => {
    if (code.trim().length < 6) {
      toast.error(t("twoFASettings.errEnterCode"));
      return;
    }
    setBusy(true);
    try {
      const d = await apiPost<{ backup_codes: string[] }>("/2fa/enable", {
        code: code.trim(),
      });
      setCodes(d.backup_codes || []);
      setStep("show-codes");
      toast.success(t("twoFASettings.enabled"));
    } catch (e: any) {
      toast.error(e.message || t("twoFASettings.errWrongCode"));
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    if (!password || code.trim().length < 6) {
      toast.error(t("twoFASettings.errFillToDisable"));
      return;
    }
    setBusy(true);
    try {
      await apiPost("/2fa/disable", { password, code: code.trim() });
      setStep("off");
      setPassword("");
      setCode("");
      toast.success(t("twoFASettings.disabled"));
    } catch (e: any) {
      toast.error(e.message || t("twoFASettings.errDisable"));
    } finally {
      setBusy(false);
    }
  };

  const regenerate = async () => {
    if (code.trim().length < 6) {
      toast.error(t("twoFASettings.errEnterCurrentCode"));
      return;
    }
    setBusy(true);
    try {
      const d = await apiPost<{ backup_codes: string[] }>(
        "/2fa/backup-codes/regenerate",
        { code: code.trim() }
      );
      setCodes(d.backup_codes || []);
      setCode("");
      setStep("show-codes");
      toast.success(t("twoFASettings.codesRegenerated"));
    } catch (e: any) {
      toast.error(e.message || t("twoFASettings.errRegenerate"));
    } finally {
      setBusy(false);
    }
  };

  const copyText = (t2: string, label: string) => {
    navigator.clipboard.writeText(t2).then(
      () => toast.success(t("twoFASettings.copied").replace("{label}", label)),
      () => toast.error(t("twoFASettings.errCopy"))
    );
  };

  if (step === "loading") {
    return <p className="text-sm text-muted-foreground">{t("twoFASettings.loading")}</p>;
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-4">
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "w-10 h-10 rounded-full flex items-center justify-center",
            step === "on" || step === "show-codes"
              ? "bg-emerald-100 dark:bg-emerald-900/30"
              : "bg-muted"
          )}
        >
          {step === "on" || step === "show-codes" ? (
            <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <ShieldOff className="w-5 h-5 text-muted-foreground" />
          )}
        </div>
        <div>
          <p className="font-semibold text-sm">{t("twoFASettings.title")}</p>
          <p className="text-xs text-muted-foreground">
            {step === "on" || step === "show-codes"
              ? t("twoFASettings.activeDesc")
              : t("twoFASettings.inactiveDesc")}
          </p>
        </div>
      </div>

      {step === "off" && (
        <Button size="sm" onClick={startSetup} disabled={busy}>
          {busy ? t("twoFASettings.preparing") : t("twoFASettings.enable")}
        </Button>
      )}

      {step === "setup" && (
        <div className="space-y-4">
          <ol className="text-sm text-muted-foreground space-y-1.5 list-decimal list-inside">
            <li>{t("twoFASettings.step1")}</li>
            <li>{t("twoFASettings.step2")}</li>
            <li>{t("twoFASettings.step3")}</li>
          </ol>
          <div className="flex flex-col sm:flex-row gap-4 items-start">
            {qr && (
              <img
                src={qr}
                alt="QR 2FA"
                className="w-40 h-40 rounded-lg border border-border bg-white p-1"
              />
            )}
            <div className="flex-1 w-full space-y-2">
              <label className="text-xs font-medium">{t("twoFASettings.secretLabel")}</label>
              <div className="flex gap-2">
                <Input value={secret} readOnly className="font-mono text-xs" />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => copyText(secret, "Secret")}
                >
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
          <div className="space-y-2 max-w-xs">
            <label className="text-xs font-medium">{t("twoFASettings.codeLabel")}</label>
            <Input
              value={code}
              onChange={(e) =>
                setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
              }
              placeholder="123456"
              inputMode="numeric"
              className="font-mono text-center text-lg tracking-[0.3em]"
            />
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={confirmEnable} disabled={busy}>
              {busy ? t("twoFASettings.verifying") : t("twoFASettings.confirmEnable")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setStep("off")}
              disabled={busy}
            >
              {t("twoFASettings.cancel")}
            </Button>
          </div>
        </div>
      )}

      {step === "show-codes" && (
        <div className="space-y-3">
          <p className="text-sm font-medium text-amber-600 dark:text-amber-400">
            {t("twoFASettings.saveCodes")}
          </p>
          <div className="grid grid-cols-2 gap-2 max-w-sm">
            {codes.map((c) => (
              <div
                key={c}
                className="font-mono text-sm text-center rounded-lg border border-border bg-muted/50 px-2 py-1.5"
              >
                {c}
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                copyText(codes.join("\n"), t("twoFASettings.backupCodesLabel"))
              }
            >
              <Copy className="w-4 h-4 mr-1" /> {t("twoFASettings.copyAll")}
            </Button>
            <Button size="sm" onClick={() => setStep("on")}>
              {t("twoFASettings.savedConfirm")}
            </Button>
          </div>
        </div>
      )}

      {step === "on" && (
        <div className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-3 max-w-lg">
            <div className="space-y-2">
              <label className="text-xs font-medium">{t("twoFASettings.currentCodeLabel")}</label>
              <Input
                value={code}
                onChange={(e) =>
                  setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                }
                placeholder="123456"
                inputMode="numeric"
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium">{t("twoFASettings.passwordLabel")}</label>
              <PasswordInput
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t("twoFASettings.passwordPlaceholder")}
                autoComplete="current-password"
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={regenerate}
              disabled={busy}
            >
              <RefreshCw className="w-4 h-4 mr-1" />
              {t("twoFASettings.regenerateCodes")}
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={disable}
              disabled={busy}
            >
              {busy ? t("twoFASettings.processing") : t("twoFASettings.disable")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

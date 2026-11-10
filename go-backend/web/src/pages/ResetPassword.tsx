import { useState } from "react";
import { Link } from "wouter";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiPost } from "@/lib/api";
import AuthLayout from "@/components/AuthLayout";
import { PasswordInput, StrengthMeter } from "@/components/PasswordInput";
import { useLang } from "@/lib/i18n";

function getToken(): string {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("token") || "";
}

export default function ResetPassword() {
  const { t } = useLang();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const token = getToken();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password.length < 6) {
      setError(t("resetPassword.errorPasswordShort"));
      return;
    }
    if (password !== confirm) {
      setError(t("resetPassword.errorConfirmMismatch"));
      return;
    }
    setLoading(true);
    try {
      await apiPost("/auth/reset-password", { token, password });
      setDone(true);
    } catch (err: any) {
      setError(
        err.message || t("resetPassword.errorInvalidLink")
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title={t("resetPassword.title")}
      subtitle={t("resetPassword.subtitle")}
    >
      {!token ? (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-950/30 px-3 py-2.5">
          <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
          <p className="text-[13px] text-red-600 dark:text-red-400">
            {t("resetPassword.invalidLinkBefore")}{" "}
            <Link href="/forgot-password" className="font-medium underline">
              {t("resetPassword.invalidLinkAnchor")}
            </Link>
            {t("resetPassword.invalidLinkAfter")}
          </p>
        </div>
      ) : done ? (
        <div className="text-center py-4">
          <span className="w-14 h-14 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-7 h-7 text-emerald-500" />
          </span>
          <h2 className="font-semibold text-foreground mt-4">
            {t("resetPassword.successTitle")}
          </h2>
          <p className="text-sm text-muted-foreground mt-2">
            {t("resetPassword.successMessage")}
          </p>
          <Link href="/login">
            <Button className="mt-6 bg-[#243370] hover:bg-[#1c2a5c] text-white">
              {t("resetPassword.loginNow")}
            </Button>
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[13px] font-medium text-foreground">
              {t("resetPassword.newPassword")}
            </label>
            <PasswordInput
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t("resetPassword.passwordPlaceholder")}
              required
              minLength={6}
              autoComplete="new-password"
            />
            <StrengthMeter password={password} />
          </div>

          <div className="space-y-1.5">
            <label className="text-[13px] font-medium text-foreground">
              {t("resetPassword.confirmPassword")}
            </label>
            <PasswordInput
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder={t("resetPassword.confirmPlaceholder")}
              required
              autoComplete="new-password"
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-950/30 px-3 py-2.5">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <p className="text-[13px] text-red-600 dark:text-red-400">
                {error}
              </p>
            </div>
          )}

          <Button
            type="submit"
            className="w-full bg-[#243370] hover:bg-[#1c2a5c] text-white h-11 text-[15px] font-semibold"
            disabled={loading}
          >
            {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {loading ? t("resetPassword.processing") : t("resetPassword.submit")}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}

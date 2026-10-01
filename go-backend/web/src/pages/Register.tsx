import { useState } from "react";
import { Link } from "wouter";
import { AlertCircle, Check, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import AuthLayout from "@/components/AuthLayout";
import { PasswordInput, StrengthMeter } from "@/components/PasswordInput";
import { cn } from "@/lib/utils";
import { useLang } from "@/lib/i18n";

export default function Register() {
  const { t } = useLang();
  const { register } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const match = confirm.length > 0 && password === confirm;
  const mismatch = confirm.length > 0 && password !== confirm;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password !== confirm) {
      setError(t("register.errorConfirmMismatch"));
      return;
    }
    if (password.length < 6) {
      setError(t("register.errorPasswordShort"));
      return;
    }
    setLoading(true);
    try {
      await register(name, email, password);
    } catch (err: any) {
      setError(err.message || t("register.errorGeneric"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title={t("register.title")}
      subtitle={t("register.subtitle")}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-[13px] font-medium text-foreground">
            {t("register.fullName")}
          </label>
          <Input
            placeholder={t("register.namePlaceholder")}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoComplete="name"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-[13px] font-medium text-foreground">{t("register.emailLabel")}</label>
          <Input
            type="email"
            placeholder="nama@perusahaan.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-[13px] font-medium text-foreground">
            {t("register.passwordLabel")}
          </label>
          <PasswordInput
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t("register.passwordPlaceholder")}
            required
            minLength={6}
            autoComplete="new-password"
          />
          <StrengthMeter password={password} />
        </div>

        <div className="space-y-1.5">
          <label className="text-[13px] font-medium text-foreground">
            {t("register.confirmPassword")}
          </label>
          <div className="relative">
            <PasswordInput
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder={t("register.confirmPlaceholder")}
              required
              autoComplete="new-password"
              className={cn(
                match && "border-emerald-500 focus-visible:ring-emerald-500",
                mismatch && "border-red-500 focus-visible:ring-red-500"
              )}
            />
            {match && (
              <span className="absolute right-10 top-1/2 -translate-y-1/2 text-emerald-500">
                <Check className="w-4 h-4" />
              </span>
            )}
          </div>
          {mismatch && (
            <p className="text-[11px] text-red-500">{t("register.passwordMismatch")}</p>
          )}
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-950/30 px-3 py-2.5">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
            <p className="text-[13px] text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}

        <Button
          type="submit"
          className="w-full bg-[#243370] hover:bg-[#1c2a5c] text-white h-11 text-[15px] font-semibold"
          disabled={loading}
        >
          {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          {loading ? t("register.processing") : t("register.submit")}
        </Button>

        {/* Fitur 7: info trial otomatis */}
        <p className="flex items-center justify-center gap-1.5 text-[12px] text-muted-foreground">
          <Sparkles className="w-3.5 h-3.5 text-[#243370] dark:text-blue-400 shrink-0" />
          {t("register.trialInfo")}
        </p>

        <p className="text-[11px] text-muted-foreground text-center leading-relaxed">
          {t("register.termsNotice")}
        </p>
      </form>

      <p className="text-center text-[13px] text-muted-foreground mt-6">
        {t("register.haveAccount")}{" "}
        <Link
          href="/login"
          className="font-semibold text-[#243370] dark:text-blue-400 hover:underline"
        >
          {t("register.loginLink")}
        </Link>
      </p>
    </AuthLayout>
  );
}

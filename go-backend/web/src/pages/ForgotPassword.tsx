import { useState } from "react";
import { Link } from "wouter";
import { AlertCircle, ArrowLeft, Loader2, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiPost } from "@/lib/api";
import AuthLayout from "@/components/AuthLayout";
import { useLang } from "@/lib/i18n";

export default function ForgotPassword() {
  const { t } = useLang();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await apiPost("/auth/forgot-password", { email });
      setSent(true);
    } catch (err: any) {
      setError(err.message || t("forgotPassword.errorGeneric"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title={t("forgotPassword.title")}
      subtitle={t("forgotPassword.subtitle")}
    >
      {sent ? (
        <div className="text-center py-4">
          <span className="w-14 h-14 rounded-full bg-[#243370]/10 dark:bg-[#243370]/10 flex items-center justify-center mx-auto">
            <MailCheck className="w-7 h-7 text-[#243370] dark:text-blue-400" />
          </span>
          <h2 className="font-semibold text-foreground mt-4">
            {t("forgotPassword.checkEmail")}
          </h2>
          <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
            {t("forgotPassword.sentBefore")}{" "}
            <span className="font-medium text-foreground">{email}</span>{" "}
            {t("forgotPassword.sentAfter")}
          </p>
          <Button
            variant="outline"
            className="mt-6"
            onClick={() => {
              setSent(false);
              setEmail("");
            }}
          >
            {t("forgotPassword.resend")}
          </Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[13px] font-medium text-foreground">
              {t("forgotPassword.emailLabel")}
            </label>
            <Input
              type="email"
              placeholder="nama@perusahaan.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
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
            {loading ? t("forgotPassword.sending") : t("forgotPassword.submit")}
          </Button>
        </form>
      )}

      <Link
        href="/login"
        className="flex items-center justify-center gap-1.5 text-[13px] font-medium text-muted-foreground hover:text-foreground mt-6"
      >
        <ArrowLeft className="w-4 h-4" />
        {t("forgotPassword.backToLogin")}
      </Link>
    </AuthLayout>
  );
}

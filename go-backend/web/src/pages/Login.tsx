import { useEffect, useState } from "react";
import { Link } from "wouter";
import { AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import AuthLayout from "@/components/AuthLayout";
import { PasswordInput } from "@/components/PasswordInput";

function GoogleIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
      />
    </svg>
  );
}

function GithubIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.55v-2.15c-3.2.7-3.87-1.36-3.87-1.36-.52-1.33-1.28-1.68-1.28-1.68-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.19 1.76 1.19 1.03 1.76 2.7 1.25 3.36.96.1-.75.4-1.25.72-1.54-2.55-.29-5.23-1.28-5.23-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11.1 11.1 0 0 1 5.8 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.41-2.69 5.38-5.25 5.67.41.35.77 1.05.77 2.12v3.14c0 .3.21.67.8.55A11.51 11.51 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5z" />
    </svg>
  );
}

export default function Login() {
  const { login } = useAuth();
  const [oauthProviders, setOauthProviders] = useState<Record<
    string,
    { enabled: boolean }
  > | null>(null);
  const [email, setEmail] = useState(
    () => localStorage.getItem("wag-remember-email") || ""
  );
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(
    () => !!localStorage.getItem("wag-remember-email")
  );
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Error dari callback OAuth.
    const params = new URLSearchParams(window.location.search);
    const oauthError = params.get("oauth_error");
    if (oauthError) {
      setError(oauthError);
      window.history.replaceState({}, "", "/login");
    }
    fetch("/api/auth/oauth/status")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setOauthProviders(d.providers || null))
      .catch(() => {});
  }, []);

  const handleOAuth = (provider: string) => {
    window.location.href = `/api/auth/oauth/${provider}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (remember) localStorage.setItem("wag-remember-email", email);
      else localStorage.removeItem("wag-remember-email");
      await login(email, password);
    } catch (err: any) {
      setError(err.message || "Email atau password salah. Coba lagi.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Selamat datang kembali"
      subtitle="Masuk untuk mengelola WhatsApp gateway Anda."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-[13px] font-medium text-foreground">Email</label>
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
            Password
          </label>
          <PasswordInput
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
        </div>

        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-[13px] text-muted-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="w-4 h-4 rounded accent-[#243370] cursor-pointer"
            />
            Ingat saya
          </label>
          <Link
            href="/forgot-password"
            className="text-[13px] font-medium text-[#243370] dark:text-blue-400 hover:underline"
          >
            Lupa password?
          </Link>
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
          {loading ? "Memproses..." : "Masuk"}
        </Button>
      </form>

      {(oauthProviders?.google?.enabled || oauthProviders?.github?.enabled) && (
        <div className="mt-6">
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">
                atau lanjutkan dengan
              </span>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            {oauthProviders?.google?.enabled && (
              <Button
                type="button"
                variant="outline"
                className="h-11 gap-2"
                onClick={() => handleOAuth("google")}
              >
                <GoogleIcon /> Google
              </Button>
            )}
            {oauthProviders?.github?.enabled && (
              <Button
                type="button"
                variant="outline"
                className="h-11 gap-2"
                onClick={() => handleOAuth("github")}
              >
                <GithubIcon /> GitHub
              </Button>
            )}
          </div>
        </div>
      )}

      <p className="text-center text-[13px] text-muted-foreground mt-6">
        Belum punya akun?{" "}
        <Link
          href="/register"
          className="font-semibold text-[#243370] dark:text-blue-400 hover:underline"
        >
          Daftar gratis
        </Link>
      </p>
    </AuthLayout>
  );
}

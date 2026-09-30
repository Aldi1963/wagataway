import { useState } from "react";
import { Link } from "wouter";
import { AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import AuthLayout from "@/components/AuthLayout";
import { PasswordInput } from "@/components/PasswordInput";

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState(
    () => localStorage.getItem("wag-remember-email") || ""
  );
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(
    () => !!localStorage.getItem("wag-remember-email")
  );
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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

import { useState } from "react";
import { Link } from "wouter";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiPost } from "@/lib/api";
import AuthLayout from "@/components/AuthLayout";
import { PasswordInput, StrengthMeter } from "@/components/PasswordInput";

function getToken(): string {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("token") || "";
}

export default function ResetPassword() {
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
      setError("Password minimal 6 karakter.");
      return;
    }
    if (password !== confirm) {
      setError("Konfirmasi password tidak sama.");
      return;
    }
    setLoading(true);
    try {
      await apiPost("/auth/reset-password", { token, password });
      setDone(true);
    } catch (err: any) {
      setError(
        err.message || "Link tidak valid atau sudah kedaluwarsa."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Buat password baru"
      subtitle="Pilih password yang kuat dan mudah Anda ingat."
    >
      {!token ? (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-950/30 px-3 py-2.5">
          <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
          <p className="text-[13px] text-red-600 dark:text-red-400">
            Link reset tidak valid. Minta link baru lewat halaman{" "}
            <Link href="/forgot-password" className="font-medium underline">
              lupa password
            </Link>
            .
          </p>
        </div>
      ) : done ? (
        <div className="text-center py-4">
          <span className="w-14 h-14 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-7 h-7 text-emerald-500" />
          </span>
          <h2 className="font-semibold text-foreground mt-4">
            Password berhasil direset
          </h2>
          <p className="text-sm text-muted-foreground mt-2">
            Silakan masuk dengan password baru Anda.
          </p>
          <Link href="/login">
            <Button className="mt-6 bg-[#243370] hover:bg-[#1c2a5c] text-white">
              Masuk sekarang
            </Button>
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[13px] font-medium text-foreground">
              Password baru
            </label>
            <PasswordInput
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Minimal 6 karakter"
              required
              minLength={6}
              autoComplete="new-password"
            />
            <StrengthMeter password={password} />
          </div>

          <div className="space-y-1.5">
            <label className="text-[13px] font-medium text-foreground">
              Konfirmasi password baru
            </label>
            <PasswordInput
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Ulangi password baru"
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
            {loading ? "Memproses..." : "Reset password"}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}

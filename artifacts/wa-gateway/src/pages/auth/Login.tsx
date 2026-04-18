import { useState, useRef, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Zap, Loader2, Eye, EyeOff, MessageSquare, Shield, BarChart3,
  ArrowRight, Sparkles, Star, ShieldCheck, ArrowLeft, Mail,
  RefreshCw, KeyRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useSiteConfig } from "@/hooks/use-site-config";
import { API_BASE } from "@/lib/api";
import { GoogleLogin } from "@react-oauth/google";

const schema = z.object({
  email: z.string().email("Email tidak valid"),
  password: z.string().min(6, "Password minimal 6 karakter"),
});
type FormData = z.infer<typeof schema>;

const stats = [
  { value: "10K+", label: "Pengguna Aktif" },
  { value: "99.9%", label: "Uptime" },
  { value: "50M+", label: "Pesan Terkirim" },
];

const features = [
  { icon: MessageSquare, label: "Blast & Auto Reply", color: "text-emerald-300" },
  { icon: Zap, label: "Multi Device WhatsApp", color: "text-yellow-300" },
  { icon: Shield, label: "Anti-Banned Protection", color: "text-blue-300" },
  { icon: BarChart3, label: "Analitik Real-time", color: "text-purple-300" },
];

const testimonial = {
  text: "WA Gateway mengubah cara kami berkomunikasi dengan pelanggan. Blast 10.000 pesan dalam hitungan menit!",
  name: "Budi Santoso",
  role: "CEO, Toko Digital",
  avatar: "BS",
};

type PageStep = "login" | "2fa" | "forgot-email" | "forgot-otp";

function SiteLogo({ logo, size = 20 }: { logo: string; size?: number }) {
  const isUrl = logo.startsWith("http://") || logo.startsWith("https://") || (logo.startsWith("/") && logo.length > 1);
  if (isUrl) {
    return <img src={logo} alt="logo" style={{ width: size, height: size, objectFit: "contain" }} />;
  }
  return <span style={{ fontSize: size - 2, lineHeight: 1 }}>{logo}</span>;
}

export default function Login() {
  const { login } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { siteName, siteLogo, siteTagline } = useSiteConfig();
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);

  // Step state
  const [step, setStep] = useState<PageStep>("login");

  // 2FA state
  const [twoFaUserId, setTwoFaUserId] = useState<number | null>(null);
  const [otpValue, setOtpValue] = useState("");
  const [otpLoading, setOtpLoading] = useState(false);

  // Forgot password state
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotOtp, setForgotOtp] = useState(["", "", "", "", "", ""]);
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [otpSending, setOtpSending] = useState(false);
  const [otpCooldown, setOtpCooldown] = useState(0);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const forgotOtpRefs = useRef<Array<HTMLInputElement | null>>([]);

  const [googleClientId, setGoogleClientId] = useState(
    import.meta.env.VITE_GOOGLE_CLIENT_ID ?? ""
  );

  useEffect(() => {
    fetch("/api/auth/config")
      .then((r) => r.json())
      .then((d) => { if (d.googleClientId) setGoogleClientId(d.googleClientId); })
      .catch(() => {});
  }, []);

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    // @ts-ignore - fix for production build
    resolver: zodResolver(schema as any) as any,
  });

  function startCooldown() {
    setOtpCooldown(60);
    if (cooldownRef.current) clearInterval(cooldownRef.current);
    cooldownRef.current = setInterval(() => {
      setOtpCooldown((prev) => {
        if (prev <= 1) { clearInterval(cooldownRef.current!); return 0; }
        return prev - 1;
      });
    }, 1000);
  }

  // ── Login ──────────────────────────────────────────────────────────────────
  async function onSubmit(data: FormData) {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok) {
        toast({ title: "Login gagal", description: json.message ?? "Email atau password salah", variant: "destructive" });
        return;
      }
      if (json.requires2fa) {
        setTwoFaUserId(json.userId);
        setStep("2fa");
        return;
      }
      login(json.token, json.user);
      setLocation("/");
    } catch {
      toast({ title: "Error", description: "Tidak dapat terhubung ke server", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  // ── 2FA verify ──────────────────────────────────────────────────────────
  async function onVerify2fa() {
    if (!twoFaUserId || otpValue.length < 6) return;
    setOtpLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/2fa/check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: twoFaUserId, token: otpValue }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast({ title: "Kode OTP salah", description: json.message, variant: "destructive" });
        setOtpValue("");
        return;
      }
      login(json.token, json.user);
      setLocation("/");
    } catch {
      toast({ title: "Error", description: "Tidak dapat terhubung ke server", variant: "destructive" });
    } finally {
      setOtpLoading(false);
    }
  }

  // ── Forgot password: send OTP ───────────────────────────────────────────
  async function onSendForgotOtp() {
    if (!forgotEmail.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      toast({ title: "Email tidak valid", variant: "destructive" });
      return;
    }
    setOtpSending(true);
    try {
      const res = await fetch(`${API_BASE}/auth/otp/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: forgotEmail, type: "forgot_password" }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast({ title: "Gagal", description: json.message, variant: "destructive" });
        return;
      }
      toast({ title: "Kode OTP dikirim!", description: "Cek inbox atau folder spam email Anda." });
      startCooldown();
      setStep("forgot-otp");
    } catch {
      toast({ title: "Error", description: "Tidak dapat terhubung ke server", variant: "destructive" });
    } finally {
      setOtpSending(false);
    }
  }

  function handleForgotOtpInput(index: number, value: string) {
    const digit = value.replace(/\D/g, "").slice(-1);
    const next = [...forgotOtp];
    next[index] = digit;
    setForgotOtp(next);
    if (digit && index < 5) forgotOtpRefs.current[index + 1]?.focus();
  }

  function handleForgotOtpKeyDown(index: number, e: React.KeyboardEvent) {
    if (e.key === "Backspace" && !forgotOtp[index] && index > 0) {
      forgotOtpRefs.current[index - 1]?.focus();
    }
  }

  function handleForgotOtpPaste(e: React.ClipboardEvent) {
    const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (text.length === 6) {
      setForgotOtp(text.split(""));
      forgotOtpRefs.current[5]?.focus();
    }
  }

  // ── Forgot password: reset ──────────────────────────────────────────────
  async function onResetPassword() {
    const otp = forgotOtp.join("");
    if (otp.length < 6) return;
    if (newPassword.length < 6) {
      toast({ title: "Password terlalu pendek", description: "Minimal 6 karakter", variant: "destructive" });
      return;
    }
    if (newPassword !== confirmNewPassword) {
      toast({ title: "Password tidak cocok", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/password/forgot`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: forgotEmail, otp, newPassword }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast({ title: "Gagal", description: json.message, variant: "destructive" });
        if (json.code === "INVALID_OTP") setForgotOtp(["", "", "", "", "", ""]);
        return;
      }
      toast({ title: "Password berhasil direset!", description: "Anda telah login otomatis." });
      login(json.token, json.user);
      setLocation("/");
    } catch {
      toast({ title: "Error", description: "Tidak dapat terhubung ke server", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleSuccess(credentialResponse: { credential?: string }) {
    if (!credentialResponse.credential) return;
    setGoogleLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/google`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential: credentialResponse.credential }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast({ title: "Login Google gagal", description: json.message ?? "Terjadi kesalahan", variant: "destructive" });
        return;
      }
      login(json.token, json.user);
      setLocation("/");
    } catch {
      toast({ title: "Error", description: "Tidak dapat terhubung ke server", variant: "destructive" });
    } finally {
      setGoogleLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden"
      style={{ background: "linear-gradient(135deg, hsl(145 55% 12%) 0%, hsl(145 50% 18%) 40%, hsl(160 45% 14%) 100%)" }}>

      {/* Background decorations */}
      <div className="absolute inset-0 pointer-events-none">
        <svg className="absolute inset-0 w-full h-full opacity-[0.06]" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
              <path d="M 50 0 L 0 0 0 50" fill="none" stroke="white" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
        <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full opacity-20"
          style={{ background: "radial-gradient(circle, hsl(145 63% 60%) 0%, transparent 70%)" }} />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full opacity-15"
          style={{ background: "radial-gradient(circle, hsl(160 60% 50%) 0%, transparent 70%)" }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full opacity-5"
          style={{ background: "radial-gradient(circle, white 0%, transparent 60%)" }} />
      </div>

      {/* Card */}
      <div className="relative z-10 w-full max-w-[420px] flex flex-col">

        {/* Logo above card */}
        <div className="flex items-center justify-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center shadow-lg border border-white/20"
            style={{ background: "linear-gradient(135deg, hsl(145 63% 44%) 0%, hsl(145 63% 35%) 100%)" }}>
            <SiteLogo logo={siteLogo} size={20} />
          </div>
          <span className="text-xl font-bold text-white tracking-tight">{siteName}</span>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider border border-white/25 text-white/70 bg-white/10">Pro</span>
        </div>

        {/* Main card */}
        <div className="bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl border border-white/10 overflow-hidden">

          {/* Card top accent bar */}
          <div className="h-1 w-full" style={{ background: "linear-gradient(90deg, hsl(145 63% 44%) 0%, hsl(160 60% 40%) 100%)" }} />

          <div className="p-8">

            {/* ── STEP: Login ── */}
            {step === "login" && (
              <>
                <div className="mb-7">
                  <h2 className="text-3xl font-bold text-foreground">Masuk</h2>
                  <p className="text-muted-foreground mt-1 text-sm">Masuk untuk mengakses akun Anda</p>
                </div>

                <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
                  <div className="space-y-1.5">
                    <Label htmlFor="email" className="text-sm font-medium text-foreground">Email</Label>
                    <Input id="email" type="email" placeholder="Masukkan email" autoComplete="email" {...register("email")}
                      className={`h-12 rounded-xl border transition-all text-sm ${errors.email ? "border-destructive" : "border-border focus-visible:border-primary"}`} />
                    {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="password" className="text-sm font-medium text-foreground">Password</Label>
                      <button type="button" className="text-xs font-medium hover:underline" style={{ color: "hsl(145 63% 40%)" }}
                        onClick={() => setStep("forgot-email")}>
                        Lupa password?
                      </button>
                    </div>
                    <div className="relative">
                      <Input id="password" type={showPassword ? "text" : "password"} placeholder="••••••••"
                        autoComplete="current-password" {...register("password")}
                        className={`h-12 pr-10 rounded-xl border transition-all text-sm ${errors.password ? "border-destructive" : "border-border focus-visible:border-primary"}`} />
                      <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                        onClick={() => setShowPassword(!showPassword)}>
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
                  </div>

                  <Button type="submit" className="w-full h-12 rounded-xl font-semibold text-white text-sm shadow-sm transition-all"
                    style={{ background: "hsl(145 63% 40%)" }}
                    disabled={loading}>
                    {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                    {loading ? "Memproses..." : "Masuk"}
                  </Button>
                </form>

                {googleClientId && (
                  <>
                    <div className="relative my-5">
                      <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-border" />
                      </div>
                      <div className="relative flex justify-center">
                        <span className="bg-white dark:bg-zinc-900 px-3 text-sm text-muted-foreground">Atau</span>
                      </div>
                    </div>

                    <div>
                      {googleLoading ? (
                        <div className="flex items-center justify-center h-12 border border-border rounded-xl">
                          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                        </div>
                      ) : (
                        <div className="[&>div]:w-full [&>div>div]:w-full [&>div>div>iframe]:w-full">
                          <GoogleLogin onSuccess={handleGoogleSuccess}
                            onError={() => toast({ title: "Login Google gagal", variant: "destructive" })}
                            width={400} text="signin_with" shape="rectangular" theme="outline" size="large" logo_alignment="left" />
                        </div>
                      )}
                    </div>
                  </>
                )}

                <p className="text-center text-sm text-muted-foreground mt-6">
                  Belum punya akun?{" "}
                  <Link href="/register" className="font-semibold hover:underline" style={{ color: "hsl(145 63% 40%)" }}>
                    Daftar gratis
                  </Link>
                </p>

                <p className="text-center text-[11px] text-muted-foreground/40 mt-4 bg-muted/30 rounded-lg px-3 py-2">
                  Demo: <span className="font-mono">admin@example.com</span> / <span className="font-mono">password123</span>
                </p>
              </>
            )}

            {/* ── STEP: 2FA ── */}
            {step === "2fa" && (
              <div className="space-y-6">
                <div className="text-center mb-2">
                  <h2 className="text-2xl font-extrabold text-foreground tracking-tight">Verifikasi 2FA</h2>
                  <p className="text-muted-foreground mt-1.5 text-sm">Masukkan kode dari aplikasi autentikator</p>
                </div>

                <div className="flex items-center gap-3 p-4 bg-primary/5 border border-primary/20 rounded-2xl">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <ShieldCheck className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground text-sm">Verifikasi Dua Langkah</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Akun ini dilindungi 2FA. Masukkan kode dari aplikasi autentikator.</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium">Kode OTP (6 digit)</Label>
                  <Input type="text" inputMode="numeric" maxLength={6} placeholder="000000"
                    className="h-14 text-center font-mono text-2xl tracking-[0.5em] rounded-xl border-border/70 focus-visible:border-primary"
                    value={otpValue}
                    onChange={(e) => setOtpValue(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    onKeyDown={(e) => e.key === "Enter" && onVerify2fa()}
                    autoFocus />
                  <p className="text-xs text-muted-foreground">Buka Google Authenticator, Authy, atau aplikasi autentikator lainnya.</p>
                </div>

                <Button className="w-full h-11 rounded-xl font-semibold gap-2 text-white shadow-md"
                  style={{ background: "linear-gradient(135deg, hsl(145 63% 44%) 0%, hsl(145 63% 36%) 100%)" }}
                  onClick={onVerify2fa} disabled={otpValue.length < 6 || otpLoading}>
                  {otpLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                  {otpLoading ? "Memverifikasi..." : "Verifikasi & Masuk"}
                </Button>

                <button type="button" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mx-auto"
                  onClick={() => { setStep("login"); setOtpValue(""); setTwoFaUserId(null); }}>
                  <ArrowLeft className="w-3.5 h-3.5" /> Kembali ke halaman login
                </button>
              </div>
            )}

          {/* ── STEP: Forgot — masukkan email ── */}
          {step === "forgot-email" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-extrabold text-foreground tracking-tight">Lupa Password?</h2>
                <p className="text-muted-foreground mt-1.5 text-sm">Masukkan email Anda untuk menerima kode OTP reset password.</p>
              </div>

              <div className="flex items-center gap-3 p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-2xl">
                <div className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
                  <KeyRound className="w-4 h-4 text-amber-600" />
                </div>
                <p className="text-xs text-amber-700 dark:text-amber-400">Kode OTP akan dikirim ke email terdaftar. Berlaku 10 menit.</p>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium">Email Terdaftar</Label>
                <Input type="email" placeholder="nama@email.com" autoFocus
                  className="h-11 rounded-xl border-border/70 focus-visible:border-primary"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)} />
              </div>

              <Button className="w-full h-11 rounded-xl font-semibold gap-2 text-white"
                style={{ background: "linear-gradient(135deg, hsl(145 63% 44%) 0%, hsl(145 63% 38%) 100%)" }}
                onClick={onSendForgotOtp} disabled={!forgotEmail || otpSending}>
                {otpSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                {otpSending ? "Mengirim..." : "Kirim Kode OTP"}
              </Button>

              <button type="button" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mx-auto"
                onClick={() => setStep("login")}>
                <ArrowLeft className="w-3.5 h-3.5" /> Kembali ke login
              </button>
            </div>
          )}

          {/* ── STEP: Forgot — masukkan OTP + password baru ── */}
          {step === "forgot-otp" && (
            <div className="space-y-5">
              <div>
                <h2 className="text-2xl font-extrabold text-foreground tracking-tight">Reset Password</h2>
                <p className="text-muted-foreground mt-1.5 text-sm">
                  Kode OTP dikirim ke <strong>{forgotEmail}</strong>
                </p>
              </div>

              <div className="space-y-3">
                <Label className="text-sm font-medium">Kode OTP</Label>
                <div className="flex gap-2 justify-between" onPaste={handleForgotOtpPaste}>
                  {forgotOtp.map((digit, i) => (
                    <input key={i}
                      ref={(el) => { forgotOtpRefs.current[i] = el; }}
                      type="text" inputMode="numeric" maxLength={1} value={digit}
                      onChange={(e) => handleForgotOtpInput(i, e.target.value)}
                      onKeyDown={(e) => handleForgotOtpKeyDown(i, e)}
                      autoFocus={i === 0}
                      className="w-12 h-14 text-center text-xl font-bold font-mono border border-border rounded-xl bg-background focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all" />
                  ))}
                </div>

                <button type="button"
                  className="flex items-center gap-1.5 text-xs font-medium transition-colors disabled:opacity-40"
                  style={{ color: otpCooldown > 0 ? undefined : "hsl(145 63% 45%)" }}
                  onClick={onSendForgotOtp} disabled={otpCooldown > 0 || otpSending}>
                  {otpSending ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                  {otpCooldown > 0 ? `Kirim ulang (${otpCooldown}s)` : "Kirim ulang OTP"}
                </button>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium">Password Baru</Label>
                <div className="relative">
                  <Input type={showNewPw ? "text" : "password"} placeholder="Min. 6 karakter"
                    className="h-11 pr-10 rounded-xl border-border/70 focus-visible:border-primary"
                    value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
                  <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => setShowNewPw(!showNewPw)}>
                    {showNewPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium">Konfirmasi Password Baru</Label>
                <Input type="password" placeholder="Ulangi password baru"
                  className="h-11 rounded-xl border-border/70 focus-visible:border-primary"
                  value={confirmNewPassword} onChange={(e) => setConfirmNewPassword(e.target.value)} />
                {confirmNewPassword && newPassword !== confirmNewPassword && (
                  <p className="text-xs text-destructive">Password tidak cocok</p>
                )}
              </div>

              <Button className="w-full h-11 rounded-xl font-semibold gap-2 text-white"
                style={{ background: "linear-gradient(135deg, hsl(145 63% 44%) 0%, hsl(145 63% 38%) 100%)" }}
                onClick={onResetPassword}
                disabled={forgotOtp.join("").length < 6 || newPassword.length < 6 || newPassword !== confirmNewPassword || loading}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                {loading ? "Mereset password..." : "Reset Password & Masuk"}
              </Button>

              <button type="button" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mx-auto"
                onClick={() => { setStep("forgot-email"); setForgotOtp(["", "", "", "", "", ""]); }}>
                <ArrowLeft className="w-3.5 h-3.5" /> Ubah email
              </button>
            </div>
          )}

          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-white/30 text-xs mt-5">
          © 2025 {siteName}. {siteTagline}
        </p>
      </div>
    </div>
  );
}

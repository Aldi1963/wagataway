import { useState, useRef, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Zap, Loader2, Eye, EyeOff, CheckCircle2, ArrowRight,
  MessageSquare, Shield, BarChart3, Mail, ArrowLeft, RefreshCw,
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
  name: z.string().min(2, "Nama minimal 2 karakter"),
  email: z.string().email("Email tidak valid"),
  password: z.string().min(6, "Password minimal 6 karakter"),
  confirmPassword: z.string(),
}).refine((d) => d.password === d.confirmPassword, {
  message: "Password tidak cocok",
  path: ["confirmPassword"],
});
type FormData = z.infer<typeof schema>;

function SiteLogo({ logo, size = 20 }: { logo: string; size?: number }) {
  const isUrl = logo.startsWith("http://") || logo.startsWith("https://") || (logo.startsWith("/") && logo.length > 1);
  if (isUrl) {
    return <img src={logo} alt="logo" style={{ width: size, height: size, objectFit: "contain" }} />;
  }
  return <span style={{ fontSize: size - 2, lineHeight: 1 }}>{logo}</span>;
}

export default function Register() {
  const { login } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { siteName, siteLogo, siteTagline } = useSiteConfig();
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [step, setStep] = useState<"form" | "otp">("form");
  const [formData, setFormData] = useState<FormData | null>(null);
  const [otpSending, setOtpSending] = useState(false);
  const [otpCooldown, setOtpCooldown] = useState(0);
  const [otpDigits, setOtpDigits] = useState(["", "", "", "", "", ""]);
  const otpRefs = useRef<Array<HTMLInputElement | null>>([]);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  async function sendOtp(email: string) {
    setOtpSending(true);
    try {
      const res = await fetch(`${API_BASE}/auth/otp/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, type: "register" }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast({ title: "Gagal mengirim OTP", description: json.message, variant: "destructive" });
        return false;
      }
      toast({ title: "Kode OTP dikirim!", description: "Cek inbox atau folder spam email Anda." });
      startCooldown();
      return true;
    } catch {
      toast({ title: "Error", description: "Tidak dapat terhubung ke server", variant: "destructive" });
      return false;
    } finally {
      setOtpSending(false);
    }
  }

  async function onSubmit(data: FormData) {
    setFormData(data);
    const ok = await sendOtp(data.email);
    if (ok) setStep("otp");
  }

  function handleOtpInput(index: number, value: string) {
    const digit = value.replace(/\D/g, "").slice(-1);
    const next = [...otpDigits];
    next[index] = digit;
    setOtpDigits(next);
    if (digit && index < 5) otpRefs.current[index + 1]?.focus();
  }

  function handleOtpKeyDown(index: number, e: React.KeyboardEvent) {
    if (e.key === "Backspace" && !otpDigits[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  }

  function handleOtpPaste(e: React.ClipboardEvent) {
    const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (text.length === 6) {
      setOtpDigits(text.split(""));
      otpRefs.current[5]?.focus();
    }
  }

  async function onVerifyOtp() {
    if (!formData) return;
    const otp = otpDigits.join("");
    if (otp.length < 6) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: formData.name, email: formData.email, password: formData.password, otp }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast({ title: "Registrasi gagal", description: json.message ?? "Terjadi kesalahan", variant: "destructive" });
        if (json.code === "INVALID_OTP") setOtpDigits(["", "", "", "", "", ""]);
        return;
      }
      toast({ title: "Akun berhasil dibuat!", description: `Selamat datang di ${siteName}.` });
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
        toast({ title: "Daftar Google gagal", description: json.message ?? "Terjadi kesalahan", variant: "destructive" });
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
            <pattern id="dots" width="30" height="30" patternUnits="userSpaceOnUse">
              <circle cx="2" cy="2" r="1.5" fill="white" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#dots)" />
        </svg>
        <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full opacity-20"
          style={{ background: "radial-gradient(circle, hsl(145 63% 60%) 0%, transparent 70%)" }} />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full opacity-15"
          style={{ background: "radial-gradient(circle, hsl(160 60% 50%) 0%, transparent 70%)" }} />
      </div>

      {/* Card wrapper */}
      <div className="relative z-10 w-full max-w-[440px] flex flex-col">

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

            {/* ── STEP 1: Form Registrasi ── */}
            {step === "form" && (
              <>
                <div className="mb-7">
                  <h2 className="text-3xl font-bold text-foreground">Daftar</h2>
                  <p className="text-muted-foreground mt-1 text-sm">Buat akun untuk mulai menggunakan {siteName}</p>
                </div>

                <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
                  <div className="space-y-1.5">
                    <Label htmlFor="name" className="text-sm font-medium text-foreground">Nama Lengkap</Label>
                    <Input id="name" placeholder="Masukkan nama Anda" autoComplete="name" {...register("name")}
                      className={`h-12 rounded-xl border transition-all text-sm ${errors.name ? "border-destructive" : "border-border focus-visible:border-primary"}`} />
                    {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="email" className="text-sm font-medium text-foreground">Email</Label>
                    <Input id="email" type="email" placeholder="Masukkan email" autoComplete="email" {...register("email")}
                      className={`h-12 rounded-xl border transition-all text-sm ${errors.email ? "border-destructive" : "border-border focus-visible:border-primary"}`} />
                    {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="password" className="text-sm font-medium text-foreground">Password</Label>
                    <div className="relative">
                      <Input id="password" type={showPassword ? "text" : "password"} placeholder="Min. 6 karakter"
                        autoComplete="new-password" {...register("password")}
                        className={`h-12 pr-10 rounded-xl border transition-all text-sm ${errors.password ? "border-destructive" : "border-border focus-visible:border-primary"}`} />
                      <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                        onClick={() => setShowPassword(!showPassword)}>
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="confirmPassword" className="text-sm font-medium text-foreground">Konfirmasi Password</Label>
                    <div className="relative">
                      <Input id="confirmPassword" type={showConfirm ? "text" : "password"} placeholder="Ulangi password"
                        autoComplete="new-password" {...register("confirmPassword")}
                        className={`h-12 pr-10 rounded-xl border transition-all text-sm ${errors.confirmPassword ? "border-destructive" : "border-border focus-visible:border-primary"}`} />
                      <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                        onClick={() => setShowConfirm(!showConfirm)}>
                        {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    {errors.confirmPassword && <p className="text-xs text-destructive">{errors.confirmPassword.message}</p>}
                  </div>

                  <Button type="submit" className="w-full h-12 rounded-xl font-semibold text-white text-sm shadow-sm transition-all"
                    style={{ background: "hsl(145 63% 40%)" }}
                    disabled={loading || otpSending}>
                    {otpSending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                    {otpSending ? "Mengirim OTP..." : "Daftar"}
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
                          <GoogleLogin
                            onSuccess={handleGoogleSuccess}
                            onError={() => toast({ title: "Daftar Google gagal", variant: "destructive" })}
                            width={400} text="signup_with" shape="rectangular" theme="outline" size="large" logo_alignment="left"
                          />
                        </div>
                      )}
                    </div>
                  </>
                )}

                <p className="text-center text-sm text-muted-foreground mt-6">
                  Sudah punya akun?{" "}
                  <Link href="/login" className="font-semibold hover:underline" style={{ color: "hsl(145 63% 40%)" }}>
                    Masuk
                  </Link>
                </p>
              </>
            )}

            {/* ── STEP 2: Verifikasi OTP Email ── */}
            {step === "otp" && (
              <div className="space-y-6">
                <div className="text-center mb-2">
                  <h2 className="text-2xl font-extrabold text-foreground tracking-tight">Verifikasi Email</h2>
                  <p className="text-muted-foreground mt-1.5 text-sm">Kode OTP dikirim ke email Anda</p>
                </div>

                <div className="flex items-center gap-3 p-4 bg-primary/5 border border-primary/20 rounded-2xl">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <Mail className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground text-sm">Cek Email Anda</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Kode OTP 6 digit dikirim ke <strong>{formData?.email}</strong>
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  <Label className="text-sm font-medium">Masukkan Kode OTP</Label>
                  <div className="flex gap-2 justify-between" onPaste={handleOtpPaste}>
                    {otpDigits.map((digit, i) => (
                      <input key={i}
                        ref={(el) => { otpRefs.current[i] = el; }}
                        type="text" inputMode="numeric" maxLength={1} value={digit}
                        onChange={(e) => handleOtpInput(i, e.target.value)}
                        onKeyDown={(e) => handleOtpKeyDown(i, e)}
                        autoFocus={i === 0}
                        className="w-12 h-14 text-center text-xl font-bold font-mono border border-border rounded-xl bg-background focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all" />
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">Berlaku 10 menit. Cek folder spam jika tidak muncul di inbox.</p>
                </div>

                <Button className="w-full h-11 rounded-xl font-semibold gap-2 text-white shadow-md"
                  style={{ background: "linear-gradient(135deg, hsl(145 63% 44%) 0%, hsl(145 63% 36%) 100%)" }}
                  onClick={onVerifyOtp} disabled={otpDigits.join("").length < 6 || loading}>
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  {loading ? "Membuat akun..." : "Verifikasi & Buat Akun"}
                </Button>

                <div className="flex items-center justify-between">
                  <button type="button" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => { setStep("form"); setOtpDigits(["", "", "", "", "", ""]); }}>
                    <ArrowLeft className="w-3.5 h-3.5" /> Ubah data
                  </button>
                  <button type="button"
                    className="flex items-center gap-1.5 text-sm font-medium transition-colors disabled:opacity-40"
                    style={{ color: otpCooldown > 0 ? undefined : "hsl(145 63% 42%)" }}
                    onClick={() => formData && sendOtp(formData.email)}
                    disabled={otpCooldown > 0 || otpSending}>
                    {otpSending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                    {otpCooldown > 0 ? `Kirim ulang (${otpCooldown}s)` : "Kirim ulang OTP"}
                  </button>
                </div>
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

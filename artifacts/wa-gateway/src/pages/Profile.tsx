import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Loader2, Eye, EyeOff, UserCircle, Shield, ShieldCheck,
  ShieldOff, CheckCircle2, Brain, Zap, Sparkles,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { ApiKeySection } from "@/components/ApiKeySection";

const passwordSchema = z.object({
  currentPassword: z.string().min(1, "Wajib diisi"),
  newPassword: z.string().min(6, "Minimal 6 karakter"),
  confirmPassword: z.string(),
}).refine((d) => d.newPassword === d.confirmPassword, {
  message: "Password tidak cocok",
  path: ["confirmPassword"],
});

type PasswordData = z.infer<typeof passwordSchema>;

export default function Profile() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [profileName, setProfileName] = useState(user?.name ?? "");
  const [profileEmail, setProfileEmail] = useState(user?.email ?? "");

  // 2FA state
  const [otpInput, setOtpInput] = useState("");
  const [disableOtpInput, setDisableOtpInput] = useState("");
  const [qrData, setQrData] = useState<{ qrDataUrl: string; secret: string } | null>(null);

  const { data: twoFa, refetch: refetchTwoFa } = useQuery({
    queryKey: ["2fa-status"],
    queryFn: () => apiFetch("/2fa/status").then((r) => r.json()),
  });

  const updateProfile = useMutation({
    mutationFn: (body: any) => apiFetch("/auth/profile", { method: "PUT", body: JSON.stringify(body) }).then((r) => r.json()),
    onSuccess: () => toast({ title: "Profil berhasil diperbarui" }),
    onError: () => toast({ title: "Gagal memperbarui profil", variant: "destructive" }),
  });

  const changePassword = useMutation({
    mutationFn: (body: any) => apiFetch("/auth/profile", { method: "PUT", body: JSON.stringify(body) }).then((r) => r.json()),
    onSuccess: () => { reset(); toast({ title: "Password berhasil diubah" }); },
    onError: () => toast({ title: "Gagal mengubah password", variant: "destructive" }),
  });

  const setupTwoFa = useMutation({
    mutationFn: () => apiFetch("/2fa/setup", { method: "POST" }).then((r) => r.json()),
    onSuccess: (d: any) => setQrData(d),
  });

  const verifyTwoFa = useMutation({
    mutationFn: (token: string) => apiFetch("/2fa/verify", { method: "POST", body: JSON.stringify({ token }) }).then((r) => r.json()),
    onSuccess: () => { toast({ title: "2FA berhasil diaktifkan!" }); setQrData(null); setOtpInput(""); refetchTwoFa(); },
    onError: () => toast({ title: "Kode OTP salah", variant: "destructive" }),
  });

  const disableTwoFa = useMutation({
    mutationFn: (token: string) => apiFetch("/2fa/disable", { method: "POST", body: JSON.stringify({ token }) }).then((r) => r.json()),
    onSuccess: () => { toast({ title: "2FA dinonaktifkan" }); setDisableOtpInput(""); refetchTwoFa(); },
    onError: () => toast({ title: "Kode OTP salah", variant: "destructive" }),
  });

  const { register, handleSubmit, reset, formState: { errors } } = useForm<PasswordData>({
    resolver: zodResolver(passwordSchema as any) as any,
  });

  return (
    <div className="max-w-lg space-y-6">
      {/* Profile Info */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <UserCircle className="w-4 h-4 text-primary" /> Informasi Profil
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              <AvatarFallback className="bg-primary text-white text-xl font-bold">
                {(profileName || user?.name || "U").charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="font-semibold">{user?.name}</p>
              <p className="text-sm text-muted-foreground">{user?.email}</p>
              <Badge variant="secondary" className="text-xs mt-1 capitalize">{user?.plan ?? "free"}</Badge>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Nama</Label>
            <Input value={profileName} onChange={(e) => setProfileName(e.target.value)} placeholder="Nama lengkap" />
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input value={profileEmail} onChange={(e) => setProfileEmail(e.target.value)} type="email" />
          </div>
          <Button disabled={updateProfile.isPending} className="gap-2" onClick={() => updateProfile.mutate({ name: profileName, email: profileEmail })}>
            {updateProfile.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            Simpan Profil
          </Button>
        </CardContent>
      </Card>

      {/* AI Integration */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Brain className="w-4 h-4 text-primary" /> Integrasi AI (Global)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Konfigurasi API key AI default untuk seluruh akun Anda. CS Bot akan menggunakan pengaturan ini jika tidak ada konfigurasi khusus per-perangkat.
          </p>
          
          <div className="space-y-3">
            <Label className="text-xs">Provider Default</Label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: "openai", label: "OpenAI", icon: "🟢" },
                { id: "gemini", label: "Gemini", icon: "🔵" },
                { id: "anthropic", label: "Anthropic", icon: "🔷" },
                { id: "groq", label: "Groq", icon: "⚡" },
              ].map((p) => {
                const settings = typeof user?.aiSettings === "string" ? JSON.parse(user.aiSettings) : user?.aiSettings;
                const active = (settings?.provider ?? "openai") === p.id;
                return (
                  <Button
                    key={p.id}
                    variant={active ? "default" : "outline"}
                    className="justify-start gap-2 h-9 text-xs"
                    onClick={() => {
                      const newSettings = { ...(settings ?? {}), provider: p.id };
                      updateProfile.mutate({ aiSettings: JSON.stringify(newSettings) });
                    }}
                  >
                    <span>{p.icon}</span> {p.label}
                  </Button>
                );
              })}
            </div>
          </div>

          <div className="space-y-3 pt-2">
            {[
               { id: "openai", label: "OpenAI API Key", placeholder: "sk-...", prefix: "sk-" },
               { id: "gemini", label: "Gemini API Key", placeholder: "AIza...", prefix: "AIza" },
            ].map((p) => {
              const settings = typeof user?.aiSettings === "string" ? JSON.parse(user.aiSettings) : user?.aiSettings;
              const val = settings?.keys?.[p.id] || (p.id === "openai" ? (user as any).openaiApiKey : "");
              
              return (
                <div key={p.id} className="space-y-2">
                  <Label className="text-xs">{p.label}</Label>
                  <div className="flex gap-2">
                    <Input
                      type="password"
                      placeholder={p.placeholder}
                      defaultValue={val}
                      className="font-mono text-xs"
                      onBlur={(e) => {
                        const newKey = e.target.value.trim();
                        if (newKey === val) return;
                        const newSettings = { 
                          ...(settings ?? {}), 
                          keys: { ...(settings?.keys ?? {}), [p.id]: newKey } 
                        };
                        updateProfile.mutate({ aiSettings: JSON.stringify(newSettings) });
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* API Key */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">API Key</CardTitle>
        </CardHeader>
        <CardContent>
          <ApiKeySection variant="compact" />
        </CardContent>
      </Card>

      {/* Change Password */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Ubah Password</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit((d) => changePassword.mutate({ password: d.newPassword }))} className="space-y-4">
            <div className="space-y-2">
              <Label>Password Saat Ini</Label>
              <Input type="password" placeholder="••••••••" {...register("currentPassword")} />
              {errors.currentPassword && <p className="text-xs text-destructive">{errors.currentPassword.message}</p>}
            </div>
            <div className="space-y-2">
              <Label>Password Baru</Label>
              <div className="relative">
                <Input type={showNewPw ? "text" : "password"} placeholder="••••••••" {...register("newPassword")} className="pr-10" />
                <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" onClick={() => setShowNewPw(!showNewPw)}>
                  {showNewPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.newPassword && <p className="text-xs text-destructive">{errors.newPassword.message}</p>}
            </div>
            <div className="space-y-2">
              <Label>Konfirmasi Password Baru</Label>
              <div className="relative">
                <Input type={showConfirmPw ? "text" : "password"} placeholder="••••••••" {...register("confirmPassword")} className="pr-10" />
                <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" onClick={() => setShowConfirmPw(!showConfirmPw)}>
                  {showConfirmPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.confirmPassword && <p className="text-xs text-destructive">{errors.confirmPassword.message}</p>}
            </div>
            <Button type="submit" disabled={changePassword.isPending} className="gap-2">
              {changePassword.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Ubah Password
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* 2FA */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            {twoFa?.enabled
              ? <ShieldCheck className="w-4 h-4 text-green-500" />
              : <Shield className="w-4 h-4 text-muted-foreground" />}
            Two-Factor Authentication (2FA)
            {twoFa?.enabled && <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-0 text-xs">Aktif</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!twoFa?.enabled ? (
            <>
              <p className="text-sm text-muted-foreground">
                Tambahkan lapisan keamanan ekstra dengan kode OTP dari aplikasi autentikator (Google Authenticator, Authy, dll.)
              </p>
              {!qrData ? (
                <Button className="gap-2" onClick={() => setupTwoFa.mutate()} disabled={setupTwoFa.isPending}>
                  {setupTwoFa.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
                  Setup 2FA
                </Button>
              ) : (
                <div className="space-y-4">
                  <div className="flex gap-4 items-start">
                    <img src={qrData.qrDataUrl} alt="QR Code 2FA" className="w-36 h-36 border rounded-lg" />
                    <div className="space-y-2">
                      <p className="text-sm font-medium">1. Scan QR code dengan aplikasi autentikator</p>
                      <p className="text-xs text-muted-foreground">Atau masukkan kode manual:</p>
                      <code className="text-xs bg-muted px-2 py-1 rounded block break-all">{qrData.secret}</code>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>2. Masukkan kode OTP untuk konfirmasi</Label>
                    <div className="flex gap-2">
                      <Input
                        maxLength={6} placeholder="000000" className="w-32 text-center font-mono text-lg tracking-widest"
                        value={otpInput} onChange={(e) => setOtpInput(e.target.value.replace(/\D/g, ""))}
                      />
                      <Button onClick={() => verifyTwoFa.mutate(otpInput)} disabled={otpInput.length < 6 || verifyTwoFa.isPending}>
                        {verifyTwoFa.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                        Verifikasi
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg">
                <ShieldCheck className="w-4 h-4 text-green-600 shrink-0" />
                <p className="text-sm text-green-700 dark:text-green-400">2FA aktif. Akun Anda lebih aman dengan verifikasi dua langkah.</p>
              </div>
              <div className="space-y-2">
                <Label>Nonaktifkan 2FA (konfirmasi dengan OTP)</Label>
                <div className="flex gap-2">
                  <Input
                    maxLength={6} placeholder="000000" className="w-32 text-center font-mono text-lg tracking-widest"
                    value={disableOtpInput} onChange={(e) => setDisableOtpInput(e.target.value.replace(/\D/g, ""))}
                  />
                  <Button variant="outline" className="text-destructive border-destructive hover:bg-destructive/10 gap-2"
                    onClick={() => disableTwoFa.mutate(disableOtpInput)} disabled={disableOtpInput.length < 6 || disableTwoFa.isPending}>
                    {disableTwoFa.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldOff className="w-4 h-4" />}
                    Nonaktifkan
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

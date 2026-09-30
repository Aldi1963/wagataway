import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput, StrengthMeter } from "@/components/PasswordInput";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/hooks/use-theme";
import { useLocation } from "wouter";
import { Sun, Moon, Check, UserRound, LockKeyhole, Palette } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { KeyManager } from "@/components/KeyManager";

function SettingCard({
  icon: Icon,
  title,
  desc,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  desc: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start gap-3 space-y-0 pb-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <CardTitle className="text-base">{title}</CardTitle>
          <p className="mt-0.5 text-sm text-muted-foreground">{desc}</p>
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export default function Settings() {
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [, navigate] = useLocation();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const pwMatch = confirmPassword.length > 0 && newPassword === confirmPassword;
  const pwMismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;
  const pwValid = newPassword.length >= 6 && pwMatch;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Setting</h2>
        <p className="text-sm text-muted-foreground">Kelola akun, keamanan, dan tampilan aplikasi</p>
      </div>

      <SettingCard icon={UserRound} title="Informasi Akun" desc="Kelola informasi akun Anda">
        <div className="space-y-4">
          <div className="flex items-center gap-4 pb-4 border-b border-border">
            <div className="w-14 h-14 rounded-full bg-foreground text-background flex items-center justify-center text-xl font-bold">
              {user?.name?.charAt(0).toUpperCase() || "U"}
            </div>
            <div>
              <p className="font-semibold text-foreground">{user?.name}</p>
              <p className="text-xs text-muted-foreground">{user?.email}</p>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium">Nama</label>
            <Input defaultValue={user?.name || ""} />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium">Email</label>
            <Input defaultValue={user?.email || ""} disabled />
          </div>

          <Button size="sm">Simpan Perubahan</Button>
        </div>
      </SettingCard>

      <SettingCard icon={LockKeyhole} title="Ubah Password" desc="Perbarui password akun Anda">
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-medium">Password Saat Ini</label>
            <PasswordInput
              placeholder="••••••••"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium">Password Baru</label>
            <PasswordInput
              placeholder="Minimal 6 karakter"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
            />
            <StrengthMeter password={newPassword} />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium">Konfirmasi Password Baru</label>
            <div className="relative">
              <PasswordInput
                placeholder="Ulangi password baru"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                className={cn(
                  pwMatch && "border-emerald-500 focus-visible:ring-emerald-500",
                  pwMismatch && "border-red-500 focus-visible:ring-red-500"
                )}
              />
              {pwMatch && (
                <span className="absolute right-10 top-1/2 -translate-y-1/2 text-emerald-500">
                  <Check className="w-4 h-4" />
                </span>
              )}
            </div>
            {pwMismatch && (
              <p className="text-[11px] text-red-500">Password tidak sama.</p>
            )}
          </div>

          <Button size="sm" disabled={!pwValid}>Ubah Password</Button>
        </div>
      </SettingCard>

      <KeyManager
        onUseKey={(key) => {
          try {
            localStorage.setItem("wag_try_apikey", key);
          } catch {
            /* abaikan */
          }
          toast.success("Key siap dipakai di panel Coba langsung");
          navigate("/api-docs");
        }}
      />

      <SettingCard icon={Palette} title="Tampilan" desc="Sesuaikan tampilan aplikasi">
        <div className="grid grid-cols-2 gap-3">
          {(
            [
              { value: "light", label: "Terang", icon: Sun },
              { value: "dark", label: "Gelap", icon: Moon },
            ] as const
          ).map((opt) => (
            <button
              key={opt.value}
              onClick={() => {
                if (theme !== opt.value) toggleTheme();
              }}
              className={cn(
                "flex items-center gap-3 rounded-lg border p-3 text-left transition-colors",
                theme === opt.value
                  ? "border-primary bg-primary/5"
                  : "border-border hover:bg-secondary/40"
              )}
            >
              <opt.icon className="w-5 h-5" />
              <span className="text-sm font-medium flex-1">{opt.label}</span>
              {theme === opt.value && <Check className="w-4 h-4 text-primary" />}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          Pilihan tema tersimpan di browser ini.
        </p>
      </SettingCard>
    </div>
  );
}

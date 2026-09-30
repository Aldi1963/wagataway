import { useEffect, useState } from "react";
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
import { apiPatch, apiPost } from "@/lib/api";
import { KeyManager } from "@/components/KeyManager";
import { PageTabs } from "@/components/ui/tabs";
import Team from "./Team";
import Affiliate from "./Affiliate";
import Billing from "./Billing";

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

const TABS = [
  { id: "profil", label: "Profil", href: "/settings" },
  { id: "keamanan", label: "Keamanan", href: "/settings?tab=keamanan" },
  { id: "api-key", label: "API Key", href: "/settings?tab=api-key" },
  { id: "tampilan", label: "Tampilan", href: "/settings?tab=tampilan" },
  { id: "tim", label: "Tim", href: "/settings?tab=tim" },
  { id: "afiliasi", label: "Afiliasi", href: "/settings?tab=afiliasi" },
  { id: "langganan", label: "Langganan", href: "/settings?tab=langganan" },
];

const VALID_TABS = new Set(TABS.map((t) => t.id));
const WIDE_TABS = new Set(["tim", "afiliasi", "langganan"]);

function initialTab(): string {
  try {
    const q = new URLSearchParams(window.location.search).get("tab");
    return q && VALID_TABS.has(q) ? q : "profil";
  } catch {
    return "profil";
  }
}

/** Halaman gabungan "Akun": Profil, Keamanan, API Key, Tampilan, Tim, Afiliasi, Langganan. */
export default function Settings() {
  const { user, updateUser } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [, navigate] = useLocation();

  const [active, setActive] = useState<string>(initialTab);

  const [name, setName] = useState(user?.name ?? "");
  const [savingName, setSavingName] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPw, setChangingPw] = useState(false);

  useEffect(() => {
    if (user) setName(user.name);
    // sinkron hanya saat identitas user berubah (bukan saat mengetik)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const select = (id: string) => {
    setActive(id);
    navigate(id === "profil" ? "/settings" : `/settings?tab=${id}`);
  };

  const pwMatch = confirmPassword.length > 0 && newPassword === confirmPassword;
  const pwMismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;
  const pwValid = newPassword.length >= 6 && pwMatch;

  const handleSaveName = async () => {
    const trimmed = name.trim();
    if (trimmed.length < 2 || savingName) return;
    setSavingName(true);
    try {
      const data = await apiPatch<{ message: string; name: string }>(
        "/auth/me",
        { name: trimmed }
      );
      if (user) updateUser({ ...user, name: data.name });
      toast.success(data.message || "Nama berhasil diperbarui");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menyimpan nama");
    } finally {
      setSavingName(false);
    }
  };

  const handleChangePassword = async () => {
    if (!pwValid || changingPw) return;
    setChangingPw(true);
    try {
      const data = await apiPost<{ message: string }>("/auth/change-password", {
        currentPassword,
        newPassword,
      });
      toast.success(data.message || "Password berhasil diubah");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Gagal mengubah password"
      );
    } finally {
      setChangingPw(false);
    }
  };

  return (
    <div className={cn("space-y-6", WIDE_TABS.has(active) ? "max-w-5xl" : "max-w-2xl")}>
      <div>
        <h2 className="text-lg font-semibold text-foreground">Akun</h2>
        <p className="text-sm text-muted-foreground">Kelola akun, tim, afiliasi, dan langganan</p>
      </div>

      <PageTabs tabs={TABS} active={active} onSelect={(t) => select(t.id)} />

      {active === "profil" && (
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
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                minLength={2}
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium">Email</label>
              <Input defaultValue={user?.email || ""} disabled />
            </div>

            <Button
              size="sm"
              onClick={handleSaveName}
              disabled={savingName || name.trim().length < 2}
            >
              {savingName ? "Menyimpan…" : "Simpan Perubahan"}
            </Button>
          </div>
        </SettingCard>
      )}

      {active === "keamanan" && (
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

            <Button
              size="sm"
              onClick={handleChangePassword}
              disabled={!pwValid || changingPw}
            >
              {changingPw ? "Mengubah…" : "Ubah Password"}
            </Button>
          </div>
        </SettingCard>
      )}

      {active === "api-key" && (
        <KeyManager
          onUseKey={(key) => {
            try {
              localStorage.setItem("wag_try_apikey", key);
            } catch {
              /* abaikan */
            }
            toast.success("Key siap dipakai di panel Coba langsung");
            navigate("/developer");
          }}
        />
      )}

      {active === "tampilan" && (
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
      )}

      {active === "tim" && <Team embedded />}
      {active === "afiliasi" && <Affiliate embedded />}
      {active === "langganan" && <Billing embedded />}
    </div>
  );
}

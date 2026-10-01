import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput, StrengthMeter } from "@/components/PasswordInput";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { Check, UserRound, KeyRound, Users, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { apiPatch, apiPost } from "@/lib/api";
import { KeyManager } from "@/components/KeyManager";
import Team from "./Team";

/** Judul seksi ala halaman profil: tebal + garis pembatas. */
export function SectionHeader({ title, desc }: { title: string; desc?: string }) {
  return (
    <div>
      <h3 className="text-xl font-bold text-foreground">{title}</h3>
      {desc && <p className="text-sm text-muted-foreground mt-1">{desc}</p>}
      <div className="border-b border-border mt-3 mb-5" />
    </div>
  );
}

const TABS = [
  { id: "profil", label: "Profil", icon: UserRound },
  { id: "api", label: "Pengaturan API", icon: KeyRound },
  { id: "tim", label: "Tim", icon: Users },
];

/** Alias tab lama (?tab=keamanan dsb.) ke halaman baru yang digabung. */
const TAB_ALIAS: Record<string, string> = {
  profil: "profil",
  keamanan: "profil",
  "api-key": "api",
  api: "api",
  tim: "tim",
};

/** Tab lama yang kini pindah ke halaman sendiri. */
const MOVED_TABS: Record<string, string> = {
  langganan: "/billing",
  afiliasi: "/affiliate",
};

const VALID_TABS = new Set(TABS.map((t) => t.id));
const WIDE_TABS = new Set(["tim"]);

function initialTab(): string {
  try {
    const q = new URLSearchParams(window.location.search).get("tab");
    // tab lama yang sudah pindah ke halaman sendiri
    if (q && MOVED_TABS[q]) {
      window.location.replace(MOVED_TABS[q]);
      return "profil";
    }
    const mapped = q ? TAB_ALIAS[q] : undefined;
    return mapped && VALID_TABS.has(mapped) ? mapped : "profil";
  } catch {
    return "profil";
  }
}

/** Halaman "Setting" ala profil: Profil, Pengaturan API, Tim, Langganan. */
export default function Settings() {
  const { user, updateUser } = useAuth();
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
      {/* ── Menu vertikal polos ala profil PPOB (tanpa card) ── */}
      <div className="border-y border-border divide-y divide-border -mx-4 px-4 sm:mx-0 sm:px-0">
        {TABS.map((t) => {
          const isActive = active === t.id;
          return (
            <button
              key={t.id}
              onClick={() => select(t.id)}
              className={cn(
                "w-full flex items-center gap-4 py-3.5 text-left transition-colors",
                !isActive && "hover:bg-secondary/30"
              )}
            >
              <span
                className={cn(
                  "w-11 h-11 rounded-full flex items-center justify-center shrink-0 transition-colors",
                  isActive
                    ? "bg-[#243370] dark:bg-[#4c63d2] text-white"
                    : "bg-secondary text-muted-foreground"
                )}
              >
                <t.icon className="w-5 h-5" />
              </span>
              <span
                className={cn(
                  "flex-1 text-sm",
                  isActive ? "font-semibold text-foreground" : "font-medium text-foreground"
                )}
              >
                {t.label}
              </span>
              <ChevronRight
                className={cn(
                  "w-4 h-4 shrink-0",
                  isActive ? "text-primary" : "text-muted-foreground"
                )}
              />
            </button>
          );
        })}
      </div>

      {/* ── Isi halaman aktif ─────────────────────────── */}
      <div>
      {active === "profil" && (
        <div className="space-y-10">
          <div>
          <SectionHeader title="Informasi Personal" desc="Kelola informasi akun Anda" />
          <div className="space-y-4">
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
          </div>

          <div>
          <SectionHeader title="Keamanan" desc="Perbarui password akun Anda" />
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
        </div>
        </div>
      )}

      {active === "api" && (
        <div>
          <SectionHeader title="Pengaturan API" desc="Kelola API key untuk integrasi" />
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
        </div>
      )}

      {active === "tim" && <Team embedded />}
      </div>
    </div>
  );
}

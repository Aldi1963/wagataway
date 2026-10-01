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
import TwoFASettings from "@/components/TwoFASettings";
import SessionsSection from "@/components/SessionsSection";
import Team from "./Team";
import { useLang } from "@/lib/i18n";

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

const TAB_IDS = ["profil", "api", "tim"];

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

const VALID_TABS = new Set(TAB_IDS);
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
  const { t } = useLang();

  const TABS = [
    { id: "profil", label: t("settings.tabProfile"), icon: UserRound },
    { id: "api", label: t("settings.tabApiSettings"), icon: KeyRound },
    { id: "tim", label: t("settings.tabTeam"), icon: Users },
  ];

  const [active, setActive] = useState<string>(initialTab);

  const [name, setName] = useState(user?.name ?? "");
  const [notifyWa, setNotifyWa] = useState(user?.notifyWa ?? "");
  const [savingName, setSavingName] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPw, setChangingPw] = useState(false);

  useEffect(() => {
    if (user) {
      setName(user.name);
      setNotifyWa(user.notifyWa ?? "");
    }
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
    const waTrimmed = notifyWa.trim();
    if (trimmed.length < 2 || savingName) return;
    // Validasi ringan nomor WA: digit saja, boleh diawali 08/62/+62; boleh kosong.
    const waDigits = waTrimmed.replace(/\D/g, "");
    if (waDigits && (waDigits.length < 9 || waDigits.length > 16)) {
      toast.error(t("settings.toastInvalidWaNumber"));
      return;
    }
    setSavingName(true);
    try {
      const data = await apiPatch<{ message: string }>(
        "/auth/me",
        { name: trimmed, notifyWa: waTrimmed }
      );
      if (user) updateUser({ ...user, name: trimmed, notifyWa: waTrimmed });
      toast.success(data.message || t("settings.toastSaved"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("settings.toastSaveFailed"));
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
      toast.success(data.message || t("settings.toastPasswordChanged"));
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("settings.toastChangePasswordFailed")
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
          <SectionHeader title={t("settings.personalInfo")} desc={t("settings.personalInfoDesc")} />
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-medium">{t("settings.labelName")}</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                minLength={2}
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium">{t("settings.labelEmail")}</label>
              <Input defaultValue={user?.email || ""} disabled />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium">{t("settings.labelNotifyWa")}</label>
              <Input
                value={notifyWa}
                onChange={(e) => setNotifyWa(e.target.value)}
                placeholder="cth. 6281234567890"
                inputMode="tel"
              />
              <p className="text-xs text-muted-foreground">
                {t("settings.notifyWaDesc")}
              </p>
            </div>

            <Button
              size="sm"
              onClick={handleSaveName}
              disabled={savingName || name.trim().length < 2}
            >
              {savingName ? t("settings.saving") : t("settings.saveChanges")}
            </Button>
          </div>
          </div>

          <div>
          <SectionHeader title={t("settings.security")} desc={t("settings.securityDesc")} />
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-medium">{t("settings.labelCurrentPassword")}</label>
              <PasswordInput
                placeholder="••••••••"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium">{t("settings.labelNewPassword")}</label>
              <PasswordInput
                placeholder={t("settings.placeholderNewPassword")}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
              />
              <StrengthMeter password={newPassword} />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium">{t("settings.labelConfirmPassword")}</label>
              <div className="relative">
                <PasswordInput
                  placeholder={t("settings.placeholderConfirmPassword")}
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
                <p className="text-[11px] text-red-500">{t("settings.passwordMismatch")}</p>
              )}
            </div>

            <Button
              size="sm"
              onClick={handleChangePassword}
              disabled={!pwValid || changingPw}
            >
              {changingPw ? t("settings.changing") : t("settings.changePassword")}
            </Button>
          </div>

          <div className="pt-2">
            <SectionHeader
              title={t("settings.twoFactor")}
              desc={t("settings.twoFactorDesc")}
            />
            <TwoFASettings />
          </div>

          <div className="pt-2">
            <SectionHeader
              title={t("settings.activeSessions")}
              desc={t("settings.activeSessionsDesc")}
            />
            <SessionsSection />
          </div>
        </div>
        </div>
      )}

      {active === "api" && (
        <div>
          <SectionHeader title={t("settings.apiSettings")} desc={t("settings.apiSettingsDesc")} />
          <KeyManager
            onUseKey={(key) => {
              try {
                localStorage.setItem("wag_try_apikey", key);
              } catch {
                /* abaikan */
              }
              toast.success(t("settings.toastKeyReady"));
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

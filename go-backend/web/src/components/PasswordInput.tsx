import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useLang } from "@/lib/i18n";

export function PasswordInput({
  value,
  onChange,
  placeholder,
  className,
  ...rest
}: React.InputHTMLAttributes<HTMLInputElement>) {
  const { t } = useLang();
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input
        type={show ? "text" : "password"}
        value={value}
        onChange={onChange}
        placeholder={placeholder ?? t("passwordInput.placeholder")}
        className={cn("pr-10", className)}
        {...rest}
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setShow((s) => !s)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
        aria-label={show ? t("passwordInput.hidePassword") : t("passwordInput.showPassword")}
      >
        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );
}

export function passwordStrength(pw: string): { score: number } {
  if (!pw) return { score: 0 };
  let score = 0;
  if (pw.length >= 6) score++;
  if (pw.length >= 10) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return { score: Math.min(score, 5) };
}

export function StrengthMeter({ password }: { password: string }) {
  const { t } = useLang();
  const { score } = passwordStrength(password);
  if (!password) return null;
  const label = t(`passwordInput.strength${Math.min(score, 4)}`);
  const colors = [
    "bg-red-500",
    "bg-orange-500",
    "bg-yellow-500",
    "bg-lime-500",
    "bg-emerald-500",
  ];
  return (
    <div className="mt-2">
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className={cn(
              "h-1 flex-1 rounded-full",
              i <= score ? colors[score - 1] : "bg-muted"
            )}
          />
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground mt-1">
        {t("passwordInput.strengthLabel")} <span className="font-medium">{label}</span>
      </p>
    </div>
  );
}

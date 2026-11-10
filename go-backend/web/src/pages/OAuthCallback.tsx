import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useLang } from "@/lib/i18n";

// Menerima token JWT dari callback OAuth backend (?token=...),
// menyimpannya, lalu mengarahkan ke dashboard.
export default function OAuthCallback() {
  const { t } = useLang();
  const [, setLocation] = useLocation();
  const { setTokenFromOAuth } = useAuth();
  const [error, setError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    if (!token) {
      setError(t("oAuthCallback.errorNoToken"));
      return;
    }
    setTokenFromOAuth(token)
      .then(() => setLocation("/"))
      .catch(() => setError(t("oAuthCallback.errorVerifyFailed")));
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-background">
      {error ? (
        <>
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          <button
            className="text-sm font-medium text-[#243370] dark:text-blue-400 hover:underline"
            onClick={() => setLocation("/login")}
          >
            {t("oAuthCallback.backToLogin")}
          </button>
        </>
      ) : (
        <>
          <Loader2 className="w-8 h-8 animate-spin text-[#243370] dark:text-blue-400" />
          <p className="text-sm text-muted-foreground">{t("oAuthCallback.completingLogin")}</p>
        </>
      )}
    </div>
  );
}

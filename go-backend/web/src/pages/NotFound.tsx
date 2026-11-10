import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { useLang } from "@/lib/i18n";

export default function NotFound() {
  const { t } = useLang();
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="text-center">
        <p className="text-6xl font-bold text-foreground">404</p>
        <p className="text-sm text-muted-foreground mt-2">
          {t("notFound.message")}
        </p>
        <Link href="/">
          <Button variant="outline" className="mt-6">
            {t("notFound.backToDashboard")}
          </Button>
        </Link>
      </div>
    </div>
  );
}

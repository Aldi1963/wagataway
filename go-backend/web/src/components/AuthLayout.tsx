import type { ReactNode } from "react";
import { Link } from "wouter";
import { Send, Zap, ShieldCheck, MessageCircle } from "lucide-react";
import { useLang } from "@/lib/i18n";

export default function AuthLayout({
  children,
  title,
  subtitle,
}: {
  children: ReactNode;
  title: string;
  subtitle: string;
}) {
  const { t } = useLang();
  const features = [
    {
      icon: Send,
      title: t("authLayout.feature1Title"),
      desc: t("authLayout.feature1Desc"),
    },
    {
      icon: Zap,
      title: t("authLayout.feature2Title"),
      desc: t("authLayout.feature2Desc"),
    },
    {
      icon: ShieldCheck,
      title: t("authLayout.feature3Title"),
      desc: t("authLayout.feature3Desc"),
    },
  ];
  return (
    <div className="min-h-screen flex bg-background">
      {/* Panel kiri — branding (desktop) */}
      <div className="hidden lg:flex w-[44%] xl:w-[46%] bg-[#243370] text-white flex-col justify-between p-10 xl:p-12 shrink-0">
        <Link href="/">
          <span className="flex items-center gap-2.5 cursor-pointer">
            <span className="w-9 h-9 rounded-lg bg-white/15 flex items-center justify-center">
              <MessageCircle className="w-5 h-5" />
            </span>
            <span className="text-xl font-bold tracking-tight">WaGataway</span>
          </span>
        </Link>

        <div className="space-y-8">
          <div>
            <h2 className="text-3xl xl:text-4xl font-bold leading-tight tracking-tight">
              {t("authLayout.heroTitle1")}
              <br />
              {t("authLayout.heroTitle2")}
            </h2>
            <p className="text-white/70 mt-3 text-[15px] leading-relaxed max-w-md">
              {t("authLayout.heroSubtitle")}
            </p>
          </div>
          <ul className="space-y-5">
            {features.map((f) => (
              <li key={f.title} className="flex gap-4">
                <span className="w-10 h-10 rounded-lg bg-white/15 flex items-center justify-center shrink-0">
                  <f.icon className="w-5 h-5" />
                </span>
                <span>
                  <p className="font-semibold text-[15px]">{f.title}</p>
                  <p className="text-white/65 text-sm mt-0.5">{f.desc}</p>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-white/50 text-xs">
          {t("authLayout.footer")}
        </p>
      </div>

      {/* Panel kanan — form */}
      <div className="flex-1 flex flex-col">
        {/* Header mobile */}
        <div className="lg:hidden bg-[#243370] text-white px-5 py-4 flex items-center gap-2.5">
          <span className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center">
            <MessageCircle className="w-4 h-4" />
          </span>
          <span className="font-bold tracking-tight">WaGataway</span>
        </div>

        <div className="flex-1 flex items-center justify-center px-4 py-10 sm:px-8">
          <div className="w-full max-w-[400px]">
            <div className="mb-7">
              <h1 className="text-2xl font-bold text-foreground tracking-tight">
                {title}
              </h1>
              <p className="text-sm text-muted-foreground mt-1.5">{subtitle}</p>
            </div>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

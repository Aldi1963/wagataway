import { useState } from "react";
import { useLang } from "@/lib/i18n";
import Templates from "./Templates";
import CannedResponses from "./CannedResponses";
import { PageTabs } from "@/components/ui/tabs";

/** Gabungan Template Pesan + Canned Responses dalam satu tampilan. */
export default function TemplateHub({ embedded = false }: { embedded?: boolean }) {
  const { t } = useLang();
  const [sub, setSub] = useState("templates");

  const SUB_TABS = [
    { id: "templates", label: t("templateHub.messageTemplatesTab"), href: "#templates" },
    { id: "canned", label: "Canned Responses", href: "#canned" },
  ];

  return (
    <div className="space-y-4">
      {!embedded && (
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">{t("templateHub.title")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("templateHub.subtitle")}
          </p>
        </div>
      )}
      <PageTabs tabs={SUB_TABS} active={sub} onSelect={(t) => setSub(t.id)} />
      {sub === "canned" ? <CannedResponses embedded /> : <Templates embedded />}
    </div>
  );
}

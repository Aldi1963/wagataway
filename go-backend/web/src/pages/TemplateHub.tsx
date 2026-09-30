import { useState } from "react";
import Templates from "./Templates";
import CannedResponses from "./CannedResponses";
import { PageTabs } from "@/components/ui/tabs";

const SUB_TABS = [
  { id: "templates", label: "Template Pesan", href: "#templates" },
  { id: "canned", label: "Canned Responses", href: "#canned" },
];

/** Gabungan Template Pesan + Canned Responses dalam satu tampilan. */
export default function TemplateHub({ embedded = false }: { embedded?: boolean }) {
  const [sub, setSub] = useState("templates");

  return (
    <div className="space-y-4">
      {!embedded && (
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Template</h1>
          <p className="text-sm text-muted-foreground">
            Template pesan dan jawaban cepat siap pakai
          </p>
        </div>
      )}
      <PageTabs tabs={SUB_TABS} active={sub} onSelect={(t) => setSub(t.id)} />
      {sub === "canned" ? <CannedResponses embedded /> : <Templates embedded />}
    </div>
  );
}

import { useEffect, useState } from "react";
import { FileText } from "lucide-react";
import { apiGet } from "@/lib/api";
import { useLang } from "@/lib/i18n";
import { Dropdown } from "@/components/ui/dropdown";

interface Template {
  id: number;
  name: string;
  category: string;
  content: string;
}

// TemplatePicker: dropdown pemilih template pesan tersimpan (/templates).
// onSelect menerima isi template; komponen pemanggil yang menaruh ke textarea.
export function TemplatePicker({ onSelect }: { onSelect: (content: string) => void }) {
  const { t } = useLang();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [value, setValue] = useState("");

  useEffect(() => {
    let alive = true;
    apiGet<{ templates: Template[] }>("/templates")
      .then((res) => {
        if (alive) setTemplates(res.templates ?? []);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  if (templates.length === 0) return null;

  return (
    <Dropdown
      value={value}
      onChange={(v) => {
        setValue(v);
        const tpl = templates.find((x) => String(x.id) === v);
        if (tpl) onSelect(tpl.content);
        // reset agar template yang sama bisa dipilih ulang
        setTimeout(() => setValue(""), 0);
      }}
      ariaLabel={t("templatePicker.aria")}
      className="w-auto min-w-[180px]"
      placeholder={t("templatePicker.placeholder")}
      options={templates.map((x) => ({
        value: String(x.id),
        label: x.category ? `${x.name} (${x.category})` : x.name,
      }))}
    />
  );
}

export function TemplatePickerLabel() {
  const { t } = useLang();
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
      <FileText className="w-3 h-3" />
      {t("templatePicker.hint")}
    </span>
  );
}

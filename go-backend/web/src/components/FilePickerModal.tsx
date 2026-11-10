import { useEffect, useState } from "react";
import {
  X,
  Search,
  File as FileIcon,
  FileText,
  FileImage,
  FileAudio,
  FileVideo,
  FileArchive,
  Loader2,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { apiGet } from "@/lib/api";
import { useLang } from "@/lib/i18n";

export interface PickedFile {
  id: number | string;
  name: string;
  url: string;
  mime?: string;
  size?: number;
}

interface FilePickerModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (file: PickedFile) => void;
}

function iconFor(name: string, mime?: string) {
  const m = (mime || "").toLowerCase();
  const ext = name.split(".").pop()?.toLowerCase() || "";
  const cls = "w-8 h-8 shrink-0 text-muted-foreground";
  if (m.startsWith("image/") || ["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(ext))
    return <FileImage className={cls} />;
  if (m.startsWith("audio/") || ["mp3", "wav", "ogg", "m4a"].includes(ext))
    return <FileAudio className={cls} />;
  if (m.startsWith("video/") || ["mp4", "mov", "webm", "mkv"].includes(ext))
    return <FileVideo className={cls} />;
  if (["zip", "rar", "7z", "tar", "gz"].includes(ext) || m.includes("zip"))
    return <FileArchive className={cls} />;
  if (
    m.startsWith("text/") ||
    ["txt", "md", "csv", "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx"].includes(ext)
  )
    return <FileText className={cls} />;
  return <FileIcon className={cls} />;
}

function formatSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return "";
  const units = ["B", "KB", "MB", "GB"];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 10 ? 0 : 1)} ${units[i]}`;
}

export default function FilePickerModal({ open, onClose, onSelect }: FilePickerModalProps) {
  const { t } = useLang();
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSearch("");
    setError(null);
    setLoading(true);
    apiGet<{ files: Array<{ id: number; originalName: string; mime: string; size: number }> }>("/files")
      .then((res) =>
        setFiles(
          (res.files || []).map((f) => ({
            id: f.id,
            name: f.originalName,
            url: `/api/files/${f.id}/content`,
            mime: f.mime,
            size: f.size,
          }))
        )
      )
      .catch((e) => setError(e instanceof Error ? e.message : t("filePickerModal.errLoad")))
      .finally(() => setLoading(false));
  }, [open ]);

  if (!open) return null;

  const filtered = files.filter((f) =>
    f.name.toLowerCase().includes(search.trim().toLowerCase())
  );

  const pick = (f: PickedFile) => {
    onSelect(f);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative bg-card text-card-foreground border border-border rounded-xl w-full max-w-lg max-h-[90vh] flex flex-col p-5 sm:p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">{t("filePickerModal.title")}</h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-secondary"
            aria-label={t("filePickerModal.close")}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder={t("filePickerModal.searchPlaceholder")}
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="flex-1 overflow-y-auto -mx-1 px-1 min-h-[200px]">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <p className="text-sm text-muted-foreground mb-3">{error}</p>
              <button
                className="text-sm text-primary underline"
                onClick={() => {
                  setError(null);
                  setLoading(true);
                  apiGet<{ files: Array<{ id: number; originalName: string; mime: string; size: number }> }>("/files")
                    .then((res) =>
                      setFiles(
                        (res.files || []).map((f) => ({
                          id: f.id,
                          name: f.originalName,
                          url: `/api/files/${f.id}/content`,
                          mime: f.mime,
                          size: f.size,
                        }))
                      )
                    )
                    .catch((e) =>
                      setError(e instanceof Error ? e.message : t("filePickerModal.errLoad"))
                    )
                    .finally(() => setLoading(false));
                }}
              >
                {t("filePickerModal.retry")}
              </button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12">
              <FileIcon className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">
                {search ? t("filePickerModal.noMatch") : t("filePickerModal.empty")}
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {filtered.map((f) => (
                <li key={String(f.id)}>
                  <button
                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-secondary/50 transition-colors"
                    onClick={() => pick(f)}
                  >
                    {iconFor(f.name, f.mime)}
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-medium truncate">{f.name}</span>
                      {f.size ? (
                        <span className="block text-xs text-muted-foreground">
                          {formatSize(f.size)}
                        </span>
                      ) : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

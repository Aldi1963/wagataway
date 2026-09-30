import { toast } from "sonner";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Plus,
  Trash2,
  X,
  RefreshCw,
  Search,
  Download,
  Upload,
  File as FileIcon,
  FileText,
  FileImage,
  FileAudio,
  FileVideo,
  FolderOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiGet, apiDelete } from "@/lib/api";

const MAX_SIZE = 16 * 1024 * 1024; // 16MB

interface MediaFile {
  id: number;
  originalName: string;
  mime: string;
  size: number;
  createdAt: string;
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-hidden
      />
      <div className="relative bg-card text-card-foreground rounded-xl border border-border shadow-lg w-full max-w-lg max-h-[90vh] overflow-y-auto p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold">{title}</h3>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={onClose}
            aria-label="Tutup"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
        {children}
      </div>
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function iconFor(mime: string) {
  if (mime.startsWith("image/"))
    return <FileImage className="w-8 h-8 text-muted-foreground" />;
  if (mime.startsWith("audio/"))
    return <FileAudio className="w-8 h-8 text-muted-foreground" />;
  if (mime.startsWith("video/"))
    return <FileVideo className="w-8 h-8 text-muted-foreground" />;
  if (mime === "application/pdf")
    return <FileText className="w-8 h-8 text-muted-foreground" />;
  return <FileIcon className="w-8 h-8 text-muted-foreground" />;
}

export default function FileManager() {
  const [files, setFiles] = useState<MediaFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [deleting, setDeleting] = useState<MediaFile | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);
  const [previewing, setPreviewing] = useState<MediaFile | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Muat blob gambar untuk preview (auth via header, bukan cookie)
  useEffect(() => {
    if (!previewing) {
      setPreviewUrl(null);
      return;
    }
    let cancelled = false;
    let objectUrl: string | null = null;
    const token = localStorage.getItem("token");
    fetch(`/api/files/${previewing.id}/content`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((res) => {
        if (!res.ok) throw new Error("Gagal memuat preview");
        return res.blob();
      })
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setPreviewUrl(objectUrl);
      })
      .catch(() => {
        if (!cancelled) toast.error("Gagal memuat preview gambar");
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [previewing]);

  const load = () => {
    setLoading(true);
    setError(null);
    apiGet<{ files: MediaFile[] }>("/files")
      .then((res) => setFiles(res.files || []))
      .catch((e) => setError(e.message || "Gagal memuat file"))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const uploadFiles = async (list: FileList | File[]) => {
    const arr = Array.from(list);
    if (arr.length === 0) return;
    const tooBig = arr.find((f) => f.size > MAX_SIZE);
    if (tooBig) {
      toast.error(
        `File "${tooBig.name}" melebihi batas 16MB`
      );
      return;
    }
    setUploading(true);
    try {
      const token = localStorage.getItem("token");
      for (const f of arr) {
        const form = new FormData();
        form.append("file", f);
        const res = await fetch("/api/files", {
          method: "POST",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: form,
        });
        if (res.status === 401) {
          localStorage.removeItem("token");
          window.location.href = "/login";
          return;
        }
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.message || `Gagal mengunggah ${f.name}`);
        }
      }
      toast.success(
        arr.length === 1 ? "File berhasil diunggah" : `${arr.length} file berhasil diunggah`
      );
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal mengunggah file");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setDeletingBusy(true);
    try {
      await apiDelete(`/files/${deleting.id}`);
      toast.success("File dihapus");
      setDeleting(null);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal menghapus file");
    } finally {
      setDeletingBusy(false);
    }
  };

  const handleDownload = async (f: MediaFile) => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/files/${f.id}/content`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Gagal mengunduh file");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = f.originalName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal mengunduh file");
    }
  };

  const filtered = files.filter((f) =>
    f.originalName.toLowerCase().includes(query.trim().toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">File Manager</h2>
          <p className="text-sm text-muted-foreground">
            Kelola file media untuk pesan WhatsApp
          </p>
        </div>
        <Button
          size="sm"
          className="gap-1.5"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
        >
          <Upload className="w-3.5 h-3.5" />
          {uploading ? "Mengunggah..." : "Upload File"}
        </Button>
      </div>

      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => e.target.files && uploadFiles(e.target.files)}
      />

      {/* Drop zone */}
      <Card>
        <CardContent
          className={`p-8 text-center border-2 border-dashed rounded-xl transition-colors ${
            dragOver
              ? "border-primary bg-primary/5"
              : "border-border"
          }`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            uploadFiles(e.dataTransfer.files);
          }}
        >
          <Upload className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm font-medium text-foreground">
            Seret & letakkan file di sini, atau{" "}
            <button
              type="button"
              className="text-primary underline underline-offset-2"
              onClick={() => inputRef.current?.click()}
            >
              pilih file
            </button>
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Maksimal 16MB per file
          </p>
        </CardContent>
      </Card>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Cari file..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {loading && (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <div className="animate-pulse flex items-center gap-3">
                  <div className="h-10 w-10 bg-secondary rounded" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-secondary rounded w-1/3" />
                    <div className="h-3 bg-secondary rounded w-1/4" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {!loading && error && (
        <Card>
          <CardContent className="p-6 text-center space-y-3">
            <p className="text-sm text-destructive">{error}</p>
            <Button size="sm" variant="outline" onClick={load} className="gap-1.5">
              <RefreshCw className="w-3.5 h-3.5" /> Coba lagi
            </Button>
          </CardContent>
        </Card>
      )}

      {!loading && !error && filtered.length === 0 && (
        <Card>
          <CardContent className="p-10 text-center space-y-3">
            <FolderOpen className="w-8 h-8 mx-auto text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">
              {query ? "Tidak ada file yang cocok" : "Belum ada file"}
            </p>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              {query
                ? "Coba kata kunci lain."
                : "Unggah gambar, dokumen, audio, atau video untuk dipakai di pesan WhatsApp."}
            </p>
            {!query && (
              <Button
                size="sm"
                onClick={() => inputRef.current?.click()}
                className="gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" /> Upload File
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {!loading && !error && filtered.length > 0 && (
        <div className="space-y-2">
          {filtered.map((f) => (
            <Card key={f.id}>
              <CardContent className="p-3 sm:p-4">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    className="shrink-0 rounded-md p-1 hover:bg-secondary/60 disabled:cursor-default"
                    onClick={() =>
                      f.mime.startsWith("image/") && setPreviewing(f)
                    }
                    disabled={!f.mime.startsWith("image/")}
                    aria-label={
                      f.mime.startsWith("image/")
                        ? "Preview gambar"
                        : "Ikon file"
                    }
                  >
                    {iconFor(f.mime)}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {f.originalName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatSize(f.size)} · {formatDate(f.createdAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handleDownload(f)}
                      aria-label="Unduh file"
                    >
                      <Download className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive"
                      onClick={() => setDeleting(f)}
                      aria-label="Hapus file"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {previewing && (
        <Modal
          title={previewing.originalName}
          onClose={() => setPreviewing(null)}
        >
          <div className="rounded-md overflow-hidden border border-border bg-secondary/30 flex items-center justify-center min-h-[200px]">
            {previewUrl ? (
              <img
                src={previewUrl}
                alt={previewing.originalName}
                className="max-h-[60vh] w-auto object-contain"
              />
            ) : (
              <p className="text-xs text-muted-foreground p-8">
                Memuat preview...
              </p>
            )}
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => handleDownload(previewing)}
            >
              <Download className="w-3.5 h-3.5" /> Unduh
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPreviewing(null)}
            >
              Tutup
            </Button>
          </div>
        </Modal>
      )}

      {deleting && (
        <Modal title="Hapus File" onClose={() => setDeleting(null)}>
          <p className="text-sm text-muted-foreground">
            Hapus file <b className="text-foreground">{deleting.originalName}</b>?
          </p>
          <div className="flex justify-end gap-2 mt-5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDeleting(null)}
            >
              Batal
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={handleDelete}
              disabled={deletingBusy}
            >
              {deletingBusy ? "Menghapus..." : "Hapus"}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

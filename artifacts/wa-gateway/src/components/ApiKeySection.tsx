import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Key, Copy, Eye, EyeOff, RefreshCw, Check, AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  key: string;
  createdAt?: string;
  lastUsed?: string;
}

/* Masked key display — toggle visible/hidden */
function MaskedKey({ value }: { value: string }) {
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  function copy() {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({ title: "API key disalin!" });
    });
  }

  const masked = value.slice(0, 12) + "••••••••••••••••••••••••••••••••••••••••••••••••";

  return (
    <div className="flex items-center gap-2">
      <code className="flex-1 text-xs font-mono break-all text-foreground select-all">
        {visible ? value : masked}
      </code>
      <button
        type="button"
        onClick={() => setVisible(!visible)}
        className="shrink-0 p-1 rounded text-muted-foreground hover:text-foreground transition-colors"
        title={visible ? "Sembunyikan" : "Tampilkan"}
      >
        {visible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
      </button>
      <button
        type="button"
        onClick={copy}
        className="shrink-0 p-1 rounded text-muted-foreground hover:text-foreground transition-colors"
        title="Salin"
      >
        {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
      </button>
    </div>
  );
}

interface Props {
  /** compact = inline row mode (for Profile). full = standalone card (for ApiSettings) */
  variant?: "compact" | "full";
}

export function ApiKeySection({ variant = "full" }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [newKeyCopied, setNewKeyCopied] = useState(false);

  const { data: apiKeys, isLoading } = useQuery<ApiKey[]>({
    queryKey: ["api-keys"],
    queryFn: () => apiFetch("/api-keys").then((r) => r.json()),
  });

  const currentKey = apiKeys?.[0];

  const regenerate = useMutation({
    mutationFn: () =>
      apiFetch("/api-keys/regenerate", { method: "PUT" }).then((r) => r.json()),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["api-keys"] });
      setConfirmOpen(false);
      setNewKey(data.key);
    },
    onError: () => toast({ title: "Gagal generate API key", variant: "destructive" }),
  });

  function copyNewKey() {
    if (!newKey) return;
    navigator.clipboard.writeText(newKey).then(() => {
      setNewKeyCopied(true);
      setTimeout(() => setNewKeyCopied(false), 2000);
    });
  }

  const displayPrefix = currentKey?.prefix ? `${currentKey.prefix}...` : null;

  /* ── Compact variant (for Profile card) ──────────────────────────── */
  if (variant === "compact") {
    return (
      <>
        <div className="space-y-2">
          <div className="text-sm font-semibold">API Key</div>

          {isLoading ? (
            <Skeleton className="h-10 w-full rounded-lg" />
          ) : currentKey ? (
            <div className="rounded-lg border border-border bg-muted/40 px-3 py-2">
              <MaskedKey value={currentKey.key} />
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border px-3 py-2.5 text-xs text-muted-foreground">
              Belum ada API key — klik Generate untuk membuat
            </div>
          )}

          <div className="flex items-center justify-between">
            {currentKey?.createdAt ? (
              <p className="text-xs text-muted-foreground">
                Dibuat {format(new Date(currentKey.createdAt), "dd MMM yyyy")}
                {currentKey.lastUsed && ` · Terakhir dipakai ${format(new Date(currentKey.lastUsed), "dd MMM yyyy")}`}
              </p>
            ) : (
              <span />
            )}
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1.5 text-xs shrink-0"
              disabled={regenerate.isPending}
              onClick={() => currentKey ? setConfirmOpen(true) : regenerate.mutate()}
            >
              {regenerate.isPending
                ? <Loader2 className="w-3 h-3 animate-spin" />
                : <RefreshCw className="w-3 h-3" />}
              {currentKey ? "Generate Ulang" : "Generate Key"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Generate ulang akan menonaktifkan key lama secara permanen
          </p>
        </div>

        {/* Confirm dialog */}
        <ConfirmDialog
          open={confirmOpen}
          onClose={() => setConfirmOpen(false)}
          onConfirm={() => regenerate.mutate()}
          isPending={regenerate.isPending}
          prefix={displayPrefix}
        />

        {/* New key dialog */}
        <NewKeyDialog
          keyValue={newKey}
          copied={newKeyCopied}
          onCopy={copyNewKey}
          onClose={() => { setNewKey(null); setNewKeyCopied(false); }}
        />
      </>
    );
  }

  /* ── Full variant (for ApiSettings) ────────────────────────────── */
  return (
    <>
      {/* Header row */}
      <div className="flex items-start justify-between mb-1">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
            style={{ backgroundColor: "hsl(145 63% 49% / 0.12)" }}>
            <Key className="w-4 h-4" style={{ color: "hsl(145 63% 42%)" }} />
          </div>
          <div>
            <p className="font-semibold text-sm">Default API Key</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {currentKey?.createdAt
                ? `Dibuat ${format(new Date(currentKey.createdAt), "dd MMM yyyy")}${currentKey.lastUsed ? ` · Terakhir dipakai ${format(new Date(currentKey.lastUsed), "dd MMM yyyy")}` : ""}`
                : "Belum ada API key"}
            </p>
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-8 gap-1.5 text-sm shrink-0"
          disabled={regenerate.isPending || isLoading}
          onClick={() => currentKey ? setConfirmOpen(true) : regenerate.mutate()}
        >
          {regenerate.isPending
            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
            : <RefreshCw className="w-3.5 h-3.5" />}
          Generate Ulang
        </Button>
      </div>

      {/* Key display */}
      {isLoading ? (
        <Skeleton className="h-10 w-full rounded-xl mt-3" />
      ) : currentKey ? (
        <div className="mt-3 bg-muted/40 rounded-xl px-4 py-2.5 border border-border/50">
          <MaskedKey value={currentKey.key} />
        </div>
      ) : (
        <div className="mt-3 rounded-xl border border-dashed border-border px-4 py-6 text-center">
          <Key className="w-6 h-6 text-muted-foreground mx-auto mb-2" />
          <p className="text-xs text-muted-foreground mb-3">Belum ada API key</p>
          <Button size="sm" className="gap-1.5 text-white" style={{ backgroundColor: "hsl(145 63% 45%)" }}
            onClick={() => regenerate.mutate()} disabled={regenerate.isPending}>
            {regenerate.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Generate API Key
          </Button>
        </div>
      )}

      <p className="text-xs text-muted-foreground mt-2">
        Generate ulang akan menonaktifkan key lama — semua integrasi harus diperbarui
      </p>

      {/* Confirm dialog */}
      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => regenerate.mutate()}
        isPending={regenerate.isPending}
        prefix={displayPrefix}
      />

      {/* New key dialog */}
      <NewKeyDialog
        keyValue={newKey}
        copied={newKeyCopied}
        onCopy={copyNewKey}
        onClose={() => { setNewKey(null); setNewKeyCopied(false); }}
      />
    </>
  );
}

/* ── Sub-dialogs ─────────────────────────────────────────────────────── */

function ConfirmDialog({ open, onClose, onConfirm, isPending, prefix }: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isPending: boolean;
  prefix: string | null;
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-600">
            <AlertTriangle className="w-5 h-5" />
            Generate API Key Baru?
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          API key lama
          {prefix && <> (<code className="text-xs font-mono bg-muted px-1 rounded">{prefix}</code>)</>}
          {" "}akan <strong>langsung tidak berfungsi</strong>. Semua integrasi yang menggunakan key lama harus diperbarui dengan key baru.
        </p>
        <DialogFooter className="gap-2 flex-row justify-end">
          <Button variant="outline" onClick={onClose} disabled={isPending}>Batal</Button>
          <Button onClick={onConfirm} disabled={isPending} className="gap-2">
            {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            Ya, Generate Baru
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NewKeyDialog({ keyValue, copied, onCopy, onClose }: {
  keyValue: string | null;
  copied: boolean;
  onCopy: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog open={!!keyValue} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-green-600 flex items-center gap-2">
            <Check className="w-5 h-5" />
            API Key Berhasil Dibuat!
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Simpan key ini sekarang. Key <strong>tidak akan ditampilkan lagi</strong> setelah dialog ini ditutup.
          </p>
          <div className="bg-zinc-900 rounded-xl p-4 flex items-start gap-3 border border-zinc-700">
            <code className="text-xs font-mono text-green-400 flex-1 break-all leading-relaxed">
              {keyValue}
            </code>
            <button
              type="button"
              onClick={onCopy}
              className="shrink-0 p-1 rounded text-zinc-400 hover:text-white transition-colors mt-0.5"
              title="Salin key"
            >
              {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={onClose} className="w-full">
            Sudah Disimpan, Tutup
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

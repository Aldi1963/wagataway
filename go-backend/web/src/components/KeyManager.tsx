import { useEffect, useState } from "react";
import {
  Plus,
  KeyRound,
  Copy,
  Trash2,
  RefreshCw,
  Eye,
  EyeOff,
  AlertTriangle,
  FlaskConical,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { apiGet, apiPost, apiDelete } from "@/lib/api";
import { toast } from "sonner";

export interface ApiKey {
  id: number;
  name: string;
  keyPrefix: string;
  isActive: boolean;
  lastUsed: string | null;
  createdAt: string;
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative bg-card text-card-foreground border border-border rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-border sticky top-0 bg-card rounded-t-xl">
          <h3 className="font-semibold">{title}</h3>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose} aria-label="Tutup">
            <X className="w-4 h-4" />
          </Button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

/* ── Kelola API Key ──────────────────── */

export function KeyManager({ onUseKey }: { onUseKey?: (key: string) => void }) {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [newKeyName, setNewKeyName] = useState("");
  const [showNewKey, setShowNewKey] = useState(true);
  const [deleting, setDeleting] = useState<ApiKey | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    apiGet<{ apiKeys: ApiKey[] }>("/api-keys")
      .then((d) => setKeys(d.apiKeys || []))
      .catch((e) => setError(e.message || "Gagal memuat API key"))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const createKey = async () => {
    if (!name.trim()) {
      toast.error("Nama API key wajib diisi");
      return;
    }
    setSaving(true);
    try {
      // Backend mengembalikan: { apiKey: "<key penuh>", key: <objek metadata> }
      const res = await apiPost<{ apiKey: string; key: ApiKey }>("/api-keys", {
        name: name.trim(),
      });
      setKeys((prev) => [res.key, ...prev]);
      setNewKey(res.apiKey);
      setNewKeyName(name.trim());
      setShowNewKey(true);
      setName("");
      setShowForm(false);
      toast.success("API key dibuat");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal membuat API key");
    } finally {
      setSaving(false);
    }
  };

  const deleteKey = async () => {
    if (!deleting) return;
    try {
      await apiDelete(`/api-keys/${deleting.id}`);
      setKeys((prev) => prev.filter((k) => k.id !== deleting.id));
      setDeleting(null);
      toast.success("API key dihapus");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal menghapus API key");
    }
  };

  const copyText = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(label + " disalin");
    } catch {
      toast.error("Gagal menyalin");
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <KeyRound className="w-4 h-4" /> Kelola API Key
        </CardTitle>
        <Button size="sm" onClick={() => setShowForm(true)} className="gap-1">
          <Plus className="w-4 h-4" /> Buat Key
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
            <RefreshCw className="w-4 h-4 animate-spin" /> Memuat...
          </div>
        ) : error ? (
          <div className="text-sm text-destructive flex items-center gap-2 py-4">
            <AlertTriangle className="w-4 h-4" /> {error}
            <Button variant="outline" size="sm" onClick={load}>Coba lagi</Button>
          </div>
        ) : keys.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            Belum ada API key. Buat satu untuk mulai memakai API.
          </p>
        ) : (
          <div className="space-y-2">
            {keys.map((k) => (
              <div
                key={k.id}
                className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{k.name}</p>
                  <p className="text-xs text-muted-foreground font-mono">
                    {k.keyPrefix}... {k.isActive ? "" : "· nonaktif"}
                    {k.lastUsed ? ` · terakhir dipakai ${new Date(k.lastUsed).toLocaleDateString("id-ID")}` : " · belum pernah dipakai"}
                  </p>
                </div>
                <Badge variant={k.isActive ? "default" : "secondary"} className="text-[10px]">
                  {k.isActive ? "Aktif" : "Nonaktif"}
                </Badge>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive hover:text-destructive"
                  onClick={() => setDeleting(k)}
                  aria-label={`Hapus ${k.name}`}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {showForm && (
          <Modal title="Buat API Key Baru" onClose={() => setShowForm(false)}>
            <div className="space-y-3">
              <div>
                <label className="text-xs">Nama key</label>
                <Input
                  className="mt-1"
                  placeholder="cth: Integrasi Toko"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && createKey()}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Key penuh hanya ditampilkan sekali setelah dibuat. Simpan di tempat aman.
              </p>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowForm(false)}>Batal</Button>
                <Button onClick={createKey} disabled={saving}>
                  {saving ? "Membuat..." : "Buat Key"}
                </Button>
              </div>
            </div>
          </Modal>
        )}

        {newKey && (
          <Modal title="API Key Baru Dibuat" onClose={() => setNewKey(null)}>
            <div className="space-y-3">
              <p className="text-sm">
                Key <strong>{newKeyName}</strong> berhasil dibuat. Salin sekarang — key penuh tidak akan ditampilkan lagi.
              </p>
              <div className="flex items-center gap-2 rounded-lg border border-border bg-secondary/40 px-3 py-2">
                <code className="flex-1 font-mono text-xs break-all">
                  {showNewKey ? newKey : "•".repeat(32)}
                </code>
                <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => setShowNewKey((v) => !v)} aria-label="Tampilkan/sembunyikan">
                  {showNewKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => copyText(newKey, "API key")} aria-label="Salin key">
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
              <div className="flex justify-end gap-2">
                {onUseKey && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      onUseKey(newKey);
                      setNewKey(null);
                    }}
                  >
                    <FlaskConical className="w-4 h-4 mr-1" /> Pakai untuk mencoba
                  </Button>
                )}
                <Button onClick={() => setNewKey(null)}>Selesai</Button>
              </div>
            </div>
          </Modal>
        )}

        {deleting && (
          <Modal title="Hapus API Key" onClose={() => setDeleting(null)}>
            <p className="text-sm mb-4">
              Hapus key <strong>{deleting.name}</strong>? Integrasi yang memakai key ini akan berhenti bekerja.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDeleting(null)}>Batal</Button>
              <Button variant="destructive" onClick={deleteKey}>Hapus</Button>
            </div>
          </Modal>
        )}
      </CardContent>
    </Card>
  );
}

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link2, Plus, Trash2, Copy, ExternalLink, BarChart2, Loader2, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";

interface ShortLink {
  id: number;
  code: string;
  originalUrl: string;
  title: string | null;
  clicks: number;
  createdAt: string;
}

function getShortUrl(code: string): string {
  return `${window.location.origin}/l/${code}`;
}

export default function Links() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [form, setForm] = useState({ originalUrl: "", title: "", customCode: "" });

  const { data: links = [], isLoading } = useQuery<ShortLink[]>({
    queryKey: ["links"],
    queryFn: () => apiFetch("/links").then((r) => r.json()),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      apiFetch("/links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      }).then(async (r) => {
        if (!r.ok) { const e = await r.json(); throw new Error(e.message); }
        return r.json();
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["links"] });
      toast({ title: "Link berhasil dibuat" });
      setShowCreate(false);
      setForm({ originalUrl: "", title: "", customCode: "" });
    },
    onError: (e: Error) => toast({ title: e.message ?? "Gagal membuat link", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      apiFetch(`/links/${id}`, { method: "DELETE" }).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["links"] });
      toast({ title: "Link dihapus" });
      setDeleteId(null);
    },
    onError: () => toast({ title: "Gagal menghapus", variant: "destructive" }),
  });

  function copyLink(code: string) {
    navigator.clipboard.writeText(getShortUrl(code));
    toast({ title: "Link disalin!" });
  }

  const totalClicks = links.reduce((sum, l) => sum + l.clicks, 0);

  return (
    <div className="max-w-3xl mx-auto space-y-5 py-6 px-4">
      {/* Header */}
      <div className="flex items-center justify-end">
        <Button
          onClick={() => setShowCreate(true)}
          style={{ backgroundColor: "hsl(145 63% 49%)" }}
          className="text-white shrink-0"
        >
          <Plus className="w-4 h-4 mr-1.5" />
          Buat Link
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-emerald-100 dark:bg-emerald-900/30 p-2.5">
                <Link2 className="w-4 h-4 text-emerald-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{links.length}</p>
                <p className="text-xs text-muted-foreground">Total Link</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-blue-100 dark:bg-blue-900/30 p-2.5">
                <BarChart2 className="w-4 h-4 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{totalClicks}</p>
                <p className="text-xs text-muted-foreground">Total Klik</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* List */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm">Daftar Link</CardTitle>
          <CardDescription className="text-xs">
            Gunakan link pendek di pesan blast untuk tracking klik
          </CardDescription>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : links.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <Link2 className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Belum ada link. Buat link pertamamu!</p>
            </div>
          ) : (
            <div className="divide-y">
              {links.map((link) => (
                <div key={link.id} className="py-4 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      {link.title && (
                        <p className="font-medium text-sm truncate">{link.title}</p>
                      )}
                      <a
                        href={link.originalUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-muted-foreground truncate block hover:underline"
                      >
                        {link.originalUrl}
                      </a>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Badge variant="secondary" className="text-xs font-mono gap-1">
                        <BarChart2 className="w-3 h-3" />
                        {link.clicks} klik
                      </Badge>
                      <Button variant="ghost" size="icon" onClick={() => copyLink(link.code)} className="h-8 w-8">
                        <Copy className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => window.open(getShortUrl(link.code), "_blank")}
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                        onClick={() => setDeleteId(link.id)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="text-xs bg-muted px-2 py-0.5 rounded font-mono">{getShortUrl(link.code)}</code>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(link.createdAt), "d MMM yyyy", { locale: idLocale })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog: Buat Link */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Buat Link Pendek</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label>URL Asli <span className="text-red-500">*</span></Label>
              <Input
                placeholder="https://example.com/halaman-produk"
                value={form.originalUrl}
                onChange={(e) => setForm((f) => ({ ...f, originalUrl: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Judul (opsional)</Label>
              <Input
                placeholder="Promo Lebaran 2025"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Kode Custom (opsional)</Label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground whitespace-nowrap">/l/</span>
                <Input
                  placeholder="promo25 (kosongkan = auto)"
                  value={form.customCode}
                  onChange={(e) => setForm((f) => ({ ...f, customCode: e.target.value }))}
                />
              </div>
            </div>
          </div>
          <DialogFooter className="pt-2">
            <Button variant="outline" onClick={() => setShowCreate(false)}>Batal</Button>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending || !form.originalUrl.trim()}
              style={{ backgroundColor: "hsl(145 63% 49%)" }}
              className="text-white"
            >
              {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
              Buat Link
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Hapus */}
      <Dialog open={!!deleteId} onOpenChange={(v) => !v && setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Hapus Link?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Link ini akan dihapus permanen. Data klik akan hilang.</p>
          <DialogFooter className="pt-2">
            <Button variant="outline" onClick={() => setDeleteId(null)}>Batal</Button>
            <Button
              variant="destructive"
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Trash2 className="w-4 h-4 mr-2" />}
              Hapus
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

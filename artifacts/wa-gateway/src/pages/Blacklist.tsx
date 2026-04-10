import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Shield, ShieldOff, Plus, Trash2, Upload, Search, Loader2, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";

interface BlacklistEntry {
  id: number;
  phone: string;
  reason: string | null;
  createdAt: string;
}

export default function Blacklist() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [phones, setPhones] = useState("");
  const [reason, setReason] = useState("");
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const { data: entries = [], isLoading } = useQuery<BlacklistEntry[]>({
    queryKey: ["blacklist", search],
    queryFn: () => {
      const params = search ? `?search=${encodeURIComponent(search)}` : "";
      return apiFetch(`/blacklist${params}`).then((r) => r.json());
    },
  });

  const addMutation = useMutation({
    mutationFn: () =>
      apiFetch("/blacklist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phones: phones.split(/[\n,;]+/).map((p) => p.replace(/\D/g, "").trim()).filter(Boolean),
          reason: reason.trim() || undefined,
        }),
      }).then((r) => r.json()),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["blacklist"] });
      toast({ title: `${data.inserted} nomor ditambahkan`, description: data.skipped ? `${data.skipped} nomor sudah ada` : undefined });
      setShowAdd(false);
      setPhones("");
      setReason("");
    },
    onError: () => toast({ title: "Gagal menambahkan", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      apiFetch(`/blacklist/${id}`, { method: "DELETE" }).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["blacklist"] });
      toast({ title: "Nomor dihapus dari blacklist" });
      setDeleteId(null);
    },
    onError: () => toast({ title: "Gagal menghapus", variant: "destructive" }),
  });

  return (
    <div className="max-w-3xl mx-auto space-y-5 py-6 px-4">
      {/* Header */}
      <div className="flex items-center justify-end">
        <Button
          onClick={() => setShowAdd(true)}
          style={{ backgroundColor: "hsl(145 63% 49%)" }}
          className="text-white shrink-0"
        >
          <Plus className="w-4 h-4 mr-1.5" />
          Tambah Nomor
        </Button>
      </div>

      {/* Stats */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-red-100 dark:bg-red-900/30 p-2.5">
              <Shield className="w-4 h-4 text-red-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{entries.length}</p>
              <p className="text-xs text-muted-foreground">Nomor diblokir</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Cari nomor..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {search && (
          <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2">
            <X className="w-4 h-4 text-muted-foreground hover:text-foreground" />
          </button>
        )}
      </div>

      {/* List */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm">Daftar Nomor Blacklist</CardTitle>
          <CardDescription className="text-xs">
            Blast otomatis akan melewati nomor-nomor ini
          </CardDescription>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : entries.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <ShieldOff className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">{search ? "Tidak ada nomor yang cocok" : "Belum ada nomor di blacklist"}</p>
            </div>
          ) : (
            <div className="divide-y">
              {entries.map((entry) => (
                <div key={entry.id} className="flex items-center justify-between py-3 gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-mono text-sm font-medium">{entry.phone}</p>
                    {entry.reason && (
                      <p className="text-xs text-muted-foreground truncate">{entry.reason}</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {format(new Date(entry.createdAt), "d MMM yyyy HH:mm", { locale: idLocale })}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 shrink-0"
                    onClick={() => setDeleteId(entry.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog: Tambah */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tambah Nomor ke Blacklist</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label>Nomor Telepon</Label>
              <Textarea
                rows={5}
                placeholder={"628111000001\n628111000002\n628111000003"}
                value={phones}
                onChange={(e) => setPhones(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Bisa isi banyak nomor sekaligus, pisah dengan baris baru atau koma. Hanya angka.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Alasan (opsional)</Label>
              <Input
                placeholder="Misal: Minta opt-out, spam, dll"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter className="pt-2">
            <Button variant="outline" onClick={() => setShowAdd(false)}>Batal</Button>
            <Button
              onClick={() => addMutation.mutate()}
              disabled={addMutation.isPending || !phones.trim()}
              style={{ backgroundColor: "hsl(145 63% 49%)" }}
              className="text-white"
            >
              {addMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
              Tambahkan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Hapus */}
      <Dialog open={!!deleteId} onOpenChange={(v) => !v && setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Hapus dari Blacklist?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Nomor ini akan dihapus dari blacklist dan bisa menerima pesan blast lagi.
          </p>
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

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ShoppingBag, Plus, Trash2, Edit2, Loader2, Package, CheckCircle2,
  XCircle, RefreshCw, ClipboardList,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending:    { label: "Menunggu",     color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300" },
  confirmed:  { label: "Dikonfirmasi", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" },
  processing: { label: "Diproses",     color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300" },
  shipped:    { label: "Dikirim",      color: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300" },
  done:       { label: "Selesai",      color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" },
  cancelled:  { label: "Dibatalkan",   color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" },
};

function formatRp(val: string | number): string {
  return `Rp${Number(val).toLocaleString("id-ID")}`;
}

function emptyProduct(deviceId: string) {
  return { deviceId, name: "", description: "", price: "", stock: "", imageUrl: "", code: "", isActive: true };
}

export default function BotProducts() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [selectedDevice, setSelectedDevice] = useState("");
  const [productDialog, setProductDialog] = useState(false);
  const [editProduct, setEditProduct] = useState<any>(null);
  const [form, setForm] = useState(emptyProduct(""));
  const [tab, setTab] = useState("products");

  const { data: devices, isLoading: devicesLoading } = useQuery({
    queryKey: ["devices"],
    queryFn: () => apiFetch("/devices").then((r) => r.json()),
  });

  const connectedDevices = (devices ?? []).filter((d: any) => d.status === "connected");

  const { data: products, isLoading: productsLoading } = useQuery({
    queryKey: ["bot-products", selectedDevice],
    queryFn: () => apiFetch(`/bot-products?deviceId=${selectedDevice}`).then((r) => r.json()),
    enabled: !!selectedDevice,
  });

  const { data: orders, isLoading: ordersLoading } = useQuery({
    queryKey: ["bot-orders", selectedDevice],
    queryFn: () => apiFetch(`/bot-orders?deviceId=${selectedDevice}`).then((r) => r.json()),
    enabled: !!selectedDevice && tab === "orders",
    refetchInterval: 30000,
  });

  const saveMut = useMutation({
    mutationFn: (data: any) => {
      if (editProduct) {
        return apiFetch(`/bot-products/${editProduct.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        }).then((r) => r.json());
      }
      return apiFetch("/bot-products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? "Gagal simpan produk");
        return d;
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bot-products", selectedDevice] });
      toast({ title: editProduct ? "Produk diperbarui" : "Produk ditambahkan" });
      setProductDialog(false);
    },
    onError: (err: any) => toast({ title: err.message ?? "Gagal simpan produk", variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiFetch(`/bot-products/${id}`, { method: "DELETE" }).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bot-products", selectedDevice] });
      toast({ title: "Produk dihapus" });
    },
  });

  const updateOrderMut = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      apiFetch(`/bot-orders/${id}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      }).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bot-orders", selectedDevice] });
      toast({ title: "Status pesanan diperbarui" });
    },
  });

  function openCreate() {
    setEditProduct(null);
    setForm(emptyProduct(selectedDevice));
    setProductDialog(true);
  }

  function openEdit(p: any) {
    setEditProduct(p);
    setForm({
      deviceId: String(p.deviceId),
      name: p.name,
      description: p.description ?? "",
      price: String(p.price),
      stock: p.stock !== null ? String(p.stock) : "",
      imageUrl: p.imageUrl ?? "",
      code: p.code,
      isActive: p.isActive,
    });
    setProductDialog(true);
  }

  function handleSave() {
    if (!form.name.trim() || !form.code.trim() || !form.price) {
      toast({ title: "Nama, kode, dan harga wajib diisi", variant: "destructive" }); return;
    }
    saveMut.mutate({
      ...form,
      deviceId: parseInt(selectedDevice, 10),
      price: Number(form.price),
      stock: form.stock !== "" ? parseInt(form.stock, 10) : null,
    });
  }

  return (
    <div className="space-y-6">

      {/* Device selector */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center gap-3">
            <Label className="shrink-0 text-sm">Perangkat:</Label>
            {devicesLoading ? (
              <Skeleton className="h-9 w-64" />
            ) : (
              <Select value={selectedDevice} onValueChange={setSelectedDevice}>
                <SelectTrigger className="w-64">
                  <SelectValue placeholder="Pilih perangkat..." />
                </SelectTrigger>
                <SelectContent>
                  {connectedDevices.length === 0 ? (
                    <SelectItem value="_none" disabled>Tidak ada perangkat terhubung</SelectItem>
                  ) : connectedDevices.map((d: any) => (
                    <SelectItem key={d.id} value={String(d.id)}>
                      {d.name} {d.phone ? `(${d.phone})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </CardContent>
      </Card>

      {!selectedDevice ? (
        <div className="rounded-xl border border-dashed p-12 text-center text-muted-foreground">
          <ShoppingBag className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Pilih perangkat untuk melihat produk dan pesanan</p>
        </div>
      ) : (
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid grid-cols-2 w-full max-w-xs">
            <TabsTrigger value="products" className="gap-1.5">
              <Package className="w-3.5 h-3.5" /> Produk
            </TabsTrigger>
            <TabsTrigger value="orders" className="gap-1.5">
              <ClipboardList className="w-3.5 h-3.5" /> Pesanan
              {orders?.length > 0 && (
                <Badge variant="secondary" className="ml-1 text-xs h-4 px-1">
                  {orders.filter((o: any) => o.status === "pending").length || ""}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {/* ── Products Tab ── */}
          <TabsContent value="products" className="mt-4">
            <div className="flex justify-end mb-3">
              <Button onClick={openCreate} className="gap-2" size="sm">
                <Plus className="w-4 h-4" /> Tambah Produk
              </Button>
            </div>

            {productsLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
              </div>
            ) : !products?.length ? (
              <div className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">
                <Package className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Belum ada produk. Tambahkan produk agar pelanggan bisa memesan via CS Bot.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {(products ?? []).map((p: any) => (
                  <Card key={p.id} className={!p.isActive ? "opacity-60" : ""}>
                    <CardContent className="pt-3 pb-3 px-4 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm">{p.name}</span>
                          <Badge variant="outline" className="text-[10px] font-mono">{p.code}</Badge>
                          {!p.isActive && <Badge variant="secondary" className="text-[10px]">Nonaktif</Badge>}
                          {p.stock !== null && (
                            <span className="text-xs text-muted-foreground">Stok: {p.stock}</span>
                          )}
                        </div>
                        {p.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{p.description}</p>}
                        <p className="text-sm font-semibold text-primary mt-0.5">{formatRp(p.price)}</p>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(p)}>
                          <Edit2 className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => { if (confirm("Hapus produk ini?")) deleteMut.mutate(p.id); }}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {/* Tips */}
            <Card className="bg-muted/30 mt-4">
              <CardContent className="pt-4 pb-4">
                <p className="text-xs font-semibold text-muted-foreground mb-1.5">Cara Kerja Pemesanan via Bot:</p>
                <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
                  <li>Pelanggan ketik <strong>katalog</strong>, <strong>pesan</strong>, atau <strong>produk</strong> di WhatsApp</li>
                  <li>Bot menampilkan daftar produk dengan harga</li>
                  <li>Pelanggan pilih produk, masukkan jumlah, nama, dan alamat</li>
                  <li>Bot mencatat pesanan dan mengirim konfirmasi otomatis</li>
                  <li>Pemilik toko melihat dan mengelola pesanan di tab Pesanan</li>
                </ul>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Orders Tab ── */}
          <TabsContent value="orders" className="mt-4">
            <div className="flex justify-end mb-3">
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() => qc.invalidateQueries({ queryKey: ["bot-orders", selectedDevice] })}
              >
                <RefreshCw className="w-3.5 h-3.5" /> Refresh
              </Button>
            </div>

            {ordersLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 w-full" />)}
              </div>
            ) : !orders?.length ? (
              <div className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">
                <ClipboardList className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Belum ada pesanan masuk</p>
              </div>
            ) : (
              <div className="space-y-3">
                {(orders ?? []).map((o: any) => {
                  const st = STATUS_MAP[o.status] ?? { label: o.status, color: "" };
                  return (
                    <Card key={o.id}>
                      <CardContent className="pt-3 pb-3 px-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-sm">#{o.id} — {o.productName}</span>
                              <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold ${st.color}`}>
                                {st.label}
                              </span>
                            </div>
                            <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                              <p>📦 Qty: {o.qty} × {formatRp(o.productPrice)} = <strong>{formatRp(o.totalPrice)}</strong></p>
                              <p>👤 {o.customerName || "—"} · 📱 {o.customerPhone}</p>
                              {o.customerAddress && <p>📍 {o.customerAddress}</p>}
                              <p>🕐 {o.createdAt ? format(new Date(o.createdAt), "dd/MM/yyyy HH:mm") : "—"}</p>
                            </div>
                          </div>
                          <Select
                            value={o.status}
                            onValueChange={(status) => updateOrderMut.mutate({ id: o.id, status })}
                          >
                            <SelectTrigger className="w-36 h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {Object.entries(STATUS_MAP).map(([v, { label }]) => (
                                <SelectItem key={v} value={v} className="text-xs">{label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
      )}

      {/* Product dialog */}
      <Dialog open={productDialog} onOpenChange={(v) => !v && setProductDialog(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editProduct ? "Edit Produk" : "Tambah Produk"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Nama Produk *</Label>
                <Input
                  placeholder="Baju Kaos Polos"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Kode Produk *</Label>
                <Input
                  placeholder="BAJU01"
                  value={form.code}
                  onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                  className="font-mono"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Deskripsi</Label>
              <Textarea
                placeholder="Deskripsi singkat produk..."
                rows={2}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Harga (Rp) *</Label>
                <Input
                  type="number"
                  placeholder="50000"
                  value={form.price}
                  onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Stok (kosongkan = unlimited)</Label>
                <Input
                  type="number"
                  placeholder="100"
                  value={form.stock}
                  onChange={(e) => setForm((f) => ({ ...f, stock: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">URL Gambar (opsional)</Label>
              <Input
                placeholder="https://..."
                value={form.imageUrl}
                onChange={(e) => setForm((f) => ({ ...f, imageUrl: e.target.value }))}
              />
            </div>

            <div className="flex items-center gap-2">
              <Switch
                checked={form.isActive}
                onCheckedChange={(v) => setForm((f) => ({ ...f, isActive: v }))}
              />
              <Label className="text-sm">Produk Aktif</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProductDialog(false)}>Batal</Button>
            <Button onClick={handleSave} disabled={saveMut.isPending} className="gap-2">
              {saveMut.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              {editProduct ? "Simpan Perubahan" : "Tambah Produk"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ShoppingBag, Plus, Trash2, Edit2, Loader2, Package, CheckCircle2,
  XCircle, RefreshCw, ClipboardList, TrendingUp, Tag, Download, 
  Search, Filter, ChevronRight, AlertTriangle, Layers, RefreshCcw, 
  ShoppingCart, LayoutDashboard, AlertCircle, DollarSign, Users, 
  Settings, Save, Smartphone, QrCode, CreditCard, FileText, Printer, Truck
} from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, BarChart, Bar } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
import * as XLSX from "xlsx";
import { cn } from "@/lib/utils";

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
  return { deviceId, categoryId: "", name: "", description: "", price: "", stock: "", minStock: "0", imageUrl: "", code: "", isActive: true, variants: [] as any[] };
}

function emptyPaymentMethod() {
  return { provider: "", accountName: "", accountNumber: "", instructions: "", imageUrl: "", isActive: true };
}

export default function BotProducts() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [selectedDevice, setSelectedDevice] = useState("");
  const [productDialog, setProductDialog] = useState(false);
  const [categoryDialog, setCategoryDialog] = useState(false);
  const [editProduct, setEditProduct] = useState<any>(null);
  const [form, setForm] = useState(emptyProduct(""));
  const [catForm, setCatForm] = useState({ name: "", description: "" });
  const [tab, setTab] = useState("dashboard");
  const [search, setSearch] = useState("");

  const [history, setHistory] = useState<any[]>([]);
  const [topProducts, setTopProducts] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>({ 
    ownerPhone: "", 
    stockAlertEnabled: true, 
    paymentInstructionEnabled: true,
    defaultShippingFee: "0",
    shippingInstructions: "",
    shippingCalcType: "flat",
    rajaongkirApiKey: "",
    rajaongkirOriginId: "",
    rajaongkirAccountType: "starter"
  });
  const [paymentMethods, setPaymentMethods] = useState<any[]>([]);
  const [pmDialog, setPmDialog] = useState(false);
  const [editPm, setEditPm] = useState<any>(null);
  const [pmForm, setPmForm] = useState(emptyPaymentMethod());

  const [cities, setCities] = useState<any[]>([]);
  const [citySearch, setCitySearch] = useState("");

  useEffect(() => {
    if (settings.rajaongkirApiKey && settings.rajaongkirApiKey.length > 5 && tab === "settings") {
      apiFetch(`/bot-commerce/rajaongkir/cities?apiKey=${settings.rajaongkirApiKey}&accountType=${settings.rajaongkirAccountType}`)
        .then(r => r.json())
        .then(data => Array.isArray(data) && setCities(data))
        .catch(() => setCities([]));
    }
  }, [settings.rajaongkirApiKey, settings.rajaongkirAccountType, tab]);

  const filteredCities = useMemo(() => {
    if (!citySearch) return cities;
    return cities.filter(c => c.city_name.toLowerCase().includes(citySearch.toLowerCase()));
  }, [cities, citySearch]);

  const { data: devices, isLoading: devicesLoading } = useQuery({
    queryKey: ["devices"],
    queryFn: () => apiFetch("/devices").then((r) => r.json()),
  });

  const connectedDevices = (devices ?? []).filter((d: any) => d.status === "connected");

  const { data: categories } = useQuery({
    queryKey: ["bot-categories", selectedDevice],
    queryFn: () => apiFetch(`/bot-categories?deviceId=${selectedDevice}`).then((r) => r.json()),
    enabled: !!selectedDevice,
  });

  const { data: products, isLoading: productsLoading } = useQuery({
    queryKey: ["bot-products", selectedDevice],
    queryFn: () => apiFetch(`/bot-products?deviceId=${selectedDevice}`).then((r) => r.json()),
    enabled: !!selectedDevice,
  });

  const { data: orders, isLoading: ordersLoading } = useQuery({
    queryKey: ["bot-orders", selectedDevice],
    queryFn: () => apiFetch(`/bot-orders?deviceId=${selectedDevice}`).then((r) => r.json()),
    enabled: !!selectedDevice,
    refetchInterval: tab === "orders" ? 30000 : false,
  });

  const { data: stats } = useQuery({
    queryKey: ["bot-commerce-stats", selectedDevice],
    queryFn: () => apiFetch(`/bot-commerce/stats?deviceId=${selectedDevice}`).then((r) => r.json()),
    enabled: !!selectedDevice && tab === "dashboard",
  });

  useEffect(() => {
    if (stats) {
      setHistory(stats.chartData || []);
      setTopProducts(stats.topProducts || []);
    }
  }, [stats]);

  const { data: usage } = useQuery({
    queryKey: ["billing-usage"],
    queryFn: () => apiFetch("/billing/usage").then((r) => r.json()),
  });

  const isPremium = useMemo(() => {
    return usage?.commerceEnabled ?? true; 
  }, [usage]);

  const saveMut = useMutation({
    mutationFn: (data: any) => {
      const endpoint = editProduct ? `/bot-products/${editProduct.id}` : "/bot-products";
      return apiFetch(endpoint, {
        method: editProduct ? "PUT" : "POST",
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

  const catMut = useMutation({
    mutationFn: (data: any) => apiFetch("/bot-categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...data, deviceId: selectedDevice }),
    }).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bot-categories", selectedDevice] });
      toast({ title: "Kategori ditambahkan" });
      setCategoryDialog(false);
      setCatForm({ name: "", description: "" });
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiFetch(`/bot-products/${id}`, { method: "DELETE" }).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bot-products", selectedDevice] });
      toast({ title: "Produk dihapus" });
    },
  });

  const updateOrderMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      apiFetch(`/bot-orders/${id}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
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
      categoryId: p.categoryId ? String(p.categoryId) : "",
      name: p.name,
      description: p.description ?? "",
      price: String(p.price),
      stock: p.stock !== null ? String(p.stock) : "",
      minStock: String(p.minStock ?? 0),
      imageUrl: p.imageUrl ?? "",
      code: p.code,
      isActive: p.isActive,
      variants: p.variants ? JSON.parse(p.variants) : [],
    });
    setProductDialog(true);
  }

  const fetchSettings = async () => {
     if(!selectedDevice) return;
     const r = await apiFetch(`/bot-commerce/settings?deviceId=${selectedDevice}`);
     if(r.ok) {
        const d = await r.json();
        setSettings(d.settings || settings);
        setPaymentMethods(d.paymentMethods || []);
     }
  };

  useEffect(() => { fetchSettings(); }, [selectedDevice]);

  function handleSave() {
    if (!form.name.trim() || !form.code.trim() || !form.price) {
      toast({ title: "Nama, kode, dan harga wajib diisi", variant: "destructive" }); return;
    }
    saveMut.mutate({
      ...form,
      deviceId: parseInt(selectedDevice, 10),
      categoryId: form.categoryId && form.categoryId !== "_default" ? parseInt(form.categoryId, 10) : null,
      price: Number(form.price),
      stock: form.stock !== "" ? parseInt(form.stock, 10) : null,
      minStock: parseInt(form.minStock, 10) || 0,
      variants: form.variants.length > 0 ? JSON.stringify(form.variants) : null,
    });
  }

  const exportToExcel = () => {
    if (!orders?.length) return;
    const data = orders.map((o: any) => ({
      ID: o.id,
      Produk: o.productName,
      Qty: o.qty,
      Harga: Number(o.productPrice),
      Total: Number(o.totalPrice),
      Nama_Pelanggan: o.customerName,
      WhatsApp: o.customerPhone,
      Alamat: o.customerAddress,
      Status: o.status,
      Tanggal: format(new Date(o.createdAt), "dd/MM/yyyy HH:mm"),
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Pesanan");
    XLSX.writeFile(wb, `Pesanan_Bot_${format(new Date(), "yyyyMMdd")}.xlsx`);
  };

  const filteredProducts = useMemo(() => {
    if (!search) return products ?? [];
    return (products ?? []).filter((p: any) => 
      p.name.toLowerCase().includes(search.toLowerCase()) || 
      p.code.toLowerCase().includes(search.toLowerCase())
    );
  }, [products, search]);

  return (
    <>
      <div className="space-y-6 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-800">Commerce Command Center</h2>
          <p className="text-muted-foreground text-sm">Kelola produk, katalog AI, dan pantau omzet penjualan bot.</p>
        </div>
        <div className="flex items-center gap-3">
            {devicesLoading ? (
              <Skeleton className="h-10 w-64" />
            ) : (<>
              <Select value={selectedDevice} onValueChange={setSelectedDevice}>
                <SelectTrigger className="w-64 h-11 bg-card shadow-sm border-none rounded-2xl">
                  <SelectValue placeholder="Pilih perangkat WA..." />
                </SelectTrigger>
                <SelectContent className="rounded-2xl border-none shadow-xl">
                  {connectedDevices.length === 0 ? (
                    <SelectItem value="_none" disabled>Tidak ada perangkat terhubung</SelectItem>
                  ) : connectedDevices.map((d: any) => (
                    <SelectItem key={d.id} value={String(d.id)}>
                      {d.name} {d.phone ? `(${d.phone})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
          </>)}
        </div>
      </div>

      {!selectedDevice ? (
        <div className="rounded-[40px] border-2 border-dashed border-slate-200 p-20 text-center bg-slate-50/50">
          <div className="w-20 h-20 bg-white rounded-3xl shadow-sm flex items-center justify-center mx-auto mb-6">
            <ShoppingBag className="w-10 h-10 text-slate-300" />
          </div>
          <h3 className="text-xl font-bold text-slate-700">Siap Berjualan?</h3>
          <p className="text-muted-foreground max-w-sm mx-auto mt-2">Pilih perangkat WhatsApp Anda untuk mulai mengelola katalog produk dan melihat pesanan otomatis dari CS Bot.</p>
        </div>
      ) : (
        <Tabs value={tab} onValueChange={setTab} className="space-y-6">
          {!isPremium && (tab === "settings" || tab === "orders" || tab === "dashboard") ? (
             <Card className="rounded-[40px] border-none shadow-2xl overflow-hidden relative group">
                <CardContent className="p-20 text-center relative z-10 flex flex-col items-center justify-center space-y-6">
                  <div className="w-24 h-24 bg-primary/10 rounded-[32px] flex items-center justify-center">
                    <ShoppingCart className="w-12 h-12 text-primary" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-3xl font-black tracking-tight">Commerce Center Premium</h3>
                    <p className="text-muted-foreground text-sm max-w-md mx-auto">Fitur automasi pesanan, cek ongkir RajaOngkir, dan manajemen katalog AI hanya tersedia pada paket *Enterprise*.</p>
                    <Button className="mt-4 rounded-xl font-bold" onClick={() => window.location.href='/billing'}>Buka Akses Premium Sekarang</Button>
                  </div>
                </CardContent>
             </Card>
          ) : (
          <>
          <TabsList className="bg-muted/50 p-1 rounded-2xl w-full md:w-auto h-auto grid grid-cols-2 md:inline-flex">
            <TabsTrigger value="dashboard" className="data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-lg px-6 py-2 transition-all">
              <LayoutDashboard className="w-4 h-4 mr-2" /> Dashboard
            </TabsTrigger>
            <TabsTrigger value="products" className="data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-lg px-6 py-2 transition-all">
              <Package className="w-4 h-4 mr-2" /> Produk
            </TabsTrigger>
            <TabsTrigger value="orders" className="data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-lg px-6 py-2 transition-all">
              <ShoppingCart className="w-4 h-4 mr-2" /> Pesanan
            </TabsTrigger>
            <TabsTrigger value="categories" className="data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-lg px-6 py-2 transition-all">
              <Layers className="w-4 h-4 mr-2" /> Kategori
            </TabsTrigger>
            <TabsTrigger value="settings" className="data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-lg px-6 py-2 transition-all">
              <Settings className="w-4 h-4 mr-2" /> Setelan
            </TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard" className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
             <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="bg-gradient-to-br from-emerald-500 to-teal-600 text-white border-none shadow-lg overflow-hidden relative rounded-[32px]">
                   <div className="absolute top-0 right-0 p-4 opacity-20"><TrendingUp className="w-24 h-24" /></div>
                   <CardHeader className="pb-2">
                      <CardTitle className="text-emerald-100/80 text-sm font-medium">Total Omzet (Selesai)</CardTitle>
                   </CardHeader>
                   <CardContent>
                      <div className="text-4xl font-bold tracking-tight mb-1">{formatRp(stats?.totalOmzet ?? 0)}</div>
                      <div className="text-emerald-100/90 text-[10px] flex items-center mt-2 font-bold uppercase tracking-wider">
                        <AlertCircle className="w-3 h-3 mr-1" /> Hanya pesanan Selesai
                      </div>
                   </CardContent>
                </Card>
                <Card className="rounded-[32px] hover:shadow-md transition-shadow border-none shadow-sm">
                   <CardHeader className="pb-2 flex flex-row items-center justify-between">
                      <CardTitle className="text-muted-foreground text-sm font-medium">Total Pesanan</CardTitle>
                      <div className="bg-blue-50 p-2 rounded-xl text-blue-500"><ShoppingCart className="w-4 h-4" /></div>
                   </CardHeader>
                   <CardContent>
                      <div className="text-3xl font-bold">{stats?.totalOrders ?? 0}</div>
                      <p className="text-xs text-muted-foreground mt-1">Transaksi sukses diproses bot.</p>
                   </CardContent>
                </Card>
                <Card className="rounded-[32px] hover:shadow-md transition-shadow border-none shadow-sm">
                   <CardHeader className="pb-2 flex flex-row items-center justify-between">
                      <CardTitle className="text-muted-foreground text-sm font-medium">Katalog Aktif</CardTitle>
                      <div className="bg-purple-50 p-2 rounded-xl text-purple-500"><Package className="w-4 h-4" /></div>
                   </CardHeader>
                   <CardContent>
                      <div className="text-3xl font-bold">{stats?.totalProducts ?? 0}</div>
                      <p className="text-xs text-muted-foreground mt-1">Item yang terpajang di WhatsApp.</p>
                   </CardContent>
                </Card>
             </div>
             
             <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <Card className="rounded-[32px] border-none shadow-sm overflow-hidden">
                    <CardHeader>
                      <CardTitle className="text-base flex items-center gap-2 font-bold"><TrendingUp className="w-4 h-4 text-emerald-500"/> Tren Penjualan (7 Hari)</CardTitle>
                    </CardHeader>
                    <CardContent className="h-[250px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={history}>
                          <defs>
                            <linearGradient id="colorAmt" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/>
                              <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                          <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#888'}} />
                          <YAxis hide />
                          <Tooltip contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)'}} />
                          <Area type="monotone" dataKey="amount" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorAmt)" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  <Card className="rounded-[32px] border-none shadow-sm">
                    <CardHeader>
                      <CardTitle className="text-base flex items-center gap-2 font-bold"><Package className="w-4 h-4 text-blue-500"/> Produk Terlaris</CardTitle>
                    </CardHeader>
                    <CardContent className="h-[250px]">
                       <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={topProducts} layout="vertical">
                            <XAxis type="number" hide />
                            <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#666'}} width={80} />
                            <Tooltip cursor={{fill: '#f8fafc'}} contentStyle={{borderRadius:'12px', border:'none'}} />
                            <Bar dataKey="count" fill="#3b82f6" radius={[0, 8, 8, 0]} barSize={20} />
                          </BarChart>
                       </ResponsiveContainer>
                    </CardContent>
                  </Card>
               </div>
          </TabsContent>

          <TabsContent value="products" className="space-y-4 animate-in fade-in duration-500">
            <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-card p-4 rounded-[32px] shadow-sm">
              <div className="relative w-full md:w-96">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input placeholder="Cari nama atau kode produk..." className="pl-11 h-12 bg-muted/40 border-none rounded-2xl" value={search} onChange={e=>setSearch(e.target.value)} />
              </div>
              <div className="flex gap-2 w-full md:w-auto">
                <Button onClick={openCreate} className="rounded-2xl h-12 px-8 font-bold gap-2" size="sm shadow-lg shadow-primary/20"><Plus className="w-4 h-4" /> Produk Baru</Button>
              </div>
            </div>

            {productsLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {Array.from({ length: 9 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-[32px]" />)}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredProducts.map((p: any) => (
                  <Card key={p.id} className={cn("rounded-[32px] border-none shadow-sm transition-all hover:shadow-xl hover:-translate-y-1 group relative overflow-hidden", !p.isActive && "opacity-60")}>
                    <CardContent className="p-6 flex gap-5">
                      {p.imageUrl ? (
                        <div className="w-24 h-24 rounded-3xl bg-slate-100 overflow-hidden shrink-0 shadow-inner group-hover:scale-105 transition-transform">
                           <img src={p.imageUrl} className="w-full h-full object-cover" />
                        </div>
                      ) : (
                        <div className="w-24 h-24 rounded-3xl bg-slate-50 flex items-center justify-center shrink-0 border-2 border-dashed border-slate-200"><Package className="w-10 h-10 text-slate-200" /></div>
                      )}
                      <div className="flex-1 min-w-0 flex flex-col justify-between">
                        <div>
                           <div className="flex items-center gap-2 mb-1">
                              <span className="font-black text-slate-800 truncate text-base">{p.name}</span>
                              <Badge variant="outline" className="text-[9px] px-2 font-bold bg-slate-50 border-slate-200">{p.code}</Badge>
                           </div>
                           <p className="text-[10px] text-muted-foreground line-clamp-2 leading-relaxed mb-2 font-medium">{p.description || 'Tanpa deskripsi'}</p>
                           <p className="font-black text-primary text-lg leading-none">{formatRp(p.price)}</p>
                        </div>
                        <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100/50">
                           <span className={cn("text-[10px] font-black uppercase tracking-widest", (p.stock??0) <= (p.minStock??0) ? 'text-red-500' : 'text-slate-400')}>Stok: {p.stock ?? '∞'}</span>
                           <div className="flex gap-1">
                              <Button size="icon" variant="ghost" className="h-8 w-8 rounded-xl bg-slate-50 hover:bg-white" onClick={() => openEdit(p)}><Edit2 className="w-4 h-4 text-slate-600" /></Button>
                              <Button size="icon" variant="ghost" className="h-8 w-8 rounded-xl bg-red-50 hover:bg-red-500 hover:text-white transition-colors" onClick={() => { if(confirm("Hapus produk ini?")) deleteMut.mutate(p.id) }}><Trash2 className="w-4 h-4 text-red-400 group-hover:text-inherit" /></Button>
                           </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="orders" className="space-y-4 animate-in fade-in duration-500">
             <div className="flex flex-col md:flex-row justify-between items-center bg-card p-6 rounded-[32px] shadow-sm gap-6">
                <div className="flex gap-8 w-full md:w-auto overflow-x-auto pb-2 md:pb-0">
                   <div className="shrink-0">
                      <p className="text-[10px] uppercase font-black tracking-widest text-muted-foreground mb-1">Menunggu</p>
                      <p className="text-2xl font-black text-slate-800">{orders?.filter((o:any)=>o.status==='pending').length ?? 0}</p>
                   </div>
                   <div className="shrink-0">
                      <p className="text-[10px] uppercase font-black tracking-widest text-muted-foreground mb-1">Terbayar</p>
                      <div className="flex items-center gap-2">
                         <p className="text-2xl font-black text-emerald-600">{orders?.filter((o:any)=>o.paymentStatus==='paid').length ?? 0}</p>
                         <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      </div>
                   </div>
                   <div className="shrink-0">
                      <p className="text-[10px] uppercase font-black tracking-widest text-muted-foreground mb-1">Total Order</p>
                      <p className="text-2xl font-black text-slate-800">{orders?.length ?? 0}</p>
                   </div>
                </div>
                <div className="flex gap-3 w-full md:w-auto">
                   <Button variant="outline" className="rounded-2xl gap-2 h-12 px-6 font-bold flex-1 md:flex-none" size="sm" onClick={exportToExcel}><Download className="w-4 h-4" /> Ekspor Excel</Button>
                   <Button variant="outline" size="icon" className="rounded-2xl h-12 w-12 border-slate-200" onClick={() => qc.invalidateQueries({ queryKey: ["bot-orders", selectedDevice] })}><RefreshCw className="w-4 h-4" /></Button>
                </div>
             </div>

             <div className="space-y-4">
               {(orders ?? []).map((o: any) => {
                 const st = STATUS_MAP[o.status] ?? { label: o.status, color: "" };
                 return (
                   <Card key={o.id} className="rounded-[32px] border-none shadow-sm hover:ring-2 ring-primary/10 transition-all overflow-hidden bg-white group">
                     <CardContent className="p-0">
                       <div className="flex flex-col lg:flex-row lg:items-center">
                          <div className="p-6 lg:p-8 flex-1 flex flex-col md:flex-row gap-6 md:items-center">
                            <div className="w-16 h-16 rounded-[20px] bg-slate-50 flex items-center justify-center text-slate-400 font-black text-xl border-2 border-slate-100/50 group-hover:bg-primary/5 group-hover:text-primary transition-colors">#{o.id}</div>
                            <div className="space-y-2 flex-1 min-w-0">
                               <div className="flex items-center gap-2 flex-wrap">
                                  <h4 className="font-black text-slate-800 text-lg leading-none">{o.productName}</h4>
                                  {o.variantOptions && <Badge variant="secondary" className="text-[9px] px-2 font-bold bg-primary/10 text-primary border-none">{o.variantOptions}</Badge>}
                                  <Badge className={cn("text-[9px] font-black uppercase tracking-widest px-2.5 py-1 border-none rounded-lg", st.color)}>{st.label}</Badge>
                                  <Badge className={cn("text-[9px] font-black uppercase tracking-widest px-2.5 py-1 border-none rounded-lg", o.paymentStatus==='paid'?'bg-emerald-500 text-white':'bg-red-50 text-red-600')}>
                                     {o.paymentStatus === 'paid' ? 'LUNAS' : 'BELUM BAYAR'}
                                  </Badge>
                               </div>
                               <div className="flex flex-col gap-1">
                                  <p className="text-sm font-medium">Nilai Transaksi: <span className="font-black text-slate-800 text-base">{formatRp(o.totalPrice)}</span></p>
                                  <p className="text-[11px] text-muted-foreground font-medium flex items-center gap-1">
                                     {formatRp(o.productPrice)} × {o.qty} 
                                     {Number(o.shippingFee) > 0 && <span className="bg-slate-100 px-1.5 py-0.5 rounded-md font-bold text-[9px] ml-1">+ {formatRp(o.shippingFee)} (Ongkir)</span>}
                                  </p>
                               </div>
                               <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-3 border-t border-slate-50">
                                  <div className="flex items-center gap-2">
                                     <Users className="w-3.5 h-3.5 text-slate-400" />
                                     <span className="text-[11px] font-bold text-slate-700 truncate">{o.customerName}</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                     <Smartphone className="w-3.5 h-3.5 text-slate-400" />
                                     <span className="text-[11px] font-medium text-slate-500">{o.customerPhone}</span>
                                  </div>
                                  <div className="flex items-center gap-2 lg:col-span-1">
                                     <FileText className="w-3.5 h-3.5 text-slate-400" />
                                     <span className="text-[11px] text-muted-foreground truncate italic">{o.customerAddress || 'Tanpa Alamat'}</span>
                                  </div>
                               </div>
                            </div>
                          </div>
                          
                          {o.proofImageUrl && (
                             <div className="bg-emerald-50/30 p-6 lg:p-8 flex items-center gap-4 lg:w-48 lg:border-l border-emerald-100/50">
                               <div className="relative group/photo">
                                 <img src={o.proofImageUrl} className="w-14 h-14 rounded-2xl object-cover ring-2 ring-white shadow-sm" />
                                 <a href={o.proofImageUrl} target="_blank" rel="noreferrer" className="absolute inset-0 bg-emerald-600/60 opacity-0 group-hover/photo:opacity-100 flex items-center justify-center rounded-2xl transition-opacity">
                                    <QrCode className="w-6 h-6 text-white" />
                                 </a>
                               </div>
                               <p className="font-black text-[10px] text-emerald-700 leading-tight uppercase tracking-widest lg:hidden italic">Bukti Transfer Dilampirkan</p>
                             </div>
                          )}

                          <div className="p-6 lg:bg-slate-50/50 lg:p-8 lg:w-72 space-y-3 lg:border-l border-slate-100">
                             <div className="space-y-1">
                                <Label className="text-[10px] font-black uppercase tracking-tighter text-slate-400">Update Status</Label>
                                <Select value={o.status} onValueChange={(v) => updateOrderMut.mutate({ id: o.id, data: { status: v } })}>
                                  <SelectTrigger className="h-10 rounded-xl text-xs font-bold border-none shadow-sm bg-white"><SelectValue /></SelectTrigger>
                                  <SelectContent className="rounded-xl border-none shadow-xl">
                                    {Object.entries(STATUS_MAP).map(([v, { label }]) => (
                                      <SelectItem key={v} value={v} className="text-xs font-medium">{label}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                             </div>
                             <div className="space-y-1">
                                <Label className="text-[10px] font-black uppercase tracking-tighter text-slate-400">Konfirmasi Dana</Label>
                                <Select value={o.paymentStatus} onValueChange={(v) => updateOrderMut.mutate({ id: o.id, data: { paymentStatus: v } })}>
                                  <SelectTrigger className="h-10 rounded-xl text-xs font-bold border-none shadow-sm bg-white"><SelectValue /></SelectTrigger>
                                  <SelectContent className="rounded-xl border-none shadow-xl">
                                    <SelectItem value="unpaid" className="text-xs font-medium">⚠️ BELUM BAYAR</SelectItem>
                                    <SelectItem value="paid" className="text-xs font-medium">✅ LUNAS / DITERIMA</SelectItem>
                                  </SelectContent>
                                </Select>
                             </div>
                          </div>
                       </div>
                     </CardContent>
                   </Card>
                 );
               })}
             </div>
          </TabsContent>

          <TabsContent value="settings" className="space-y-6 animate-in fade-in duration-500">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-1 space-y-6">
                  <Card className="rounded-[40px] border-none shadow-sm overflow-hidden bg-white">
                    <CardHeader className="bg-slate-50/50 pb-8 pt-8">
                       <div className="w-12 h-12 bg-white rounded-2xl shadow-sm flex items-center justify-center mb-4 text-slate-600">
                          <Settings className="w-6 h-6" />
                       </div>
                      <CardTitle className="text-xl font-black text-slate-800">Bot Logic & Gating</CardTitle>
                      <CardDescription className="text-xs font-medium">Konfigurasi automasi dan pengiriman.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6 pt-8">
                      <div className="space-y-2">
                        <Label className="text-[10px] font-black uppercase opacity-50 tracking-widest text-slate-500">Nomor Owner (Alert WhatsApp)</Label>
                        <div className="relative">
                           <Smartphone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                           <Input placeholder="Contoh: 62812345..." value={settings.ownerPhone} onChange={e => setSettings({...settings, ownerPhone: e.target.value})} className="rounded-2xl h-12 pl-12 bg-slate-50/50 border-none focus:bg-white transition-all shadow-inner" />
                        </div>
                      </div>

                      <div className="space-y-4 pt-6 mt-6 border-t border-slate-100">
                        <div className="flex items-center gap-2 mb-2">
                           <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary"><Truck className="w-4 h-4" /></div>
                           <h3 className="text-xs font-black uppercase tracking-widest text-slate-700">Metode Pengiriman</h3>
                        </div>
                        
                        <div className="space-y-2">
                           <Label className="text-[10px] font-black uppercase opacity-50 tracking-widest text-slate-500">Mode Kalkulasi</Label>
                           <Select value={settings.shippingCalcType} onValueChange={v => setSettings({...settings, shippingCalcType: v})}>
                              <SelectTrigger className="h-12 rounded-2xl bg-slate-50/50 border-none shadow-inner"><SelectValue /></SelectTrigger>
                              <SelectContent className="rounded-2xl border-none shadow-xl">
                                 <SelectItem value="flat" className="font-bold">🏷️ Harga Flat (Statis)</SelectItem>
                                 <SelectItem value="rajaongkir" className="font-bold">🏢 RajaOngkir (Otomatis)</SelectItem>
                              </SelectContent>
                           </Select>
                        </div>

                        {settings.shippingCalcType === 'flat' ? (
                           <div className="space-y-2 animate-in fade-in zoom-in-95 duration-300">
                             <Label className="text-[10px] font-black uppercase opacity-50 tracking-widest text-slate-500">Nominal Ongkir Flat</Label>
                             <div className="relative">
                               <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xs font-black text-slate-400">Rp</span>
                               <Input type="number" value={settings.defaultShippingFee} onChange={e => setSettings({...settings, defaultShippingFee: e.target.value})} className="pl-12 rounded-2xl h-12 bg-slate-50/50 border-none shadow-inner" />
                             </div>
                           </div>
                        ) : (
                           <div className="space-y-4 animate-in fade-in zoom-in-95 duration-300 p-6 rounded-[32px] bg-slate-50 border border-slate-200/50">
                              <div className="space-y-2">
                                 <Label className="text-[10px] font-black uppercase opacity-50 text-slate-500 tracking-widest">RajaOngkir API Key</Label>
                                 <Input type="password" placeholder="Input API Key RajaOngkir..." value={settings.rajaongkirApiKey} onChange={e => setSettings({...settings, rajaongkirApiKey: e.target.value})} className="h-11 rounded-xl bg-white border-slate-200" />
                              </div>

                              <div className="grid grid-cols-2 gap-3">
                                 <div className="space-y-2">
                                    <Label className="text-[10px] font-black uppercase opacity-50 tracking-widest">Tipe Akun</Label>
                                    <Select value={settings.rajaongkirAccountType} onValueChange={v => setSettings({...settings, rajaongkirAccountType: v})}>
                                       <SelectTrigger className="h-11 rounded-xl bg-white border-slate-200 font-bold text-xs"><SelectValue /></SelectTrigger>
                                       <SelectContent className="rounded-xl">
                                          <SelectItem value="starter">Starter</SelectItem>
                                          <SelectItem value="basic">Basic</SelectItem>
                                          <SelectItem value="pro">Pro</SelectItem>
                                       </SelectContent>
                                    </Select>
                                 </div>
                                 <div className="space-y-2">
                                    <Label className="text-[10px] font-black uppercase opacity-50 tracking-widest">Kota Asal (Origin)</Label>
                                    <Select value={settings.rajaongkirOriginId} onValueChange={v => setSettings({...settings, rajaongkirOriginId: v})}>
                                       <SelectTrigger className="h-11 rounded-xl bg-white border-slate-200 font-bold text-xs"><SelectValue placeholder="Pilih Kota..." /></SelectTrigger>
                                       <SelectContent className="rounded-xl max-h-60 overflow-y-auto w-64 border-none shadow-xl">
                                          <div className="p-2 border-b bg-slate-50 sticky top-0 z-10">
                                            <Input placeholder="Cari kota..." className="h-8 text-[10px] rounded-lg" onChange={e => setCitySearch(e.target.value)} />
                                          </div>
                                          {filteredCities.slice(0, 100).map((c: any) => (
                                             <SelectItem key={c.city_id} value={String(c.city_id)} className="text-[10px]">{c.type} {c.city_name}</SelectItem>
                                          ))}
                                          {filteredCities.length === 0 && <p className="p-4 text-[10px] text-muted-foreground italic text-center">Masukan API Key yang benar...</p>}
                                       </SelectContent>
                                    </Select>
                                 </div>
                              </div>
                              <p className="text-[9px] text-muted-foreground italic mt-2">*Otomatis menghitung biaya kirim ke pembeli.</p>
                           </div>
                        )}

                        <div className="space-y-2 pt-4">
                          <Label className="text-[10px] font-black uppercase opacity-50 tracking-widest text-slate-500">Ket. Pengiriman (Opsional)</Label>
                          <Textarea placeholder="Contoh: Barang dikirim H+1..." value={settings.shippingInstructions} onChange={e => setSettings({...settings, shippingInstructions: e.target.value})} className="rounded-2xl text-xs bg-slate-50/50 border-none shadow-inner" rows={3} />
                        </div>
                      </div>

                      <Button className="w-full h-14 mt-8 rounded-[24px] font-black text-xs uppercase tracking-[0.2em] shadow-2xl shadow-primary/30 transition-all hover:scale-[1.02]" onClick={async () => {
                        await apiFetch('/bot-commerce/settings', { 
                          method: 'POST', 
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ deviceId: selectedDevice, ...settings }) 
                        });
                        toast({ title: "Konfigurasi Tersimpan", description: "Opsi pengiriman bot berhasil diperbarui." });
                        fetchSettings();
                      }}>Simpan Pengaturan</Button>
                    </CardContent>
                  </Card>
                </div>

                <div className="lg:col-span-2 space-y-6">
                   <Card className="rounded-[40px] border-none shadow-sm overflow-hidden bg-white">
                     <CardHeader className="bg-slate-50/50 pb-8 pt-8 flex flex-row items-center justify-between">
                       <div>
                          <div className="w-12 h-12 bg-white rounded-2xl shadow-sm flex items-center justify-center mb-4 text-emerald-600">
                             <CreditCard className="w-6 h-6" />
                          </div>
                          <CardTitle className="text-xl font-black text-slate-800">Metode Pembayaran</CardTitle>
                          <CardDescription className="text-xs font-medium">Rekening atau wallet tujuan transfer pelanggan.</CardDescription>
                       </div>
                       <Button size="sm" variant="outline" className="rounded-2xl h-12 px-6 text-xs font-black uppercase tracking-widest border-slate-200 transition-all hover:bg-slate-50" onClick={() => { setEditPm(null); setPmForm(emptyPaymentMethod()); setPmDialog(true); }}>
                         <Plus className="w-4 h-4 mr-2" /> Rekening Baru
                       </Button>
                     </CardHeader>
                     <CardContent className="pt-8 pb-8">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                           {paymentMethods.map(p => (
                             <div key={p.id} className="p-6 border-2 border-slate-100 rounded-[32px] flex items-start justify-between group hover:border-emerald-500/50 hover:bg-emerald-50/20 transition-all cursor-default relative overflow-hidden">
                               <div className="flex gap-5 items-center">
                                  <div className="bg-emerald-100/30 p-4 rounded-2xl text-emerald-600 group-hover:scale-110 transition-transform"><CreditCard className="w-8 h-8" /></div>
                                  <div className="space-y-1">
                                    <div className="font-black text-xs uppercase tracking-[0.1em] text-slate-400">{p.provider}</div>
                                    <div className="text-xl font-black text-slate-800 tracking-[0.05em]">{p.accountNumber}</div>
                                    <div className="text-[10px] text-muted-foreground font-bold italic opacity-70">A/N {p.accountName}</div>
                                  </div>
                               </div>
                               <Button variant="ghost" size="icon" className="h-10 w-10 rounded-full opacity-0 group-hover:opacity-100 transition-opacity bg-white shadow-sm" onClick={() => { setEditPm(p); setPmForm(p); setPmDialog(true); }}>
                                 <Edit2 className="w-4 h-4" />
                               </Button>
                               {!p.isActive && <div className="absolute inset-0 bg-slate-50/80 backdrop-blur-[1px] flex items-center justify-center font-black text-[10px] tracking-widest text-slate-400 uppercase">Non-Aktif</div>}
                             </div>
                           ))}
                           {paymentMethods.length === 0 && (
                             <div className="col-span-full py-20 text-center border-2 border-dashed border-slate-200 rounded-[40px] bg-slate-50/50">
                               <CreditCard className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                               <p className="text-sm font-bold text-slate-400">Belum ada metode pembayaran.</p>
                               <p className="text-[10px] text-muted-foreground mt-2 max-w-[200px] mx-auto">Tambahkan QRIS atau Rekening Bank untuk memulai menerima order.</p>
                             </div>
                           )}
                        </div>
                     </CardContent>
                   </Card>
                </div>
              </div>
          </TabsContent>

          <TabsContent value="categories" className="space-y-4 animate-in fade-in duration-500">
             <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-card p-6 rounded-[32px] shadow-sm">
               <div>
                  <CardTitle className="text-lg font-black text-slate-800">Manajemen Kategori</CardTitle>
                  <CardDescription className="text-xs font-medium">Kelompokkan produk Anda untuk navigasi bot yang lebih mudah.</CardDescription>
               </div>
               <Button onClick={()=>setCategoryDialog(true)} className="rounded-2xl h-12 px-8 font-bold gap-2 bg-purple-600 hover:bg-purple-700 shadow-lg shadow-purple-500/20"><Plus className="w-4 h-4" /> Kategori Baru</Button>
             </div>
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {(categories ?? []).map((c:any) => (
                   <Card key={c.id} className="rounded-[32px] border-none shadow-sm group hover:shadow-xl transition-all relative overflow-hidden bg-white">
                      <CardHeader className="pb-4">
                         <div className="flex items-center justify-between">
                            <div className="w-10 h-10 bg-purple-50 rounded-xl flex items-center justify-center text-purple-500 group-hover:bg-purple-500 group-hover:text-white transition-colors duration-500"><Tag className="w-5 h-5" /></div>
                            <Badge variant="outline" className="text-[9px] font-black bg-slate-50 border-slate-200">ID: {c.id}</Badge>
                         </div>
                         <CardTitle className="text-base font-black text-slate-800 mt-4 leading-none">{c.name}</CardTitle>
                         <CardDescription className="text-[10px] font-medium line-clamp-2 mt-1 leading-relaxed">{c.description || 'Barang kategori ini siap ditayangkan.'}</CardDescription>
                      </CardHeader>
                      <CardContent className="pt-0 flex justify-end">
                         <Button size="icon" variant="ghost" className="h-8 w-8 rounded-xl text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors" onClick={async ()=>{if(confirm("Hapus kategori ini?")) { await apiFetch(`/bot-categories/${c.id}`, {method:'DELETE'}); qc.invalidateQueries({queryKey:['bot-categories', selectedDevice]}); toast({title:"Kategori Dihapus"}); }} }><Trash2 className="w-4 h-4" /></Button>
                      </CardContent>
                   </Card>
                ))}
                {(categories ?? []).length === 0 && (
                   <div className="col-span-full py-20 text-center border-2 border-dashed border-slate-200 rounded-[40px] bg-slate-50/50">
                     <Layers className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                     <p className="text-sm font-bold text-slate-400">Belum ada kategori.</p>
                     <p className="text-[10px] text-muted-foreground mt-2 max-w-[200px] mx-auto">Klik tombol Kategori Baru untuk memulai pengelompokan.</p>
                   </div>
                )}
             </div>
          </TabsContent>
          </>)}
        </Tabs>
      )}
      </div>

      {/* Payment Method Dialog */}
      <Dialog open={pmDialog} onOpenChange={setPmDialog}>
        <DialogContent className="sm:max-w-[480px] rounded-[40px] p-10 border-none shadow-2xl">
          <DialogHeader className="mb-6">
            <DialogTitle className="text-2xl font-black text-slate-800">{editPm ? "Perbarui Rekening" : "Tambah Rekening Baru"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-6 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Provider / Bank</Label>
                <Input placeholder="BCA / DANA / QRIS" value={pmForm.provider} onChange={e => setPmForm({...pmForm, provider: e.target.value.toUpperCase()})} className="h-12 rounded-2xl bg-slate-50/50 border-none shadow-inner font-bold" />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Nomor Rekening</Label>
                <Input placeholder="089xxxx / 123xxx" value={pmForm.accountNumber} onChange={e => setPmForm({...pmForm, accountNumber: e.target.value})} className="h-12 rounded-2xl bg-slate-50/50 border-none shadow-inner font-black" />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Atas Nama Pemilik</Label>
              <Input placeholder="Sesuai buku tabungan / e-wallet..." value={pmForm.accountName} onChange={e => setPmForm({...pmForm, accountName: e.target.value})} className="h-12 rounded-2xl bg-slate-50/50 border-none shadow-inner font-bold" />
            </div>
            <div className="space-y-2">
               <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Instruksi Pembayaran (Opsional)</Label>
               <Input placeholder="Kirim screenshot bukti transfer..." value={pmForm.instructions} onChange={e => setPmForm({...pmForm, instructions: e.target.value})} className="h-12 rounded-2xl bg-slate-50/50 border-none shadow-inner" />
            </div>
            <div className="flex items-center justify-between p-4 bg-emerald-50/50 rounded-2xl border border-emerald-100">
              <div className="space-y-0.5"><Label htmlFor="is_active_pm" className="text-xs font-bold text-emerald-800">Aktifkan Metode</Label><p className="text-[9px] text-emerald-600/70 font-medium italic leading-none">Munculkan di bot saat pilih pembayaran.</p></div>
              <Switch checked={pmForm.isActive} onCheckedChange={v => setPmForm({...pmForm, isActive: v})} id="is_active_pm" />
            </div>
          </div>
          <DialogFooter className="gap-2 pt-8 border-t border-slate-100 flex-col md:flex-row">
            {editPm && (
              <Button variant="ghost" className="rounded-2xl text-red-500 hover:text-red-600 hover:bg-red-50 font-bold" onClick={async () => {
                if(!confirm("Hapus metode pembayaran ini?")) return;
                await apiFetch(`/bot-commerce/payment-methods/${editPm.id}`, { method: 'DELETE' });
                fetchSettings(); setPmDialog(false);
                toast({ title: "Metode Dihapus" });
              }}><Trash2 className="w-4 h-4 mr-2" /> Hapus</Button>
            )}
            <Button className="rounded-[24px] px-10 h-14 font-black text-xs uppercase tracking-[0.2em] shadow-lg shadow-emerald-500/20 bg-emerald-600 hover:bg-emerald-700 transition-all flex-1" onClick={async () => {
               if(!pmForm.provider || !pmForm.accountNumber) { toast({title: "Data tidak lengkap", variant:'destructive'}); return; }
               await apiFetch('/bot-commerce/payment-methods', { 
                 method: 'POST', 
                 headers: { 'Content-Type': 'application/json' },
                 body: JSON.stringify({ ...pmForm, deviceId: selectedDevice }) 
               });
               fetchSettings(); setPmDialog(false);
               toast({ title: "Berhasil!", description: "Metode pembayaran telah disimpan." });
            }}>Simpan Rekening</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── PRODUCT DIALOG ── */}
      <Dialog open={productDialog} onOpenChange={(v) => !v && setProductDialog(false)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto rounded-[48px] p-10 border-none shadow-2xl">
          <DialogHeader className="mb-8">
             <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center text-primary mb-4">
                <Package className="w-8 h-8" />
             </div>
             <DialogTitle className="text-3xl font-black text-slate-800 leading-tight">{editProduct ? "Perbarui Katalog" : "Tambah Produk Baru"}</DialogTitle>
             <p className="text-muted-foreground text-xs font-medium">Lengkapi detail produk untuk ditampilkan di menu WhatsApp bot Anda.</p>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
            <div className="space-y-6">
               <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Kategori Produk</Label>
                  <Select value={form.categoryId} onValueChange={v=>setForm({...form, categoryId: v})}>
                     <SelectTrigger className="h-12 bg-slate-50/50 border-none rounded-2xl shadow-inner font-bold"><SelectValue placeholder="Tanpa Kategori" /></SelectTrigger>
                     <SelectContent className="rounded-2xl border-none shadow-xl">
                        <SelectItem value="_default" className="font-medium">🏷️ Tanpa Kategori</SelectItem>
                        {(categories ?? []).map((c:any)=>(<SelectItem key={c.id} value={String(c.id)} className="font-medium">{c.name}</SelectItem>))}
                     </SelectContent>
                  </Select>
               </div>
               <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Informasi Katalog</Label>
                  <Input placeholder="Nama Produk..." value={form.name} onChange={e=>setForm({...form, name: e.target.value})} className="h-12 rounded-2xl bg-slate-50/50 border-none shadow-inner font-bold" />
                  <Input placeholder="KODE PRODUK (KAOS-01)..." value={form.code} onChange={e=>setForm({...form, code: e.target.value.toUpperCase()})} className="h-12 rounded-2xl bg-slate-50/50 border-none shadow-inner font-black tracking-widest" />
               </div>
               <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Harga & Persediaan</Label>
                  <div className="flex gap-4">
                     <div className="relative flex-1">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xs font-black text-slate-400">Rp</span>
                        <Input type="number" placeholder="Harga" value={form.price} onChange={e=>setForm({...form, price: e.target.value})} className="pl-12 h-12 rounded-2xl bg-slate-50/50 border-none shadow-inner font-black" />
                     </div>
                     <Input type="number" placeholder="Stok" value={form.stock} onChange={e=>setForm({...form, stock: e.target.value})} className="h-12 rounded-2xl bg-slate-50/50 border-none shadow-inner w-32 font-bold" />
                  </div>
                  <div className="flex items-center justify-between px-2 pt-1">
                     <Label className="text-[10px] font-bold text-muted-foreground italic">Alert stok menipis pada sisa:</Label>
                     <Input type="number" value={form.minStock} onChange={e=>setForm({...form, minStock: e.target.value})} className="h-9 w-20 rounded-xl text-center font-bold border-slate-200" />
                  </div>
               </div>
            </div>
            
            <div className="space-y-6">
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Foto & Deskripsi</Label>
                  <Input placeholder="URL Gambar (https://...)" value={form.imageUrl} onChange={e=>setForm({...form, imageUrl: e.target.value})} className="h-12 rounded-2xl bg-slate-50/50 border-none shadow-inner font-medium text-xs" />
                  <Textarea placeholder="Detail deskripsi produk..." value={form.description} onChange={e=>setForm({...form, description: e.target.value})} className="rounded-2xl bg-slate-50/50 border-none shadow-inner font-medium text-xs" rows={4} />
                </div>
                
                <div className="space-y-3">
                   <div className="flex items-center justify-between"><Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Varian Produk (Opsional)</Label><Button size="sm" variant="ghost" className="h-6 text-[9px] font-black uppercase tracking-wider text-primary" onClick={()=>setForm({...form, variants:[...form.variants, {name:'', options:''}]})}><Plus className="w-3 h-3 mr-1" /> Varian</Button></div>
                   <div className="space-y-2 max-h-40 overflow-y-auto pr-2 custom-scrollbar">
                      {form.variants.map((v, i) => (
                         <div key={i} className="flex gap-2 p-3 bg-slate-50 rounded-2xl border border-dotted border-slate-300 relative group/var">
                            <Input placeholder="Cth: Warna" value={v.name} onChange={e=>{const next=[...form.variants]; next[i].name=e.target.value; setForm({...form, variants:next})}} className="h-8 text-[10px] rounded-lg bg-white w-24 border-slate-200" />
                            <Input placeholder="Merah, Biru, Hijau..." value={v.options} onChange={e=>{const next=[...form.variants]; next[i].options=e.target.value; setForm({...form, variants:next})}} className="h-8 text-[10px] rounded-lg bg-white flex-1 border-slate-200" />
                            <Button variant="ghost" size="icon" className="h-6 w-6 text-red-500 hover:bg-red-50 rounded-lg absolute -right-2 -top-2 opacity-0 group-hover/var:opacity-100 transition-opacity bg-white shadow-sm border" onClick={()=>{const next=form.variants.filter((_,j)=>j!==i); setForm({...form, variants:next})}}><XCircle className="w-4 h-4" /></Button>
                         </div>
                      ))}
                      {form.variants.length === 0 && <p className="text-[9px] text-muted-foreground italic text-center py-6 bg-slate-50/50 rounded-2xl border border-dashed border-slate-100">Opsional: Tambahkan varian seperti warna atau ukuran.</p>}
                   </div>
                </div>
                <div className="flex items-center justify-between p-4 bg-emerald-50 rounded-2xl border border-emerald-100/50">
                   <div className="space-y-0.5"><Label className="text-xs font-black text-emerald-800 uppercase tracking-tighter">Status Katalog</Label><p className="text-[9px] text-emerald-600/70 font-bold">Aktifkan untuk menampilkan belanja.</p></div>
                   <Switch checked={form.isActive} onCheckedChange={v=>setForm({...form, isActive: v})} />
                </div>
            </div>
          </div>
          <DialogFooter className="mt-10 pt-8 border-t border-slate-100 flex flex-col md:flex-row gap-4">
            <Button variant="ghost" className="rounded-2xl px-10 h-14 font-bold text-slate-400 hover:text-slate-600" onClick={() => setProductDialog(false)}>Batalkan</Button>
            <Button onClick={handleSave} disabled={saveMut.isPending} className="rounded-[24px] px-14 h-14 font-black text-xs uppercase tracking-[0.2em] shadow-2xl shadow-primary/25 transition-all hover:scale-[1.02] flex-1">
              {saveMut.isPending && <Loader2 className="w-4 h-4 animate-spin mr-3" />}
              {editProduct ? "Simpan Perubahan" : "Tayangkan Ke Bot"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── CATEGORY DIALOG ── */}
      <Dialog open={categoryDialog} onOpenChange={setCategoryDialog}>
         <DialogContent className="max-w-xs rounded-[40px] p-8 border-none shadow-2xl">
            <DialogHeader className="mb-4">
               <div className="w-12 h-12 bg-purple-50 rounded-2xl flex items-center justify-center text-purple-600 mb-2">
                  <Layers className="w-6 h-6" />
               </div>
               <DialogTitle className="text-xl font-black text-slate-800">Kategori Baru</DialogTitle>
            </DialogHeader>
            <div className="space-y-5 py-2">
               <div className="space-y-2"><Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Nama Kategori</Label><Input placeholder="Contoh: Makanan, Fashion..." value={catForm.name} onChange={e=>setCatForm({...catForm, name:e.target.value})} className="rounded-2xl h-12 bg-slate-50/50 border-none shadow-inner font-bold" /></div>
               <div className="space-y-2"><Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Deskripsi</Label><Textarea placeholder="..." value={catForm.description} onChange={e=>setCatForm({...catForm, description:e.target.value})} className="rounded-2xl bg-slate-50/50 border-none shadow-inner" rows={3} /></div>
            </div>
            <DialogFooter className="pt-6 mt-4 border-t border-slate-100"><Button onClick={()=>catMut.mutate(catForm)} disabled={catMut.isPending} className="w-full rounded-[20px] h-12 font-black uppercase tracking-widest text-[10px] bg-purple-600 hover:bg-purple-700 shadow-lg shadow-purple-500/20 transition-all">{catMut.isPending ? 'Memproses...' : 'Simpan Kategori'}</Button></DialogFooter>
         </DialogContent>
      </Dialog>

    </>
  );
}

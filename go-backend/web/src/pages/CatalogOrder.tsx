import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Pencil, X, RefreshCw, ShoppingBag, Package, Search, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dropdown } from "@/components/ui/dropdown";
import { PageTabs } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useLang, timeAgo } from "@/lib/i18n";
import { apiGet, apiPost, apiPut, apiDelete, apiPatch } from "@/lib/api";
import { toast } from "sonner";

interface BotProduct {
  id: number;
  userId: number;
  name: string;
  description: string;
  price: number;
  stock: number;
  category: string;
  imageUrl: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface BotOrderItem {
  id: number;
  orderId: number;
  productId: number;
  productName: string;
  price: number;
  quantity: number;
  subtotal: number;
}

interface BotOrder {
  id: number;
  userId: number;
  orderNumber: string;
  productId: number;
  buyerPhone: string;
  buyerName: string;
  quantity: number;
  total: number;
  status: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
  items?: BotOrderItem[];
}

const STATUS_ORDER = ["pending", "confirmed", "shipped", "completed", "cancelled"] as const;

const NEXT_STATUS: Record<string, string[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["shipped", "cancelled"],
  shipped: ["completed"],
  completed: [],
  cancelled: [],
};

function fmtIDR(n: number) {
  return "Rp" + new Intl.NumberFormat("id-ID").format(n);
}

function statusBadgeClass(status: string) {
  switch (status) {
    case "pending":
      return "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300";
    case "confirmed":
      return "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300";
    case "shipped":
      return "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300";
    case "completed":
      return "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300";
    case "cancelled":
      return "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  const { t } = useLang();
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className={cn(
          "relative bg-card text-card-foreground border border-border rounded-xl w-full max-h-[90vh] overflow-y-auto shadow-xl",
          wide ? "max-w-2xl" : "max-w-lg"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-border sticky top-0 bg-card rounded-t-xl z-10">
          <h3 className="font-semibold">{title}</h3>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose} aria-label={t("catalogOrder.close")}>
            <X className="w-4 h-4" />
          </Button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={label}
      onClick={onChange}
      className={cn(
        "relative h-5 w-9 shrink-0 rounded-full transition-colors",
        checked ? "bg-[#243370]" : "bg-muted"
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all",
          checked ? "left-[18px]" : "left-0.5"
        )}
      />
    </button>
  );
}

const emptyProductForm = {
  name: "",
  description: "",
  price: "",
  stock: "",
  category: "",
  imageUrl: "",
  isActive: true,
};

export default function CatalogOrder() {
  const { t, lang } = useLang();
  const [tab, setTab] = useState<"catalog" | "orders">("catalog");

  /* ── Katalog ── */
  const [products, setProducts] = useState<BotProduct[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<BotProduct | null>(null);
  const [form, setForm] = useState(emptyProductForm);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<BotProduct | null>(null);

  /* ── Pesanan ── */
  const [orders, setOrders] = useState<BotOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [orderSearch, setOrderSearch] = useState("");
  const [stats, setStats] = useState<Record<string, number>>({});
  const [detail, setDetail] = useState<BotOrder | null>(null);
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  const loadProducts = () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (search.trim()) params.set("search", search.trim());
    if (categoryFilter) params.set("category", categoryFilter);
    const q = params.toString();
    apiGet<{ products: BotProduct[]; categories: string[] }>(`/bot-products${q ? `?${q}` : ""}`)
      .then((r) => {
        setProducts(r.products || []);
        setCategories(r.categories || []);
      })
      .catch((e) => setError(e.message || t("catalogOrder.loadError")))
      .finally(() => setLoading(false));
  };

  const loadOrders = () => {
    setOrdersLoading(true);
    setOrdersError(null);
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    if (orderSearch.trim()) params.set("search", orderSearch.trim());
    const q = params.toString();
    Promise.all([
      apiGet<{ orders: BotOrder[] }>(`/bot-orders${q ? `?${q}` : ""}`),
      apiGet<{ byStatus: Record<string, number>; total: number }>("/bot-orders/stats/summary"),
    ])
      .then(([o, s]) => {
        setOrders(o.orders || []);
        setStats(s.byStatus || {});
      })
      .catch((e) => setOrdersError(e.message || t("catalogOrder.loadError")))
      .finally(() => setOrdersLoading(false));
  };

  useEffect(loadProducts, [search, categoryFilter]);
  useEffect(loadOrders, [statusFilter, orderSearch]);

  const visibleProducts = useMemo(() => products, [products]);

  /* ── CRUD produk ── */

  const openAdd = () => {
    setEditing(null);
    setForm(emptyProductForm);
    setShowForm(true);
  };

  const openEdit = (p: BotProduct) => {
    setEditing(p);
    setForm({
      name: p.name,
      description: p.description || "",
      price: String(p.price),
      stock: String(p.stock),
      category: p.category || "",
      imageUrl: p.imageUrl || "",
      isActive: p.isActive,
    });
    setShowForm(true);
  };

  const saveProduct = async () => {
    const price = Math.floor(Number(form.price));
    const stock = Math.floor(Number(form.stock));
    if (!form.name.trim() || Number.isNaN(price) || price < 0 || Number.isNaN(stock) || stock < 0) {
      toast.error(t("catalogOrder.productValidationError"));
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description,
        price,
        stock,
        category: form.category.trim(),
        imageUrl: form.imageUrl.trim(),
        isActive: form.isActive,
      };
      if (editing) {
        const res = await apiPut<{ product: BotProduct }>(`/bot-products/${editing.id}`, payload);
        setProducts((prev) => prev.map((p) => (p.id === editing.id ? res.product : p)));
        toast.success(t("catalogOrder.productUpdated"));
      } else {
        const res = await apiPost<{ product: BotProduct }>("/bot-products", payload);
        setProducts((prev) => [res.product, ...prev]);
        toast.success(t("catalogOrder.productAdded"));
      }
      setShowForm(false);
      loadProducts();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("catalogOrder.saveError"));
    } finally {
      setSaving(false);
    }
  };

  const toggleProduct = async (p: BotProduct) => {
    const next = !p.isActive;
    setProducts((prev) => prev.map((x) => (x.id === p.id ? { ...x, isActive: next } : x)));
    try {
      const res = await apiPatch<{ isActive: boolean }>(`/bot-products/${p.id}/toggle`, {});
      setProducts((prev) => prev.map((x) => (x.id === p.id ? { ...x, isActive: res.isActive } : x)));
      toast.success(res.isActive ? t("catalogOrder.productEnabled") : t("catalogOrder.productDisabled"));
    } catch (e) {
      setProducts((prev) => prev.map((x) => (x.id === p.id ? { ...x, isActive: p.isActive } : x)));
      toast.error(e instanceof Error ? e.message : t("catalogOrder.toggleError"));
    }
  };

  const confirmDeleteProduct = async () => {
    if (!deleting) return;
    try {
      await apiDelete(`/bot-products/${deleting.id}`);
      setProducts((prev) => prev.filter((p) => p.id !== deleting.id));
      toast.success(t("catalogOrder.productDeleted"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("catalogOrder.deleteError"));
    } finally {
      setDeleting(null);
    }
  };

  /* ── Pesanan ── */

  const changeStatus = async (order: BotOrder, next: string) => {
    setUpdatingId(order.id);
    try {
      const res = await apiPatch<{ order: BotOrder }>(`/bot-orders/${order.id}/status`, { status: next });
      setOrders((prev) => prev.map((o) => (o.id === order.id ? res.order : o)));
      if (detail?.id === order.id) setDetail(res.order);
      toast.success(t("catalogOrder.orderStatusUpdated"));
      loadOrders();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("catalogOrder.statusError"));
    } finally {
      setUpdatingId(null);
    }
  };

  const statusLabel = (s: string) => t("catalogOrder.status." + s);

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">{t("catalogOrder.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("catalogOrder.subtitle")}</p>
        </div>
        {tab === "catalog" && (
          <Button onClick={openAdd}>
            <Plus className="w-4 h-4 mr-1.5" />
            {t("catalogOrder.addProduct")}
          </Button>
        )}
      </div>

      <div className="rounded-lg border border-border px-4 py-3 flex items-start gap-1.5 text-[11px] text-muted-foreground">
        <Info className="w-3.5 h-3.5 mt-px shrink-0" />
        <span>{t("catalogOrder.usageHint")}</span>
      </div>

      <PageTabs
        tabs={[
          { id: "catalog", label: t("catalogOrder.catalogTab"), href: "#" },
          { id: "orders", label: t("catalogOrder.ordersTab"), href: "#" },
        ]}
        active={tab}
        onSelect={(tab) => setTab(tab.id as "catalog" | "orders")}
      />

      {tab === "catalog" ? (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder={t("catalogOrder.searchProduct")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Dropdown
              value={categoryFilter}
              onChange={setCategoryFilter}
              options={[
                { value: "", label: t("catalogOrder.allCategories") },
                ...categories.map((c) => ({ value: c, label: c })),
              ]}
              aria-label={t("catalogOrder.category")}
              className="w-44"
            />
            <Button variant="outline" size="icon" onClick={loadProducts} aria-label={t("catalogOrder.retry")}>
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>

          {loading ? (
            <p className="text-sm text-muted-foreground">{t("catalogOrder.loading")}</p>
          ) : error ? (
            <p className="text-sm text-red-500">{error}</p>
          ) : visibleProducts.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center">
                <Package className="w-8 h-8 mx-auto text-muted-foreground" />
                <p className="mt-2 font-medium">{t("catalogOrder.emptyProducts")}</p>
                <p className="text-sm text-muted-foreground">{t("catalogOrder.emptyProductsHint")}</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {visibleProducts.map((p) => (
                <Card key={p.id}>
                  <CardContent className="p-4 space-y-2">
                    <div className="flex gap-3">
                      {p.imageUrl ? (
                        <img src={p.imageUrl} alt={p.name} className="w-16 h-16 rounded-lg object-cover border border-border shrink-0" />
                      ) : (
                        <div className="w-16 h-16 rounded-lg bg-muted flex items-center justify-center shrink-0">
                          <ShoppingBag className="w-6 h-6 text-muted-foreground" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="font-medium truncate">{p.name}</p>
                        <p className="text-sm font-semibold">{fmtIDR(p.price)}</p>
                        <p className="text-xs text-muted-foreground">
                          {t("catalogOrder.stock")}: {p.stock}
                          {p.category ? ` • ${p.category}` : ""}
                        </p>
                      </div>
                    </div>
                    {p.description && <p className="text-xs text-muted-foreground line-clamp-2">{p.description}</p>}
                    <div className="flex items-center justify-between pt-1">
                      <span className="flex items-center gap-2">
                        <Switch checked={p.isActive} onChange={() => toggleProduct(p)} label={t("catalogOrder.toggleActiveLabel")} />
                        <span className="text-xs text-muted-foreground">
                          {p.isActive ? t("catalogOrder.active") : t("catalogOrder.inactive")}
                        </span>
                      </span>
                      <span className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(p)} aria-label={t("catalogOrder.edit")}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => setDeleting(p)} aria-label={t("catalogOrder.delete")}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {(["", ...STATUS_ORDER] as string[]).map((s) => (
              <button
                key={s || "all"}
                type="button"
                onClick={() => setStatusFilter(s)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium",
                  statusFilter === s
                    ? "bg-[#243370] text-white border-[#243370]"
                    : "border-border text-muted-foreground hover:text-foreground"
                )}
              >
                {s === "" ? t("catalogOrder.allStatuses") : statusLabel(s)}
                {s !== "" && stats[s] != null ? ` (${stats[s]})` : ""}
              </button>
            ))}
            <div className="relative flex-1 min-w-[180px]">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder={t("catalogOrder.searchOrder")}
                value={orderSearch}
                onChange={(e) => setOrderSearch(e.target.value)}
              />
            </div>
          </div>

          {ordersLoading ? (
            <p className="text-sm text-muted-foreground">{t("catalogOrder.loading")}</p>
          ) : ordersError ? (
            <p className="text-sm text-red-500">{ordersError}</p>
          ) : orders.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center">
                <ShoppingBag className="w-8 h-8 mx-auto text-muted-foreground" />
                <p className="mt-2 font-medium">{t("catalogOrder.emptyOrders")}</p>
                <p className="text-sm text-muted-foreground">{t("catalogOrder.emptyOrdersHint")}</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {orders.map((o) => (
                <Card key={o.id}>
                  <CardContent className="p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <button type="button" className="text-left min-w-0" onClick={() => setDetail(o)}>
                        <p className="font-mono text-sm font-semibold">{o.orderNumber}</p>
                        <p className="text-xs text-muted-foreground">
                          {o.buyerName ? `${o.buyerName} • ` : ""}
                          {o.buyerPhone} • {timeAgo(o.createdAt, lang)}
                        </p>
                      </button>
                      <Badge className={statusBadgeClass(o.status)}>{statusLabel(o.status)}</Badge>
                    </div>
                    <div className="mt-2 text-sm space-y-0.5">
                      {(o.items || []).map((it) => (
                        <p key={it.id} className="flex justify-between gap-2">
                          <span className="truncate">
                            {it.productName} × {it.quantity}
                          </span>
                          <span className="shrink-0">{fmtIDR(it.subtotal)}</span>
                        </p>
                      ))}
                      {(!o.items || o.items.length === 0) && (
                        <p className="text-muted-foreground">
                          {t("catalogOrder.itemsCount").replace("{count}", String(o.quantity))} — {fmtIDR(o.total)}
                        </p>
                      )}
                    </div>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                      <p className="font-semibold">{t("catalogOrder.total")}: {fmtIDR(o.total)}</p>
                      {NEXT_STATUS[o.status]?.length > 0 && (
                        <Dropdown
                          value=""
                          onChange={(v) => v && changeStatus(o, v)}
                          options={[
                            { value: "", label: t("catalogOrder.changeStatus") },
                            ...NEXT_STATUS[o.status].map((s) => ({ value: s, label: statusLabel(s) })),
                          ]}
                          aria-label={t("catalogOrder.changeStatus")}
                          className="w-44"
                          disabled={updatingId === o.id}
                        />
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {showForm && (
        <Modal title={editing ? t("catalogOrder.editProduct") : t("catalogOrder.addProduct")} onClose={() => setShowForm(false)}>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">{t("catalogOrder.productName")}</label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={t("catalogOrder.productNamePlaceholder")} />
            </div>
            <div>
              <label className="text-sm font-medium">{t("catalogOrder.description")}</label>
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">{t("catalogOrder.price")}</label>
                <Input type="number" min={0} value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="15000" />
              </div>
              <div>
                <label className="text-sm font-medium">{t("catalogOrder.stock")}</label>
                <Input type="number" min={0} value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} placeholder="10" />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">{t("catalogOrder.category")}</label>
              <Input
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                placeholder={t("catalogOrder.categoryPlaceholder")}
                list="catalog-categories"
              />
              <datalist id="catalog-categories">
                {categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
            <div>
              <label className="text-sm font-medium">{t("catalogOrder.imageUrl")}</label>
              <Input value={form.imageUrl} onChange={(e) => setForm({ ...form, imageUrl: e.target.value })} placeholder="https://…" />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={form.isActive} onChange={() => setForm({ ...form, isActive: !form.isActive })} label={t("catalogOrder.toggleActiveLabel")} />
              {form.isActive ? t("catalogOrder.active") : t("catalogOrder.inactive")}
            </label>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setShowForm(false)}>
                {t("catalogOrder.cancel")}
              </Button>
              <Button onClick={saveProduct} disabled={saving}>
                {saving ? t("catalogOrder.saving") : t("catalogOrder.save")}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {deleting && (
        <Modal title={t("catalogOrder.deleteProductTitle")} onClose={() => setDeleting(null)}>
          <p className="text-sm">{t("catalogOrder.deleteProductConfirm").replace("{name}", deleting.name)}</p>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setDeleting(null)}>
              {t("catalogOrder.cancel")}
            </Button>
            <Button variant="destructive" onClick={confirmDeleteProduct}>
              {t("catalogOrder.delete")}
            </Button>
          </div>
        </Modal>
      )}

      {detail && (
        <Modal title={detail.orderNumber} onClose={() => setDetail(null)} wide>
          <div className="space-y-3 text-sm">
            <div className="flex flex-wrap gap-2 items-center">
              <Badge className={statusBadgeClass(detail.status)}>{statusLabel(detail.status)}</Badge>
              <span className="text-muted-foreground">{timeAgo(detail.createdAt, lang)}</span>
            </div>
            <p>
              <span className="text-muted-foreground">{t("catalogOrder.buyer")}: </span>
              {detail.buyerName ? `${detail.buyerName} • ` : ""}
              {detail.buyerPhone}
            </p>
            {detail.notes && (
              <p>
                <span className="text-muted-foreground">{t("catalogOrder.notes")}: </span>
                {detail.notes}
              </p>
            )}
            <div className="border-t border-border pt-2 space-y-1">
              {(detail.items || []).map((it) => (
                <p key={it.id} className="flex justify-between gap-2">
                  <span>
                    {it.productName} × {it.quantity} <span className="text-muted-foreground">({fmtIDR(it.price)})</span>
                  </span>
                  <span>{fmtIDR(it.subtotal)}</span>
                </p>
              ))}
              <p className="flex justify-between font-semibold pt-1">
                <span>{t("catalogOrder.total")}</span>
                <span>{fmtIDR(detail.total)}</span>
              </p>
            </div>
            {NEXT_STATUS[detail.status]?.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {NEXT_STATUS[detail.status].map((s) => (
                  <Button key={s} size="sm" variant={s === "cancelled" ? "destructive" : "default"} disabled={updatingId === detail.id} onClick={() => changeStatus(detail, s)}>
                    {statusLabel(s)}
                  </Button>
                ))}
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}

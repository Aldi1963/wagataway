import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Bell, Plus, Trash2, Loader2, Search, Filter,
  Megaphone, Clock, Wifi, Info, CheckCircle2, AlertTriangle,
  XCircle, Eye, EyeOff, Users, ChevronDown, X, Send, ExternalLink, Globe,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import { id as localeId } from "date-fns/locale";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

interface AdminNotif {
  id: number;
  userId: number;
  userName: string | null;
  userEmail: string | null;
  type: string;
  title: string;
  message: string;
  link: string | null;
  isRead: boolean;
  createdAt: string;
}

interface NotifListResp {
  notifications: AdminNotif[];
  total: number;
  unread: number;
}

interface AdminUser { id: number; name: string; email: string; }

// ── Config ────────────────────────────────────────────────────────────────────

const TYPE_OPTIONS = [
  { value: "system",             label: "Pengumuman Sistem",  icon: Megaphone,      color: "text-purple-600", bg: "bg-purple-100 dark:bg-purple-900/30" },
  { value: "info",               label: "Informasi",          icon: Info,           color: "text-blue-500",   bg: "bg-blue-100 dark:bg-blue-900/30" },
  { value: "warning",            label: "Peringatan",         icon: AlertTriangle,  color: "text-amber-600",  bg: "bg-amber-100 dark:bg-amber-900/30" },
  { value: "success",            label: "Sukses",             icon: CheckCircle2,   color: "text-green-600",  bg: "bg-green-100 dark:bg-green-900/30" },
  { value: "error",              label: "Error",              icon: XCircle,        color: "text-red-500",    bg: "bg-red-100 dark:bg-red-900/30" },
  { value: "trial_expiry",       label: "Trial Berakhir",     icon: Clock,          color: "text-amber-600",  bg: "bg-amber-100 dark:bg-amber-900/30" },
  { value: "device_disconnected",label: "Perangkat Terputus", icon: Wifi,           color: "text-red-500",    bg: "bg-red-100 dark:bg-red-900/30" },
];

function getTypeCfg(type: string) {
  return TYPE_OPTIONS.find((t) => t.value === type) ?? TYPE_OPTIONS[1];
}

function isExternalUrl(url: string): boolean {
  return url.startsWith("http://") || url.startsWith("https://");
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AdminNotifications() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selected, setSelected] = useState<number[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [editItem, setEditItem] = useState<AdminNotif | null>(null);
  const [deleteIds, setDeleteIds] = useState<number[] | null>(null);

  const params = new URLSearchParams({ limit: "100" });
  if (search) params.set("search", search);
  if (typeFilter !== "all") params.set("type", typeFilter);
  if (statusFilter !== "all") params.set("status", statusFilter);

  const { data, isLoading } = useQuery<NotifListResp>({
    queryKey: ["admin-notifications", search, typeFilter, statusFilter],
    queryFn: () => apiFetch(`/admin/notifications?${params}`).then((r) => r.json()),
  });

  const notifications = data?.notifications ?? [];
  const total = data?.total ?? 0;
  const unread = data?.unread ?? 0;

  const toggleRead = useMutation({
    mutationFn: ({ id, isRead }: { id: number; isRead: boolean }) =>
      apiFetch(`/admin/notifications/${id}`, { method: "PUT", body: JSON.stringify({ isRead }) }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-notifications"] }),
    onError: () => toast({ title: "Gagal mengubah status", variant: "destructive" }),
  });

  const deleteNotifs = useMutation({
    mutationFn: (ids: number[]) =>
      apiFetch("/admin/notifications", { method: "DELETE", body: JSON.stringify({ ids }) }).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-notifications"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
      toast({ title: "Notifikasi dihapus" });
      setDeleteIds(null);
      setSelected([]);
    },
    onError: () => toast({ title: "Gagal menghapus", variant: "destructive" }),
  });

  function toggleSelect(id: number) {
    setSelected((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]);
  }

  function toggleSelectAll() {
    setSelected((s) => s.length === notifications.length ? [] : notifications.map((n) => n.id));
  }

  const allSelected = notifications.length > 0 && selected.length === notifications.length;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex gap-2 flex-wrap">
          {selected.length > 0 && (
            <Button
              variant="destructive"
              onClick={() => setDeleteIds(selected)}
              className="gap-2 h-9 text-sm"
            >
              <Trash2 className="w-4 h-4" /> Hapus {selected.length} terpilih
            </Button>
          )}
          <Button onClick={() => setShowCreate(true)} className="gap-2 h-9 text-sm">
            <Plus className="w-4 h-4" /> Buat Notifikasi
          </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        {[
          { label: "Total",  value: total,          icon: Bell,        color: "text-primary",     bg: "bg-primary/10" },
          { label: "Belum Dibaca", value: unread,   icon: EyeOff,      color: "text-amber-600",   bg: "bg-amber-100 dark:bg-amber-900/30" },
          { label: "Sudah Dibaca", value: total - unread, icon: Eye,   color: "text-green-600",   bg: "bg-green-100 dark:bg-green-900/30" },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="p-3 sm:p-4">
              <div className={`w-7 h-7 rounded-lg ${s.bg} flex items-center justify-center mb-2`}>
                <s.icon className={`w-4 h-4 ${s.color}`} />
              </div>
              <p className="text-xl sm:text-2xl font-bold leading-none">{s.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-3 sm:p-4">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                placeholder="Cari judul, pesan, atau pengguna…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-9 text-sm"
              />
              {search && (
                <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="h-9 text-sm w-full sm:w-44">
                <div className="flex items-center gap-2">
                  <Filter className="w-3.5 h-3.5 text-muted-foreground" />
                  <SelectValue />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Tipe</SelectItem>
                {TYPE_OPTIONS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-9 text-sm w-full sm:w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Status</SelectItem>
                <SelectItem value="unread">Belum Dibaca</SelectItem>
                <SelectItem value="read">Sudah Dibaca</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* List */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">Daftar Notifikasi</CardTitle>
            {notifications.length > 0 && (
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={toggleSelectAll}
                  aria-label="Pilih semua"
                />
                <span className="text-xs text-muted-foreground">
                  {selected.length > 0 ? `${selected.length} dipilih` : "Pilih semua"}
                </span>
              </div>
            )}
          </div>
          {(search || typeFilter !== "all" || statusFilter !== "all") && (
            <CardDescription className="text-xs">
              Menampilkan {notifications.length} hasil
            </CardDescription>
          )}
        </CardHeader>

        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
            </div>
          ) : notifications.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Bell className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">Tidak ada notifikasi ditemukan</p>
            </div>
          ) : (
            <div className="divide-y">
              {notifications.map((n) => {
                const cfg = getTypeCfg(n.type);
                const Icon = cfg.icon;
                const isSelected = selected.includes(n.id);
                const external = n.link ? isExternalUrl(n.link) : false;
                return (
                  <div
                    key={n.id}
                    className={cn("px-4 py-3 transition-colors", isSelected && "bg-primary/5", !n.isRead && "bg-muted/30")}
                  >
                    <div className="flex items-start gap-3">
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleSelect(n.id)}
                        className="mt-0.5 shrink-0"
                      />
                      <div className={cn("w-8 h-8 rounded-xl flex items-center justify-center shrink-0", cfg.bg)}>
                        <Icon className={cn("w-4 h-4", cfg.color)} />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-start gap-2 flex-wrap">
                          <p className={cn("text-sm leading-snug flex-1 min-w-0", !n.isRead && "font-semibold")}>
                            {n.title}
                          </p>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {n.link && (
                              <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 h-4 border-0 gap-1", external ? "bg-sky-100 dark:bg-sky-900/30 text-sky-600" : "bg-muted text-muted-foreground")}>
                                {external ? <ExternalLink className="w-2.5 h-2.5" /> : <Globe className="w-2.5 h-2.5" />}
                                {external ? "Web" : "Halaman"}
                              </Badge>
                            )}
                            <Badge
                              variant="outline"
                              className={cn("text-[10px] px-1.5 py-0 h-4 border-0", cfg.bg, cfg.color)}
                            >
                              {cfg.label}
                            </Badge>
                            <Badge
                              variant={n.isRead ? "secondary" : "default"}
                              className="text-[10px] px-1.5 py-0 h-4"
                            >
                              {n.isRead ? "Dibaca" : "Baru"}
                            </Badge>
                          </div>
                        </div>

                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">{n.message}</p>

                        {n.link && (
                          <p className="text-[11px] text-primary/80 mt-1 flex items-center gap-1 truncate">
                            {external ? <ExternalLink className="w-2.5 h-2.5 shrink-0" /> : <Globe className="w-2.5 h-2.5 shrink-0" />}
                            <span className="truncate">{n.link}</span>
                          </p>
                        )}

                        <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                            <Users className="w-3 h-3" />
                            {n.userName ?? "?"} ({n.userEmail ?? "?"})
                          </span>
                          <span className="text-[11px] text-muted-foreground">
                            {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true, locale: localeId })}
                          </span>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-0.5 shrink-0">
                        <Button
                          variant="ghost" size="sm"
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                          title={n.isRead ? "Tandai belum dibaca" : "Tandai dibaca"}
                          onClick={() => toggleRead.mutate({ id: n.id, isRead: !n.isRead })}
                        >
                          {n.isRead ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </Button>
                        <Button
                          variant="ghost" size="sm"
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                          title="Edit"
                          onClick={() => setEditItem(n)}
                        >
                          <ChevronDown className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost" size="sm"
                          className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                          title="Hapus"
                          onClick={() => setDeleteIds([n.id])}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialogs */}
      <CreateNotifDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
      />

      {editItem && (
        <EditNotifDialog
          notif={editItem}
          onClose={() => setEditItem(null)}
        />
      )}

      <AlertDialog open={deleteIds !== null} onOpenChange={() => setDeleteIds(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus {deleteIds?.length === 1 ? "Notifikasi" : `${deleteIds?.length} Notifikasi`}?</AlertDialogTitle>
            <AlertDialogDescription>
              Tindakan ini tidak dapat dibatalkan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteIds && deleteNotifs.mutate(deleteIds)}
              className="bg-destructive hover:bg-destructive/90"
            >
              Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ── Create Notification Dialog ────────────────────────────────────────────────

function CreateNotifDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [type, setType] = useState("system");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [link, setLink] = useState("");
  const [target, setTarget] = useState<"broadcast" | "targeted">("broadcast");
  const [selectedUsers, setSelectedUsers] = useState<number[]>([]);
  const [userSearch, setUserSearch] = useState("");

  const { data: users = [] } = useQuery<AdminUser[]>({
    queryKey: ["admin-users-simple"],
    queryFn: () => apiFetch("/admin/users").then((r) => r.json()),
    enabled: open,
  });

  const filteredUsers = users.filter((u) =>
    !userSearch || u.name.toLowerCase().includes(userSearch.toLowerCase()) || u.email.toLowerCase().includes(userSearch.toLowerCase())
  );

  function reset() {
    setType("system"); setTitle(""); setMessage(""); setLink("");
    setTarget("broadcast"); setSelectedUsers([]); setUserSearch("");
  }

  function handleClose() { onClose(); reset(); }

  const create = useMutation({
    mutationFn: () => apiFetch("/admin/notifications", {
      method: "POST",
      body: JSON.stringify({
        type,
        title,
        message,
        link: link || undefined,
        userIds: target === "targeted" ? selectedUsers : undefined,
      }),
    }).then(async (r) => {
      if (!r.ok) { const d = await r.json(); throw new Error(d.message); }
      return r.json();
    }),
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ["admin-notifications"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
      toast({ title: d.broadcast ? `Broadcast ke ${d.sent} pengguna` : `Terkirim ke ${d.sent} pengguna` });
      handleClose();
    },
    onError: (e: any) => toast({ title: e.message ?? "Gagal membuat notifikasi", variant: "destructive" }),
  });

  const cfg = getTypeCfg(type);
  const Icon = cfg.icon;
  const canSubmit = title.trim() && message.trim() && (target === "broadcast" || selectedUsers.length > 0);
  const linkIsExternal = link && isExternalUrl(link);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg mx-4 sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Bell className="w-4 h-4 text-primary" /> Buat Notifikasi Baru
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Type */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Tipe Notifikasi</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="h-9 text-sm">
                <div className="flex items-center gap-2">
                  <div className={cn("w-5 h-5 rounded-md flex items-center justify-center", cfg.bg)}>
                    <Icon className={cn("w-3 h-3", cfg.color)} />
                  </div>
                  <SelectValue />
                </div>
              </SelectTrigger>
              <SelectContent>
                {TYPE_OPTIONS.map((t) => {
                  const TIcon = t.icon;
                  return (
                    <SelectItem key={t.value} value={t.value}>
                      <div className="flex items-center gap-2">
                        <div className={cn("w-5 h-5 rounded-md flex items-center justify-center", t.bg)}>
                          <TIcon className={cn("w-3 h-3", t.color)} />
                        </div>
                        {t.label}
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          {/* Title */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Judul</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Judul singkat yang jelas…"
              className="text-sm"
            />
          </div>

          {/* Message */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Isi Pesan</Label>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Detail notifikasi yang akan ditampilkan kepada pengguna…"
              className="text-sm resize-none"
              rows={3}
            />
          </div>

          {/* Link / URL */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5" /> URL Tujuan (opsional)
            </Label>
            <div className="relative">
              {linkIsExternal
                ? <ExternalLink className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-sky-500" />
                : <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              }
              <Input
                value={link}
                onChange={(e) => setLink(e.target.value)}
                placeholder="https://example.com atau /billing"
                className={cn("text-sm font-mono pl-8", linkIsExternal && "border-sky-400 focus-visible:ring-sky-400")}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {linkIsExternal
                ? "URL eksternal — pengguna akan diarahkan ke website tersebut saat klik notifikasi"
                : "Masukkan https://... untuk web eksternal, atau /halaman untuk navigasi internal"}
            </p>
          </div>

          {/* Target */}
          <div className="space-y-2">
            <Label className="text-xs font-medium">Target Penerima</Label>
            <div className="grid grid-cols-2 gap-2">
              {(["broadcast", "targeted"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTarget(t)}
                  className={cn(
                    "flex items-center gap-2 p-3 rounded-xl border text-sm transition-colors text-left",
                    target === t
                      ? "border-primary bg-primary/5 text-primary font-medium"
                      : "border-border text-muted-foreground hover:border-primary/40"
                  )}
                >
                  {t === "broadcast"
                    ? <><Megaphone className="w-4 h-4 shrink-0" /> Semua Pengguna</>
                    : <><Users className="w-4 h-4 shrink-0" /> Pengguna Tertentu</>}
                </button>
              ))}
            </div>
          </div>

          {/* User picker when targeted */}
          {target === "targeted" && (
            <div className="space-y-2">
              <Label className="text-xs font-medium">Pilih Pengguna ({selectedUsers.length} dipilih)</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder="Cari nama atau email…"
                  className="pl-8 h-8 text-sm"
                />
              </div>
              <div className="border border-border rounded-xl max-h-40 overflow-y-auto divide-y">
                {filteredUsers.map((u) => (
                  <label key={u.id} className="flex items-center gap-3 px-3 py-2 hover:bg-muted/50 cursor-pointer">
                    <Checkbox
                      checked={selectedUsers.includes(u.id)}
                      onCheckedChange={(checked) =>
                        setSelectedUsers((s) => checked ? [...s, u.id] : s.filter((x) => x !== u.id))
                      }
                    />
                    <div className="min-w-0">
                      <p className="text-xs font-medium truncate">{u.name}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{u.email}</p>
                    </div>
                  </label>
                ))}
                {filteredUsers.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-4">Pengguna tidak ditemukan</p>
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0 mt-2">
          <Button variant="outline" onClick={handleClose} className="h-9">Batal</Button>
          <Button onClick={() => create.mutate()} disabled={!canSubmit || create.isPending} className="gap-2 h-9">
            {create.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {target === "broadcast" ? "Broadcast" : `Kirim ke ${selectedUsers.length} pengguna`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Edit Notification Dialog ──────────────────────────────────────────────────

function EditNotifDialog({ notif, onClose }: { notif: AdminNotif; onClose: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [type, setType] = useState(notif.type);
  const [title, setTitle] = useState(notif.title);
  const [message, setMessage] = useState(notif.message);
  const [link, setLink] = useState(notif.link ?? "");

  const save = useMutation({
    mutationFn: () => apiFetch(`/admin/notifications/${notif.id}`, {
      method: "PUT",
      body: JSON.stringify({ type, title, message, link: link || null }),
    }).then(async (r) => {
      if (!r.ok) { const d = await r.json(); throw new Error(d.message); }
      return r.json();
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-notifications"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
      toast({ title: "Notifikasi berhasil diperbarui" });
      onClose();
    },
    onError: (e: any) => toast({ title: e.message ?? "Gagal menyimpan", variant: "destructive" }),
  });

  const cfg = getTypeCfg(type);
  const Icon = cfg.icon;
  const linkIsExternal = link && isExternalUrl(link);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg mx-4 sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Bell className="w-4 h-4 text-primary" /> Edit Notifikasi
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Tipe</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="h-9 text-sm">
                <div className="flex items-center gap-2">
                  <div className={cn("w-5 h-5 rounded-md flex items-center justify-center", cfg.bg)}>
                    <Icon className={cn("w-3 h-3", cfg.color)} />
                  </div>
                  <SelectValue />
                </div>
              </SelectTrigger>
              <SelectContent>
                {TYPE_OPTIONS.map((t) => {
                  const TIcon = t.icon;
                  return (
                    <SelectItem key={t.value} value={t.value}>
                      <div className="flex items-center gap-2">
                        <div className={cn("w-5 h-5 rounded-md flex items-center justify-center", t.bg)}>
                          <TIcon className={cn("w-3 h-3", t.color)} />
                        </div>
                        {t.label}
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Judul</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} className="text-sm" />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Isi Pesan</Label>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="text-sm resize-none"
              rows={3}
            />
          </div>

          {/* Link / URL */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5" /> URL Tujuan (opsional)
            </Label>
            <div className="relative">
              {linkIsExternal
                ? <ExternalLink className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-sky-500" />
                : <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              }
              <Input
                value={link}
                onChange={(e) => setLink(e.target.value)}
                placeholder="https://example.com atau /billing"
                className={cn("text-sm font-mono pl-8", linkIsExternal && "border-sky-400 focus-visible:ring-sky-400")}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {linkIsExternal
                ? "URL eksternal — pengguna akan diarahkan ke website tersebut saat klik notifikasi"
                : "Masukkan https://... untuk web eksternal, atau /halaman untuk navigasi internal"}
            </p>
          </div>

          <div className="rounded-xl bg-muted/50 px-4 py-3 text-xs text-muted-foreground">
            Penerima: <span className="font-medium">{notif.userName}</span> ({notif.userEmail})
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose} className="h-9">Batal</Button>
          <Button onClick={() => save.mutate()} disabled={!title.trim() || !message.trim() || save.isPending} className="gap-2 h-9">
            {save.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Simpan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

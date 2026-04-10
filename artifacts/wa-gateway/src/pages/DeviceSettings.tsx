import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import {
  Smartphone, Wifi, WifiOff, Battery, RefreshCw, Loader2,
  QrCode, Phone, Trash2, Bell, Webhook, Settings2, RotateCw,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { apiFetch } from "@/lib/api";
import { useDevice } from "@/contexts/DeviceContext";
import { useToast } from "@/hooks/use-toast";

const statusMeta: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  connected: { label: "Terhubung", color: "text-green-600 bg-green-50 border-green-200", icon: Wifi },
  connecting: { label: "Menghubungkan...", color: "text-amber-600 bg-amber-50 border-amber-200", icon: RefreshCw },
  disconnected: { label: "Terputus", color: "text-red-600 bg-red-50 border-red-200", icon: WifiOff },
};

export default function DeviceSettings() {
  const { selectedDevice, devices, selectDevice } = useDevice();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [deleteOpen, setDeleteOpen] = useState(false);

  const device = selectedDevice;
  const meta = statusMeta[device?.status ?? "disconnected"] ?? statusMeta.disconnected;
  const StatusIcon = meta.icon;

  const { register, handleSubmit, reset } = useForm({
    values: {
      name: device?.name ?? "",
      phone: device?.phone ?? "",
      webhookUrl: "",
      autoReconnect: device?.autoReconnect ?? true,
    },
  });

  const [autoReconnect, setAutoReconnect] = useState(device?.autoReconnect ?? true);
  const [notifyOnDisconnect, setNotifyOnDisconnect] = useState(device?.notifyOnDisconnect ?? true);
  const [notifyOnConnect, setNotifyOnConnect] = useState(device?.notifyOnConnect ?? false);
  const [savingNotif, setSavingNotif] = useState(false);
  const [rotationEnabled, setRotationEnabled] = useState<boolean>(device?.rotationEnabled ?? false);
  const [rotationWeight, setRotationWeight] = useState<number>(device?.rotationWeight ?? 1);
  const [rotationGroup, setRotationGroup] = useState<string>(device?.rotationGroup ?? "");
  const [savingRotation, setSavingRotation] = useState(false);

  const save = useMutation({
    mutationFn: (body: any) =>
      apiFetch(`/devices/${device!.id}`, { method: "PUT", body: JSON.stringify(body) }).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["devices"] });
      qc.invalidateQueries({ queryKey: ["devices-context"] });
      toast({ title: "Pengaturan device disimpan" });
    },
    onError: () => toast({ title: "Gagal menyimpan", variant: "destructive" }),
  });

  const reconnect = useMutation({
    mutationFn: () => apiFetch(`/devices/${device!.id}/connect`, { method: "POST" }).then((r) => r.json()),
    onSuccess: () => toast({ title: "Permintaan koneksi dikirim" }),
    onError: () => toast({ title: "Gagal terhubung", variant: "destructive" }),
  });

  const deleteDevice = useMutation({
    mutationFn: () => apiFetch(`/devices/${device!.id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["devices"] });
      qc.invalidateQueries({ queryKey: ["devices-context"] });
      const next = devices.find((d) => d.id !== device!.id);
      if (next) selectDevice(next.id);
      setDeleteOpen(false);
      toast({ title: "Device dihapus" });
    },
    onError: () => toast({ title: "Gagal menghapus", variant: "destructive" }),
  });

  if (!device) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
        <Smartphone className="w-10 h-10 opacity-30" />
        <p className="text-sm">Belum ada device. Tambahkan device dari halaman Perangkat.</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-end">
        <div className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border ${meta.color}`}>
          <StatusIcon className="w-3.5 h-3.5" />
          {meta.label}
        </div>
      </div>

      <Tabs defaultValue="general">
        <TabsList className="w-full">
          <TabsTrigger value="general" className="flex-1 gap-1.5"><Settings2 className="w-3.5 h-3.5" />Umum</TabsTrigger>
          <TabsTrigger value="connection" className="flex-1 gap-1.5"><Wifi className="w-3.5 h-3.5" />Koneksi</TabsTrigger>
          <TabsTrigger value="notif" className="flex-1 gap-1.5"><Bell className="w-3.5 h-3.5" />Notifikasi</TabsTrigger>
          <TabsTrigger value="rotation" className="flex-1 gap-1.5"><RotateCw className="w-3.5 h-3.5" />Rotasi</TabsTrigger>
        </TabsList>

        {/* ── General Tab ── */}
        <TabsContent value="general" className="mt-4 space-y-4">
          <Card>
            <CardContent className="p-5 space-y-4">
              {/* Device info */}
              <div className="flex items-center gap-4 pb-4 border-b border-border">
                <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <Smartphone className="w-7 h-7 text-primary" />
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">ID Device</p>
                  <p className="font-mono text-sm font-medium">#{device.id}</p>
                  {device.battery !== undefined && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Battery className="w-3 h-3" />
                      {device.battery}%
                    </div>
                  )}
                </div>
                <div className="ml-auto space-y-1 text-right">
                  <p className="text-xs text-muted-foreground">Pesan Terkirim</p>
                  <p className="text-lg font-bold text-primary">{(device.messagesSent ?? 0).toLocaleString()}</p>
                </div>
              </div>

              <form onSubmit={handleSubmit((d) => save.mutate({ ...d, autoReconnect }))} className="space-y-4">
                <div className="space-y-2">
                  <Label>Nama Device</Label>
                  <Input {...register("name")} placeholder="misal: WhatsApp Bisnis" />
                </div>
                <div className="space-y-2">
                  <Label>Nomor WhatsApp</Label>
                  <Input {...register("phone")} placeholder="628xxxxxxxxxx" />
                  <p className="text-xs text-muted-foreground">Format: kode negara tanpa +, contoh 6281234567890</p>
                </div>
                <div className="flex items-center justify-between py-2">
                  <div>
                    <p className="text-sm font-medium">Auto Reconnect</p>
                    <p className="text-xs text-muted-foreground">Hubungkan ulang otomatis jika terputus</p>
                  </div>
                  <Switch checked={autoReconnect} onCheckedChange={setAutoReconnect} />
                </div>
                <Button type="submit" disabled={save.isPending} className="gap-2 bg-blue-600 hover:bg-blue-700 text-white">
                  {save.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                  Simpan Pengaturan
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Danger zone */}
          <Card className="border-destructive/40">
            <CardHeader className="pb-2">
              <CardTitle className="text-base text-destructive">Zona Berbahaya</CardTitle>
            </CardHeader>
            <CardContent className="p-5 pt-0">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Hapus Device</p>
                  <p className="text-xs text-muted-foreground">Semua data device akan dihapus permanen</p>
                </div>
                <Button variant="destructive" size="sm" className="gap-2" onClick={() => setDeleteOpen(true)}>
                  <Trash2 className="w-4 h-4" />
                  Hapus
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Connection Tab ── */}
        <TabsContent value="connection" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Status Koneksi</CardTitle>
            </CardHeader>
            <CardContent className="p-5 pt-0 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-muted/50 rounded-xl p-4">
                  <p className="text-xs text-muted-foreground mb-1">Status</p>
                  <div className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${meta.color}`}>
                    <StatusIcon className="w-3 h-3" />
                    {meta.label}
                  </div>
                </div>
                <div className="bg-muted/50 rounded-xl p-4">
                  <p className="text-xs text-muted-foreground mb-1">Terakhir Aktif</p>
                  <p className="text-sm font-medium">
                    {device.lastSeen ? new Date(device.lastSeen).toLocaleString("id-ID", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" }) : "—"}
                  </p>
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  className="flex-1 gap-2"
                  onClick={() => reconnect.mutate()}
                  disabled={reconnect.isPending || device.status === "connected"}
                >
                  {reconnect.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <QrCode className="w-4 h-4" />}
                  Hubungkan via QR
                </Button>
                <Button variant="outline" className="flex-1 gap-2">
                  <Phone className="w-4 h-4" />
                  Kode Pairing
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Webhook className="w-4 h-4 text-primary" /> Webhook Device
              </CardTitle>
            </CardHeader>
            <CardContent className="p-5 pt-0 space-y-3">
              <p className="text-xs text-muted-foreground">URL webhook yang menerima event dari device ini.</p>
              <div className="space-y-2">
                <Label>Webhook URL</Label>
                <Input placeholder="https://yourapp.com/webhook" {...register("webhookUrl")} />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Kirim event:</Label>
                <div className="grid grid-cols-2 gap-2">
                  {["Pesan Masuk", "Pesan Terkirim", "Status Koneksi", "Perubahan Status"].map((ev) => (
                    <label key={ev} className="flex items-center gap-2 text-sm cursor-pointer">
                      <input type="checkbox" className="rounded" defaultChecked />
                      {ev}
                    </label>
                  ))}
                </div>
              </div>
              <Button size="sm" className="gap-2 bg-blue-600 hover:bg-blue-700 text-white">
                <Webhook className="w-3.5 h-3.5" />
                Simpan Webhook
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Notification Tab ── */}
        <TabsContent value="notif" className="mt-4 space-y-4">
          <Card>
            <CardContent className="p-5 space-y-5">
              <div className="flex gap-3 items-start p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
                <Bell className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
                <p className="text-xs text-blue-700 dark:text-blue-400">
                  Notifikasi dikirim ke <strong>email akun</strong> Anda. Pastikan SMTP sudah dikonfigurasi di Pengaturan Website (admin).
                </p>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between py-2 border-b border-border/50">
                  <div>
                    <p className="text-sm font-medium">Notifikasi Perangkat Terputus</p>
                    <p className="text-xs text-muted-foreground">Kirim email peringatan saat perangkat ini terputus dari server</p>
                  </div>
                  <Switch
                    checked={notifyOnDisconnect}
                    onCheckedChange={setNotifyOnDisconnect}
                  />
                </div>

                <div className="flex items-center justify-between py-2">
                  <div>
                    <p className="text-sm font-medium">Notifikasi Perangkat Terhubung</p>
                    <p className="text-xs text-muted-foreground">Kirim email konfirmasi saat perangkat ini berhasil terhubung kembali</p>
                  </div>
                  <Switch
                    checked={notifyOnConnect}
                    onCheckedChange={setNotifyOnConnect}
                  />
                </div>
              </div>

              <Button
                size="sm"
                className="gap-2 bg-blue-600 hover:bg-blue-700 text-white"
                disabled={savingNotif}
                onClick={async () => {
                  setSavingNotif(true);
                  try {
                    await save.mutateAsync({ notifyOnDisconnect, notifyOnConnect });
                  } finally {
                    setSavingNotif(false);
                  }
                }}
              >
                {savingNotif ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Bell className="w-3.5 h-3.5" />}
                Simpan Notifikasi
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Rotation Tab ── */}
        <TabsContent value="rotation" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <RotateCw className="w-4 h-4 text-primary" />
                Pengaturan Rotasi Device
              </CardTitle>
            </CardHeader>
            <CardContent className="p-5 space-y-5">
              <div className="flex gap-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                <RotateCw className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  Rotasi memungkinkan sistem memilih device secara otomatis. Gunakan <code className="bg-amber-100 dark:bg-amber-900 px-1 rounded">deviceId=auto</code> di API agar pesan didistribusikan berdasarkan bobot.
                </p>
              </div>

              <div className="flex items-center justify-between py-2 border-b border-border/50">
                <div>
                  <p className="text-sm font-medium">Aktifkan Rotasi</p>
                  <p className="text-xs text-muted-foreground">Device ini masuk pool rotasi otomatis</p>
                </div>
                <Switch checked={rotationEnabled} onCheckedChange={setRotationEnabled} />
              </div>

              {rotationEnabled && (
                <>
                  <div className="space-y-2">
                    <Label>Bobot Rotasi (1–100)</Label>
                    <div className="flex items-center gap-3">
                      <Input
                        type="number"
                        min={1}
                        max={100}
                        value={rotationWeight}
                        onChange={(e) => setRotationWeight(Number(e.target.value))}
                        className="w-24"
                      />
                      <p className="text-xs text-muted-foreground">Bobot lebih tinggi = lebih sering dipilih.</p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Grup Rotasi (opsional)</Label>
                    <Input
                      placeholder="misal: marketing atau group-a"
                      value={rotationGroup}
                      onChange={(e) => setRotationGroup(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">Pisahkan device ke grup berbeda. Kosongkan untuk default.</p>
                  </div>
                </>
              )}

              <Button
                size="sm"
                className="gap-2 bg-blue-600 hover:bg-blue-700 text-white"
                disabled={savingRotation}
                onClick={async () => {
                  setSavingRotation(true);
                  try {
                    await save.mutateAsync({ rotationEnabled, rotationWeight, rotationGroup: rotationGroup || null });
                  } finally {
                    setSavingRotation(false);
                  }
                }}
              >
                {savingRotation ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCw className="w-3.5 h-3.5" />}
                Simpan Rotasi
              </Button>
            </CardContent>
          </Card>

          <Card className="bg-muted/30">
            <CardContent className="pt-4 pb-4">
              <p className="text-xs font-medium text-muted-foreground mb-2">Cara Pakai via API:</p>
              <pre className="text-xs bg-muted rounded-md p-3 overflow-x-auto whitespace-pre-wrap">{`POST /api/messages/send\n{\n  "deviceId": "auto",\n  "phone": "6281234567890",\n  "message": "Halo!"\n}`}</pre>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Delete confirm */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus device ini?</AlertDialogTitle>
            <AlertDialogDescription>
              Device <strong>{device.name}</strong> ({device.phone}) akan dihapus permanen beserta semua datanya.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => deleteDevice.mutate()}
            >
              {deleteDevice.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Ya, Hapus"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

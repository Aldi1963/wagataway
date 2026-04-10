import { useState, useEffect, useRef } from "react";
import QRCode from "qrcode";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Smartphone,
  Plus,
  WifiOff,
  Battery,
  Trash2,
  Loader2,
  QrCode,
  MoreVertical,
  Link,
  RefreshCw,
  Phone,
  CheckCircle2,
  Clock,
  Globe,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { apiFetch, API_BASE, getToken } from "@/lib/api";
import { format } from "date-fns";
import { LimitExceededDialog } from "@/components/LimitExceededDialog";

interface Device {
  id: string;
  name: string;
  phone?: string;
  status: string;
  battery?: number;
  lastSeen?: string;
  autoReconnect?: boolean;
  messagesSent?: number;
  createdAt?: string;
}

export default function Devices() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [limitErr, setLimitErr] = useState<{ message: string; current?: number; limit?: number; planName?: string } | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [autoReconnect, setAutoReconnect] = useState(true);

  const [webhookDialogOpen, setWebhookDialogOpen] = useState(false);
  const [webhookTargetDevice, setWebhookTargetDevice] = useState<Device | null>(null);
  const [webhookInputUrl, setWebhookInputUrl] = useState("");

  const [connectOpen, setConnectOpen] = useState(false);
  const [connectDevice, setConnectDevice] = useState<Device | null>(null);
  const [connectTab, setConnectTab] = useState("qr");
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrExpiry, setQrExpiry] = useState<Date | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [pairPhone, setPairPhone] = useState("");
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [pairExpiry, setPairExpiry] = useState<Date | null>(null);
  const [pairLoading, setPairLoading] = useState(false);
  const [pairCountdown, setPairCountdown] = useState(0);
  const [qrConnected, setQrConnected] = useState(false);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pairCountdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sseRef = useRef<EventSource | null>(null);

  const { data: devices, isLoading } = useQuery<Device[]>({
    queryKey: ["devices"],
    queryFn: () => apiFetch("/devices").then((r) => r.json()),
  });

  const addDevice = useMutation({
    mutationFn: async (body: any) => {
      const { webhookUrl: wh, ...deviceBody } = body;
      const res = await apiFetch("/devices", { method: "POST", body: JSON.stringify(deviceBody) });
      const data = await res.json();
      if (!res.ok) { const err = Object.assign(new Error(data.message ?? "Error"), data); throw err; }
      if (wh && data?.id) {
        await apiFetch("/webhooks", {
          method: "POST",
          body: JSON.stringify({
            deviceId: data.id,
            name: `Webhook ${deviceBody.name}`,
            url: wh,
            events: ["message.received", "message.sent", "device.connected", "device.disconnected"],
          }),
        });
      }
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["devices"] });
      qc.invalidateQueries({ queryKey: ["webhooks"] });
      qc.invalidateQueries({ queryKey: ["billing-usage"] });
      setAddOpen(false);
      setName("");
      setPhone("");
      setWebhookUrl("");
      toast({ title: "Perangkat berhasil ditambahkan" });
    },
    onError: async (err: any) => {
      if (err?.code === "LIMIT_EXCEEDED" || err?.status === 403) {
        setLimitErr({ message: err.message, current: err.current, limit: err.limit, planName: err.planName });
      } else {
        toast({ title: "Gagal menambahkan perangkat", variant: "destructive" });
      }
    },
  });

  const disconnectDevice = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/devices/${id}/disconnect`, { method: "POST" }).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["devices"] });
      toast({ title: "Perangkat berhasil diputus" });
    },
  });

  const deleteDevice = useMutation({
    mutationFn: (id: string) => apiFetch(`/devices/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["devices"] });
      toast({ title: "Perangkat dihapus" });
    },
  });

  const { data: allWebhooks } = useQuery<{ id: string; deviceId: string | null; url: string; name: string }[]>({
    queryKey: ["webhooks"],
    queryFn: () => apiFetch("/webhooks").then((r) => r.json()),
  });

  const upsertWebhook = useMutation({
    mutationFn: async ({ device, url }: { device: Device; url: string }) => {
      const existing = allWebhooks?.find((w) => w.deviceId === String(device.id));
      if (existing) {
        return apiFetch(`/webhooks/${existing.id}`, {
          method: "PUT",
          body: JSON.stringify({ url }),
        }).then((r) => r.json());
      } else {
        return apiFetch("/webhooks", {
          method: "POST",
          body: JSON.stringify({
            deviceId: device.id,
            name: `Webhook ${device.name}`,
            url,
            events: ["message.received", "message.sent", "device.connected", "device.disconnected"],
          }),
        }).then((r) => r.json());
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["webhooks"] });
      setWebhookDialogOpen(false);
      setWebhookInputUrl("");
      setWebhookTargetDevice(null);
      toast({ title: "Webhook URL berhasil disimpan" });
    },
    onError: () => toast({ title: "Gagal menyimpan webhook URL", variant: "destructive" }),
  });

  function openWebhookDialog(device: Device) {
    const existing = allWebhooks?.find((w) => w.deviceId === String(device.id));
    setWebhookTargetDevice(device);
    setWebhookInputUrl(existing?.url ?? "");
    setWebhookDialogOpen(true);
  }

  function startCountdown(expiry: Date, setFn: (n: number) => void, ref: React.MutableRefObject<any>) {
    if (ref.current) clearInterval(ref.current);
    const tick = () => {
      const secs = Math.max(0, Math.floor((expiry.getTime() - Date.now()) / 1000));
      setFn(secs);
      if (secs === 0 && ref.current) clearInterval(ref.current);
    };
    tick();
    ref.current = setInterval(tick, 1000);
  }

  function closeSse() {
    if (sseRef.current) {
      sseRef.current.close();
      sseRef.current = null;
    }
  }

  function startQrStream(deviceId: string) {
    closeSse();
    setQrLoading(true);
    setQrDataUrl(null);
    setQrConnected(false);

    const token = getToken() ?? "";
    const url = `${API_BASE}/devices/${deviceId}/qr-stream?token=${encodeURIComponent(token)}`;
    const sse = new EventSource(url);
    sseRef.current = sse;

    sse.addEventListener("qr", async (e) => {
      const data = JSON.parse((e as MessageEvent).data);
      let src: string | null = data.qrDataUrl ?? null;
      // Fallback: generate QR in browser if server didn't convert
      if (!src && data.qr) {
        try {
          const svg = await QRCode.toString(data.qr, { type: "svg", width: 400, margin: 2 });
          src = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
        } catch {
          src = null;
        }
      }
      setQrDataUrl(src);
      setQrLoading(false);
      if (data.expiresAt) {
        const exp = new Date(data.expiresAt);
        setQrExpiry(exp);
        startCountdown(exp, setCountdown, countdownRef);
      }
    });

    sse.addEventListener("connected", () => {
      setQrConnected(true);
      setQrLoading(false);
      setConnectOpen(false);
      closeSse();
      qc.invalidateQueries({ queryKey: ["devices"] });
      toast({ title: "WhatsApp berhasil terhubung!" });
    });

    sse.addEventListener("disconnected", () => {
      setQrLoading(false);
      closeSse();
    });

    sse.addEventListener("error", () => {
      setQrLoading(false);
    });

    sse.onerror = () => {
      setQrLoading(false);
    };
  }

  // kept for pairing tab compatibility
  function fetchQr(deviceId: string) { startQrStream(deviceId); }

  async function requestPairingCode() {
    if (!connectDevice || !pairPhone.trim()) return;
    setPairLoading(true);
    setPairingCode(null);
    try {
      const res = await apiFetch(`/devices/${connectDevice.id}/pair-phone`, {
        method: "POST",
        body: JSON.stringify({ phone: pairPhone.trim() }),
      });
      const data = await res.json();
      setPairingCode(data.pairingCode ?? null);
      if (data.expiresAt) {
        const exp = new Date(data.expiresAt);
        setPairExpiry(exp);
        startCountdown(exp, setPairCountdown, pairCountdownRef);
      }
    } finally {
      setPairLoading(false);
    }
  }

  function openConnectDialog(device: Device) {
    setConnectDevice(device);
    setConnectTab("qr");
    setQrDataUrl(null);
    setQrExpiry(null);
    setCountdown(0);
    setPairPhone(device.phone ?? "");
    setPairingCode(null);
    setPairExpiry(null);
    setPairCountdown(0);
    setConnectOpen(true);
    fetchQr(device.id);
  }

  useEffect(() => {
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
      if (pairCountdownRef.current) clearInterval(pairCountdownRef.current);
      closeSse();
    };
  }, []);

  function statusColor(status: string) {
    if (status === "connected") return "bg-green-500";
    if (status === "connecting") return "bg-yellow-500";
    return "bg-gray-400";
  }

  function statusLabel(status: string) {
    if (status === "connected") return "Terhubung";
    if (status === "connecting") return "Menghubungkan";
    return "Terputus";
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Button onClick={() => setAddOpen(true)} className="gap-2">
          <Plus className="w-4 h-4" />
          Tambah Perangkat
        </Button>
      </div>

      {isLoading ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}><CardContent className="p-5"><Skeleton className="h-40 w-full" /></CardContent></Card>
          ))}
        </div>
      ) : !devices?.length ? (
        <Card>
          <CardContent className="py-16 flex flex-col items-center gap-4 text-center">
            <Smartphone className="w-12 h-12 text-muted-foreground/50" />
            <div>
              <p className="font-medium">Belum ada perangkat</p>
              <p className="text-sm text-muted-foreground">Tambahkan perangkat WhatsApp untuk mulai mengirim pesan</p>
            </div>
            <Button onClick={() => setAddOpen(true)} className="gap-2">
              <Plus className="w-4 h-4" />
              Tambah Perangkat
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {devices.map((device) => (
            <Card key={device.id} className="relative">
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center relative">
                      <Smartphone className="w-5 h-5 text-muted-foreground" />
                      <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-card ${statusColor(device.status)}`} />
                    </div>
                    <div>
                      <p className="font-semibold text-sm">{device.name}</p>
                      <p className="text-xs text-muted-foreground">{device.phone ?? "Belum scan QR"}</p>
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7">
                        <MoreVertical className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {device.status === "connected" ? (
                        <DropdownMenuItem onClick={() => disconnectDevice.mutate(device.id)}>
                          <WifiOff className="w-4 h-4 mr-2" />
                          Putuskan
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem onClick={() => openConnectDialog(device)}>
                          <QrCode className="w-4 h-4 mr-2" />
                          Hubungkan
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem onClick={() => openWebhookDialog(device)}>
                        <Globe className="w-4 h-4 mr-2" />
                        Set Webhook URL
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => deleteDevice.mutate(device.id)}
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Hapus
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Status</span>
                    <Badge
                      variant={device.status === "connected" ? "default" : "secondary"}
                      className="text-xs"
                    >
                      {statusLabel(device.status)}
                    </Badge>
                  </div>
                  {device.battery !== null && device.battery !== undefined && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground flex items-center gap-1">
                        <Battery className="w-3 h-3" /> Baterai
                      </span>
                      <span className="font-medium">{device.battery}%</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Pesan terkirim</span>
                    <span className="font-medium">{device.messagesSent ?? 0}</span>
                  </div>
                  {device.lastSeen && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Terakhir aktif</span>
                      <span className="font-medium">{format(new Date(device.lastSeen), "dd/MM HH:mm")}</span>
                    </div>
                  )}
                </div>

                {device.status !== "connected" && (
                  <Button
                    size="sm"
                    className="w-full mt-4 gap-2"
                    onClick={() => openConnectDialog(device)}
                  >
                    <QrCode className="w-3 h-3" />
                    Hubungkan Perangkat
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Connect Dialog */}
      <Dialog open={connectOpen} onOpenChange={(open) => {
        setConnectOpen(open);
        if (!open) {
          closeSse();
          if (countdownRef.current) clearInterval(countdownRef.current);
          if (pairCountdownRef.current) clearInterval(pairCountdownRef.current);
          qc.invalidateQueries({ queryKey: ["devices"] });
        }
      }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Smartphone className="w-4 h-4" />
              Hubungkan {connectDevice?.name}
            </DialogTitle>
          </DialogHeader>

          <Tabs value={connectTab} onValueChange={(v) => {
            setConnectTab(v);
            if (v === "qr" && !qrDataUrl && connectDevice) fetchQr(connectDevice.id);
          }}>
            <TabsList className="w-full">
              <TabsTrigger value="qr" className="flex-1 gap-1.5">
                <QrCode className="w-3.5 h-3.5" />
                Kode QR
              </TabsTrigger>
              <TabsTrigger value="phone" className="flex-1 gap-1.5">
                <Phone className="w-3.5 h-3.5" />
                Kode Pairing
              </TabsTrigger>
            </TabsList>

            {/* QR Code Tab */}
            <TabsContent value="qr" className="mt-4">
              <div className="flex flex-col items-center gap-3">
                <div className="w-[280px] h-[280px] bg-muted rounded-xl flex items-center justify-center border relative overflow-hidden">
                  {qrLoading ? (
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <Loader2 className="w-8 h-8 animate-spin" />
                      <p className="text-xs">Membuat QR Code...</p>
                    </div>
                  ) : qrDataUrl ? (
                    <>
                      <img src={qrDataUrl} alt="WhatsApp QR Code" className="w-full h-full object-contain p-3" />
                      {countdown <= 10 && countdown > 0 && (
                        <div className="absolute inset-0 bg-background/80 flex flex-col items-center justify-center gap-2">
                          <Clock className="w-6 h-6 text-amber-500" />
                          <p className="text-sm font-medium text-amber-600">Kedaluwarsa dalam {countdown}s</p>
                        </div>
                      )}
                      {countdown === 0 && (
                        <div className="absolute inset-0 bg-background/90 flex flex-col items-center justify-center gap-3">
                          <p className="text-sm font-medium">QR Code kedaluwarsa</p>
                          <Button size="sm" variant="outline" onClick={() => connectDevice && fetchQr(connectDevice.id)} className="gap-1.5">
                            <RefreshCw className="w-3.5 h-3.5" />
                            Perbarui
                          </Button>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <QrCode className="w-10 h-10 opacity-40" />
                      <p className="text-xs">Gagal memuat QR Code</p>
                    </div>
                  )}
                </div>

                {qrDataUrl && countdown > 0 && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Clock className="w-3 h-3" />
                    <span>Kedaluwarsa dalam <span className={`font-medium ${countdown <= 15 ? "text-amber-500" : ""}`}>{countdown}s</span></span>
                    <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => connectDevice && fetchQr(connectDevice.id)}>
                      <RefreshCw className="w-3 h-3" />
                    </Button>
                  </div>
                )}

                <div className="text-center text-xs text-muted-foreground space-y-1 px-2">
                  <p className="font-medium text-foreground">Cara scan QR Code:</p>
                  <p>1. Buka WhatsApp di HP Anda</p>
                  <p>2. Ketuk menu <strong>⋮</strong> → <strong>Perangkat Tertaut</strong></p>
                  <p>3. Ketuk <strong>Tautkan Perangkat</strong>, lalu scan QR</p>
                </div>
              </div>
            </TabsContent>

            {/* Phone Pairing Tab */}
            <TabsContent value="phone" className="mt-4">
              <div className="flex flex-col gap-4">
                <div className="text-xs text-muted-foreground text-center space-y-1">
                  <p className="font-medium text-foreground">Pairing dengan nomor HP</p>
                  <p>Masukkan nomor WhatsApp yang ingin dihubungkan</p>
                </div>

                {!pairingCode ? (
                  <>
                    <div className="space-y-2">
                      <Label>Nomor WhatsApp</Label>
                      <Input
                        placeholder="628123456789 (tanpa tanda +)"
                        value={pairPhone}
                        onChange={(e) => setPairPhone(e.target.value)}
                        type="tel"
                      />
                      <p className="text-xs text-muted-foreground">*Gunakan kode negara tanpa tanda +</p>
                    </div>
                    <Button
                      onClick={requestPairingCode}
                      disabled={!pairPhone.trim() || pairLoading}
                      className="gap-2"
                    >
                      {pairLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Phone className="w-4 h-4" />}
                      Dapatkan Kode Pairing
                    </Button>
                  </>
                ) : (
                  <div className="flex flex-col items-center gap-4">
                    <div className="flex items-center gap-2 text-green-600">
                      <CheckCircle2 className="w-5 h-5" />
                      <span className="text-sm font-medium">Kode berhasil dibuat</span>
                    </div>

                    <div className="bg-muted rounded-xl px-8 py-5 text-center w-full">
                      <p className="text-xs text-muted-foreground mb-2">Kode Pairing WhatsApp</p>
                      <p className="text-3xl font-bold tracking-[0.3em] font-mono text-primary">{pairingCode}</p>
                      {pairCountdown > 0 && (
                        <p className="text-xs text-muted-foreground mt-2 flex items-center justify-center gap-1">
                          <Clock className="w-3 h-3" />
                          Berlaku <span className={`font-medium mx-1 ${pairCountdown <= 30 ? "text-amber-500" : ""}`}>{Math.floor(pairCountdown / 60)}:{String(pairCountdown % 60).padStart(2, "0")}</span>
                        </p>
                      )}
                    </div>

                    <div className="text-xs text-muted-foreground text-center space-y-1">
                      <p className="font-medium text-foreground">Cara menggunakan kode:</p>
                      <p>1. Buka WhatsApp di HP Anda</p>
                      <p>2. Ketuk menu <strong>⋮</strong> → <strong>Perangkat Tertaut</strong></p>
                      <p>3. Ketuk <strong>Tautkan dengan nomor telepon</strong></p>
                      <p>4. Masukkan kode di atas</p>
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => { setPairingCode(null); setPairPhone(""); }}
                      className="gap-1.5"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      Minta Kode Baru
                    </Button>
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Add Device Dialog */}
      <Dialog open={addOpen} onOpenChange={(open) => {
        setAddOpen(open);
        if (!open) { setName(""); setPhone(""); setWebhookUrl(""); setAutoReconnect(true); }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tambah Perangkat Baru</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Nama Perangkat</Label>
              <Input
                placeholder="Contoh: WhatsApp Bisnis"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Nomor WhatsApp</Label>
              <Input
                placeholder="628123456789 (tanpa tanda +)"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                type="tel"
              />
              <p className="text-xs text-muted-foreground">*Gunakan kode negara tanpa tanda +</p>
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <Link className="w-3.5 h-3.5" />
                Link Webhook
              </Label>
              <Input
                placeholder="https://example.com/webhook"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                type="url"
              />
              <p className="text-xs text-muted-foreground">*Opsional — webhook otomatis dibuat jika diisi</p>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label>Auto Reconnect</Label>
                <p className="text-xs text-muted-foreground">Hubungkan otomatis jika terputus</p>
              </div>
              <Switch checked={autoReconnect} onCheckedChange={setAutoReconnect} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Batal</Button>
            <Button
              onClick={() => addDevice.mutate({ name, phone: phone.trim() || undefined, autoReconnect, webhookUrl: webhookUrl.trim() || undefined })}
              disabled={!name.trim() || addDevice.isPending}
            >
              {addDevice.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Webhook URL Dialog ────────────────────────────────────────────── */}
      <Dialog open={webhookDialogOpen} onOpenChange={(open) => { if (!open) { setWebhookDialogOpen(false); setWebhookInputUrl(""); setWebhookTargetDevice(null); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5 text-primary" />
              Set Webhook URL
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {webhookTargetDevice && (
              <div className="text-sm text-muted-foreground">
                Perangkat: <span className="font-medium text-foreground">{webhookTargetDevice.name}</span>
                {webhookTargetDevice.phone && <span className="ml-1 text-xs">({webhookTargetDevice.phone})</span>}
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="webhook-url-input">URL Webhook</Label>
              <Input
                id="webhook-url-input"
                type="url"
                placeholder="https://example.com/webhook"
                value={webhookInputUrl}
                onChange={(e) => setWebhookInputUrl(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Pesan masuk dan event perangkat akan dikirim ke URL ini via POST.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWebhookDialogOpen(false)}>Batal</Button>
            <Button
              onClick={() => webhookTargetDevice && upsertWebhook.mutate({ device: webhookTargetDevice, url: webhookInputUrl.trim() })}
              disabled={!webhookInputUrl.trim() || upsertWebhook.isPending}
            >
              {upsertWebhook.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <LimitExceededDialog
        open={!!limitErr}
        onClose={() => setLimitErr(null)}
        message={limitErr?.message ?? ""}
        current={limitErr?.current}
        limit={limitErr?.limit}
        planName={limitErr?.planName}
        resource="Perangkat"
      />
    </div>
  );
}

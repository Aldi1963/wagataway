import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { Loader2, Server, Clock, Users2, Smartphone, GitBranch, Globe, Mail, CheckCircle2, XCircle, Eye, EyeOff } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

interface ServerSettings {
  appName: string;
  baseUrl: string;
  maxDevicesPerUser: number;
  maxMessagesPerDay: number;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpFrom: string;
  maintenanceMode: boolean;
  registrationOpen: boolean;
  version: string;
  uptimeSeconds: number;
  totalUsers: number;
  totalDevices: number;
  nodeVersion: string;
  environment: string;
}

function formatUptime(secs: number) {
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (d > 0) return `${d}h ${h}j ${m}m`;
  if (h > 0) return `${h}j ${m}m`;
  return `${m}m`;
}

interface GoogleOAuthSettings {
  googleClientId: string;
  googleClientSecret: string;
  configured: boolean;
}

export default function AdminServerSettings() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [maintenance, setMaintenance] = useState(false);
  const [regOpen, setRegOpen] = useState(true);
  const [showSecret, setShowSecret] = useState(false);
  const [gClientId, setGClientId] = useState("");
  const [gClientSecret, setGClientSecret] = useState("");

  const { register, handleSubmit, reset } = useForm<Partial<ServerSettings>>();

  const { data, isLoading } = useQuery<ServerSettings>({
    queryKey: ["admin-server-settings"],
    queryFn: () => apiFetch("/admin/server-settings").then((r) => r.json()),
  });

  useEffect(() => {
    if (!data) return;
    setMaintenance(data.maintenanceMode);
    setRegOpen(data.registrationOpen);
    reset({
      appName: data.appName,
      baseUrl: data.baseUrl,
      maxDevicesPerUser: data.maxDevicesPerUser,
      maxMessagesPerDay: data.maxMessagesPerDay,
      smtpHost: data.smtpHost,
      smtpPort: data.smtpPort,
      smtpUser: data.smtpUser,
      smtpFrom: data.smtpFrom,
    });
  }, [data]);

  const save = useMutation({
    mutationFn: (body: any) =>
      apiFetch("/admin/server-settings", { method: "PUT", body: JSON.stringify(body) }).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-server-settings"] });
      toast({ title: "Pengaturan disimpan" });
    },
    onError: () => toast({ title: "Gagal menyimpan", variant: "destructive" }),
  });

  const { data: googleData } = useQuery<GoogleOAuthSettings>({
    queryKey: ["admin-google-oauth"],
    queryFn: () => apiFetch("/admin/google-oauth").then((r) => r.json()),
  });

  useEffect(() => {
    if (!googleData) return;
    setGClientId(googleData.googleClientId ?? "");
    setGClientSecret("");
  }, [googleData]);

  const saveGoogle = useMutation({
    mutationFn: (body: any) =>
      apiFetch("/admin/google-oauth", { method: "PUT", body: JSON.stringify(body) }).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-google-oauth"] });
      toast({ title: "Pengaturan Google OAuth disimpan" });
    },
    onError: () => toast({ title: "Gagal menyimpan Google OAuth", variant: "destructive" }),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      {/* Status cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { icon: Server, label: "Versi", value: data?.version ?? "-" },
          { icon: Clock, label: "Uptime", value: formatUptime(data?.uptimeSeconds ?? 0) },
          { icon: Users2, label: "Total User", value: String(data?.totalUsers ?? 0) },
          { icon: Smartphone, label: "Total Device", value: String(data?.totalDevices ?? 0) },
        ].map(({ icon: Icon, label, value }) => (
          <Card key={label}>
            <CardContent className="p-4 flex flex-col items-center gap-1">
              <Icon className="w-5 h-5 text-primary" />
              <p className="text-lg font-bold">{value}</p>
              <p className="text-xs text-muted-foreground">{label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <form onSubmit={handleSubmit((d) => save.mutate({ ...d, maintenanceMode: maintenance, registrationOpen: regOpen }))}>
        <div className="space-y-4">
          {/* General */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Globe className="w-4 h-4 text-primary" /> Umum
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Nama Aplikasi</Label>
                <Input {...register("appName")} defaultValue={data?.appName} />
              </div>
              <div className="space-y-2">
                <Label>Base URL API</Label>
                <Input {...register("baseUrl")} defaultValue={data?.baseUrl} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Maks. Device/User</Label>
                  <Input type="number" {...register("maxDevicesPerUser", { valueAsNumber: true })} defaultValue={data?.maxDevicesPerUser} />
                </div>
                <div className="space-y-2">
                  <Label>Maks. Pesan/Hari</Label>
                  <Input type="number" {...register("maxMessagesPerDay", { valueAsNumber: true })} defaultValue={data?.maxMessagesPerDay} />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* SMTP */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Mail className="w-4 h-4 text-primary" /> SMTP Email
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2 space-y-2">
                  <Label>SMTP Host</Label>
                  <Input {...register("smtpHost")} defaultValue={data?.smtpHost} placeholder="smtp.gmail.com" />
                </div>
                <div className="space-y-2">
                  <Label>Port</Label>
                  <Input type="number" {...register("smtpPort", { valueAsNumber: true })} defaultValue={data?.smtpPort} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Username</Label>
                  <Input {...register("smtpUser")} defaultValue={data?.smtpUser} placeholder="user@gmail.com" />
                </div>
                <div className="space-y-2">
                  <Label>From Email</Label>
                  <Input {...register("smtpFrom")} defaultValue={data?.smtpFrom} />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Toggles */}
          <Card>
            <CardContent className="p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">Mode Maintenance</p>
                  <p className="text-xs text-muted-foreground">Blokir akses user sementara</p>
                </div>
                <Switch checked={maintenance} onCheckedChange={setMaintenance} />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">Registrasi Terbuka</p>
                  <p className="text-xs text-muted-foreground">Izinkan user baru mendaftar</p>
                </div>
                <Switch checked={regOpen} onCheckedChange={setRegOpen} />
              </div>
            </CardContent>
          </Card>

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={save.isPending} className="gap-2 bg-blue-600 hover:bg-blue-700 text-white">
              {save.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Simpan Pengaturan
            </Button>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <GitBranch className="w-3 h-3" />
              Node {data?.nodeVersion} · {data?.environment}
            </div>
          </div>
        </div>
      </form>
      {/* Google OAuth Settings */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-white border border-border shadow-sm flex items-center justify-center">
                <svg viewBox="0 0 24 24" className="w-5 h-5" xmlns="http://www.w3.org/2000/svg">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
              </div>
              <div>
                <CardTitle className="text-base">Google OAuth (Sign in with Google)</CardTitle>
                <CardDescription className="text-xs mt-0.5">
                  Izinkan user login menggunakan akun Google
                </CardDescription>
              </div>
            </div>
            {googleData?.configured ? (
              <Badge className="gap-1 bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800">
                <CheckCircle2 className="w-3 h-3" /> Aktif
              </Badge>
            ) : (
              <Badge variant="secondary" className="gap-1">
                <XCircle className="w-3 h-3" /> Belum dikonfigurasi
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 text-xs text-blue-700 dark:text-blue-400 space-y-1">
            <p className="font-semibold">Cara mendapatkan Client ID & Secret:</p>
            <ol className="list-decimal list-inside space-y-0.5 text-blue-600 dark:text-blue-400">
              <li>Buka <span className="font-mono bg-blue-100 dark:bg-blue-900 px-1 rounded">console.cloud.google.com</span></li>
              <li>Buat project → API & Services → Credentials</li>
              <li>Create OAuth 2.0 Client ID → Application type: Web</li>
              <li>Tambahkan <span className="font-mono bg-blue-100 dark:bg-blue-900 px-1 rounded">{window.location.origin}</span> ke Authorized origins</li>
            </ol>
          </div>

          <div className="space-y-2">
            <Label>Google Client ID</Label>
            <Input
              value={gClientId}
              onChange={(e) => setGClientId(e.target.value)}
              placeholder="xxxxx.apps.googleusercontent.com"
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">Berakhir dengan <code className="bg-muted px-1 rounded">.apps.googleusercontent.com</code></p>
          </div>

          <div className="space-y-2">
            <Label>Google Client Secret</Label>
            <div className="relative">
              <Input
                type={showSecret ? "text" : "password"}
                value={gClientSecret}
                onChange={(e) => setGClientSecret(e.target.value)}
                placeholder={googleData?.googleClientSecret || "GOCSPX-..."}
                className="pr-10 font-mono text-sm"
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setShowSecret(!showSecret)}
              >
                {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">Kosongkan jika tidak ingin mengubah secret yang sudah tersimpan</p>
          </div>

          <Button
            onClick={() => saveGoogle.mutate({ googleClientId: gClientId, googleClientSecret: gClientSecret })}
            disabled={saveGoogle.isPending || !gClientId}
            className="gap-2"
          >
            {saveGoogle.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            Simpan Google OAuth
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

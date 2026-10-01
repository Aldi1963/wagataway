import { useEffect, useState } from "react";
import { KeyRound, Send, RefreshCw, ShieldCheck, Timer, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dropdown } from "@/components/ui/dropdown";
import { apiGet, apiPost } from "@/lib/api";
import { toast } from "sonner";

interface OtpDevice {
  id: number;
  name: string;
  phone: string;
  status: string;
  isDefault: boolean;
}

interface OtpEntry {
  id: number;
  phone: string;
  status: string;
  attempts: number;
  length: number;
  expiresAt: string;
  createdAt: string;
}

const statusStyle: Record<string, string> = {
  active: "bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30",
  used: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
  invalidated: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30",
  expired: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
};

const statusLabel: Record<string, string> = {
  active: "Aktif",
  used: "Terverifikasi",
  invalidated: "Hangus",
  expired: "Kedaluwarsa",
};

function fmtTime(s: string) {
  try {
    return new Date(s).toLocaleString("id-ID", {
      day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return s;
  }
}

export default function Otp() {
  const [devices, setDevices] = useState<OtpDevice[]>([]);
  const [history, setHistory] = useState<OtpEntry[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  // Form kirim
  const [phone, setPhone] = useState("");
  const [deviceId, setDeviceId] = useState<string>("");
  const [length, setLength] = useState("6");
  const [ttl, setTtl] = useState("5");
  const [template, setTemplate] = useState("");
  const [sending, setSending] = useState(false);
  const [sentInfo, setSentInfo] = useState<{ phone: string; expiresIn: number } | null>(null);

  // Form verifikasi manual
  const [vPhone, setVPhone] = useState("");
  const [vCode, setVCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<{ ok: boolean; message: string } | null>(null);

  const loadDevices = async () => {
    try {
      const r = await apiGet<{ success: boolean; data: OtpDevice[] }>("/api/devices");
      setDevices(r.data ?? []);
    } catch {
      /* abaikan */
    }
  };

  const loadHistory = async () => {
    setLoadingHistory(true);
    try {
      const r = await apiGet<{ success: boolean; data: OtpEntry[] }>("/api/otp/history");
      setHistory(r.data ?? []);
    } catch {
      toast.error("Gagal memuat riwayat OTP");
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    loadDevices();
    loadHistory();
  }, []);

  const handleSend = async () => {
    if (!phone.trim()) {
      toast.error("Nomor telepon wajib diisi");
      return;
    }
    setSending(true);
    setSentInfo(null);
    try {
      const body: Record<string, unknown> = {
        phone: phone.trim(),
        length: parseInt(length, 10),
        ttlMenit: parseInt(ttl, 10),
      };
      if (deviceId) body.deviceId = parseInt(deviceId, 10);
      if (template.trim()) body.template = template.trim();
      const r = await apiPost<{ success: boolean; message: string; phone: string; expiresIn: number }>("/api/otp/send", body);
      setSentInfo({ phone: r.phone, expiresIn: r.expiresIn });
      toast.success(r.message);
      loadHistory();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Gagal mengirim OTP";
      toast.error(msg);
    } finally {
      setSending(false);
    }
  };

  const handleVerify = async () => {
    if (!vPhone.trim() || !vCode.trim()) {
      toast.error("Nomor dan kode wajib diisi");
      return;
    }
    setVerifying(true);
    setVerifyResult(null);
    try {
      const r = await apiPost<{ success: boolean; message: string; attemptsLeft?: number }>("/api/otp/verify", {
        phone: vPhone.trim(),
        code: vCode.trim(),
      });
      let message = r.message;
      if (!r.success && r.attemptsLeft !== undefined && r.attemptsLeft > 0) {
        message += ` Sisa percobaan: ${r.attemptsLeft}.`;
      }
      setVerifyResult({ ok: r.success, message });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Gagal verifikasi";
      setVerifyResult({ ok: false, message: msg });
    } finally {
      setVerifying(false);
      loadHistory();
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
          <KeyRound className="w-6 h-6 text-[#243370]" /> OTP
        </h1>
        <p className="text-sm text-muted-foreground">
          Kirim kode OTP via WhatsApp dan verifikasi — kode hanya disimpan sebagai hash, tidak pernah ditampilkan.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ── Form kirim ── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Send className="w-4 h-4" /> Kirim OTP
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Nomor tujuan</label>
              <Input
                placeholder="62812xxxxxxx"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                inputMode="tel"
                className="mt-1"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Perangkat</label>
                <div className="mt-1">
                  <Dropdown
                    value={deviceId}
                    onChange={setDeviceId}
                    options={[
                      { value: "", label: "Otomatis (terhubung)" },
                      ...devices.map((d) => ({
                        value: String(d.id),
                        label: `${d.name}${d.status === "connected" ? " ✓" : " (offline)"}`,
                      })),
                    ]}
                    ariaLabel="Pilih perangkat"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Panjang kode</label>
                <div className="mt-1">
                  <Dropdown
                    value={length}
                    onChange={setLength}
                    options={["4", "5", "6", "7", "8"].map((v) => ({ value: v, label: `${v} digit` }))}
                    ariaLabel="Panjang kode OTP"
                  />
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Berlaku</label>
                <div className="mt-1">
                  <Dropdown
                    value={ttl}
                    onChange={setTtl}
                    options={[
                      { value: "1", label: "1 menit" },
                      { value: "3", label: "3 menit" },
                      { value: "5", label: "5 menit" },
                      { value: "10", label: "10 menit" },
                      { value: "15", label: "15 menit" },
                      { value: "30", label: "30 menit" },
                    ]}
                    ariaLabel="Masa berlaku OTP"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Template (opsional)</label>
                <Input
                  placeholder="Kode OTP Anda: {code}"
                  value={template}
                  onChange={(e) => setTemplate(e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Gunakan <code className="font-mono bg-secondary px-1 rounded">{"{code}"}</code> sebagai placeholder kode.
              Maksimal 5x kirim per nomor per 10 menit.
            </p>
            <Button onClick={handleSend} disabled={sending} className="w-full gap-2">
              {sending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {sending ? "Mengirim..." : "Kirim OTP"}
            </Button>
            {sentInfo && (
              <div className="flex items-center gap-2 rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-xs text-sky-700 dark:text-sky-300">
                <Timer className="w-4 h-4 shrink-0" />
                OTP terkirim ke {sentInfo.phone}, berlaku {Math.round(sentInfo.expiresIn / 60)} menit.
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Verifikasi manual ── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldCheck className="w-4 h-4" /> Verifikasi Manual
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Nomor telepon</label>
              <Input
                placeholder="62812xxxxxxx"
                value={vPhone}
                onChange={(e) => setVPhone(e.target.value)}
                inputMode="tel"
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Kode OTP</label>
              <Input
                placeholder="••••••"
                value={vCode}
                onChange={(e) => setVCode(e.target.value.replace(/\D/g, ""))}
                inputMode="numeric"
                maxLength={8}
                className="mt-1 font-mono tracking-widest"
              />
            </div>
            <Button onClick={handleVerify} disabled={verifying} variant="tint" className="w-full gap-2">
              {verifying ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
              {verifying ? "Memeriksa..." : "Verifikasi Kode"}
            </Button>
            {verifyResult && (
              <div
                className={
                  verifyResult.ok
                    ? "rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300"
                    : "rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-300"
                }
              >
                {verifyResult.message}
              </div>
            )}
            <p className="text-[11px] text-muted-foreground flex items-start gap-1">
              <Trash2 className="w-3 h-3 mt-0.5 shrink-0" />
              Kode sekali pakai dan hangus setelah 5x tebakan salah.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ── Riwayat ── */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Riwayat OTP</CardTitle>
          <Button variant="ghost" size="sm" className="gap-1 text-xs" onClick={loadHistory} disabled={loadingHistory}>
            <RefreshCw className={`w-3 h-3 ${loadingHistory ? "animate-spin" : ""}`} /> Muat ulang
          </Button>
        </CardHeader>
        <CardContent>
          {loadingHistory ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Memuat...</p>
          ) : history.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Belum ada OTP yang dikirim.</p>
          ) : (
            <div className="overflow-x-auto -mx-1 px-1">
              <table className="w-full text-sm min-w-[560px]">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b border-border">
                    <th className="py-2 pr-3 font-medium">Nomor</th>
                    <th className="py-2 pr-3 font-medium">Status</th>
                    <th className="py-2 pr-3 font-medium">Salah</th>
                    <th className="py-2 pr-3 font-medium">Kedaluwarsa</th>
                    <th className="py-2 font-medium">Dikirim</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h) => (
                    <tr key={h.id} className="border-b border-border/60 last:border-0">
                      <td className="py-2 pr-3 font-mono text-xs">{h.phone}</td>
                      <td className="py-2 pr-3">
                        <Badge variant="outline" className={statusStyle[h.status] ?? ""}>
                          {statusLabel[h.status] ?? h.status}
                        </Badge>
                      </td>
                      <td className="py-2 pr-3">{h.attempts}x</td>
                      <td className="py-2 pr-3 text-xs text-muted-foreground">{fmtTime(h.expiresAt)}</td>
                      <td className="py-2 text-xs text-muted-foreground">{fmtTime(h.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-[11px] text-muted-foreground mt-3">
            Kode OTP tidak pernah ditampilkan di riwayat ini — hanya statusnya.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

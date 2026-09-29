import { useEffect, useState } from "react";
import { toast } from "sonner";
import { X, Smartphone, QrCode, Send, CheckCircle2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiGet, apiPost } from "@/lib/api";

const DONE_KEY = "wg_onboard_done";

/** True bila user sudah pernah menyelesaikan/melewati onboarding. */
export function isOnboardingDone(): boolean {
  try {
    return localStorage.getItem(DONE_KEY) === "1";
  } catch {
    return true;
  }
}

function markDone() {
  try {
    localStorage.setItem(DONE_KEY, "1");
  } catch {
    /* abaikan */
  }
}

interface DeviceItem {
  id: number;
  name: string;
}

const stepLabels = ["Tambah Perangkat", "Pindai QR", "Kirim Pesan Tes"];
const stepIcons = [Smartphone, QrCode, Send];

export default function OnboardingWizard({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(1);

  // Langkah 1
  const [deviceName, setDeviceName] = useState("");
  const [deviceId, setDeviceId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  // Langkah 2
  const [qr, setQr] = useState("");
  const [qrLoading, setQrLoading] = useState(false);
  const [qrError, setQrError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  // Langkah 3
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState(
    "Halo! Ini pesan tes dari WaGataway 👋"
  );
  const [sending, setSending] = useState(false);

  const skip = () => {
    if (step < 3) {
      setStep(step + 1);
    } else {
      markDone();
      onDone();
    }
  };

  const finish = () => {
    markDone();
    onDone();
  };

  /* ── Langkah 1: buat perangkat ─────────────────────────── */
  const createDevice = async () => {
    const name = deviceName.trim();
    if (!name) {
      toast.error("Nama perangkat wajib diisi");
      return;
    }
    setSaving(true);
    try {
      const created = await apiPost<{ device?: DeviceItem; id?: number }>(
        "/devices",
        { name }
      );
      let id = created.device?.id ?? created.id;
      if (!id) {
        const list = await apiGet<{ devices: DeviceItem[] }>("/devices");
        id = (list.devices || []).filter((d) => d.name === name).pop()?.id;
      }
      if (!id) throw new Error("ID perangkat tidak ditemukan, coba lagi");
      setDeviceId(id);
      setStep(2);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal menambah perangkat");
    } finally {
      setSaving(false);
    }
  };

  /* ── Langkah 2: QR + polling status ────────────────────── */
  const startConnect = async (id: number) => {
    setQrLoading(true);
    setQrError(null);
    setQr("");
    try {
      await apiPost(`/devices/${id}/connect`);
      // beri jeda agar sesi sempat membuat QR
      await new Promise((r) => setTimeout(r, 1500));
      const q = await apiGet<{ qr: string }>(`/devices/${id}/qr`);
      if (q.qr) setQr(q.qr);
      else setQrError("QR belum tersedia, coba muat ulang.");
    } catch (e) {
      setQrError(e instanceof Error ? e.message : "Gagal memulai koneksi");
    } finally {
      setQrLoading(false);
    }
  };

  useEffect(() => {
    if (step !== 2 || !deviceId) return;
    startConnect(deviceId);
    const startedAt = Date.now();
    const iv = setInterval(async () => {
      if (Date.now() - startedAt > 90000) {
        clearInterval(iv);
        return;
      }
      try {
        const s = await apiGet<{ status: string }>(
          `/devices/${deviceId}/status`
        );
        if (s.status === "connected") {
          clearInterval(iv);
          toast.success("Perangkat terhubung!");
          setStep(3);
        } else {
          const q = await apiGet<{ qr: string }>(
            `/devices/${deviceId}/qr`
          ).catch(() => null);
          if (q?.qr) setQr((prev) => (prev === q.qr ? prev : q.qr));
        }
      } catch {
        /* abaikan, coba lagi di tick berikutnya */
      }
    }, 3000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, deviceId]);

  const checkConnected = async () => {
    if (!deviceId) return;
    setChecking(true);
    try {
      const s = await apiGet<{ status: string }>(
        `/devices/${deviceId}/status`
      );
      if (s.status === "connected") {
        toast.success("Perangkat terhubung!");
        setStep(3);
      } else {
        toast.error("Perangkat belum terhubung, pindai QR dulu");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal memeriksa status");
    } finally {
      setChecking(false);
    }
  };

  /* ── Langkah 3: kirim pesan tes ─────────────────────────── */
  const sendTest = async () => {
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 9) {
      toast.error("Nomor tujuan tidak valid, gunakan format 62812xxxxxxx");
      return;
    }
    if (!message.trim()) {
      toast.error("Pesan tidak boleh kosong");
      return;
    }
    if (!deviceId) {
      toast.error("Perangkat tidak ditemukan");
      return;
    }
    setSending(true);
    try {
      await apiPost("/chat/send", {
        deviceId,
        phone: digits,
        content: message.trim(),
        type: "text",
      });
      toast.success("Pesan tes terkirim!");
      finish();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal mengirim pesan tes");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" aria-hidden />
      <div className="relative bg-card text-card-foreground rounded-xl border border-border shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto p-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-1">
          <div>
            <h3 className="text-base font-semibold">Selamat datang di WaGataway</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Selesaikan 3 langkah cepat untuk mulai mengirim pesan
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={skip}
            aria-label="Lewati"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Indikator langkah */}
        <div className="flex items-center gap-1 my-5">
          {stepLabels.map((label, i) => {
            const n = i + 1;
            const Icon = stepIcons[i];
            const active = step === n;
            const done = step > n;
            return (
              <div key={label} className="flex-1 flex flex-col items-center gap-1.5">
                <div
                  className={`w-9 h-9 rounded-full flex items-center justify-center border transition-colors ${
                    done
                      ? "bg-emerald-600 border-emerald-600 text-white"
                      : active
                        ? "bg-emerald-600/10 border-emerald-600 text-emerald-600"
                        : "border-border text-muted-foreground"
                  }`}
                >
                  {done ? (
                    <CheckCircle2 className="w-4 h-4" />
                  ) : (
                    <Icon className="w-4 h-4" />
                  )}
                </div>
                <span
                  className={`text-[10px] text-center leading-tight ${
                    active ? "font-semibold text-foreground" : "text-muted-foreground"
                  }`}
                >
                  {label}
                </span>
              </div>
            );
          })}
        </div>

        {/* Isi langkah */}
        {step === 1 && (
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-foreground">
                Nama perangkat
              </label>
              <Input
                className="mt-1"
                placeholder="cth: HP Utama"
                value={deviceName}
                onChange={(e) => setDeviceName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && createDevice()}
              />
              <p className="text-[11px] text-muted-foreground mt-1.5">
                Perangkat adalah nomor WhatsApp yang akan dipakai mengirim pesan.
              </p>
            </div>
            <div className="flex justify-between">
              <Button variant="ghost" size="sm" onClick={skip}>
                Lewati
              </Button>
              <Button size="sm" onClick={createDevice} disabled={saving}>
                {saving ? "Menyimpan..." : "Lanjut"}
              </Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div className="flex flex-col items-center space-y-3">
              {qrLoading && (
                <p className="text-sm text-muted-foreground py-8">
                  Menyiapkan kode QR...
                </p>
              )}
              {!qrLoading && qrError && (
                <>
                  <p className="text-sm text-destructive text-center">{qrError}</p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => deviceId && startConnect(deviceId)}
                    className="gap-1.5"
                  >
                    <RefreshCw className="w-3.5 h-3.5" /> Muat ulang QR
                  </Button>
                </>
              )}
              {!qrLoading && !qrError && qr && (
                <>
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=8&data=${encodeURIComponent(
                      qr
                    )}`}
                    alt="Kode QR WhatsApp"
                    className="w-56 h-56 rounded-lg border border-border"
                  />
                  <p className="text-xs text-muted-foreground text-center">
                    Pindai dengan WhatsApp di HP kamu
                    (Pengaturan → Perangkat tertaut).
                  </p>
                </>
              )}
            </div>
            <div className="flex justify-between">
              <Button variant="ghost" size="sm" onClick={skip}>
                Lewati
              </Button>
              <Button
                size="sm"
                onClick={checkConnected}
                disabled={checking}
              >
                {checking ? "Memeriksa..." : "Sudah terhubung, lanjut"}
              </Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-foreground">
                Nomor tujuan
              </label>
              <Input
                className="mt-1 font-mono"
                placeholder="62812xxxxxxx"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-foreground">
                Pesan
              </label>
              <textarea
                className="mt-1 flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring min-h-[90px] resize-y"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
            </div>
            <div className="flex justify-between">
              <Button variant="ghost" size="sm" onClick={skip}>
                Lewati
              </Button>
              <Button size="sm" onClick={sendTest} disabled={sending}>
                {sending ? "Mengirim..." : "Kirim Pesan Tes"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

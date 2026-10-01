import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/PasswordInput";
import { ShieldCheck, ShieldOff, Copy, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { apiGet, apiPost } from "@/lib/api";
import { cn } from "@/lib/utils";

type Step = "loading" | "off" | "setup" | "show-codes" | "on";

export default function TwoFASettings() {
  const [step, setStep] = useState<Step>("loading");
  const [qr, setQr] = useState("");
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [codes, setCodes] = useState<string[]>([]);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiGet<{ enabled: boolean }>("/2fa/status")
      .then((d) => setStep(d.enabled ? "on" : "off"))
      .catch(() => setStep("off"));
  }, []);

  const startSetup = async () => {
    setBusy(true);
    try {
      const d = await apiPost<{ qr: string; secret: string }>("/2fa/setup");
      setQr(d.qr);
      setSecret(d.secret);
      setCode("");
      setStep("setup");
    } catch (e: any) {
      toast.error(e.message || "Gagal memulai setup 2FA");
    } finally {
      setBusy(false);
    }
  };

  const confirmEnable = async () => {
    if (code.trim().length < 6) {
      toast.error("Masukkan 6 digit kode dari aplikasi authenticator");
      return;
    }
    setBusy(true);
    try {
      const d = await apiPost<{ backup_codes: string[] }>("/2fa/enable", {
        code: code.trim(),
      });
      setCodes(d.backup_codes || []);
      setStep("show-codes");
      toast.success("2FA aktif");
    } catch (e: any) {
      toast.error(e.message || "Kode salah, coba lagi");
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    if (!password || code.trim().length < 6) {
      toast.error("Isi password dan kode 2FA untuk menonaktifkan");
      return;
    }
    setBusy(true);
    try {
      await apiPost("/2fa/disable", { password, code: code.trim() });
      setStep("off");
      setPassword("");
      setCode("");
      toast.success("2FA dinonaktifkan");
    } catch (e: any) {
      toast.error(e.message || "Gagal menonaktifkan 2FA");
    } finally {
      setBusy(false);
    }
  };

  const regenerate = async () => {
    if (code.trim().length < 6) {
      toast.error("Masukkan kode 2FA saat ini dulu");
      return;
    }
    setBusy(true);
    try {
      const d = await apiPost<{ backup_codes: string[] }>(
        "/2fa/backup-codes/regenerate",
        { code: code.trim() }
      );
      setCodes(d.backup_codes || []);
      setCode("");
      setStep("show-codes");
      toast.success("Kode cadangan baru dibuat");
    } catch (e: any) {
      toast.error(e.message || "Gagal membuat kode cadangan");
    } finally {
      setBusy(false);
    }
  };

  const copyText = (t: string, label: string) => {
    navigator.clipboard.writeText(t).then(
      () => toast.success(label + " disalin"),
      () => toast.error("Gagal menyalin")
    );
  };

  if (step === "loading") {
    return <p className="text-sm text-muted-foreground">Memuat status 2FA…</p>;
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-4">
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "w-10 h-10 rounded-full flex items-center justify-center",
            step === "on" || step === "show-codes"
              ? "bg-emerald-100 dark:bg-emerald-900/30"
              : "bg-muted"
          )}
        >
          {step === "on" || step === "show-codes" ? (
            <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <ShieldOff className="w-5 h-5 text-muted-foreground" />
          )}
        </div>
        <div>
          <p className="font-semibold text-sm">Autentikasi Dua Faktor (2FA)</p>
          <p className="text-xs text-muted-foreground">
            {step === "on" || step === "show-codes"
              ? "Aktif — login butuh kode dari aplikasi authenticator."
              : "Belum aktif — akun hanya dilindungi password."}
          </p>
        </div>
      </div>

      {step === "off" && (
        <Button size="sm" onClick={startSetup} disabled={busy}>
          {busy ? "Menyiapkan…" : "Aktifkan 2FA"}
        </Button>
      )}

      {step === "setup" && (
        <div className="space-y-4">
          <ol className="text-sm text-muted-foreground space-y-1.5 list-decimal list-inside">
            <li>Buka aplikasi authenticator (Google Authenticator, Authy, 1Password).</li>
            <li>Pindai QR di bawah atau masukkan secret manual.</li>
            <li>Masukkan 6 digit kode yang muncul, lalu konfirmasi.</li>
          </ol>
          <div className="flex flex-col sm:flex-row gap-4 items-start">
            {qr && (
              <img
                src={qr}
                alt="QR 2FA"
                className="w-40 h-40 rounded-lg border border-border bg-white p-1"
              />
            )}
            <div className="flex-1 w-full space-y-2">
              <label className="text-xs font-medium">Secret (manual)</label>
              <div className="flex gap-2">
                <Input value={secret} readOnly className="font-mono text-xs" />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => copyText(secret, "Secret")}
                >
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
          <div className="space-y-2 max-w-xs">
            <label className="text-xs font-medium">Kode 6 digit</label>
            <Input
              value={code}
              onChange={(e) =>
                setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
              }
              placeholder="123456"
              inputMode="numeric"
              className="font-mono text-center text-lg tracking-[0.3em]"
            />
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={confirmEnable} disabled={busy}>
              {busy ? "Memverifikasi…" : "Konfirmasi & Aktifkan"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setStep("off")}
              disabled={busy}
            >
              Batal
            </Button>
          </div>
        </div>
      )}

      {step === "show-codes" && (
        <div className="space-y-3">
          <p className="text-sm font-medium text-amber-600 dark:text-amber-400">
            Simpan kode cadangan ini di tempat aman. Tiap kode hanya bisa
            dipakai sekali — untuk darurat kalau HP hilang.
          </p>
          <div className="grid grid-cols-2 gap-2 max-w-sm">
            {codes.map((c) => (
              <div
                key={c}
                className="font-mono text-sm text-center rounded-lg border border-border bg-muted/50 px-2 py-1.5"
              >
                {c}
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                copyText(codes.join("\n"), "Kode cadangan")
              }
            >
              <Copy className="w-4 h-4 mr-1" /> Salin semua
            </Button>
            <Button size="sm" onClick={() => setStep("on")}>
              Saya sudah menyimpan
            </Button>
          </div>
        </div>
      )}

      {step === "on" && (
        <div className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-3 max-w-lg">
            <div className="space-y-2">
              <label className="text-xs font-medium">Kode 2FA saat ini</label>
              <Input
                value={code}
                onChange={(e) =>
                  setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                }
                placeholder="123456"
                inputMode="numeric"
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium">Password</label>
              <PasswordInput
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Untuk nonaktifkan"
                autoComplete="current-password"
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={regenerate}
              disabled={busy}
            >
              <RefreshCw className="w-4 h-4 mr-1" />
              Buat ulang kode cadangan
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={disable}
              disabled={busy}
            >
              {busy ? "Memproses…" : "Nonaktifkan 2FA"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

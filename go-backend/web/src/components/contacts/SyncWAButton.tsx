import { useState } from "react";
import { RefreshCw, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { apiGet, apiPost } from "@/lib/api";
import { useLang } from "@/lib/i18n";

interface Device {
  id: number;
  name: string;
  phone: string;
  status: string;
}

interface Props {
  kind: "contacts" | "groups";
  onDone: () => void;
}

/** Tombol "Sync WA": tarik kontak / grup langsung dari perangkat WhatsApp yang terhubung. */
export default function SyncWAButton({ kind, onDone }: Props) {
  const { t } = useLang();
  const [busy, setBusy] = useState(false);
  const [devices, setDevices] = useState<Device[] | null>(null); // null = dialog pilih perangkat tertutup
  const [pickId, setPickId] = useState("");

  const start = async () => {
    try {
      const res = await apiGet<{ devices: Device[] }>("/devices");
      const online = (res.devices || []).filter((d) => d.status === "connected");
      if (online.length === 0) {
        toast.error(t("syncWAButton.errNoDevices"));
        return;
      }
      if (online.length === 1) {
        await doSync(online[0].id);
        return;
      }
      setDevices(online);
      setPickId(String(online[0].id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("syncWAButton.errLoadDevices"));
    }
  };

  const doSync = async (deviceId: number) => {
    setBusy(true);
    try {
      const path = kind === "contacts" ? "/contacts/sync" : "/contact-groups/sync";
      const res = await apiPost<{ message: string }>(path, { deviceId });
      toast.success(res.message || t("syncWAButton.syncDone"));
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("syncWAButton.errSync"));
    } finally {
      setBusy(false);
      setDevices(null);
    }
  };

  return (
    <>
      <Button variant="outline" onClick={start} disabled={busy} className="gap-1.5">
        <RefreshCw className={`w-4 h-4 ${busy ? "animate-spin" : ""}`} />
        {busy ? t("syncWAButton.syncing") : t("syncWAButton.buttonLabel")}
      </Button>

      {devices !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => !busy && setDevices(null)}
        >
          <div
            className="w-full max-w-sm rounded-xl bg-card border border-border p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <h3 className="font-semibold">{t("syncWAButton.dialogTitle")}</h3>
              <p className="text-sm text-muted-foreground mt-1">
                {t("syncWAButton.dialogDesc").replace(
                  "{kind}",
                  kind === "contacts" ? t("syncWAButton.kindContacts") : t("syncWAButton.kindGroups")
                )}
              </p>
            </div>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {devices.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => setPickId(String(d.id))}
                  className={`w-full flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-sm text-left transition-colors ${
                    pickId === String(d.id)
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-secondary/50"
                  }`}
                >
                  <Smartphone className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span className="flex-1 truncate font-medium">{d.name}</span>
                  <span className="text-xs text-muted-foreground shrink-0">{d.phone}</span>
                </button>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDevices(null)} disabled={busy}>
                {t("syncWAButton.cancel")}
              </Button>
              <Button onClick={() => doSync(Number(pickId))} disabled={busy || !pickId}>
                {busy ? t("syncWAButton.syncing") : t("syncWAButton.startSync")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

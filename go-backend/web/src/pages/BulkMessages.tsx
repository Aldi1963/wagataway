import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Send, Upload, Users, UsersRound, Loader2, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dropdown } from "@/components/ui/dropdown";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { apiGet, apiPost } from "@/lib/api";
import { useActiveDevice } from "@/hooks/use-active-device";

interface SimpleContact {
  id: number;
  phone: string;
}

interface SimpleGroup {
  id: number;
  name: string;
  memberCount: number;
}

interface SimpleMember {
  contactId: number;
}

interface Device {
  id: number;
  name: string;
  phone: string;
  status: "connected" | "connecting" | "disconnected";
}

export default function BulkMessages({ embedded = false }: { embedded?: boolean }) {
  const { activeDeviceId } = useActiveDevice();
  const [devices, setDevices] = useState<Device[]>([]);
  const [devicesLoading, setDevicesLoading] = useState(true);
  const [selectedDevices, setSelectedDevices] = useState<number[]>([]);
  const [recipients, setRecipients] = useState("");
  const [message, setMessage] = useState("");
  const [minDelay, setMinDelay] = useState("3");
  const [maxDelay, setMaxDelay] = useState("15");
  const [groups, setGroups] = useState<SimpleGroup[]>([]);
  const [groupsLoaded, setGroupsLoaded] = useState(false);
  const [groupId, setGroupId] = useState("");
  const [loadingNumbers, setLoadingNumbers] = useState(false);
  const [sending, setSending] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      setDevicesLoading(true);
      try {
        const res = await apiGet<{ devices: Device[] }>("/devices");
        const list = res.devices ?? [];
        setDevices(list);
        // Default: device aktif bila connected, kalau tidak semua device yang connected.
        const connected = list.filter((d) => d.status === "connected");
        const preselect =
          activeDeviceId && connected.some((d) => d.id === activeDeviceId)
            ? [activeDeviceId]
            : connected.map((d) => d.id);
        setSelectedDevices(preselect);
      } catch {
        // gagal dimuat — user bisa coba lagi
      } finally {
        setDevicesLoading(false);
      }
    })();
  }, [activeDeviceId]);

  const toggleDevice = (id: number) => {
    setSelectedDevices((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const ensureGroups = async () => {
    if (groupsLoaded) return;
    try {
      const res = await apiGet<{ groups: SimpleGroup[] }>("/contact-groups");
      setGroups(res.groups ?? []);
      setGroupsLoaded(true);
    } catch {
      // gagal dimuat — user bisa coba lagi saat memilih
    }
  };

  const handleLoadContacts = async () => {
    setLoadingNumbers(true);
    try {
      const res = await apiGet<{ contacts: SimpleContact[] }>(
        "/contacts?limit=1000"
      );
      const phones = (res.contacts ?? [])
        .map((c) => (c.phone || "").trim())
        .filter(Boolean);
      if (phones.length === 0) {
        toast.error("Belum ada kontak dengan nomor");
        return;
      }
      setRecipients(phones.join("\n"));
      toast.success(`${phones.length} nomor diambil dari kontak`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal memuat kontak");
    } finally {
      setLoadingNumbers(false);
    }
  };

  const handleLoadGroup = async () => {
    if (!groupId) {
      toast.error("Pilih grup terlebih dahulu");
      return;
    }
    setLoadingNumbers(true);
    try {
      const [mRes, cRes] = await Promise.all([
        apiGet<{ members: SimpleMember[] }>(
          `/contact-groups/${groupId}/members`
        ),
        apiGet<{ contacts: SimpleContact[] }>("/contacts?limit=1000"),
      ]);
      const phoneById = new Map<number, string>(
        (cRes.contacts ?? []).map((c) => [c.id, (c.phone || "").trim()])
      );
      const memberIds = new Set(
        (mRes.members ?? []).map((m) => m.contactId)
      );
      const phones = [...memberIds]
        .map((id) => phoneById.get(id) ?? "")
        .filter(Boolean);
      if (phones.length === 0) {
        toast.error("Grup ini belum punya anggota dengan nomor");
        return;
      }
      setRecipients(phones.join("\n"));
      toast.success(`${phones.length} nomor diambil dari grup`);
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Gagal memuat anggota grup"
      );
    } finally {
      setLoadingNumbers(false);
    }
  };

  const handleImportCsv = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      const phones = text
        .split(/[\r\n,;]+/)
        .map((s) => s.replace(/[^\d+]/g, "").trim())
        .filter((s) => s.length >= 8);
      if (phones.length === 0) {
        toast.error("Tidak ada nomor valid di file CSV");
        return;
      }
      setRecipients(phones.join("\n"));
      toast.success(`${phones.length} nomor diimpor dari CSV`);
    };
    reader.onerror = () => toast.error("Gagal membaca file");
    reader.readAsText(file);
  };

  const handleSend = async () => {
    const phones = recipients
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    const min = parseInt(minDelay, 10);
    const max = parseInt(maxDelay, 10);

    if (selectedDevices.length === 0) {
      toast.error("Pilih minimal satu perangkat pengirim");
      return;
    }
    if (phones.length === 0) {
      toast.error("Isi minimal satu nomor tujuan");
      return;
    }
    if (!message.trim()) {
      toast.error("Isi pesan blast");
      return;
    }
    if (Number.isNaN(min) || Number.isNaN(max) || min < 0 || max < 0 || min > 3600 || max > 3600) {
      toast.error("Jeda harus angka 0–3600 detik");
      return;
    }
    if (max < min) {
      toast.error("Jeda maks tidak boleh lebih kecil dari jeda min");
      return;
    }

    setSending(true);
    try {
      const res = await apiPost<{ message: string; job: { id: number } }>(
        "/messages/send-bulk",
        {
          deviceIds: selectedDevices,
          recipients: phones,
          content: message.trim(),
          minDelay: min,
          maxDelay: max,
        }
      );
      toast.success(
        `Blast dijadwalkan ke ${phones.length} nomor via ${selectedDevices.length} perangkat (job #${res.job?.id})`
      );
      setRecipients("");
      setMessage("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal menjadwalkan blast");
    } finally {
      setSending(false);
    }
  };

  const connectedCount = devices.filter((d) => d.status === "connected").length;

  return (
    <div className="max-w-3xl space-y-6">
      {!embedded && (
        <div>
          <h2 className="text-lg font-semibold text-foreground">Blast Pesan</h2>
          <p className="text-sm text-muted-foreground">Kirim pesan ke banyak nomor sekaligus</p>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Kirim Blast</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-medium text-foreground">
              Perangkat Pengirim <span className="text-muted-foreground font-normal">(bisa pilih lebih dari satu — pesan dibagi rata round-robin)</span>
            </label>
            {devicesLoading ? (
              <p className="text-xs text-muted-foreground">Memuat perangkat…</p>
            ) : devices.length === 0 ? (
              <p className="text-xs text-muted-foreground">Belum ada perangkat. Tambahkan dulu di Dashboard.</p>
            ) : (
              <div className="space-y-1.5">
                {devices.map((d) => {
                  const isConnected = d.status === "connected";
                  const checked = selectedDevices.includes(d.id);
                  return (
                    <label
                      key={d.id}
                      className={`flex items-center gap-3 rounded-lg border border-border px-3 py-2 text-sm ${
                        isConnected ? "cursor-pointer hover:bg-muted/50" : "opacity-50 cursor-not-allowed"
                      } ${checked ? "border-[#243370] bg-[#243370]/5" : ""}`}
                      title={isConnected ? undefined : "Perangkat tidak terhubung — tidak bisa dipilih"}
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 shrink-0 accent-[#243370]"
                        checked={checked}
                        disabled={!isConnected}
                        onChange={() => toggleDevice(d.id)}
                      />
                      <Smartphone className="w-4 h-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{d.name}</span>
                        <span className="block text-xs text-muted-foreground font-mono">{d.phone || "-"}</span>
                      </span>
                      <Badge variant={isConnected ? "success" : "secondary"}>
                        {isConnected ? "Terhubung" : "Terputus"}
                      </Badge>
                    </label>
                  );
                })}
                <p className="text-[10px] text-muted-foreground pt-1">
                  {connectedCount === 0
                    ? "Tidak ada perangkat yang terhubung — hubungkan dulu sebelum blast."
                    : `${selectedDevices.length} perangkat dipilih. Bila satu perangkat terputus di tengah jalan, sisa pesannya otomatis dialihkan ke perangkat lain.`}
                </p>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-foreground">Nomor Tujuan</label>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-[11px] gap-1.5"
                onClick={handleLoadContacts}
                disabled={loadingNumbers}
              >
                <Users className="w-3.5 h-3.5" />
                Ambil dari Kontak
              </Button>
              <Dropdown
                value={groupId}
                onChange={setGroupId}
                onOpen={ensureGroups}
                disabled={loadingNumbers}
                aria-label="Pilih grup"
                className="w-auto min-w-[140px]"
                placeholder="Pilih grup…"
                options={[
                  { value: "", label: "Pilih grup…" },
                  ...groups.map((g) => ({ value: String(g.id), label: `${g.name} (${g.memberCount})` })),
                ]}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-[11px] gap-1.5"
                onClick={handleLoadGroup}
                disabled={loadingNumbers || !groupId}
              >
                <UsersRound className="w-3.5 h-3.5" />
                Ambil dari Grup
              </Button>
            </div>
            <textarea
              className="flex w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring min-h-[100px] resize-y font-mono"
              placeholder="Satu nomor per baris:&#10;628123456789&#10;628987654321&#10;628111222333"
              value={recipients}
              onChange={(e) => setRecipients(e.target.value)}
            />
            <p className="text-[10px] text-muted-foreground">
              {recipients.split("\n").filter(Boolean).length} nomor
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-foreground">Pesan</label>
            <textarea
              className="flex w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring min-h-[100px] resize-y"
              placeholder="Tulis pesan blast..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-foreground">
              Jeda antar pesan <span className="text-muted-foreground font-normal">(acak, detik, berlaku per perangkat)</span>
            </label>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <span className="text-[11px] text-muted-foreground">Min</span>
                <Input value={minDelay} onChange={(e) => setMinDelay(e.target.value)} type="number" min={0} />
              </div>
              <div className="space-y-1">
                <span className="text-[11px] text-muted-foreground">Maks</span>
                <Input value={maxDelay} onChange={(e) => setMaxDelay(e.target.value)} type="number" min={0} />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pt-2">
            <Button className="gap-2" onClick={handleSend} disabled={sending || devicesLoading}>
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {sending ? "Menjadwalkan…" : "Kirim Blast"}
            </Button>
            <Button variant="outline" className="gap-2" onClick={() => fileRef.current?.click()} disabled={loadingNumbers}>
              <Upload className="w-4 h-4" />
              Import CSV
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.txt"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleImportCsv(f);
                e.target.value = "";
              }}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

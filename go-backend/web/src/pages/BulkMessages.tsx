import { useState } from "react";
import { toast } from "sonner";
import { Send, Upload, Users, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dropdown } from "@/components/ui/dropdown";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiGet } from "@/lib/api";

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

export default function BulkMessages({ embedded = false }: { embedded?: boolean }) {
  const [recipients, setRecipients] = useState("");
  const [message, setMessage] = useState("");
  const [minDelay, setMinDelay] = useState("3");
  const [maxDelay, setMaxDelay] = useState("8");
  const [groups, setGroups] = useState<SimpleGroup[]>([]);
  const [groupsLoaded, setGroupsLoaded] = useState(false);
  const [groupId, setGroupId] = useState("");
  const [loadingNumbers, setLoadingNumbers] = useState(false);

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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-medium text-foreground">Delay Min (detik)</label>
              <Input value={minDelay} onChange={(e) => setMinDelay(e.target.value)} type="number" />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-foreground">Delay Max (detik)</label>
              <Input value={maxDelay} onChange={(e) => setMaxDelay(e.target.value)} type="number" />
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <Button className="gap-2">
              <Send className="w-4 h-4" />
              Kirim Blast
            </Button>
            <Button variant="outline" className="gap-2">
              <Upload className="w-4 h-4" />
              Import CSV
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

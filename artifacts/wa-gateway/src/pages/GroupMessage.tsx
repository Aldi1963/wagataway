import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Users,
  Send,
  Loader2,
  RefreshCw,
  CheckCircle2,
  MessageSquare,
  Smartphone,
  ShieldCheck,
  UserCheck,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

export default function GroupMessage() {
  const { toast } = useToast();
  const [deviceId, setDeviceId] = useState("");
  const [groupId, setGroupId] = useState("");
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);

  const { data: devices, isLoading: devicesLoading } = useQuery({
    queryKey: ["devices"],
    queryFn: () => apiFetch("/devices").then((r) => r.json()),
  });

  const connectedDevices = (devices ?? []).filter((d: any) => d.status === "connected");

  const [membersGroupId, setMembersGroupId] = useState("");

  const {
    data: groupsRes,
    isLoading: groupsLoading,
    refetch: refetchGroups,
    isFetching: groupsFetching,
  } = useQuery({
    queryKey: ["wa-groups", deviceId],
    queryFn: () => apiFetch(`/groups?deviceId=${deviceId}`).then((r) => r.json()),
    enabled: !!deviceId,
    staleTime: 30000,
  });
  const groups = groupsRes?.data ?? groupsRes ?? [];

  const {
    data: membersRes,
    isLoading: membersLoading,
    refetch: refetchMembers,
  } = useQuery({
    queryKey: ["wa-group-members", deviceId, membersGroupId],
    queryFn: () => apiFetch(`/groups/${encodeURIComponent(membersGroupId)}/members?deviceId=${deviceId}`).then((r) => r.json()),
    enabled: !!deviceId && !!membersGroupId,
    staleTime: 60000,
  });
  const members = membersRes?.data ?? [];

  const sendMutation = useMutation({
    mutationFn: () =>
      apiFetch("/groups/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId, groupId, message }),
      }).then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.message ?? "Gagal kirim pesan");
        return data;
      }),
    onSuccess: () => {
      setSent(true);
      setMessage("");
      toast({ title: "Pesan berhasil dikirim ke grup" });
      setTimeout(() => setSent(false), 3000);
    },
    onError: (err: any) => {
      toast({ title: err.message ?? "Gagal kirim pesan", variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!deviceId || !groupId || !message.trim()) {
      toast({ title: "Lengkapi semua field", variant: "destructive" });
      return;
    }
    sendMutation.mutate();
  };

  const selectedGroup = (groups ?? []).find((g: any) => g.id === groupId);

  return (
    <div className="max-w-2xl mx-auto space-y-6">

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-primary" />
            Kirim Pesan Grup
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Device picker */}
            <div className="space-y-2">
              <Label>Perangkat</Label>
              {devicesLoading ? (
                <Skeleton className="h-10 w-full" />
              ) : (
                <Select
                  value={deviceId}
                  onValueChange={(v) => {
                    setDeviceId(v);
                    setGroupId("");
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih perangkat WhatsApp" />
                  </SelectTrigger>
                  <SelectContent>
                    {connectedDevices.length === 0 ? (
                      <SelectItem value="_none" disabled>
                        Tidak ada perangkat terhubung
                      </SelectItem>
                    ) : (
                      connectedDevices.map((d: any) => (
                        <SelectItem key={d.id} value={String(d.id)}>
                          <div className="flex items-center gap-2">
                            <Smartphone className="w-3.5 h-3.5 text-green-500" />
                            {d.name}
                            {d.phone && <span className="text-muted-foreground text-xs">({d.phone})</span>}
                          </div>
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Group picker */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Grup WhatsApp</Label>
                {deviceId && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 text-xs"
                    onClick={() => refetchGroups()}
                    disabled={groupsFetching}
                  >
                    <RefreshCw className={`w-3 h-3 ${groupsFetching ? "animate-spin" : ""}`} />
                    Refresh
                  </Button>
                )}
              </div>
              {!deviceId ? (
                <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                  Pilih perangkat dulu untuk memuat daftar grup
                </div>
              ) : groupsLoading || groupsFetching ? (
                <Skeleton className="h-10 w-full" />
              ) : !groups?.length ? (
                <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                  Tidak ada grup ditemukan. Pastikan perangkat terhubung dan memiliki grup.
                </div>
              ) : (
                <Select value={groupId} onValueChange={setGroupId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih grup tujuan" />
                  </SelectTrigger>
                  <SelectContent>
                    {groups.map((g: any) => (
                      <SelectItem key={g.id} value={g.id}>
                        <div className="flex items-center gap-2">
                          <Users className="w-3.5 h-3.5 text-blue-500" />
                          {g.name}
                          <Badge variant="secondary" className="text-xs font-normal">
                            {g.participants} anggota
                          </Badge>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Group info + members */}
            {selectedGroup && (
              <div className="space-y-2">
                <div className="rounded-lg bg-muted/50 border px-4 py-3 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                    <Users className="w-4 h-4 text-blue-500" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{selectedGroup.name}</p>
                    <p className="text-xs text-muted-foreground">{selectedGroup.participants} anggota</p>
                  </div>
                  <Button
                    type="button" variant="outline" size="sm" className="h-7 text-xs gap-1"
                    onClick={() => {
                      setMembersGroupId(membersGroupId === selectedGroup.id ? "" : selectedGroup.id);
                    }}
                  >
                    <UserCheck className="w-3 h-3" />
                    {membersGroupId === selectedGroup.id ? "Tutup" : "Lihat Anggota"}
                  </Button>
                </div>
                {membersGroupId === selectedGroup.id && (
                  <div className="rounded-lg border bg-muted/20 p-3 space-y-1 max-h-48 overflow-y-auto">
                    {membersLoading ? (
                      <p className="text-xs text-muted-foreground text-center py-2">Memuat anggota...</p>
                    ) : members.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-2">Tidak ada anggota</p>
                    ) : (
                      members.map((m: any, i: number) => (
                        <div key={i} className="flex items-center gap-2 text-xs py-0.5">
                          {m.isAdmin ? (
                            <ShieldCheck className="w-3 h-3 text-green-500 flex-shrink-0" />
                          ) : (
                            <UserCheck className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                          )}
                          <span className="font-mono">{m.phone}</span>
                          {m.isAdmin && <Badge variant="secondary" className="text-xs font-normal h-4">Admin</Badge>}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Message */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Pesan</Label>
                <span className="text-xs text-muted-foreground">{message.length} karakter</span>
              </div>
              <Textarea
                placeholder="Ketik pesan yang akan dikirim ke grup..."
                rows={5}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Gunakan *bold*, _italic_, ~strikethrough~ untuk format teks
              </p>
            </div>

            <Button
              type="submit"
              className="w-full gap-2"
              disabled={sendMutation.isPending || !deviceId || !groupId || !message.trim()}
            >
              {sendMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : sent ? (
                <CheckCircle2 className="w-4 h-4" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              {sendMutation.isPending ? "Mengirim..." : sent ? "Terkirim!" : "Kirim ke Grup"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Tips */}
      <Card className="bg-muted/30">
        <CardContent className="pt-4 pb-4">
          <p className="text-xs text-muted-foreground font-medium mb-2">Tips Kirim ke Grup:</p>
          <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
            <li>Pastikan nomor WhatsApp Anda adalah admin atau anggota grup</li>
            <li>Gunakan fitur ini secukupnya untuk menghindari pembatasan dari WhatsApp</li>
            <li>Pesan akan terlihat sebagai pesan biasa dari nomor Anda di grup</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

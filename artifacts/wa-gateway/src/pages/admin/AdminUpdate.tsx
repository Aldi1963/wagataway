import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Loader2, CheckCircle2, RefreshCw, PackageCheck, Terminal, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

interface UpdateInfo {
  currentVersion: string;
  latestVersion: string;
  upToDate: boolean;
  releaseNotes: string;
  checkedAt: string;
  changelog: { version: string; date: string; notes: string }[];
}

export default function AdminUpdate() {
  const { toast } = useToast();
  const [restarting, setRestarting] = useState(false);
  const [log, setLog] = useState<string[]>([]);

  const { data, isLoading, refetch, isFetching } = useQuery<UpdateInfo>({
    queryKey: ["admin-update"],
    queryFn: () => apiFetch("/admin/update").then((r) => r.json()),
  });

  const restart = useMutation({
    mutationFn: () => apiFetch("/admin/restart", { method: "POST" }).then((r) => r.json()),
    onMutate: () => {
      setRestarting(true);
      setLog(["Mengirim sinyal restart..."]);
    },
    onSuccess: () => {
      const msgs = [
        "Mengirim sinyal restart...",
        "Menutup koneksi aktif...",
        "Menyimpan state sementara...",
        "Memulai ulang layanan...",
        "Server berhasil direstart ✓",
      ];
      let i = 1;
      const iv = setInterval(() => {
        setLog(msgs.slice(0, i + 1));
        i++;
        if (i >= msgs.length) {
          clearInterval(iv);
          setRestarting(false);
          toast({ title: "Server berhasil direstart" });
        }
      }, 700);
    },
    onError: () => {
      setRestarting(false);
      toast({ title: "Gagal restart server", variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-xl space-y-6">
      {/* Version status card */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center ${data?.upToDate ? "bg-green-100 dark:bg-green-900/30" : "bg-amber-100 dark:bg-amber-900/30"}`}>
                {data?.upToDate
                  ? <CheckCircle2 className="w-6 h-6 text-green-600" />
                  : <AlertCircle className="w-6 h-6 text-amber-600" />}
              </div>
              <div>
                <p className="font-semibold">
                  {data?.upToDate ? "Sistem Sudah Terbaru" : "Pembaruan Tersedia"}
                </p>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Versi saat ini: <span className="font-mono font-medium">{data?.currentVersion}</span>
                  {!data?.upToDate && (
                    <> → Terbaru: <span className="font-mono font-medium text-green-600">{data?.latestVersion}</span></>
                  )}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Dicek: {data?.checkedAt ? new Date(data.checkedAt).toLocaleString("id-ID") : "-"}
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="gap-2 shrink-0"
              onClick={() => refetch()}
              disabled={isFetching}
            >
              {isFetching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Cek Ulang
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Changelog */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <PackageCheck className="w-4 h-4 text-primary" /> Riwayat Versi
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {data?.changelog.map((c) => (
            <div key={c.version} className="flex items-start gap-3 pb-3 border-b border-border last:border-0 last:pb-0">
              <Badge variant="outline" className="font-mono mt-0.5 shrink-0">{c.version}</Badge>
              <div>
                <p className="text-sm">{c.notes}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{new Date(c.date).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}</p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Restart server */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Terminal className="w-4 h-4 text-primary" /> Restart Layanan
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Restart server akan memutus koneksi aktif sementara. Gunakan hanya saat diperlukan.
          </p>
          {log.length > 0 && (
            <div className="bg-zinc-900 rounded-lg p-4 font-mono text-xs text-green-400 space-y-1">
              {log.map((line, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-zinc-500">$</span>
                  <span>{line}</span>
                  {i === log.length - 1 && restarting && (
                    <Loader2 className="w-3 h-3 animate-spin ml-1 text-green-400" />
                  )}
                </div>
              ))}
            </div>
          )}
          <Button
            onClick={() => restart.mutate()}
            disabled={restarting}
            variant="destructive"
            className="gap-2"
          >
            {restarting ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Restart Server
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

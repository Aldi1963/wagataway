import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  BarChart3,
  Send,
  Eye,
  X,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiGet, apiPost } from "@/lib/api";
import { cn } from "@/lib/utils";

interface PollOptionResult {
  text: string;
  votes: number;
}

interface PollResult {
  id: number;
  question: string;
  options: PollOptionResult[];
  totalVotes: number;
  totalVoters: number;
  isClosed: boolean;
  isGroup: boolean;
  to: string;
  deviceId: number;
  messageId: string;
  sentAt: string | null;
}

interface Device {
  id: number;
  name: string;
  phone: string;
}

function formatDate(iso: string | null) {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className={cn(
          "relative bg-card text-card-foreground border border-border rounded-xl w-full max-h-[90vh] overflow-y-auto shadow-xl",
          wide ? "max-w-2xl" : "max-w-lg"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-border sticky top-0 bg-card rounded-t-xl z-10">
          <h3 className="font-semibold">{title}</h3>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose} aria-label="Tutup">
            <X className="w-4 h-4" />
          </Button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

function ResultBars({ poll }: { poll: PollResult }) {
  const max = Math.max(1, ...poll.options.map((o) => o.votes));
  return (
    <div className="space-y-3">
      {poll.options.map((opt, i) => {
        const pct = poll.totalVotes > 0 ? Math.round((opt.votes / poll.totalVotes) * 100) : 0;
        return (
          <div key={i}>
            <div className="flex items-center justify-between text-sm mb-1">
              <span className="font-medium truncate mr-2">
                {i + 1}. {opt.text}
              </span>
              <span className="text-muted-foreground whitespace-nowrap">
                {opt.votes} suara ({pct}%)
              </span>
            </div>
            <div className="h-2.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-[#243370] transition-all"
                style={{ width: `${Math.round((opt.votes / max) * 100)}%` }}
              />
            </div>
          </div>
        );
      })}
      <p className="text-xs text-muted-foreground pt-1">
        🗳️ Total {poll.totalVotes} suara dari {poll.totalVoters} pemilih
      </p>
    </div>
  );
}

const PAGE_SIZE = 20;

/** Tab "Polling" di hub Kirim Pesan: daftar poll + hasil + kirim rekap. */
export default function Polls({ embedded = false }: { embedded?: boolean }) {
  const [rows, setRows] = useState<PollResult[]>([]);
  const [devices, setDevices] = useState<Record<number, string>>({});
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [viewing, setViewing] = useState<PollResult | null>(null);
  const [recapping, setRecapping] = useState<PollResult | null>(null);
  const [recapTo, setRecapTo] = useState("");
  const [sendingRecap, setSendingRecap] = useState(false);
  const [closing, setClosing] = useState<number | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const load = async (p: number) => {
    setLoading(true);
    try {
      const [pl, d] = await Promise.all([
        apiGet<{ data: { polls: PollResult[]; total: number } }>(
          `/polls?page=${p}&limit=${PAGE_SIZE}`
        ),
        apiGet<{ devices: Device[] }>("/devices"),
      ]);
      setRows(pl.data.polls ?? []);
      setTotal(pl.data.total ?? 0);
      const map: Record<number, string> = {};
      for (const dev of d.devices ?? []) map[dev.id] = dev.phone || dev.name || `#${dev.id}`;
      setDevices(map);
      setPage(p);
    } catch (e: any) {
      toast.error(e.message || "Gagal memuat daftar polling");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(1);
  }, []);

  const openResults = async (id: number) => {
    try {
      const res = await apiGet<{ data: PollResult }>(`/polls/${id}/results`);
      setViewing(res.data);
    } catch (e: any) {
      toast.error(e.message || "Gagal memuat hasil polling");
    }
  };

  const sendRecap = async () => {
    if (!recapping || !recapTo.trim()) {
      toast.error("Isi nomor/grup tujuan rekap");
      return;
    }
    setSendingRecap(true);
    try {
      await apiPost(`/polls/${recapping.id}/recap`, { to: recapTo.trim() });
      toast.success("Rekap hasil polling terkirim");
      setRecapping(null);
      setRecapTo("");
    } catch (e: any) {
      toast.error(e.message || "Gagal mengirim rekap");
    } finally {
      setSendingRecap(false);
    }
  };

  const closePoll = async (id: number) => {
    setClosing(id);
    try {
      await apiPost(`/polls/${id}/close`);
      toast.success("Polling ditutup");
      if (viewing?.id === id) openResults(id);
      load(page);
    } catch (e: any) {
      toast.error(e.message || "Gagal menutup polling");
    } finally {
      setClosing(null);
    }
  };

  return (
    <div className={cn(!embedded && "space-y-4 sm:space-y-6")}>
      {!embedded && (
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Polling</h1>
          <p className="text-sm text-muted-foreground">
            Hasil voting polling yang dikirim lewat API, plus kirim rekap otomatis
          </p>
        </div>
      )}

      <Card>
        {!embedded && (
          <CardHeader>
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <BarChart3 className="w-4 h-4" /> Riwayat Polling
            </CardTitle>
          </CardHeader>
        )}
        <CardContent className={cn(embedded && "pt-4")}>
          {loading ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Memuat…</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              Belum ada polling. Kirim polling dari tab Kirim (tipe pesan: Polling).
            </p>
          ) : (
            <>
              <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
                <table className="w-full text-sm min-w-[640px]">
                  <thead>
                    <tr className="text-left text-muted-foreground border-b border-border">
                      <th className="py-2 pr-3 font-medium">Pertanyaan</th>
                      <th className="py-2 pr-3 font-medium">Tujuan</th>
                      <th className="py-2 pr-3 font-medium">Suara</th>
                      <th className="py-2 pr-3 font-medium">Status</th>
                      <th className="py-2 pr-3 font-medium">Dikirim</th>
                      <th className="py-2 font-medium text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((p) => (
                      <tr key={p.id} className="border-b border-border last:border-0">
                        <td className="py-2.5 pr-3 max-w-[240px]">
                          <div className="font-medium truncate">{p.question}</div>
                          <div className="text-xs text-muted-foreground">
                            {p.options.length} opsi{p.isGroup ? " • grup" : ""}
                          </div>
                        </td>
                        <td className="py-2.5 pr-3 whitespace-nowrap">
                          <div className="truncate max-w-[140px]">{p.to || "-"}</div>
                          <div className="text-xs text-muted-foreground">
                            {devices[p.deviceId] ?? `#${p.deviceId}`}
                          </div>
                        </td>
                        <td className="py-2.5 pr-3 whitespace-nowrap">
                          {p.totalVotes} suara
                          <div className="text-xs text-muted-foreground">
                            {p.totalVoters} pemilih
                          </div>
                        </td>
                        <td className="py-2.5 pr-3">
                          {p.isClosed ? (
                            <Badge variant="secondary">Ditutup</Badge>
                          ) : p.messageId ? (
                            <Badge variant="default">Aktif</Badge>
                          ) : (
                            <Badge variant="secondary">Mengirim…</Badge>
                          )}
                        </td>
                        <td className="py-2.5 pr-3 whitespace-nowrap text-muted-foreground">
                          {formatDate(p.sentAt)}
                        </td>
                        <td className="py-2.5 text-right whitespace-nowrap">
                          <Button
                            variant="tint"
                            size="sm"
                            className="mr-1.5"
                            onClick={() => openResults(p.id)}
                          >
                            <Eye className="w-3.5 h-3.5 mr-1" /> Hasil
                          </Button>
                          <Button
                            variant="default"
                            size="sm"
                            onClick={() => {
                              setRecapping(p);
                              setRecapTo(p.to || "");
                            }}
                          >
                            <Send className="w-3.5 h-3.5 mr-1" /> Rekap
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between pt-3">
                <p className="text-xs text-muted-foreground">
                  Halaman {page} dari {totalPages} • {total} polling
                </p>
                <div className="flex gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => load(page - 1)}
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages}
                    onClick={() => load(page + 1)}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {viewing && (
        <Modal wide title="Hasil Polling" onClose={() => setViewing(null)}>
          <div className="space-y-4">
            <div>
              <p className="font-semibold">{viewing.question}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {viewing.isClosed ? (
                  <Badge variant="secondary" className="mr-1.5">Ditutup</Badge>
                ) : (
                  <Badge variant="default" className="mr-1.5">Aktif</Badge>
                )}
                Tujuan: {viewing.to || "-"} • {devices[viewing.deviceId] ?? `#${viewing.deviceId}`}
              </p>
            </div>
            <ResultBars poll={viewing} />
            {!viewing.isClosed && (
              <Button
                variant="outline"
                size="sm"
                disabled={closing === viewing.id}
                onClick={() => closePoll(viewing.id)}
              >
                <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                {closing === viewing.id ? "Menutup…" : "Tutup polling"}
              </Button>
            )}
          </div>
        </Modal>
      )}

      {recapping && (
        <Modal title="Kirim Rekap Hasil" onClose={() => setRecapping(null)}>
          <div className="space-y-4">
            <p className="text-sm">
              Ringkasan hasil <span className="font-semibold">“{recapping.question}”</span> akan
              dikirim sebagai pesan teks via perangkat yang sama.
            </p>
            <div className="rounded-lg bg-muted p-3">
              <ResultBars poll={recapping} />
            </div>
            <div>
              <label className="text-sm font-medium block mb-1.5">
                Tujuan (nomor / JID grup)
              </label>
              <Input
                value={recapTo}
                onChange={(e) => setRecapTo(e.target.value)}
                placeholder="6281234567890 atau <id>@g.us"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setRecapping(null)}>
                Batal
              </Button>
              <Button onClick={sendRecap} disabled={sendingRecap}>
                <Send className="w-3.5 h-3.5 mr-1.5" />
                {sendingRecap ? "Mengirim…" : "Kirim rekap"}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

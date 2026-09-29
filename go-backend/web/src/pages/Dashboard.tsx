import { useEffect, useState } from "react";
import { Smartphone, Send, Users, BarChart3, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { apiGet } from "@/lib/api";

interface Overview {
  totalMessages: number;
  todayMessages: number;
  sentMessages: number;
  failedMessages: number;
  totalContacts: number;
  activeDevices: number;
  deliveryRate: number;
}

interface Message {
  id: number;
  to: string;
  content: string;
  status: string;
  createdAt: string;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "baru saja";
  if (mins < 60) return mins + " menit lalu";
  const hours = Math.floor(mins / 60);
  if (hours < 24) return hours + " jam lalu";
  const days = Math.floor(hours / 24);
  return days + " hari lalu";
}

const statusLabel: Record<string, string> = {
  pending: "Menunggu",
  sent: "Terkirim",
  delivered: "Sampai",
  read: "Dibaca",
  failed: "Gagal",
};

export default function Dashboard() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    Promise.all([
      apiGet<Overview>("/analytics/overview"),
      apiGet<{ messages: Message[] }>("/messages"),
    ])
      .then(([ov, msgRes]) => {
        setOverview(ov);
        setMessages((msgRes.messages || []).slice(0, 5));
      })
      .catch((e) => setError(e.message || "Gagal memuat data"))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const stats = overview
    ? [
        {
          label: "Perangkat Aktif",
          value: String(overview.activeDevices),
          icon: Smartphone,
        },
        {
          label: "Pesan Hari Ini",
          value: overview.todayMessages.toLocaleString("id-ID"),
          icon: Send,
        },
        {
          label: "Total Kontak",
          value: overview.totalContacts.toLocaleString("id-ID"),
          icon: Users,
        },
        {
          label: "Tingkat Terkirim",
          value: Number(overview.deliveryRate).toFixed(1) + "%",
          icon: BarChart3,
        },
      ]
    : [];

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {loading
          ? [0, 1, 2, 3].map((i) => (
              <Card key={i}>
                <CardContent className="p-5">
                  <div className="h-4 w-4 rounded bg-muted animate-pulse" />
                  <div className="mt-3 h-8 w-20 rounded bg-muted animate-pulse" />
                  <div className="mt-2 h-3 w-24 rounded bg-muted animate-pulse" />
                </CardContent>
              </Card>
            ))
          : stats.map((stat) => (
              <Card key={stat.label}>
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <stat.icon className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div className="mt-3">
                    <p className="text-2xl font-bold text-foreground tracking-tight">
                      {stat.value}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {stat.label}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
      </div>

      {/* Error */}
      {error && !loading && (
        <Card className="border-destructive/50">
          <CardContent className="p-5 flex items-center justify-between">
            <p className="text-sm text-destructive">{error}</p>
            <Button variant="outline" size="sm" onClick={load} className="gap-1.5">
              <RefreshCw className="w-3.5 h-3.5" /> Coba lagi
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Recent Messages */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">
            Pesan Terakhir
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-center gap-3 py-2">
                  <div className="w-8 h-8 rounded-full bg-muted animate-pulse shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 w-32 rounded bg-muted animate-pulse" />
                    <div className="h-3 w-full rounded bg-muted animate-pulse" />
                  </div>
                </div>
              ))}
            </div>
          ) : messages.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              Belum ada pesan. Kirim pesan pertama dari menu Kirim Pesan.
            </p>
          ) : (
            <div className="space-y-0">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className="flex items-center justify-between py-3 border-b border-border last:border-0"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center shrink-0">
                      <Send className="w-3.5 h-3.5 text-muted-foreground" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground font-mono">
                        {msg.to}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {msg.content}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 ml-4">
                    <StatusDot status={msg.status} />
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {timeAgo(msg.createdAt)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    sent: "bg-foreground",
    delivered: "bg-foreground",
    read: "bg-foreground",
    failed: "bg-destructive",
    pending: "bg-muted-foreground",
  };

  return (
    <div className="flex items-center gap-1.5">
      <div className={`w-1.5 h-1.5 rounded-full ${colors[status] || colors.pending}`} />
      <span className="text-[10px] text-muted-foreground">
        {statusLabel[status] || status}
      </span>
    </div>
  );
}

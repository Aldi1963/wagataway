import {
  Smartphone,
  Send,
  Users,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const stats = [
  {
    label: "Perangkat Aktif",
    value: "3",
    change: "+1",
    up: true,
    icon: Smartphone,
  },
  {
    label: "Pesan Hari Ini",
    value: "1,247",
    change: "+18%",
    up: true,
    icon: Send,
  },
  {
    label: "Total Kontak",
    value: "4,891",
    change: "+124",
    up: true,
    icon: Users,
  },
  {
    label: "Tingkat Terkirim",
    value: "98.5%",
    change: "-0.2%",
    up: false,
    icon: BarChart3,
  },
];

const recentMessages = [
  { to: "628123456789", status: "sent", time: "2 menit lalu", content: "Halo, pesanan Anda..." },
  { to: "628987654321", status: "delivered", time: "5 menit lalu", content: "Terima kasih telah..." },
  { to: "628111222333", status: "failed", time: "8 menit lalu", content: "Promo spesial untuk..." },
  { to: "628444555666", status: "sent", time: "12 menit lalu", content: "Konfirmasi pembayaran..." },
];

export default function Dashboard() {
  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <stat.icon className="w-4 h-4 text-muted-foreground" />
                <div
                  className={`flex items-center gap-0.5 text-xs font-medium ${
                    stat.up ? "text-foreground" : "text-destructive"
                  }`}
                >
                  {stat.up ? (
                    <ArrowUpRight className="w-3 h-3" />
                  ) : (
                    <ArrowDownRight className="w-3 h-3" />
                  )}
                  {stat.change}
                </div>
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

      {/* Recent Messages */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">
            Pesan Terakhir
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-0">
            {recentMessages.map((msg, i) => (
              <div
                key={i}
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
                    {msg.time}
                  </span>
                </div>
              </div>
            ))}
          </div>
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
      <span className="text-[10px] text-muted-foreground capitalize">{status}</span>
    </div>
  );
}

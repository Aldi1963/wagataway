import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const weeklyData = [
  { day: "Sen", sent: 182, delivered: 178, failed: 4 },
  { day: "Sel", sent: 213, delivered: 209, failed: 4 },
  { day: "Rab", sent: 195, delivered: 192, failed: 3 },
  { day: "Kam", sent: 267, delivered: 261, failed: 6 },
  { day: "Jum", sent: 234, delivered: 230, failed: 4 },
  { day: "Sab", sent: 89, delivered: 87, failed: 2 },
  { day: "Min", sent: 56, delivered: 55, failed: 1 },
];

export default function Analytics() {
  const totalSent = weeklyData.reduce((a, b) => a + b.sent, 0);
  const totalDelivered = weeklyData.reduce((a, b) => a + b.delivered, 0);
  const totalFailed = weeklyData.reduce((a, b) => a + b.failed, 0);
  const maxSent = Math.max(...weeklyData.map((d) => d.sent));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Analytics</h2>
        <p className="text-sm text-muted-foreground">
          Ringkasan pengiriman pesan 7 hari terakhir
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground">Total Terkirim</p>
            <p className="text-2xl font-bold text-foreground mt-1">{totalSent}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground">Diterima</p>
            <p className="text-2xl font-bold text-foreground mt-1">{totalDelivered}</p>
            <Badge variant="secondary" className="mt-1 text-[10px]">
              {((totalDelivered / totalSent) * 100).toFixed(1)}%
            </Badge>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground">Gagal</p>
            <p className="text-2xl font-bold text-destructive mt-1">{totalFailed}</p>
            <Badge variant="outline" className="mt-1 text-[10px]">
              {((totalFailed / totalSent) * 100).toFixed(1)}%
            </Badge>
          </CardContent>
        </Card>
      </div>

      {/* Simple bar chart (pure CSS, no library) */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">
            Pesan per Hari
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-3 h-40">
            {weeklyData.map((d) => (
              <div key={d.day} className="flex-1 flex flex-col items-center gap-2">
                <div className="w-full flex flex-col items-center gap-0.5">
                  <span className="text-[10px] text-muted-foreground">
                    {d.sent}
                  </span>
                  <div
                    className="w-full bg-foreground rounded-sm min-h-[4px]"
                    style={{ height: `${(d.sent / maxSent) * 100}%` }}
                  />
                </div>
                <span className="text-[10px] text-muted-foreground font-medium">
                  {d.day}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

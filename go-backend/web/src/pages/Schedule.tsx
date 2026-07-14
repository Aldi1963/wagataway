import { useState } from "react";
import { Plus, Clock, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface ScheduleItem {
  id: number;
  to: string;
  content: string;
  sendAt: string;
  status: "pending" | "sent" | "failed" | "cancelled";
}

const mockSchedules: ScheduleItem[] = [
  { id: 1, to: "628123456789", content: "Reminder: Meeting jam 10 pagi besok", sendAt: "2026-07-15T10:00:00", status: "pending" },
  { id: 2, to: "628987654321", content: "Invoice bulan Juli sudah terbit", sendAt: "2026-07-14T08:00:00", status: "sent" },
  { id: 3, to: "628111222333", content: "Follow up proposal", sendAt: "2026-07-16T14:00:00", status: "pending" },
];

export default function Schedule() {
  const [schedules] = useState<ScheduleItem[]>(mockSchedules);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Jadwal Pesan</h2>
          <p className="text-sm text-muted-foreground">Kirim pesan di waktu tertentu</p>
        </div>
        <Button size="sm" className="gap-1.5">
          <Plus className="w-3.5 h-3.5" />
          Jadwalkan Baru
        </Button>
      </div>

      <div className="space-y-3">
        {schedules.map((item) => (
          <Card key={item.id}>
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-md bg-secondary flex items-center justify-center">
                  <Clock className="w-4 h-4 text-foreground" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">{item.content}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-muted-foreground font-mono">{item.to}</span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(item.sendAt).toLocaleString("id-ID")}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={item.status === "sent" ? "default" : item.status === "pending" ? "outline" : "destructive"} className="text-[10px]">
                  {item.status}
                </Badge>
                {item.status === "pending" && (
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive">
                    <X className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

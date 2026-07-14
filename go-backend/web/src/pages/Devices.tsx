import { useState } from "react";
import { Smartphone, Plus, Wifi, WifiOff, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface Device {
  id: number;
  name: string;
  phone: string;
  status: "connected" | "disconnected" | "connecting";
  lastSeen: string;
}

const mockDevices: Device[] = [
  { id: 1, name: "HP Utama", phone: "628123456789", status: "connected", lastSeen: "Sekarang" },
  { id: 2, name: "CS Device", phone: "628987654321", status: "disconnected", lastSeen: "2 jam lalu" },
  { id: 3, name: "Marketing", phone: "628111222333", status: "connecting", lastSeen: "5 menit lalu" },
];

export default function Devices() {
  const [devices] = useState<Device[]>(mockDevices);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Perangkat</h2>
          <p className="text-sm text-muted-foreground">
            Kelola perangkat WhatsApp yang terhubung
          </p>
        </div>
        <Button size="sm" className="gap-1.5">
          <Plus className="w-3.5 h-3.5" />
          Tambah Perangkat
        </Button>
      </div>

      {/* Device Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {devices.map((device) => (
          <Card key={device.id}>
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg border border-border flex items-center justify-center">
                    <Smartphone className="w-5 h-5 text-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {device.name}
                    </p>
                    <p className="text-xs text-muted-foreground font-mono">
                      {device.phone}
                    </p>
                  </div>
                </div>
                <Button variant="ghost" size="icon" className="h-7 w-7">
                  <MoreHorizontal className="w-4 h-4" />
                </Button>
              </div>

              <div className="mt-4 flex items-center justify-between">
                <Badge
                  variant={device.status === "connected" ? "default" : "outline"}
                  className="gap-1"
                >
                  {device.status === "connected" ? (
                    <Wifi className="w-3 h-3" />
                  ) : (
                    <WifiOff className="w-3 h-3" />
                  )}
                  {device.status === "connected"
                    ? "Terhubung"
                    : device.status === "connecting"
                    ? "Menghubungkan..."
                    : "Terputus"}
                </Badge>
                <span className="text-[10px] text-muted-foreground">
                  {device.lastSeen}
                </span>
              </div>

              <div className="mt-4 flex gap-2">
                {device.status === "disconnected" ? (
                  <Button variant="outline" size="sm" className="flex-1 text-xs">
                    Hubungkan
                  </Button>
                ) : device.status === "connected" ? (
                  <Button variant="outline" size="sm" className="flex-1 text-xs">
                    Putuskan
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" className="flex-1 text-xs" disabled>
                    Menunggu...
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

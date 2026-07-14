import { Plus, Users, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const mockGroups = [
  { id: 1, name: "Pelanggan VIP", memberCount: 45, color: "#000" },
  { id: 2, name: "Supplier", memberCount: 12, color: "#666" },
  { id: 3, name: "Tim Internal", memberCount: 8, color: "#999" },
];

export default function ContactGroups() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            Grup Kontak
          </h2>
          <p className="text-sm text-muted-foreground">
            Kelompokkan kontak untuk blast pesan
          </p>
        </div>
        <Button size="sm" className="gap-1.5">
          <Plus className="w-3.5 h-3.5" />
          Buat Grup
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {mockGroups.map((group) => (
          <Card key={group.id}>
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center">
                    <Users className="w-5 h-5 text-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {group.name}
                    </p>
                    <Badge variant="outline" className="text-[10px] mt-1">
                      {group.memberCount} anggota
                    </Badge>
                  </div>
                </div>
                <Button variant="ghost" size="icon" className="h-7 w-7">
                  <MoreHorizontal className="w-4 h-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

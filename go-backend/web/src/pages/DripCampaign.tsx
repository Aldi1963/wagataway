import { useState } from "react";
import { Plus, Zap, Users, Clock, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface Campaign {
  id: number;
  name: string;
  description: string;
  isActive: boolean;
  enrolled: number;
  steps: number;
}

const mockCampaigns: Campaign[] = [
  { id: 1, name: "Onboarding Pelanggan Baru", description: "Welcome series 5 hari", isActive: true, enrolled: 234, steps: 5 },
  { id: 2, name: "Follow Up Abandoned Cart", description: "Reminder checkout 3 tahap", isActive: true, enrolled: 89, steps: 3 },
  { id: 3, name: "Re-engagement", description: "Pelanggan inactive 30 hari", isActive: false, enrolled: 45, steps: 2 },
];

export default function DripCampaign() {
  const [campaigns] = useState<Campaign[]>(mockCampaigns);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Drip Campaign</h2>
          <p className="text-sm text-muted-foreground">Kirim pesan bertahap secara otomatis</p>
        </div>
        <Button size="sm" className="gap-1.5">
          <Plus className="w-3.5 h-3.5" />
          Buat Campaign
        </Button>
      </div>

      <div className="space-y-3">
        {campaigns.map((campaign) => (
          <Card key={campaign.id}>
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center">
                    <Zap className="w-5 h-5 text-foreground" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-foreground">{campaign.name}</p>
                      <Badge variant={campaign.isActive ? "default" : "outline"} className="text-[10px]">
                        {campaign.isActive ? "Aktif" : "Paused"}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{campaign.description}</p>
                    <div className="flex items-center gap-4 mt-2">
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Users className="w-3 h-3" /> {campaign.enrolled} enrolled
                      </span>
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="w-3 h-3" /> {campaign.steps} steps
                      </span>
                    </div>
                  </div>
                </div>
                <Button variant="ghost" size="icon" className="h-8 w-8">
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

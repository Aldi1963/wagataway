import { Plus, Globe, Trash2, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const mockWebhooks = [
  { id: 1, url: "https://api.myapp.com/wa-hook", events: ["message.received", "message.sent"], isActive: true, triggerCount: 1247 },
  { id: 2, url: "https://n8n.myserver.com/webhook/wa", events: ["*"], isActive: true, triggerCount: 532 },
];

export default function Webhooks() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Webhooks</h2>
          <p className="text-sm text-muted-foreground">Kirim event ke URL eksternal</p>
        </div>
        <Button size="sm" className="gap-1.5">
          <Plus className="w-3.5 h-3.5" />
          Tambah Webhook
        </Button>
      </div>

      <div className="space-y-3">
        {mockWebhooks.map((hook) => (
          <Card key={hook.id}>
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-md bg-secondary flex items-center justify-center">
                  <Globe className="w-4 h-4 text-foreground" />
                </div>
                <div>
                  <p className="text-sm font-mono text-foreground">{hook.url}</p>
                  <div className="flex items-center gap-2 mt-1">
                    {hook.events.map((e) => (
                      <Badge key={e} variant="outline" className="text-[9px]">{e}</Badge>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Zap className="w-3 h-3" /> {hook.triggerCount}x
                </span>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive">
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

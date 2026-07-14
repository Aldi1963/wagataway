import { useState } from "react";
import { Plus, Zap, Trash2, Power } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface Rule {
  id: number;
  name: string;
  keyword: string;
  matchType: string;
  replyContent: string;
  isActive: boolean;
}

const mockRules: Rule[] = [
  { id: 1, name: "Salam", keyword: "halo,hi,hey", matchType: "contains", replyContent: "Halo! Ada yang bisa kami bantu?", isActive: true },
  { id: 2, name: "Harga", keyword: "harga,price", matchType: "contains", replyContent: "Silakan cek katalog kami di wagataway.com/katalog", isActive: true },
  { id: 3, name: "Jam Operasional", keyword: "jam,buka", matchType: "contains", replyContent: "Kami buka Senin-Jumat, 08:00-17:00 WIB", isActive: false },
];

export default function AutoReply() {
  const [rules] = useState<Rule[]>(mockRules);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Auto Reply</h2>
          <p className="text-sm text-muted-foreground">Balas pesan otomatis berdasarkan keyword</p>
        </div>
        <Button size="sm" className="gap-1.5">
          <Plus className="w-3.5 h-3.5" />
          Tambah Rule
        </Button>
      </div>

      <div className="space-y-3">
        {rules.map((rule) => (
          <Card key={rule.id}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-md bg-secondary flex items-center justify-center mt-0.5">
                    <Zap className="w-4 h-4 text-foreground" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-foreground">{rule.name}</p>
                      <Badge variant={rule.isActive ? "default" : "outline"} className="text-[10px]">
                        {rule.isActive ? "Aktif" : "Nonaktif"}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Keyword: <span className="font-mono">{rule.keyword}</span> ({rule.matchType})
                    </p>
                    <p className="text-xs text-muted-foreground mt-1 border-l-2 border-border pl-2">
                      {rule.replyContent}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7">
                    <Power className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive">
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

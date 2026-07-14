import { useState } from "react";
import { Plus, Copy, Trash2, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface Template {
  id: number;
  name: string;
  category: string;
  content: string;
}

const mockTemplates: Template[] = [
  { id: 1, name: "Greeting", category: "umum", content: "Halo {{nama}}, terima kasih sudah menghubungi kami!" },
  { id: 2, name: "Konfirmasi Order", category: "order", content: "Pesanan #{{order_id}} sudah kami terima. Total: Rp {{total}}" },
  { id: 3, name: "Follow Up", category: "sales", content: "Hai {{nama}}, apakah ada yang bisa kami bantu lagi terkait produk kami?" },
];

export default function Templates() {
  const [templates] = useState<Template[]>(mockTemplates);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Template Pesan</h2>
          <p className="text-sm text-muted-foreground">Template reusable dengan variabel</p>
        </div>
        <Button size="sm" className="gap-1.5">
          <Plus className="w-3.5 h-3.5" />
          Tambah Template
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {templates.map((tpl) => (
          <Card key={tpl.id}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-semibold text-foreground">{tpl.name}</span>
                </div>
                <span className="text-[10px] px-1.5 py-0.5 rounded border border-border text-muted-foreground">
                  {tpl.category}
                </span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed border-l-2 border-border pl-2">
                {tpl.content}
              </p>
              <div className="flex items-center gap-1 mt-3">
                <Button variant="outline" size="sm" className="h-7 text-[10px] gap-1">
                  <Copy className="w-3 h-3" /> Salin
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive">
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

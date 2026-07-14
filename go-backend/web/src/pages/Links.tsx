import { useState } from "react";
import { Plus, Link2, Copy, Trash2, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface ShortLink {
  id: number;
  code: string;
  targetUrl: string;
  title: string;
  clickCount: number;
}

const mockLinks: ShortLink[] = [
  { id: 1, code: "promo-juli", targetUrl: "https://wagataway.com/promo/juli-2026", title: "Promo Juli", clickCount: 347 },
  { id: 2, code: "katalog", targetUrl: "https://wagataway.com/products", title: "Katalog Produk", clickCount: 892 },
  { id: 3, code: "wa-cs", targetUrl: "https://wa.me/628123456789", title: "CS WhatsApp", clickCount: 1204 },
];

export default function Links() {
  const [links] = useState<ShortLink[]>(mockLinks);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Link Shortener</h2>
          <p className="text-sm text-muted-foreground">Buat short link + tracking klik</p>
        </div>
        <Button size="sm" className="gap-1.5">
          <Plus className="w-3.5 h-3.5" />
          Buat Link
        </Button>
      </div>

      <div className="space-y-3">
        {links.map((link) => (
          <Card key={link.id}>
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-md bg-secondary flex items-center justify-center">
                  <Link2 className="w-4 h-4 text-foreground" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">{link.title}</p>
                  <p className="text-xs text-muted-foreground font-mono">
                    wagataway.com/l/{link.code}
                  </p>
                  <p className="text-[10px] text-muted-foreground truncate max-w-[300px]">
                    → {link.targetUrl}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <BarChart3 className="w-3 h-3" />
                  {link.clickCount} klik
                </div>
                <Button variant="ghost" size="icon" className="h-7 w-7">
                  <Copy className="w-3.5 h-3.5" />
                </Button>
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

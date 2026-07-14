import { useState } from "react";
import { Plus, Ban, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";

const mockBlacklist = [
  { id: 1, phone: "628999888777", reason: "Spam" },
  { id: 2, phone: "628666555444", reason: "Request unsubscribe" },
  { id: 3, phone: "628333222111", reason: "" },
];

export default function Blacklist() {
  const [items] = useState(mockBlacklist);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            Blacklist
          </h2>
          <p className="text-sm text-muted-foreground">
            Nomor yang diblokir dari menerima pesan
          </p>
        </div>
        <Button size="sm" className="gap-1.5">
          <Plus className="w-3.5 h-3.5" />
          Tambah Nomor
        </Button>
      </div>

      <div className="space-y-2">
        {items.map((item) => (
          <Card key={item.id}>
            <CardContent className="p-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Ban className="w-4 h-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-mono text-foreground">
                    {item.phone}
                  </p>
                  {item.reason && (
                    <p className="text-[10px] text-muted-foreground">
                      {item.reason}
                    </p>
                  )}
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-destructive"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

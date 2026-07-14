import { useState } from "react";
import { Send, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function BulkMessages() {
  const [recipients, setRecipients] = useState("");
  const [message, setMessage] = useState("");
  const [minDelay, setMinDelay] = useState("3");
  const [maxDelay, setMaxDelay] = useState("8");

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Blast Pesan</h2>
        <p className="text-sm text-muted-foreground">Kirim pesan ke banyak nomor sekaligus</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Kirim Blast</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-medium text-foreground">Nomor Tujuan</label>
            <textarea
              className="flex w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring min-h-[100px] resize-y font-mono"
              placeholder="Satu nomor per baris:&#10;628123456789&#10;628987654321&#10;628111222333"
              value={recipients}
              onChange={(e) => setRecipients(e.target.value)}
            />
            <p className="text-[10px] text-muted-foreground">
              {recipients.split("\n").filter(Boolean).length} nomor
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-foreground">Pesan</label>
            <textarea
              className="flex w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring min-h-[100px] resize-y"
              placeholder="Tulis pesan blast..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-medium text-foreground">Delay Min (detik)</label>
              <Input value={minDelay} onChange={(e) => setMinDelay(e.target.value)} type="number" />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-foreground">Delay Max (detik)</label>
              <Input value={maxDelay} onChange={(e) => setMaxDelay(e.target.value)} type="number" />
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <Button className="gap-2">
              <Send className="w-4 h-4" />
              Kirim Blast
            </Button>
            <Button variant="outline" className="gap-2">
              <Upload className="w-4 h-4" />
              Import CSV
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

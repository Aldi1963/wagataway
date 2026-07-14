import { useState } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function SendMessage() {
  const [to, setTo] = useState("");
  const [message, setMessage] = useState("");

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    // TODO: implement
    alert(`Mengirim ke ${to}: ${message}`);
  };

  return (
    <div className="max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Kirim Pesan</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSend} className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-medium text-foreground">
                Nomor Tujuan
              </label>
              <Input
                placeholder="628xxxxxxxxxx"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="font-mono"
                required
              />
              <p className="text-[10px] text-muted-foreground">
                Format: 628xxx (tanpa + atau 0)
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-foreground">
                Pesan
              </label>
              <textarea
                className="flex w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 min-h-[120px] resize-y"
                placeholder="Tulis pesan Anda..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                required
              />
            </div>

            <Button type="submit" className="gap-2">
              <Send className="w-4 h-4" />
              Kirim
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

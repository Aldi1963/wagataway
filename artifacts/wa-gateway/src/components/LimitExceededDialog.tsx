import { useLocation } from "wouter";
import { AlertTriangle, Zap, ArrowRight } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

interface Props {
  open: boolean;
  onClose: () => void;
  message: string;
  current?: number;
  limit?: number;
  planName?: string;
  resource?: string;
}

export function LimitExceededDialog({ open, onClose, message, current, limit, planName, resource }: Props) {
  const [, setLocation] = useLocation();

  const percentage = current !== undefined && limit !== undefined && limit > 0
    ? Math.min(100, Math.round((current / limit) * 100))
    : 100;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Batas Paket Tercapai
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {planName && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>Paket saat ini:</span>
              <span className="font-semibold text-foreground">{planName}</span>
            </div>
          )}

          <p className="text-sm">{message}</p>

          {current !== undefined && limit !== undefined && (
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{resource ?? "Penggunaan"}</span>
                <span className="font-medium">{current.toLocaleString("id-ID")} / {limit.toLocaleString("id-ID")}</span>
              </div>
              <Progress value={percentage} className="h-2" />
              <p className="text-xs text-destructive">{percentage}% kuota terpakai</p>
            </div>
          )}

          <div className="rounded-xl bg-primary/5 border border-primary/20 px-4 py-3 text-sm space-y-1">
            <p className="font-semibold text-primary flex items-center gap-1.5">
              <Zap className="h-4 w-4" /> Upgrade paket Anda
            </p>
            <p className="text-muted-foreground text-xs">
              Tingkatkan paket untuk mendapatkan batas lebih tinggi atau tak terbatas.
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose}>Tutup</Button>
          <Button
            onClick={() => { onClose(); setLocation("/billing"); }}
            className="gap-1.5"
          >
            <Zap className="h-4 w-4" /> Upgrade Paket <ArrowRight className="h-4 w-4" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

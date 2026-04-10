import { ShieldOff } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function Unauthorized() {
  return (
    <div className="flex flex-col items-center justify-center h-64 gap-4 text-center">
      <div className="w-16 h-16 rounded-2xl bg-destructive/10 flex items-center justify-center">
        <ShieldOff className="w-8 h-8 text-destructive" />
      </div>
      <div>
        <h2 className="text-xl font-bold">Akses Ditolak</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Halaman ini hanya dapat diakses oleh Administrator.
        </p>
      </div>
      <Link href="/">
        <Button variant="outline" size="sm">Kembali ke Dashboard</Button>
      </Link>
    </div>
  );
}

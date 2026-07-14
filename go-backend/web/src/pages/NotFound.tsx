import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="text-center">
        <p className="text-6xl font-bold text-foreground">404</p>
        <p className="text-sm text-muted-foreground mt-2">
          Halaman yang Anda cari tidak ditemukan.
        </p>
        <Link href="/">
          <Button variant="outline" className="mt-6">
            Kembali ke Dashboard
          </Button>
        </Link>
      </div>
    </div>
  );
}

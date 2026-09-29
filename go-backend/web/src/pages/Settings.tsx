import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/hooks/use-theme";
import { Sun, Moon, Check } from "lucide-react";
import { cn } from "@/lib/utils";

export default function Settings() {
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Pengaturan</h2>
        <p className="text-sm text-muted-foreground">Sesuaikan tampilan aplikasi</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Tampilan</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3">
            {(
              [
                { value: "light", label: "Terang", icon: Sun },
                { value: "dark", label: "Gelap", icon: Moon },
              ] as const
            ).map((opt) => (
              <button
                key={opt.value}
                onClick={() => {
                  if (theme !== opt.value) toggleTheme();
                }}
                className={cn(
                  "flex items-center gap-3 rounded-lg border p-3 text-left transition-colors",
                  theme === opt.value
                    ? "border-primary bg-primary/5"
                    : "border-border hover:bg-secondary/40"
                )}
              >
                <opt.icon className="w-5 h-5" />
                <span className="text-sm font-medium flex-1">{opt.label}</span>
                {theme === opt.value && <Check className="w-4 h-4 text-primary" />}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            Pilihan tema tersimpan di browser ini.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Akun</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Kelola nama, email, dan password akun Anda.
          </p>
          <Button variant="outline" size="sm" asChild>
            <a href="/profile">Buka Profil</a>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

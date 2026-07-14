import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";

export default function Profile() {
  const { user } = useAuth();

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Profil</h2>
        <p className="text-sm text-muted-foreground">Kelola informasi akun</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Informasi Akun</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4 pb-4 border-b border-border">
            <div className="w-14 h-14 rounded-full bg-foreground text-background flex items-center justify-center text-xl font-bold">
              {user?.name?.charAt(0).toUpperCase() || "U"}
            </div>
            <div>
              <p className="font-semibold text-foreground">{user?.name}</p>
              <p className="text-xs text-muted-foreground">{user?.email}</p>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium">Nama</label>
            <Input defaultValue={user?.name || ""} />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium">Email</label>
            <Input defaultValue={user?.email || ""} disabled />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium">Password Baru</label>
            <Input type="password" placeholder="Kosongkan jika tidak diubah" />
          </div>

          <Button size="sm">Simpan Perubahan</Button>
        </CardContent>
      </Card>
    </div>
  );
}

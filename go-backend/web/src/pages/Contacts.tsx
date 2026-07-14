import { Users, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const mockContacts = [
  { id: 1, name: "Ahmad Rizky", phone: "628123456789", tags: "pelanggan" },
  { id: 2, name: "Siti Nurhaliza", phone: "628987654321", tags: "supplier" },
  { id: 3, name: "Budi Setiawan", phone: "628111222333", tags: "pelanggan" },
  { id: 4, name: "Dewi Lestari", phone: "628444555666", tags: "reseller" },
  { id: 5, name: "Eko Prasetyo", phone: "628777888999", tags: "pelanggan" },
];

export default function Contacts() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Kontak</h2>
          <p className="text-sm text-muted-foreground">
            {mockContacts.length} kontak tersimpan
          </p>
        </div>
        <Button size="sm" className="gap-1.5">
          <Plus className="w-3.5 h-3.5" />
          Tambah Kontak
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Cari kontak..." className="pl-9" />
      </div>

      {/* Contact List */}
      <Card>
        <CardContent className="p-0">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left text-xs font-medium text-muted-foreground px-5 py-3">
                  Nama
                </th>
                <th className="text-left text-xs font-medium text-muted-foreground px-5 py-3">
                  Nomor
                </th>
                <th className="text-left text-xs font-medium text-muted-foreground px-5 py-3">
                  Tag
                </th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {mockContacts.map((contact) => (
                <tr
                  key={contact.id}
                  className="border-b border-border last:border-0 hover:bg-secondary/50 transition-colors"
                >
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
                        <Users className="w-3.5 h-3.5 text-muted-foreground" />
                      </div>
                      <span className="text-sm font-medium text-foreground">
                        {contact.name}
                      </span>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <span className="text-sm text-muted-foreground font-mono">
                      {contact.phone}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <span className="text-xs px-2 py-0.5 rounded-full border border-border text-muted-foreground">
                      {contact.tags}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <Button variant="ghost" size="sm" className="text-xs">
                      Edit
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

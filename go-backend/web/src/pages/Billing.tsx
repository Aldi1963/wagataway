import { useState } from "react";
import { Check, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

// Nomor WhatsApp admin untuk upgrade paket.
// GANTI dengan nomor CS yang sebenarnya, format: 62812xxxxxxx (tanpa +, tanpa spasi).
const CS_WA_NUMBER = "6280000000000";

interface Plan {
  name: string;
  price: number;
  period: string;
  features: string[];
  current: boolean;
  popular?: boolean;
}

const plans: Plan[] = [
  {
    name: "Free",
    price: 0,
    period: "selamanya",
    features: ["1 Perangkat", "100 Pesan/hari", "500 Kontak", "5 Auto Reply"],
    current: true,
  },
  {
    name: "Starter",
    price: 99000,
    period: "/bulan",
    features: ["3 Perangkat", "1.000 Pesan/hari", "5.000 Kontak", "20 Auto Reply", "Bulk Message", "Live Chat"],
    current: false,
  },
  {
    name: "Pro",
    price: 249000,
    period: "/bulan",
    features: ["10 Perangkat", "10.000 Pesan/hari", "Unlimited Kontak", "Unlimited Auto Reply", "AI CS Bot", "Drip Campaign", "Webhook", "Analytics"],
    current: false,
    popular: true,
  },
];

export default function Billing() {
  const [upgradePlan, setUpgradePlan] = useState<Plan | null>(null);

  const waLink = upgradePlan
    ? `https://wa.me/${CS_WA_NUMBER}?text=${encodeURIComponent(
        `Halo Admin WaGataway, saya ingin upgrade ke paket ${upgradePlan.name}.`
      )}`
    : "#";

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Langganan</h2>
        <p className="text-sm text-muted-foreground">Pilih paket yang sesuai kebutuhan</p>
      </div>

      {/* Current Plan */}
      <Card>
        <CardContent className="p-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">Paket saat ini: <span className="font-bold">Free</span></p>
            <p className="text-xs text-muted-foreground">100 pesan/hari, 1 perangkat</p>
          </div>
          <Badge variant="outline">Aktif</Badge>
        </CardContent>
      </Card>

      {/* Plans Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {plans.map((plan) => (
          <Card key={plan.name} className={plan.popular ? "border-foreground" : ""}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">{plan.name}</CardTitle>
                {plan.popular && <Badge className="text-[9px]">Popular</Badge>}
              </div>
              <div className="pt-1">
                <span className="text-2xl font-bold text-foreground">
                  {plan.price === 0 ? "Gratis" : `Rp ${plan.price.toLocaleString("id-ID")}`}
                </span>
                {plan.price > 0 && <span className="text-xs text-muted-foreground">{plan.period}</span>}
              </div>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 mb-4">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Check className="w-3 h-3 text-foreground" />
                    {f}
                  </li>
                ))}
              </ul>
              <Button
                variant={plan.current ? "outline" : "default"}
                className="w-full"
                size="sm"
                disabled={plan.current}
                onClick={() => setUpgradePlan(plan)}
              >
                {plan.current ? "Paket Saat Ini" : "Pilih Paket"}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Upgrade confirmation modal */}
      {upgradePlan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setUpgradePlan(null)}
          />
          <Card className="relative w-full max-w-md">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Upgrade ke Paket {upgradePlan.name}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border border-border p-3">
                <div className="flex items-baseline justify-between">
                  <span className="text-sm font-semibold text-foreground">{upgradePlan.name}</span>
                  <span className="text-lg font-bold text-foreground">
                    Rp {upgradePlan.price.toLocaleString("id-ID")}
                    <span className="text-xs font-normal text-muted-foreground">{upgradePlan.period}</span>
                  </span>
                </div>
                <ul className="mt-2 space-y-1">
                  {upgradePlan.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Check className="w-3 h-3 text-foreground" />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
              <p className="text-sm text-muted-foreground">
                Untuk upgrade, hubungi admin via WhatsApp.
              </p>
              <div className="flex gap-2">
                <Button
                  className="flex-1 bg-[#243370] hover:bg-[#1c2a5c] text-white"
                  onClick={() => window.open(waLink, "_blank", "noopener")}
                >
                  <MessageCircle className="w-4 h-4 mr-2" />
                  Hubungi Admin
                </Button>
                <Button variant="outline" onClick={() => setUpgradePlan(null)}>
                  Batal
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

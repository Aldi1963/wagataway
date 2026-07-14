import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const plans = [
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
              >
                {plan.current ? "Paket Saat Ini" : "Pilih Paket"}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

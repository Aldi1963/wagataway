import { useLocation } from "wouter";
import SendMessage from "./SendMessage";
import BulkMessages from "./BulkMessages";
import { PageTabs } from "@/components/ui/tabs";

const TABS = [
  { id: "kirim", label: "Kirim", href: "/send" },
  { id: "blast", label: "Blast", href: "/bulk" },
];

/** Halaman gabungan "Kirim Pesan": tab Kirim + Blast. URL lama /send & /bulk tetap valid. */
export default function Send() {
  const [location, navigate] = useLocation();
  const active = location === "/bulk" ? "blast" : "kirim";

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold">Kirim Pesan</h1>
        <p className="text-sm text-muted-foreground">
          Kirim pesan satuan atau blast ke banyak nomor sekaligus
        </p>
      </div>
      <PageTabs tabs={TABS} active={active} onSelect={(tab) => navigate(tab.href)} />
      {active === "blast" ? <BulkMessages embedded /> : <SendMessage embedded />}
    </div>
  );
}

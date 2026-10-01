import Billing from "./Billing";
import Affiliate from "./Affiliate";
import { SectionHeader } from "./Settings";

/** Halaman Langganan: paket berlangganan + afiliasi. */
export default function Langganan() {
  return (
    <div className="space-y-10 max-w-5xl">
      <Billing embedded />
      <div>
        <SectionHeader title="Afiliasi" desc="Ajak orang berlangganan dan dapatkan komisi" />
        <Affiliate embedded />
      </div>
    </div>
  );
}

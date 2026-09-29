import { useLocation } from "wouter";
import Contacts from "./Contacts";
import ContactGroups from "./ContactGroups";
import Blacklist from "./Blacklist";
import { PageTabs } from "@/components/ui/tabs";

const TABS = [
  { id: "kontak", label: "Kontak", href: "/contacts" },
  { id: "grup", label: "Grup", href: "/contact-groups" },
  { id: "blacklist", label: "Blacklist", href: "/blacklist" },
];

/** Halaman gabungan "Kontak": tab Kontak + Grup + Blacklist. URL lama tetap valid. */
export default function ContactsHub() {
  const [location, navigate] = useLocation();
  const active =
    location === "/contact-groups"
      ? "grup"
      : location === "/blacklist"
        ? "blacklist"
        : "kontak";

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold">Kontak</h1>
        <p className="text-sm text-muted-foreground">
          Kelola kontak, grup kontak, dan blacklist
        </p>
      </div>
      <PageTabs tabs={TABS} active={active} onSelect={(tab) => navigate(tab.href)} />
      {active === "grup" ? (
        <ContactGroups embedded />
      ) : active === "blacklist" ? (
        <Blacklist embedded />
      ) : (
        <Contacts embedded />
      )}
    </div>
  );
}

import { useLocation } from "wouter";
import Contacts from "./Contacts";
import ContactGroups from "./ContactGroups";
import Blacklist from "./Blacklist";
import { PageTabs } from "@/components/ui/tabs";
import { useLang } from "@/lib/i18n";

/** Halaman gabungan "Kontak": tab Kontak + Grup + Blacklist. URL lama tetap valid. */
export default function ContactsHub() {
  const [location, navigate] = useLocation();
  const { t } = useLang();
  const active =
    location === "/contact-groups"
      ? "grup"
      : location === "/blacklist"
        ? "blacklist"
        : "kontak";

  const tabs = [
    { id: "kontak", label: t("contactsHub.tabContacts"), href: "/contacts" },
    { id: "grup", label: t("contactsHub.tabGroups"), href: "/contact-groups" },
    { id: "blacklist", label: t("contactsHub.tabBlacklist"), href: "/blacklist" },
  ];

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold">{t("title.contacts")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("contactsHub.description")}
        </p>
      </div>
      <PageTabs tabs={tabs} active={active} onSelect={(tab) => navigate(tab.href)} />
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

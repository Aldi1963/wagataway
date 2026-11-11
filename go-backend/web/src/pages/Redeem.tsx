import { useEffect } from "react";
import { Link, Redirect, useSearch } from "wouter";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useLang } from "@/lib/i18n";
import {
  consumePostLoginRedirect,
  savePostLoginRedirect,
} from "@/lib/post-login-redirect";
import { PageTransitionLoader } from "@/components/ui/page-transition";
import VoucherRedeem from "@/components/VoucherRedeem";

// Halaman tukar voucher mandiri: /redeem?code=HEMAT50
// Kode dari link langsung terisi di form (komponen yang sama dengan tab
// voucher Settings, jadi hasil redeem — sukses / sudah dipakai / tidak
// valid / kedaluwarsa — tampil identik). Redeem butuh login: bila belum
// login, simpan target lalu arahkan ke /login; GuestRoute mengembalikan
// pengguna ke sini setelah login berhasil.
export default function Redeem() {
  const { t } = useLang();
  const { user, isLoading } = useAuth();
  const search = useSearch();
  const code = new URLSearchParams(search).get("code") || "";
  const target = code
    ? `/redeem?code=${encodeURIComponent(code.trim().toUpperCase())}`
    : "/redeem";

  // Bila sampai di sini tanpa lewat GuestRoute (mis. token sudah ada),
  // bersihkan target usang supaya login berikutnya tidak nyasar ke sini.
  useEffect(() => {
    if (user) consumePostLoginRedirect();
  }, [user]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8 bg-background">
        <PageTransitionLoader />
      </div>
    );
  }

  if (!user) {
    savePostLoginRedirect(target);
    return <Redirect to="/login" />;
  }

  return (
    <div className="min-h-screen bg-background flex justify-center px-4 py-10">
      <div className="w-full max-w-xl">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          {t("redeem.backToDashboard")}
        </Link>
        <VoucherRedeem initialCode={code} />
      </div>
    </div>
  );
}

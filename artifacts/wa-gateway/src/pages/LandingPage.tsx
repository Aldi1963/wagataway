import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useDynamicSEO } from "@/hooks/use-dynamic-seo";
import {
  ChevronDown, ChevronRight, Menu, X, Zap, Bot, MessageSquareText,
  Repeat2, BarChart2, Smartphone, Star, CheckCircle2, ArrowRight,
  Mail, Phone, ExternalLink, Crown, Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

interface LandingData {
  siteName: string; siteLogo: string; siteTagline: string;
  hero: { title: string; subtitle: string; cta1: string; cta2: string; image: string };
  stats: { label: string; value: string }[];
  features: { icon: string; title: string; desc: string }[];
  testimonials: { name: string; role: string; company: string; text: string; avatar: string }[];
  faqs: { q: string; a: string }[];
  howItWorks: { step: string; title: string; desc: string }[];
  plans: { id: string; name: string; price: number; description: string; features: string[] }[];
  contact: { email: string; whatsapp: string };
  footerText: string;
  show: { pricing: boolean; testimonials: boolean; stats: boolean; howItWorks: boolean };
  seo: {
    title: string; description: string; keywords: string;
    ogImage: string; favicon: string; author: string; robots: string;
  };
}

// ── Icon Map ──────────────────────────────────────────────────────────────────

const ICON_MAP: Record<string, React.ElementType> = {
  Zap, Bot, MessageSquareText, Repeat2, BarChart2, Smartphone,
  Star, Crown, Shield, CheckCircle2, ArrowRight,
};

function DynIcon({ name, ...props }: { name: string; [k: string]: any }) {
  const Icon = ICON_MAP[name] ?? Zap;
  return <Icon {...props} />;
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

function useScrolled(threshold = 50) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > threshold);
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, [threshold]);
  return scrolled;
}

function useInView(ref: React.RefObject<HTMLElement>) {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    if (!ref.current) return;
    const obs = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) setInView(true); }, { threshold: 0.15 });
    obs.observe(ref.current!);
    return () => obs.disconnect();
  }, []);
  return inView;
}

// ── Helper: format price ──────────────────────────────────────────────────────

function fmtRp(price: number) {
  if (price === 0) return "Gratis";
  return `Rp ${(price * 15000).toLocaleString("id-ID")}`;
}

const PLAN_STYLE: Record<string, { gradient: string; badge?: string; popular?: boolean }> = {
  free:       { gradient: "from-zinc-400 to-zinc-500" },
  basic:      { gradient: "from-blue-400 to-blue-600", badge: "Populer", popular: true },
  pro:        { gradient: "from-emerald-400 to-emerald-600", badge: "Terbaik" },
  enterprise: { gradient: "from-violet-400 to-violet-600" },
};

// ── FAQ Item ──────────────────────────────────────────────────────────────────

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-border/50">
      <button className="w-full flex items-center justify-between py-4 text-left gap-4" onClick={() => setOpen((v) => !v)}>
        <span className="font-medium text-foreground">{q}</span>
        <ChevronDown size={18} className={cn("flex-shrink-0 text-muted-foreground transition-transform duration-300", open && "rotate-180")} />
      </button>
      <div className={cn("overflow-hidden transition-all duration-300", open ? "max-h-96 pb-4" : "max-h-0")}>
        <p className="text-muted-foreground text-sm leading-relaxed">{a}</p>
      </div>
    </div>
  );
}

// ── Animated Section ─────────────────────────────────────────────────────────

function AnimSection({ children, className, delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref as React.RefObject<HTMLElement>);
  return (
    <div ref={ref} className={cn("transition-all duration-700", inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8", className)}
      style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

// ── Counter Animation ─────────────────────────────────────────────────────────

function StatCard({ value, label }: { value: string; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref as React.RefObject<HTMLElement>);
  return (
    <div ref={ref} className={cn("text-center transition-all duration-700", inView ? "opacity-100 scale-100" : "opacity-0 scale-90")}>
      <p className="text-3xl md:text-4xl font-extrabold text-emerald-500 dark:text-emerald-400 mb-1">{value}</p>
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  const scrolled = useScrolled(60);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const { data, isLoading } = useQuery<LandingData>({
    queryKey: ["landing"],
    queryFn: () => fetch("/api/public/landing").then((r) => r.json()),
    staleTime: 60000,
  });

  // Smooth scroll
  function scrollTo(id: string) {
    setMobileMenuOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  }

  const d = data;
  const siteName = d?.siteName ?? "WA Gateway";

  // Dynamic SEO meta tags + favicon
  useDynamicSEO({
    title: d?.seo?.title,
    description: d?.seo?.description,
    keywords: d?.seo?.keywords,
    ogImage: d?.seo?.ogImage,
    favicon: d?.seo?.favicon,
    author: d?.seo?.author,
    robots: d?.seo?.robots,
    siteName: d?.siteName,
  });
  const navLinks = [
    { label: "Fitur", id: "features" },
    { label: "Cara Kerja", id: "how-it-works" },
    { label: "Harga", id: "pricing" },
    { label: "Testimoni", id: "testimonials" },
    { label: "FAQ", id: "faq" },
  ].filter((l) => {
    if (l.id === "pricing" && d && !d.show.pricing) return false;
    if (l.id === "testimonials" && d && !d.show.testimonials) return false;
    return true;
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
          <p className="text-sm text-muted-foreground">Memuat halaman...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">

      {/* ── Navbar ─────────────────────────────────────────────────────────── */}
      <header className={cn("fixed top-0 left-0 right-0 z-50 transition-all duration-300",
        scrolled ? "bg-background/95 backdrop-blur-xl shadow-sm border-b border-border/40" : "bg-transparent")}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          {/* Logo */}
          <button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} className="flex items-center gap-2 font-extrabold text-xl group">
            <div className="w-9 h-9 flex items-center justify-center shrink-0">
              {d?.siteLogo?.startsWith("/") || d?.siteLogo?.startsWith("http") ? (
                <img src={d.siteLogo} alt="Logo" className="w-full h-full object-contain" />
              ) : (
                <span className="text-2xl group-hover:scale-110 transition-transform">{d?.siteLogo ?? "⚡"}</span>
              )}
            </div>
            <span className="text-foreground tracking-tight">{siteName}</span>
          </button>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-6">
            {navLinks.map((l) => (
              <button key={l.id} onClick={() => scrollTo(l.id)}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors font-medium">
                {l.label}
              </button>
            ))}
          </nav>

          {/* CTA */}
          <div className="hidden md:flex items-center gap-2">
            <Link href="/login">
              <button className="px-4 py-1.5 text-sm font-medium text-foreground hover:text-primary transition-colors">Masuk</button>
            </Link>
            <Link href="/register">
              <button className="px-4 py-1.5 text-sm font-semibold bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-full hover:opacity-90 transition-all shadow-sm shadow-emerald-500/30">
                Daftar Gratis
              </button>
            </Link>
          </div>

          {/* Mobile menu toggle */}
          <button className="md:hidden p-2 rounded-xl hover:bg-muted/50" onClick={() => setMobileMenuOpen((v) => !v)}>
            {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-background/98 backdrop-blur-xl border-b border-border px-4 pb-4 space-y-1">
            {navLinks.map((l) => (
              <button key={l.id} onClick={() => scrollTo(l.id)}
                className="block w-full text-left px-3 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg transition-colors">
                {l.label}
              </button>
            ))}
            <div className="pt-2 flex gap-2">
              <Link href="/login" className="flex-1">
                <button className="w-full px-4 py-2 text-sm font-medium border border-border rounded-xl hover:bg-muted/50 transition-colors">Masuk</button>
              </Link>
              <Link href="/register" className="flex-1">
                <button className="w-full px-4 py-2 text-sm font-semibold bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-xl hover:opacity-90">Daftar Gratis</button>
              </Link>
            </div>
          </div>
        )}
      </header>

      {/* ── Hero ───────────────────────────────────────────────────────────── */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-16">
        {/* Background blobs */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-emerald-400/20 dark:bg-emerald-600/10 rounded-full blur-3xl animate-pulse" style={{ animationDuration: "4s" }} />
          <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-teal-400/15 dark:bg-teal-600/10 rounded-full blur-3xl animate-pulse" style={{ animationDuration: "6s", animationDelay: "1s" }} />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-emerald-300/10 dark:bg-emerald-700/5 rounded-full blur-3xl" />
          {/* Grid pattern */}
          <div className="absolute inset-0 opacity-[0.03] dark:opacity-[0.06]"
            style={{ backgroundImage: "linear-gradient(#333 1px, transparent 1px), linear-gradient(90deg, #333 1px, transparent 1px)", backgroundSize: "48px 48px" }} />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-20 text-center">
          {/* Pill badge */}
          {d?.siteTagline && (
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-sm font-medium mb-8 animate-fade-in">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              {d.siteTagline}
            </div>
          )}

          {/* Headline */}
          <h1 className="text-5xl sm:text-6xl md:text-7xl font-extrabold leading-tight tracking-tight mb-6">
            {(d?.hero.title ?? "Kelola WhatsApp\nBisnis Anda\ndengan Mudah").split("\n").map((line, i, arr) => (
              <span key={i} className={cn("block", i === 1 ? "bg-gradient-to-r from-emerald-500 to-teal-400 bg-clip-text text-transparent" : "text-foreground")}>
                {line}{i < arr.length - 1 ? "" : ""}
              </span>
            ))}
          </h1>

          {/* Subtitle */}
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed mb-10">
            {d?.hero.subtitle ?? "Platform all-in-one untuk blast pesan massal, auto reply cerdas, CS Bot bertenaga AI, dan analitik real-time."}
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-3 justify-center mb-16">
            <Link href="/register">
              <button className="group px-8 py-3.5 bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-bold rounded-2xl text-base hover:opacity-90 transition-all shadow-lg shadow-emerald-500/30 flex items-center gap-2">
                {d?.hero.cta1 ?? "Mulai Gratis Sekarang"}
                <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
              </button>
            </Link>
            <Link href="/login">
              <button className="px-8 py-3.5 border border-border hover:border-primary/50 text-foreground font-semibold rounded-2xl text-base hover:bg-muted/50 transition-all">
                {d?.hero.cta2 ?? "Masuk ke Dashboard"}
              </button>
            </Link>
          </div>

          {/* Hero visual — image if set, otherwise dashboard mockup */}
          <div className="relative max-w-4xl mx-auto">
          {d?.hero.image ? (
            <div className="relative rounded-2xl overflow-hidden border border-border/60 shadow-2xl shadow-black/10">
              <img
                src={d.hero.image}
                alt="Hero"
                className="w-full h-auto object-cover max-h-[500px]"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-background/20 to-transparent pointer-events-none" />
            </div>
          ) : (
            <>
            <div className="relative rounded-2xl border border-border/60 bg-card/80 backdrop-blur shadow-2xl shadow-black/10 overflow-hidden">
              {/* Fake browser chrome */}
              <div className="flex items-center gap-2 px-4 py-3 bg-muted/50 border-b border-border/40">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-rose-400" />
                  <div className="w-3 h-3 rounded-full bg-amber-400" />
                  <div className="w-3 h-3 rounded-full bg-emerald-400" />
                </div>
                <div className="flex-1 mx-4 h-5 bg-background rounded-md flex items-center px-2">
                  <span className="text-[10px] text-muted-foreground">app.wagateway.id/dashboard</span>
                </div>
              </div>
              {/* Dashboard preview (stylized) */}
              <div className="p-4 md:p-6 grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: "Pesan Terkirim", value: "12.847", trend: "+18%", color: "text-emerald-500" },
                  { label: "Perangkat Aktif", value: "8 / 10", trend: "Terhubung", color: "text-blue-500" },
                  { label: "Auto Reply", value: "247", trend: "+5 baru", color: "text-violet-500" },
                  { label: "CS Bot Chat", value: "1.293", trend: "+32%", color: "text-amber-500" },
                ].map((s, i) => (
                  <div key={i} className="bg-background rounded-xl border border-border p-3">
                    <p className="text-xs text-muted-foreground mb-1">{s.label}</p>
                    <p className={cn("text-xl font-extrabold", s.color)}>{s.value}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{s.trend}</p>
                  </div>
                ))}
              </div>
              <div className="px-4 md:px-6 pb-4 md:pb-6 grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="md:col-span-2 bg-background rounded-xl border border-border p-3 h-24 flex flex-col gap-1.5">
                  <p className="text-xs text-muted-foreground">Aktivitas Pesan</p>
                  <div className="flex items-end gap-1 h-12">
                    {[40, 65, 45, 80, 55, 90, 70, 85, 60, 95, 75, 88].map((h, i) => (
                      <div key={i} className="flex-1 rounded-sm bg-emerald-400/60 dark:bg-emerald-500/50" style={{ height: `${h}%` }} />
                    ))}
                  </div>
                </div>
                <div className="bg-background rounded-xl border border-border p-3 h-24 flex flex-col gap-2">
                  <p className="text-xs text-muted-foreground">Status CS Bot</p>
                  {[{ l: "Aktif", v: 86, c: "bg-emerald-400" }, { l: "Offline", v: 14, c: "bg-zinc-300 dark:bg-zinc-600" }].map((s) => (
                    <div key={s.l} className="flex items-center gap-2 text-xs">
                      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className={cn("h-full rounded-full", s.c)} style={{ width: `${s.v}%` }} />
                      </div>
                      <span className="text-muted-foreground w-10 text-right">{s.v}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            {/* Floating badge */}
            <div className="absolute -top-3 -right-3 md:-right-6 bg-emerald-500 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-lg shadow-emerald-500/40 rotate-3">
              Live Preview ✨
            </div>
            </>
          )}
          </div>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 text-muted-foreground animate-bounce">
          <ChevronDown size={20} />
        </div>
      </section>

      {/* ── Stats ──────────────────────────────────────────────────────────── */}
      {d?.show.stats !== false && d?.stats && d.stats.length > 0 && (
        <section className="py-16 border-y border-border/40 bg-muted/20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
              {d.stats.map((s, i) => (
                <AnimSection key={i} delay={i * 100}>
                  <StatCard value={s.value} label={s.label} />
                </AnimSection>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── Features ───────────────────────────────────────────────────────── */}
      <section id="features" className="py-20 md:py-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <AnimSection>
            <div className="text-center mb-14">
              <span className="inline-flex items-center gap-2 text-emerald-600 dark:text-emerald-400 text-sm font-semibold mb-3 uppercase tracking-widest">
                <Zap size={14} /> Fitur Unggulan
              </span>
              <h2 className="text-3xl md:text-4xl font-extrabold mb-4">Semua yang Anda Butuhkan</h2>
              <p className="text-muted-foreground max-w-xl mx-auto">Platform lengkap untuk otomatisasi WhatsApp bisnis Anda</p>
            </div>
          </AnimSection>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {(d?.features ?? []).map((f, i) => (
              <AnimSection key={i} delay={i * 80}>
                <div className="group relative rounded-2xl border border-border hover:border-emerald-400/50 bg-card hover:bg-card/80 p-6 transition-all hover:shadow-lg hover:-translate-y-1">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-400/20 to-teal-400/20 border border-emerald-400/30 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <DynIcon name={f.icon} size={22} className="text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <h3 className="font-bold text-lg mb-2">{f.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
                </div>
              </AnimSection>
            ))}
          </div>
        </div>
      </section>

      {/* ── How It Works ───────────────────────────────────────────────────── */}
      {d?.show.howItWorks !== false && d?.howItWorks && d.howItWorks.length > 0 && (
        <section id="how-it-works" className="py-20 md:py-28 bg-muted/20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6">
            <AnimSection>
              <div className="text-center mb-14">
                <span className="inline-flex items-center gap-2 text-emerald-600 dark:text-emerald-400 text-sm font-semibold mb-3 uppercase tracking-widest">
                  <ChevronRight size={14} /> Cara Kerja
                </span>
                <h2 className="text-3xl md:text-4xl font-extrabold mb-4">Mulai dalam 3 Langkah</h2>
                <p className="text-muted-foreground max-w-xl mx-auto">Tidak perlu keahlian teknis — siapa pun bisa menggunakannya</p>
              </div>
            </AnimSection>
            <div className="grid md:grid-cols-3 gap-8 relative">
              {/* Connector line */}
              <div className="hidden md:block absolute top-8 left-1/4 right-1/4 h-px bg-gradient-to-r from-transparent via-emerald-400/40 to-transparent" />
              {d.howItWorks.map((step, i) => (
                <AnimSection key={i} delay={i * 150}>
                  <div className="relative text-center">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 text-white text-2xl font-extrabold flex items-center justify-center mx-auto mb-4 shadow-lg shadow-emerald-500/30">
                      {step.step}
                    </div>
                    <h3 className="font-bold text-lg mb-2">{step.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{step.desc}</p>
                  </div>
                </AnimSection>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── Pricing ────────────────────────────────────────────────────────── */}
      {d?.show.pricing !== false && d?.plans && d.plans.length > 0 && (
        <section id="pricing" className="py-20 md:py-28">
          <div className="max-w-7xl mx-auto px-4 sm:px-6">
            <AnimSection>
              <div className="text-center mb-14">
                <span className="inline-flex items-center gap-2 text-emerald-600 dark:text-emerald-400 text-sm font-semibold mb-3 uppercase tracking-widest">
                  <Star size={14} /> Harga Transparan
                </span>
                <h2 className="text-3xl md:text-4xl font-extrabold mb-4">Pilih Paket yang Tepat</h2>
                <p className="text-muted-foreground max-w-xl mx-auto">Mulai gratis, upgrade kapan saja. Tidak ada biaya tersembunyi.</p>
              </div>
            </AnimSection>
            <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
              {d.plans.slice(0, 3).map((plan, i) => {
                const style = PLAN_STYLE[plan.id] ?? PLAN_STYLE.free!;
                return (
                  <AnimSection key={plan.id} delay={i * 100}>
                    <div className={cn("relative rounded-2xl border bg-card p-6 flex flex-col h-full transition-all hover:shadow-xl",
                      style.popular ? "border-emerald-400 dark:border-emerald-500 ring-1 ring-emerald-400 dark:ring-emerald-500 shadow-lg shadow-emerald-500/10" : "border-border")}>
                      {style.badge && (
                        <div className={cn("absolute -top-3.5 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full text-xs font-bold text-white shadow-md", `bg-gradient-to-r ${style.gradient}`)}>
                          {style.badge}
                        </div>
                      )}
                      <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center text-white mb-4 shadow-sm", `bg-gradient-to-br ${style.gradient}`)}>
                        <Star size={22} />
                      </div>
                      <h3 className="font-bold text-xl capitalize mb-1">{plan.name ?? plan.id}</h3>
                      <div className="flex items-baseline gap-1 mb-2">
                        <span className="text-4xl font-extrabold text-emerald-600 dark:text-emerald-400">{fmtRp(plan.price)}</span>
                        {plan.price > 0 && <span className="text-muted-foreground text-sm">/bulan</span>}
                      </div>
                      <p className="text-xs text-muted-foreground mb-5 leading-relaxed">{plan.description}</p>
                      <ul className="space-y-2.5 mb-6 flex-1">
                        {plan.features.map((feat, j) => (
                          <li key={j} className="flex items-start gap-2 text-sm">
                            <CheckCircle2 size={15} className="text-emerald-500 flex-shrink-0 mt-0.5" />
                            <span className="leading-snug">{feat}</span>
                          </li>
                        ))}
                      </ul>
                      <Link href="/register">
                        <button className={cn("w-full py-3 rounded-xl font-bold text-sm transition-all",
                          style.popular ? `bg-gradient-to-r ${style.gradient} text-white hover:opacity-90 shadow-md` : "border border-border hover:border-primary/50 hover:bg-muted/50 text-foreground")}>
                          {plan.price === 0 ? "Mulai Gratis" : "Pilih Paket"}
                        </button>
                      </Link>
                    </div>
                  </AnimSection>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* ── Testimonials ───────────────────────────────────────────────────── */}
      {d?.show.testimonials !== false && d?.testimonials && d.testimonials.length > 0 && (
        <section id="testimonials" className="py-20 md:py-28 bg-muted/20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6">
            <AnimSection>
              <div className="text-center mb-14">
                <span className="inline-flex items-center gap-2 text-emerald-600 dark:text-emerald-400 text-sm font-semibold mb-3 uppercase tracking-widest">
                  <Star size={14} /> Testimoni
                </span>
                <h2 className="text-3xl md:text-4xl font-extrabold mb-4">Dipercaya Ribuan Bisnis</h2>
                <p className="text-muted-foreground max-w-xl mx-auto">Bergabunglah dengan puluhan ribu bisnis yang sudah berkembang bersama kami</p>
              </div>
            </AnimSection>
            <div className="grid md:grid-cols-3 gap-6">
              {d.testimonials.map((t, i) => (
                <AnimSection key={i} delay={i * 100}>
                  <div className="bg-card border border-border rounded-2xl p-6 flex flex-col gap-4 hover:shadow-lg transition-all hover:-translate-y-1">
                    <div className="flex gap-0.5">
                      {Array.from({ length: 5 }).map((_, j) => (
                        <Star key={j} size={14} className="text-amber-400 fill-amber-400" />
                      ))}
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed flex-1">"{t.text}"</p>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                        {t.avatar || t.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-semibold text-sm">{t.name}</p>
                        <p className="text-xs text-muted-foreground">{t.role} · {t.company}</p>
                      </div>
                    </div>
                  </div>
                </AnimSection>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── FAQ ────────────────────────────────────────────────────────────── */}
      {d?.faqs && d.faqs.length > 0 && (
        <section id="faq" className="py-20 md:py-28">
          <div className="max-w-3xl mx-auto px-4 sm:px-6">
            <AnimSection>
              <div className="text-center mb-12">
                <span className="inline-flex items-center gap-2 text-emerald-600 dark:text-emerald-400 text-sm font-semibold mb-3 uppercase tracking-widest">
                  <ChevronDown size={14} /> FAQ
                </span>
                <h2 className="text-3xl md:text-4xl font-extrabold mb-4">Pertanyaan Umum</h2>
                <p className="text-muted-foreground">Tidak menemukan jawaban? Hubungi kami langsung.</p>
              </div>
            </AnimSection>
            <AnimSection delay={100}>
              <div className="rounded-2xl border border-border bg-card px-6">
                {d.faqs.map((f, i) => <FaqItem key={i} q={f.q} a={f.a} />)}
              </div>
            </AnimSection>
          </div>
        </section>
      )}

      {/* ── CTA Banner ─────────────────────────────────────────────────────── */}
      <section className="py-20 md:py-28">
        <AnimSection>
          <div className="max-w-4xl mx-auto px-4 sm:px-6">
            <div className="relative rounded-3xl bg-gradient-to-br from-emerald-500 to-teal-500 p-10 md:p-14 text-center text-white overflow-hidden">
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
                <div className="absolute bottom-0 left-0 w-48 h-48 bg-black/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />
              </div>
              <div className="relative">
                <h2 className="text-3xl md:text-4xl font-extrabold mb-4">Siap Mengotomatiskan Bisnis Anda?</h2>
                <p className="text-emerald-100 text-lg mb-8 max-w-xl mx-auto">Mulai gratis sekarang, tidak perlu kartu kredit. Setup hanya 5 menit.</p>
                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                  <Link href="/register">
                    <button className="px-8 py-3.5 bg-white text-emerald-700 font-bold rounded-2xl hover:bg-emerald-50 transition-all shadow-lg text-base flex items-center gap-2">
                      Mulai Gratis <ArrowRight size={18} />
                    </button>
                  </Link>
                  {d?.contact?.whatsapp && (
                    <a href={`https://wa.me/${d.contact.whatsapp}`} target="_blank" rel="noopener noreferrer">
                      <button className="px-8 py-3.5 bg-white/20 backdrop-blur text-white font-semibold rounded-2xl hover:bg-white/30 transition-all border border-white/30 text-base">
                        Hubungi Tim Kami
                      </button>
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>
        </AnimSection>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <footer className="border-t border-border/40 bg-muted/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
          <div className="flex flex-col md:flex-row justify-between gap-6 mb-8">
            {/* Brand */}
            <div className="max-w-xs">
              <div className="flex items-center gap-2 font-extrabold text-lg mb-2">
                <div className="w-8 h-8 flex items-center justify-center shrink-0">
                  {d?.siteLogo?.startsWith("/") || d?.siteLogo?.startsWith("http") ? (
                    <img src={d.siteLogo} alt="Logo" className="w-full h-full object-contain" />
                  ) : (
                    <span className="text-xl">{d?.siteLogo ?? "⚡"}</span>
                  )}
                </div>
                <span>{siteName}</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">{d?.siteTagline ?? "Platform WhatsApp #1 di Indonesia"}</p>
            </div>

            {/* Links */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-6 text-sm">
              <div className="space-y-2">
                <p className="font-semibold text-xs uppercase tracking-widest text-muted-foreground">Produk</p>
                {["Fitur", "Harga", "API Docs"].map((l) => (
                  <button key={l} onClick={() => l === "Fitur" ? scrollTo("features") : l === "Harga" ? scrollTo("pricing") : undefined}
                    className="block text-muted-foreground hover:text-foreground transition-colors">{l}</button>
                ))}
              </div>
              <div className="space-y-2">
                <p className="font-semibold text-xs uppercase tracking-widest text-muted-foreground">Akun</p>
                {[["Daftar", "/register"], ["Masuk", "/login"]].map(([l, href]) => (
                  <Link key={l} href={href} className="block text-muted-foreground hover:text-foreground transition-colors">{l}</Link>
                ))}
              </div>
              <div className="space-y-2">
                <p className="font-semibold text-xs uppercase tracking-widest text-muted-foreground">Kontak</p>
                {d?.contact?.email && (
                  <a href={`mailto:${d.contact.email}`} className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors">
                    <Mail size={12} /> {d.contact.email}
                  </a>
                )}
                {d?.contact?.whatsapp && (
                  <a href={`https://wa.me/${d.contact.whatsapp}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors">
                    <Phone size={12} /> WhatsApp
                  </a>
                )}
              </div>
            </div>
          </div>
          <div className="border-t border-border/40 pt-6 flex flex-col sm:flex-row justify-between items-center gap-2 text-xs text-muted-foreground">
            <p>{d?.footerText ?? `© ${new Date().getFullYear()} ${siteName}. All rights reserved.`}</p>
            <div className="flex items-center gap-4">
              <Link href="/login" className="hover:text-foreground transition-colors">Dashboard</Link>
              <Link href="/register" className="hover:text-foreground transition-colors">Daftar</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

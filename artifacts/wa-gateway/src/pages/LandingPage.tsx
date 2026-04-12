import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useDynamicSEO } from "@/hooks/use-dynamic-seo";
import {
  ChevronDown, ChevronRight, Menu, X, Zap, Bot, MessageSquareText,
  Repeat2, BarChart2, Smartphone, Star, CheckCircle2, ArrowRight,
  Mail, Phone, ExternalLink, Crown, Shield, Facebook, Twitter,
  Instagram, Github, Linkedin
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence, useScroll, useSpring } from "framer-motion";

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
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-100px" }}
      transition={{ duration: 0.8, delay: delay / 1000, ease: [0.21, 0.47, 0.32, 0.98] }}
      className={className}
    >
      {children}
    </motion.div>
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
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 100,
    damping: 30,
    restDelta: 0.001
  });

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
    <div className="relative min-h-screen bg-background text-foreground overflow-x-hidden selection:bg-emerald-500/30">
      {/* Scroll Progress Bar */}
      <motion.div
        className="fixed top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 to-teal-400 z-[100] origin-left"
        style={{ scaleX }} 
      />

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
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-16 -mt-16">
        {/* Background blobs */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <motion.div 
            animate={{ 
              scale: [1, 1.2, 1],
              x: [0, 50, 0],
              y: [0, -50, 0],
            }}
            transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
            className="absolute top-1/4 left-1/4 w-[40rem] h-[40rem] bg-emerald-500/10 dark:bg-emerald-600/5 rounded-full blur-[120px]" 
          />
          <motion.div 
            animate={{ 
              scale: [1, 1.3, 1],
              x: [0, -70, 0],
              y: [0, 40, 0],
            }}
            transition={{ duration: 25, repeat: Infinity, ease: "linear", delay: 2 }}
            className="absolute bottom-1/4 right-1/4 w-[35rem] h-[35rem] bg-teal-500/10 dark:bg-teal-600/5 rounded-full blur-[100px]" 
          />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_transparent_0%,_var(--background)_100%)] opacity-70" />
          
          {/* Enhanced Grid pattern */}
          <div className="absolute inset-0 opacity-[0.05] dark:opacity-[0.1]"
            style={{ backgroundImage: "radial-gradient(circle, #4ade80 1px, transparent 1px)", backgroundSize: "40px 40px" }} />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-24 text-center z-10">
          {/* Pill badge */}
          {d?.siteTagline && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5 }}
              className="inline-flex items-center gap-2 px-6 py-2 rounded-full bg-emerald-500/5 backdrop-blur-md border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-sm font-semibold mb-10 shadow-xl shadow-emerald-500/5"
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              {d.siteTagline}
            </motion.div>
          )}

          {/* Headline */}
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="text-6xl sm:text-7xl md:text-8xl font-black leading-[1.1] tracking-tighter mb-8"
          >
            {(d?.hero.title ?? "Transformasi WhatsApp\nBisnis Anda\nJadi Lebih Cerdas").split("\n").map((line, i, arr) => (
              <span key={i} className={cn("block pb-1", i === 1 ? "bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-400 bg-clip-text text-transparent" : "text-foreground")}>
                {line}
              </span>
            ))}
          </motion.h1>

          {/* Subtitle */}
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.4 }}
            className="text-xl md:text-2xl text-muted-foreground/80 max-w-3xl mx-auto leading-relaxed mb-12 font-medium"
          >
            {d?.hero.subtitle ?? "Solusi WhatsApp Gateway terlengkap: Blast massal, Auto-reply AI, Layanan CS multi-perangkat, dan Analitik mendalam dalam satu dashboard premium."}
          </motion.p>

          {/* CTA Buttons */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.6 }}
            className="flex flex-col sm:flex-row gap-5 justify-center mb-20"
          >
            <Link href="/register">
              <button className="group relative px-10 py-5 bg-foreground text-background font-bold rounded-2xl text-lg hover:bg-emerald-500 hover:text-white transition-all duration-300 shadow-2xl hover:shadow-emerald-500/25 flex items-center justify-center gap-3 active:scale-95 overflow-hidden">
                <span className="relative z-10">{d?.hero.cta1 ?? "Mulai Sekarang"}</span>
                <ArrowRight size={22} className="relative z-10 group-hover:translate-x-1.5 transition-transform" />
                <div className="absolute inset-0 bg-gradient-to-r from-emerald-600 to-teal-500 opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            </Link>
            <Link href="/login">
              <button className="px-10 py-5 border-2 border-border/60 hover:border-emerald-500/50 text-foreground font-bold rounded-2xl text-lg hover:bg-emerald-500/5 transition-all duration-300 backdrop-blur-sm active:scale-95">
                {d?.hero.cta2 ?? "Lihat Demo"}
              </button>
            </Link>
          </motion.div>

          {/* Hero visual — enhanced dashboard mockup */}
          <motion.div 
            initial={{ opacity: 0, y: 50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 1, delay: 0.8, ease: "circOut" }}
            className="relative group cursor-default"
          >
            <div className="absolute -inset-0.5 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-[2.5rem] blur opacity-20 group-hover:opacity-30 transition-opacity" />
            <div className="relative max-w-5xl mx-auto rounded-[2.2rem] border border-white/10 bg-background/40 backdrop-blur-3xl shadow-[0_50px_100px_-20px_rgba(0,0,0,0.3)] dark:shadow-[0_50px_100px_-20px_rgba(0,0,0,0.6)] overflow-hidden">
              {/* Fake browser chrome */}
              <div className="flex items-center justify-between px-6 py-4 bg-muted/30 border-b border-white/5">
                <div className="flex gap-2">
                  <div className="w-3.5 h-3.5 rounded-full bg-rose-500/80" />
                  <div className="w-3.5 h-3.5 rounded-full bg-amber-500/80" />
                  <div className="w-3.5 h-3.5 rounded-full bg-emerald-500/80" />
                </div>
                <div className="flex-1 max-w-sm mx-4 h-7 bg-background/50 rounded-lg border border-white/5 flex items-center justify-center px-4">
                  <span className="text-[11px] text-muted-foreground/60 font-medium tracking-wide flex items-center gap-2">
                    <Shield size={10} className="text-emerald-500" /> app.wagateway.pro
                  </span>
                </div>
                <div className="flex gap-4">
                  <div className="w-4 h-4 rounded bg-white/5" />
                  <div className="w-4 h-4 rounded bg-white/5" />
                </div>
              </div>
              
              {/* Modern Dashboard Layout Preview */}
              <div className="p-8 md:p-10">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-5 mb-8">
                  {[
                    { label: "Total Broadcast", value: "852.410", percentage: "+24.5%", color: "text-emerald-500", icon: Zap },
                    { label: "Active Nodes", value: "32", percentage: "Optimal", color: "text-blue-500", icon: Smartphone },
                    { label: "Auto Reply Hits", value: "12,4k", percentage: "+12.2%", color: "text-violet-500", icon: Bot },
                    { label: "System Uptime", value: "99.98%", percentage: "Secure", color: "text-rose-500", icon: Shield },
                  ].map((s, i) => (
                    <div key={i} className="bg-background/20 backdrop-blur-xl rounded-2xl border border-white/5 p-5 hover:bg-white/5 transition-colors group/card">
                      <div className="flex justify-between items-start mb-3">
                        <div className={cn("p-2.5 rounded-xl bg-white/5 group-hover/card:scale-110 transition-transform", s.color)}>
                          <s.icon size={20} />
                        </div>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500">{s.percentage}</span>
                      </div>
                      <p className="text-xs text-muted-foreground/60 font-medium mb-1">{s.label}</p>
                      <p className={cn("text-2xl font-black tracking-tight", s.color)}>{s.value}</p>
                    </div>
                  ))}
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="md:col-span-2 bg-background/20 backdrop-blur-xl rounded-3xl border border-white/5 p-6">
                    <div className="flex justify-between items-center mb-6">
                      <h4 className="text-sm font-bold opacity-80">Messaging Growth</h4>
                      <div className="flex gap-2">
                        <div className="w-2 h-2 rounded-full bg-emerald-500" />
                        <div className="w-2 h-2 rounded-full bg-teal-500/30" />
                      </div>
                    </div>
                    <div className="flex items-end gap-2.5 h-32 md:h-40">
                      {[30, 45, 35, 60, 50, 85, 40, 70, 95, 65, 80, 100].map((h, i) => (
                        <motion.div 
                          key={i} 
                          initial={{ height: 0 }}
                          animate={{ height: `${h}%` }}
                          transition={{ duration: 1, delay: 1 + (i * 0.05) }}
                          className="flex-1 rounded-t-lg bg-gradient-to-t from-emerald-500/20 via-emerald-500/40 to-emerald-500 hover:opacity-80 transition-opacity cursor-pointer shadow-[0_0_20px_rgba(16,185,129,0.1)]" 
                        />
                      ))}
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div className="bg-background/20 backdrop-blur-xl rounded-3xl border border-white/5 p-6 h-full flex flex-col justify-center">
                      <h4 className="text-sm font-bold opacity-80 mb-6 flex items-center gap-2">
                        <Bot size={16} className="text-emerald-500" /> AI Agent Status
                      </h4>
                      <div className="space-y-5">
                        {[
                          { l: "Support Bot", v: 94, c: "bg-emerald-500" },
                          { l: "Sales Agent", v: 78, c: "bg-teal-500" },
                          { l: "Auto Responder", v: 100, c: "bg-blue-500" }
                        ].map((s) => (
                          <div key={s.l}>
                            <div className="flex justify-between text-[11px] mb-2 font-semibold">
                              <span className="opacity-60">{s.l}</span>
                              <span className="text-emerald-400">{s.v}%</span>
                            </div>
                            <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                              <motion.div 
                                initial={{ width: 0 }}
                                animate={{ width: `${s.v}%` }}
                                transition={{ duration: 1.5, delay: 1.2 }}
                                className={cn("h-full rounded-full shadow-[0_0_10px_rgba(16,185,129,0.2)]", s.c)} 
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            {/* Floating context badges */}
            <motion.div 
              animate={{ y: [0, -10, 0] }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
              className="absolute -top-6 -right-8 md:-right-12 bg-emerald-500 text-white text-sm font-black px-6 py-2.5 rounded-2xl shadow-[0_20px_40px_rgba(16,185,129,0.4)] rotate-3 border border-emerald-400/50"
            >
              Ultra Fast ⚡
            </motion.div>
            <motion.div 
              animate={{ y: [0, 10, 0] }}
              transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 1 }}
              className="absolute -bottom-6 -left-8 md:-left-12 bg-background/80 backdrop-blur-xl border border-white/10 text-foreground text-sm font-black px-6 py-2.5 rounded-2xl shadow-[0_20px_40px_rgba(0,0,0,0.1)] -rotate-3"
            >
              Enterprise Ready 🏢
            </motion.div>
          </motion.div>
        </div>

        {/* Decorative Floating Icons */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden hidden lg:block">
          {[
            { Icon: MessageSquareText, top: "20%", left: "10%", delay: 0, color: "text-emerald-500/20" },
            { Icon: Zap, top: "15%", right: "15%", delay: 1, color: "text-amber-500/20" },
            { Icon: Bot, bottom: "30%", left: "15%", delay: 2, color: "text-blue-500/20" },
            { Icon: Shield, bottom: "20%", right: "10%", delay: 3, color: "text-rose-500/20" },
            { Icon: Crown, top: "40%", right: "20%", delay: 4, color: "text-violet-500/20" },
          ].map((item, i) => (
            <motion.div
              key={i}
              className={cn("absolute scale-150", item.color)}
              style={{ top: item.top, left: item.left, right: item.right, bottom: item.bottom }}
              animate={{
                y: [0, -20, 0],
                rotate: [0, 10, -10, 0],
                opacity: [0.1, 0.3, 0.1]
              }}
              transition={{
                duration: 6 + Math.random() * 4,
                repeat: Infinity,
                delay: item.delay,
              }}
            >
              <item.Icon size={48} strokeWidth={1} />
            </motion.div>
          ))}
        </div>
        {/* Scroll indicator */}
        <motion.div 
          animate={{ y: [0, 10, 0] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-muted-foreground/50 font-bold uppercase tracking-[0.2em] text-[10px]"
        >
          <span>Scroll</span>
          <div className="w-px h-12 bg-gradient-to-t from-emerald-500 to-transparent" />
        </motion.div>
      </section>

      {/* ── Logo Marquee (Trusted By) ────────────────────────────────────────── */}
      <section className="py-12 border-b border-border/40 bg-zinc-50/50 dark:bg-zinc-900/50 overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 mb-8 text-center">
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground">Dipercaya oleh industri terkemuka</p>
        </div>
        <div className="relative flex overflow-x-hidden">
          <div className="animate-marquee whitespace-nowrap flex items-center gap-16 py-4">
            {["Gojek", "Tokopedia", "Shopee", "BliBli", "Astra", "Mandiri", "Angkasa", "Freeport"].map((name, i) => (
              <div key={i} className="flex items-center gap-2 grayscale hover:grayscale-0 opacity-50 hover:opacity-100 transition-all cursor-pointer">
                <div className="w-10 h-10 bg-muted rounded-xl flex items-center justify-center font-black text-xs">
                  {name.slice(0, 2).toUpperCase()}
                </div>
                <span className="font-bold tracking-tight text-lg text-muted-foreground">{name}</span>
              </div>
            ))}
          </div>
          <div className="absolute top-0 animate-marquee2 whitespace-nowrap flex items-center gap-16 py-4">
             {["Gojek", "Tokopedia", "Shopee", "BliBli", "Astra", "Mandiri", "Angkasa", "Freeport"].map((name, i) => (
              <div key={i+"-2"} className="flex items-center gap-2 grayscale hover:grayscale-0 opacity-50 hover:opacity-100 transition-all cursor-pointer">
                <div className="w-10 h-10 bg-muted rounded-xl flex items-center justify-center font-black text-xs">
                  {name.slice(0, 2).toUpperCase()}
                </div>
                <span className="font-bold tracking-tight text-lg text-muted-foreground">{name}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
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
      <section id="features" className="py-24 md:py-32 relative group">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-4xl h-px bg-gradient-to-r from-transparent via-emerald-500/20 to-transparent" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <AnimSection>
            <div className="text-center mb-20">
              <motion.div 
                whileHover={{ scale: 1.05 }}
                className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-black uppercase tracking-widest mb-6"
              >
                <Zap size={14} className="animate-pulse" /> Platform Terunggul
              </motion.div>
              <h2 className="text-4xl md:text-5xl lg:text-6xl font-black mb-6 tracking-tight">Kuasai Komunikasi,<br/>Kembangkan Bisnis</h2>
              <p className="text-muted-foreground text-lg max-w-2xl mx-auto leading-relaxed">Dari startup hingga perusahaan besar, teknologi kami dirancang untuk menangani ribuan percakapan setiap detik dengan akurasi 100%.</p>
            </div>
          </AnimSection>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {(d?.features ?? []).map((f, i) => (
              <AnimSection key={i} delay={i * 80}>
                <motion.div 
                   whileHover={{ y: -10, scale: 1.02 }}
                   className="group relative rounded-[2rem] border border-border/60 hover:border-emerald-500/50 bg-card hover:bg-card/80 p-10 transition-all duration-500 hover:shadow-[0_40px_80px_-20px_rgba(16,185,129,0.15)] overflow-hidden"
                >
                  <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
                    <DynIcon name={f.icon} size={120} strokeWidth={1} />
                  </div>
                  <div className="relative z-10">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500/10 to-teal-500/10 border border-emerald-500/20 flex items-center justify-center mb-8 group-hover:scale-110 group-hover:bg-emerald-500 group-hover:text-white transition-all duration-300 shadow-sm">
                      <DynIcon name={f.icon} size={28} />
                    </div>
                    <h3 className="font-black text-2xl mb-4 tracking-tight">{f.title}</h3>
                    <p className="text-muted-foreground/80 leading-relaxed font-medium">{f.desc}</p>
                    <div className="mt-8 flex items-center gap-2 text-emerald-500 font-bold text-sm cursor-pointer hover:gap-3 transition-all pt-4 border-t border-border/40">
                      Pelajari Selengkapnya <ChevronRight size={16} />
                    </div>
                  </div>
                </motion.div>
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
      <footer className="relative border-t border-border/40 bg-background pt-24 pb-12 overflow-hidden">
        {/* Background Decorations */}
        <div className="absolute inset-0 pointer-events-none opacity-40">
           <div className="absolute bottom-0 left-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-[120px] -translate-x-1/2 translate-y-1/2" />
           <div className="absolute top-0 right-0 w-80 h-80 bg-teal-500/5 rounded-full blur-[100px] translate-x-1/3 -translate-y-1/3" />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-16 mb-20">
            {/* Brand Section */}
            <div className="lg:col-span-5 space-y-8">
              <div className="flex items-center gap-3 font-black text-2xl tracking-tighter group cursor-pointer" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
                <div className="w-12 h-12 flex items-center justify-center bg-foreground text-background rounded-2xl shadow-xl group-hover:rotate-12 transition-transform duration-300">
                  {d?.siteLogo?.startsWith("/") || d?.siteLogo?.startsWith("http") ? (
                    <img src={d.siteLogo} alt="Logo" className="w-full h-full object-contain p-2 inverted" />
                  ) : (
                    <span className="text-2xl">{d?.siteLogo ?? "⚡"}</span>
                  )}
                </div>
                <span className="bg-gradient-to-r from-foreground to-foreground/60 bg-clip-text text-transparent">{siteName}</span>
              </div>
              <p className="text-base text-muted-foreground leading-relaxed max-w-sm font-medium">
                {d?.siteTagline ?? "Platform WhatsApp Gateway All-in-One terpercaya untuk skalabilitas bisnis masa depan Anda."}
              </p>
              <div className="flex items-center gap-4">
                {[
                  { Icon: Twitter, href: "#" },
                  { Icon: Instagram, href: "#" },
                  { Icon: Linkedin, href: "#" },
                  { Icon: Github, href: "#" },
                  { Icon: Facebook, href: "#" },
                ].map((social, i) => (
                  <a key={i} href={social.href} className="w-10 h-10 rounded-xl bg-muted/50 flex items-center justify-center text-muted-foreground hover:bg-emerald-500 hover:text-white transition-all duration-300 shadow-sm">
                    <social.Icon size={18} />
                  </a>
                ))}
              </div>
            </div>

            {/* Links Sections */}
            <div className="lg:col-span-7 grid grid-cols-2 sm:grid-cols-3 gap-12">
              <div className="space-y-6">
                <h5 className="font-black text-xs uppercase tracking-[0.2em] text-foreground/40">Solusi</h5>
                <ul className="space-y-4">
                  {[
                    { l: "Fitur Utama", id: "features" },
                    { l: "Cara Kerja", id: "how-it-works" },
                    { l: "Harga", id: "pricing" },
                    { l: "Enterprise", id: "pricing" },
                    { l: "API Docs", href: "#" }
                  ].map((l, i) => (
                    <li key={i}>
                      {l.id ? (
                        <button onClick={() => scrollTo(l.id)} className="text-sm font-bold text-muted-foreground hover:text-emerald-500 transition-colors flex items-center gap-2 group">
                          <ChevronRight size={14} className="opacity-0 -ml-4 group-hover:opacity-100 group-hover:ml-0 transition-all" />
                          {l.l}
                        </button>
                      ) : (
                        <a href={l.href} className="text-sm font-bold text-muted-foreground hover:text-emerald-500 transition-colors flex items-center gap-2 group">
                          <ChevronRight size={14} className="opacity-0 -ml-4 group-hover:opacity-100 group-hover:ml-0 transition-all" />
                          {l.l}
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="space-y-6">
                <h5 className="font-black text-xs uppercase tracking-[0.2em] text-foreground/40">Perusahaan</h5>
                <ul className="space-y-4">
                  {["Tentang Kami", "Karir", "Blog", "Partner", "Kebijakan Privasi", "Ketentuan Layanan"].map((l, i) => (
                    <li key={i}>
                      <a href="#" className="text-sm font-bold text-muted-foreground hover:text-emerald-500 transition-colors flex items-center gap-2 group">
                        <ChevronRight size={14} className="opacity-0 -ml-4 group-hover:opacity-100 group-hover:ml-0 transition-all" />
                        {l}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="space-y-6 col-span-2 sm:col-span-1">
                <h5 className="font-black text-xs uppercase tracking-[0.2em] text-foreground/40">Dukungan</h5>
                <div className="space-y-6">
                  {d?.contact?.email && (
                    <div className="space-y-2">
                       <p className="text-[10px] font-bold opacity-40 uppercase tracking-widest">Email</p>
                       <a href={`mailto:${d.contact.email}`} className="text-sm font-bold text-muted-foreground hover:text-emerald-500 transition-colors break-all">
                        {d.contact.email}
                      </a>
                    </div>
                  )}
                  {d?.contact?.whatsapp && (
                    <div className="space-y-2">
                       <p className="text-[10px] font-bold opacity-40 uppercase tracking-widest">Phone</p>
                       <a href={`https://wa.me/${d.contact.whatsapp}`} target="_blank" rel="noopener noreferrer" className="text-sm font-bold text-muted-foreground hover:text-emerald-500 transition-colors flex items-center gap-2">
                        <Phone size={14} className="text-emerald-500" /> WhatsApp CS
                      </a>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="pt-12 border-t border-border/40 flex flex-col md:flex-row justify-between items-center gap-8 text-[11px] font-bold tracking-widest text-muted-foreground uppercase">
            <p className="opacity-60">{d?.footerText ?? `© ${new Date().getFullYear()} ${siteName}. Dibuat dengan ❤️ untuk UMKM Indonesia.`}</p>
            <div className="flex items-center gap-8">
              <Link href="/login" className="hover:text-emerald-500 transition-colors">Dashboard Portal</Link>
              <Link href="/register" className="hover:text-emerald-500 transition-colors">Daftar Akun</Link>
              <span className="px-3 py-1 bg-emerald-500/10 text-emerald-500 rounded-full text-[9px] border border-emerald-500/20">v2.4.0 Secure</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

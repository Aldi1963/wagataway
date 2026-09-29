import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import {
  Zap,
  ShieldCheck,
  Headset,
  MousePointerClick,
  Send,
  Users,
  CalendarClock,
  Repeat,
  Variable,
  Paperclip,
  FileSpreadsheet,
  MessagesSquare,
  Bot,
  Webhook,
  Smartphone,
  ContactRound,
  History,
  LayoutTemplate,
  Radio,
  CalendarDays,
  ChartLine,
  Code2,
  KeyRound,
  BookOpen,
  Check,
  ChevronDown,
  Star,
  ArrowRight,
  Menu,
  X,
  BellRing,
  Timer,
  Play,
  FlaskConical,
} from "lucide-react";

/* ── Util: reveal on scroll ─────────────────────────── */
function Reveal({ children, delay = 0, className = "" }: { children: React.ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [vis, setVis] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setVis(true);
          io.disconnect();
        }
      },
      { threshold: 0.12 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={`${className} transition-all duration-700 ease-out ${vis ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
    >
      {children}
    </div>
  );
}

function SectionHead({ kicker, title, desc }: { kicker: string; title: string; desc?: string }) {
  return (
    <Reveal className="text-center max-w-2xl mx-auto mb-12">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-600 mb-3">{kicker}</p>
      <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight text-slate-900">{title}</h2>
      {desc && <p className="text-slate-500 mt-3">{desc}</p>}
    </Reveal>
  );
}

/* ── Navbar ─────────────────────────────────────────── */
const navLinks = [
  { label: "Fitur", href: "#fitur" },
  { label: "Cara Kerja", href: "#cara-kerja" },
  { label: "Harga", href: "#harga" },
  { label: "FAQ", href: "#faq" },
];

function Navbar() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 12);
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);
  return (
    <header className={`fixed top-0 inset-x-0 z-50 transition-all ${scrolled ? "bg-white/90 backdrop-blur-md shadow-sm" : "bg-transparent"}`}>
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
        <a href="#top" className="flex items-center gap-2">
          <span className="w-9 h-9 rounded-xl bg-emerald-500 flex items-center justify-center">
            <Send className="w-5 h-5 text-white" />
          </span>
          <span className="text-lg font-extrabold tracking-tight text-slate-900">WaGataway</span>
        </a>
        <nav className="hidden md:flex items-center gap-8">
          {navLinks.map((l) => (
            <a key={l.href} href={l.href} className="text-sm font-medium text-slate-600 hover:text-emerald-600 transition-colors">
              {l.label}
            </a>
          ))}
          <Link href="/api-docs" className="text-sm font-medium text-slate-600 hover:text-emerald-600 transition-colors">
            Dokumentasi
          </Link>
        </nav>
        <div className="hidden md:flex items-center gap-2">
          <Link href="/login" className="text-sm font-semibold text-slate-700 hover:text-emerald-600 px-3 py-2">
            Masuk
          </Link>
          <Link href="/register" className="text-sm font-semibold bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-lg transition-colors">
            Coba Gratis
          </Link>
        </div>
        <button className="md:hidden p-2 text-slate-700" onClick={() => setOpen((v) => !v)} aria-label="Menu">
          {open ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>
      {open && (
        <div className="md:hidden bg-white border-t border-slate-100 px-4 py-4 space-y-1 shadow-lg">
          {navLinks.map((l) => (
            <a key={l.href} href={l.href} onClick={() => setOpen(false)} className="block px-2 py-2 text-sm font-medium text-slate-700 hover:text-emerald-600">
              {l.label}
            </a>
          ))}
          <Link href="/api-docs" onClick={() => setOpen(false)} className="block px-2 py-2 text-sm font-medium text-slate-700">
            Dokumentasi
          </Link>
          <div className="flex gap-2 pt-2">
            <Link href="/login" onClick={() => setOpen(false)} className="flex-1 text-center text-sm font-semibold border border-slate-200 rounded-lg px-3 py-2">
              Masuk
            </Link>
            <Link href="/register" onClick={() => setOpen(false)} className="flex-1 text-center text-sm font-semibold bg-emerald-500 text-white rounded-lg px-3 py-2">
              Coba Gratis
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}

/* ── Hero: ilustrasi vector + kartu melayang ────── */
function HeroArt() {
  return (
    <div className="relative mx-auto w-full max-w-[420px]">
      <img
        src="/illustrations/messaging-fun.svg"
        alt="Ilustrasi pengiriman pesan WhatsApp otomatis"
        className="w-full h-auto hero-float"
        loading="eager"
      />
      <style>{`
        @keyframes heroFloat { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
        .hero-float { animation: heroFloat 6s ease-in-out infinite; }
      `}</style>
    </div>
  );
}

function Hero() {
  return (
    <section id="top" className="relative overflow-hidden bg-white pt-28 pb-16 md:pt-36 md:pb-20">
      <div className="relative max-w-6xl mx-auto px-4">
        <Reveal>
          <h1 className="text-7xl md:text-8xl font-extrabold tracking-tight text-[#1e2a5c] leading-none">
            CLIDI
          </h1>
          <p className="text-2xl md:text-3xl font-extrabold tracking-wide text-[#1e2a5c] mt-3">
            WHATSAPP API
          </p>
          <p className="text-slate-600 text-lg mt-4">
            Kirim pesan WhatsApp secara otomatis.
          </p>
          <div className="mt-8">
            <Link href="/register" className="inline-flex items-center gap-2 bg-[#1e2a5c] hover:bg-[#16224a] text-white font-semibold px-8 py-4 rounded-2xl transition-colors">
              <Send className="w-5 h-5" /> Coba Gratis
            </Link>
          </div>
        </Reveal>
        <Reveal delay={150} className="mt-12">
          <HeroArt />
        </Reveal>
      </div>
    </section>
  );
}

/* ── Kelebihan ──────────────────────────────────────── */
function Kelebihan() {
  const items = [
    { icon: MousePointerClick, t: "Mudah Digunakan", d: "Dashboard maupun API-nya sangat mudah dipakai, bahkan untuk non-developer." },
    { icon: Zap, t: "Respon API Cepat", d: "API mengeksekusi perintah dengan cepat dan efisien, rata-rata di bawah 100ms." },
    { icon: ShieldCheck, t: "Stabil", d: "Layanan stabil dan tidak putus-putus, dengan notifikasi saat device terputus." },
    { icon: Headset, t: "Support Responsif", d: "Bantuan cepat dan ramah kapan pun Anda butuh, lewat live chat kami." },
  ];
  return (
    <section className="py-20 bg-white">
      <div className="max-w-6xl mx-auto px-4">
        <SectionHead kicker="Kelebihan" title="Kenapa WaGataway?" desc="Beberapa alasan untuk menggunakan WhatsApp API WaGataway." />
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {items.map((it, i) => (
            <Reveal key={it.t} delay={i * 80}>
              <div className="h-full bg-slate-50 hover:bg-emerald-50/60 border border-slate-100 hover:border-emerald-200 rounded-2xl p-6 transition-colors">
                <span className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center mb-4">
                  <it.icon className="w-6 h-6 text-emerald-600" />
                </span>
                <h3 className="font-bold text-slate-900 mb-2">{it.t}</h3>
                <p className="text-sm text-slate-500">{it.d}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── Fitur (tabs ala Fonnte) ────────────────────────── */
type FiturItem = { icon: any; t: string; d: string };
const fiturTabs: { id: string; label: string; items: FiturItem[] }[] = [
  {
    id: "kirim",
    label: "Kirim Pesan",
    items: [
      { icon: Send, t: "Single", d: "Kirim pesan ke 1 nomor tujuan." },
      { icon: Users, t: "Broadcast", d: "Kirim pesan ke banyak nomor sekaligus." },
      { icon: CalendarClock, t: "Terjadwal", d: "Kirim pesan terjadwal sesuai waktu yang ditentukan." },
      { icon: Repeat, t: "Pesan Berulang", d: "Jadwalkan pesan yang dikirim berulang terus-menerus." },
      { icon: Variable, t: "Variable", d: "Personalisasi isi pesan dengan variable seperti {nama}." },
      { icon: Paperclip, t: "Attachment", d: "Kirim gambar, dokumen PDF/Excel, video, dan audio." },
      { icon: FileSpreadsheet, t: "Import CSV", d: "Kirim pesan massal dari file CSV dengan preview." },
      { icon: Timer, t: "Follow Up", d: "Rangkaian pesan lanjutan otomatis (drip campaign) sesuai jeda waktu." },
      { icon: Code2, t: "Simple API", d: "API kirim pesan yang simpel, satu endpoint untuk semua." },
    ],
  },
  {
    id: "balas",
    label: "Balas Otomatis",
    items: [
      { icon: MessagesSquare, t: "Pesan Default", d: "Balas otomatis untuk pesan di luar keyword yang dikenal." },
      { icon: Bot, t: "Keyword Based", d: "Membalas pesan berdasarkan keyword tertentu." },
      { icon: Zap, t: "Template Cepat", d: "Kirim balasan sesuai template yang tersimpan sekali klik." },
      { icon: Webhook, t: "Webhook", d: "Balas pesan secara dinamis dari sistem Anda sendiri." },
      { icon: BellRing, t: "Notifikasi Device", d: "Dapat pemberitahuan saat device terputus." },
      { icon: History, t: "Riwayat Balasan", d: "Semua balasan otomatis tercatat dan bisa ditinjau." },
    ],
  },
  {
    id: "dashboard",
    label: "Dashboard",
    items: [
      { icon: Smartphone, t: "Multi Device", d: "Satu akun bisa mengelola banyak device WhatsApp." },
      { icon: ContactRound, t: "Simpan Kontak", d: "Menyimpan kontak untuk digunakan di kemudian hari." },
      { icon: Users, t: "Grouping Kontak", d: "Kelompokkan kontak untuk pengiriman yang tertarget." },
      { icon: History, t: "Riwayat Pesan", d: "Riwayat pesan yang dikirim melalui layanan kami." },
      { icon: LayoutTemplate, t: "Template Pesan", d: "Simpan template pesan untuk dipakai kapan saja." },
      { icon: Radio, t: "Status Real-time", d: "Pantau status pengiriman pesan secara real-time." },
      { icon: CalendarDays, t: "Kalender Jadwal", d: "Lihat semua pesan terjadwal dalam tampilan kalender." },
      { icon: ChartLine, t: "Analitik Drip", d: "Pantau performa drip campaign per langkah." },
      { icon: MessagesSquare, t: "Live Chat", d: "Balas chat pelanggan langsung dari dashboard." },
    ],
  },
  {
    id: "dev",
    label: "Developer",
    items: [
      { icon: Code2, t: "REST API", d: "Endpoint REST lengkap untuk semua fitur." },
      { icon: KeyRound, t: "API Key", d: "Buat dan kelola banyak API key per akun." },
      { icon: Webhook, t: "Webhook + Retry", d: "Terima event pesan masuk dengan log dan retry otomatis." },
      { icon: BookOpen, t: "Dokumentasi Interaktif", d: "Coba setiap endpoint langsung dari halaman dokumentasi." },
      { icon: ShieldCheck, t: "Keamanan", d: "Key terisolasi per akun, bisa dinonaktifkan kapan saja." },
      { icon: Zap, t: "Cepat", d: "Rata-rata respon API di bawah 100ms." },
    ],
  },
];

function Fitur() {
  const [tab, setTab] = useState("kirim");
  const active = fiturTabs.find((t) => t.id === tab)!;
  return (
    <section id="fitur" className="py-20 bg-slate-50 scroll-mt-16">
      <div className="max-w-6xl mx-auto px-4">
        <SectionHead kicker="Fitur" title="Fitur-fitur WaGataway" desc="Semua yang Anda butuhkan untuk otomatisasi WhatsApp dalam satu platform." />
        <Reveal className="flex flex-wrap justify-center gap-2 mb-10">
          {fiturTabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-5 py-2.5 rounded-full text-sm font-semibold transition-all ${
                tab === t.id ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/25" : "bg-white text-slate-600 border border-slate-200 hover:border-emerald-300"
              }`}
            >
              {t.label}
            </button>
          ))}
        </Reveal>
        <div key={tab} className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {active.items.map((it, i) => (
            <Reveal key={it.t} delay={Math.min(i, 5) * 60}>
              <div className="h-full bg-white border border-slate-100 rounded-2xl p-6 hover:shadow-xl hover:shadow-slate-200/60 hover:-translate-y-1 transition-all">
                <span className="w-11 h-11 rounded-xl bg-emerald-500/10 flex items-center justify-center mb-4">
                  <it.icon className="w-5 h-5 text-emerald-600" />
                </span>
                <h3 className="font-bold text-slate-900 mb-1.5">{it.t}</h3>
                <p className="text-sm text-slate-500">{it.d}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── Cara kerja ─────────────────────────────────────── */
function CaraKerja() {
  const steps = [
    { n: "1", t: "Daftar Gratis", d: "Buat akun dalam hitungan detik, tanpa kartu kredit." },
    { n: "2", t: "Hubungkan Device", d: "Scan QR dari dashboard untuk menautkan nomor WhatsApp Anda." },
    { n: "3", t: "Kirim via API", d: "Dapatkan API key dan mulai kirim pesan dari aplikasi Anda." },
  ];
  return (
    <section id="cara-kerja" className="py-20 bg-white scroll-mt-16">
      <div className="max-w-6xl mx-auto px-4">
        <SectionHead kicker="Cara Kerja" title="Mulai dalam 3 langkah" />
        <div className="grid md:grid-cols-3 gap-6">
          {steps.map((s, i) => (
            <Reveal key={s.n} delay={i * 100}>
              <div className="relative bg-slate-50 border border-slate-100 rounded-2xl p-8 text-center h-full">
                <span className="inline-flex w-12 h-12 rounded-full bg-emerald-500 text-white font-extrabold text-lg items-center justify-center mb-4">{s.n}</span>
                <h3 className="font-bold text-slate-900 text-lg mb-2">{s.t}</h3>
                <p className="text-sm text-slate-500">{s.d}</p>
                {i < 2 && <ArrowRight className="hidden md:block absolute top-1/2 -right-5 -translate-y-1/2 w-6 h-6 text-emerald-300" />}
              </div>
            </Reveal>
          ))}
        </div>
        {/* code sample */}
        <Reveal delay={150} className="mt-14">
          <div className="bg-slate-900 rounded-2xl overflow-hidden shadow-2xl">
            <div className="flex items-center gap-2 px-5 py-3 border-b border-white/10">
              <span className="w-3 h-3 rounded-full bg-red-400" />
              <span className="w-3 h-3 rounded-full bg-amber-400" />
              <span className="w-3 h-3 rounded-full bg-emerald-400" />
              <span className="ml-3 text-xs text-slate-400 font-mono">kirim-pesan.sh</span>
            </div>
            <pre className="p-5 md:p-7 text-[13px] md:text-sm font-mono leading-relaxed overflow-x-auto">
              <code>
                <span className="text-slate-500"># Kirim pesan WhatsApp semudah ini</span>{"\n"}
                <span className="text-emerald-400">curl</span> <span className="text-slate-300">-X POST https://wa.clipku.com/api/messages/send \</span>{"\n"}
                {"  "}<span className="text-sky-400">-H</span> <span className="text-amber-300">"X-API-Key: wg_anda_disini"</span> <span className="text-slate-300">\</span>{"\n"}
                {"  "}<span className="text-sky-400">-H</span> <span className="text-amber-300">"Content-Type: application/json"</span> <span className="text-slate-300">\</span>{"\n"}
                {"  "}<span className="text-sky-400">-d</span> <span className="text-amber-300">'{"{"}"deviceId": 1, "to": "6281234567890", "message": "Halo {"{nama}"}!"{"}"}'</span>
              </code>
            </pre>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ── Demo simulasi ────────────────────────────────── */
function DemoSimulasi() {
  const [nomor, setNomor] = useState("6281234567890");
  const [pesan, setPesan] = useState("Halo! Pesanan Anda sudah dikirim 🚚");
  const [resp, setResp] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const curlCmd = `curl -X POST https://wa.clipku.com/api/messages/send \\\n  -H "X-API-Key: ••••" \\\n  -H "Content-Type: application/json" \\\n  -d '${JSON.stringify({ to: nomor.trim() || "62812...", message: pesan })}'`;

  const kirim = () => {
    const msgId = "3EB0" + Array.from({ length: 8 }, () => "0123456789ABCDEF"[Math.floor(Math.random() * 16)]).join("");
    const full = JSON.stringify(
      { status: "sent", messageId: msgId, to: nomor.trim() || "62812...", timestamp: new Date().toISOString() },
      null,
      2
    );
    setResp("");
    setRunning(true);
    let i = 0;
    const t = setInterval(() => {
      i += 4;
      setResp(full.slice(0, i));
      if (i >= full.length) {
        clearInterval(t);
        setRunning(false);
      }
    }, 10);
  };

  return (
    <section id="demo" className="py-20 bg-slate-50 scroll-mt-16">
      <div className="max-w-6xl mx-auto px-4">
        <SectionHead kicker="Demo" title="Coba simulasi pengiriman" desc="Rasakan alur API tanpa daftar dan tanpa mengirim pesan beneran." />
        <div className="flex justify-center mb-10 -mt-6">
          <span className="inline-flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-700 text-xs font-semibold px-3 py-1.5 rounded-full">
            <FlaskConical className="w-3.5 h-3.5" /> Simulasi — tanpa login, tanpa kirim pesan beneran
          </span>
        </div>
        <div className="grid md:grid-cols-2 gap-6 items-start">
          <Reveal>
            <div className="bg-white border border-slate-200 rounded-2xl p-6">
              <label className="block text-sm font-semibold text-slate-700 mb-2">Nomor WhatsApp tujuan</label>
              <input
                value={nomor}
                onChange={(e) => setNomor(e.target.value)}
                placeholder="6281234567890"
                inputMode="tel"
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 mb-4"
              />
              <label className="block text-sm font-semibold text-slate-700 mb-2">Isi pesan</label>
              <textarea
                value={pesan}
                onChange={(e) => setPesan(e.target.value)}
                rows={4}
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 mb-4 resize-y"
              />
              <button
                onClick={kirim}
                disabled={running}
                className="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60 text-white font-semibold px-6 py-3 rounded-xl transition-colors"
              >
                <Play className="w-4 h-4" /> {running ? "Mengirim…" : "Kirim simulasi"}
              </button>
            </div>
          </Reveal>
          <div className="space-y-4">
            <Reveal delay={100}>
              <div className="bg-slate-900 rounded-2xl overflow-hidden">
                <div className="px-5 py-3 border-b border-white/10 text-xs text-slate-400 font-mono">Request</div>
                <pre className="p-5 text-[12.5px] font-mono leading-relaxed overflow-x-auto">
                  <code className="text-slate-300 whitespace-pre-wrap break-all">{curlCmd}</code>
                </pre>
              </div>
            </Reveal>
            <Reveal delay={150}>
              <div className="bg-slate-900 rounded-2xl overflow-hidden min-h-[190px]">
                <div className="px-5 py-3 border-b border-white/10 flex items-center justify-between">
                  <span className="text-xs text-slate-400 font-mono">Response</span>
                  {resp !== null && !running && <span className="text-xs font-mono font-bold text-emerald-400">200 OK</span>}
                </div>
                <pre className="p-5 text-[12.5px] font-mono leading-relaxed overflow-x-auto">
                  <code className="text-emerald-300 whitespace-pre-wrap">
                    {resp === null ? <span className="text-slate-500">// Tekan "Kirim simulasi" untuk melihat response</span> : resp + (running ? "▍" : "")}
                  </code>
                </pre>
              </div>
            </Reveal>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── WaGataway vs Fonnte ────────────────────────────── */
const vsRows = [
  { prov: "fonnte", paket: "Free", harga: "Rp 0", kuota: "1.000/bln", device: "—", plus: "—" },
  { prov: "wag", paket: "Free", harga: "Rp 0", kuota: "1.000/bln", device: "1", plus: "Gratis selamanya" },
  { prov: "fonnte", paket: "Lite", harga: "Rp 25.000", kuota: "1.000/bln", device: "—", plus: "—" },
  { prov: "wag", paket: "Lite", harga: "Rp 25.000", kuota: "1.000/bln", device: "2", plus: "Attachment & broadcast CSV" },
  { prov: "fonnte", paket: "Regular", harga: "Rp 66.000", kuota: "10.000/bln", device: "—", plus: "—" },
  { prov: "wag", paket: "Regular", harga: "Rp 66.000", kuota: "10.000/bln", device: "3", plus: "Drip campaign + analitik" },
  { prov: "fonnte", paket: "Pro", harga: "Rp 110.000", kuota: "25.000/bln", device: "—", plus: "—" },
  { prov: "wag", paket: "Pro", harga: "Rp 110.000", kuota: "25.000/bln", device: "5", plus: "Multi device + webhook retry" },
  { prov: "fonnte", paket: "Master", harga: "Rp 175.000", kuota: "unlimited", device: "—", plus: "—" },
  { prov: "wag", paket: "Master", harga: "Rp 175.000", kuota: "unlimited", device: "10", plus: "Pesan tanpa batas" },
];

function VsFonnte() {
  return (
    <section id="perbandingan" className="py-20 bg-white scroll-mt-16">
      <div className="max-w-5xl mx-auto px-4">
        <SectionHead kicker="Perbandingan" title="WaGataway vs Fonnte" desc="Bandingkan harga dan kuota secara jujur — lalu putuskan sendiri." />
        <Reveal>
          <div className="overflow-x-auto rounded-2xl border border-slate-200">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="bg-slate-50 text-left">
                  {["Paket", "Harga", "Kuota", "Device", "Nilai plus"].map((h) => (
                    <th key={h} className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-500">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {vsRows.map((r, i) => {
                  const wag = r.prov === "wag";
                  return (
                    <tr key={i} className={`border-t border-slate-100 ${wag ? "bg-emerald-50/70" : "bg-white"}`}>
                      <td className="px-4 py-3">
                        <span className="font-bold text-slate-900">{r.paket}</span>{" "}
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${wag ? "bg-emerald-500 text-white" : "bg-slate-200 text-slate-600"}`}>
                          {wag ? "WaGataway" : "Fonnte"}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-800 whitespace-nowrap">{r.harga}</td>
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{r.kuota}</td>
                      <td className="px-4 py-3 text-slate-600">{r.device}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {wag ? (
                          <span className="inline-flex items-center gap-1.5">
                            <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                            {r.plus}
                          </span>
                        ) : (
                          r.plus
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Reveal>
        <Reveal className="mt-4">
          <p className="text-xs text-slate-400 text-center">Harga Fonnte per fonnte.com (Sep 2026), dapat berubah sewaktu-waktu.</p>
        </Reveal>
      </div>
    </section>
  );
}

/* ── Integrasi ──────────────────────────────────────── */
function Integrasi() {
  const items = ["Toko Online", "CRM", "ERP", "Sistem Kasir", "Aplikasi Absensi", "Notifikasi OTP", "E-Commerce", "Helpdesk"];
  return (
    <section className="py-16 bg-emerald-600 overflow-hidden">
      <div className="max-w-6xl mx-auto px-4 text-center mb-8">
        <Reveal>
          <h2 className="text-2xl md:text-3xl font-extrabold text-white">Terintegrasi dengan sistem Anda</h2>
          <p className="text-emerald-100 mt-2">REST API + Webhook yang simpel — sambungkan ke aplikasi apa pun.</p>
        </Reveal>
      </div>
      <div className="relative">
        <div className="flex gap-4 w-max marquee">
          {[...items, ...items].map((it, i) => (
            <span key={i} className="bg-white/10 border border-white/20 text-white text-sm font-semibold px-5 py-2.5 rounded-full whitespace-nowrap backdrop-blur">
              {it}
            </span>
          ))}
        </div>
        <style>{`@keyframes marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } } .marquee { animation: marquee 22s linear infinite; }`}</style>
      </div>
    </section>
  );
}

/* ── Testimoni ──────────────────────────────────────── */
function Testimoni() {
  const data = [
    { n: "Rian", r: "Owner Online Shop", t: "Notifikasi order otomatis ke pelanggan bikin toko saya kelihatan profesional. Pemasangannya gampang, cukup scan QR dari HP." },
    { n: "Sinta", r: "Digital Marketer", t: "Fitur broadcast + variable personalisasi juara banget. Satu dashboard bisa kelola 3 nomor sekaligus." },
    { n: "Budi", r: "Developer", t: "API-nya simpel dan dokumentasinya jelas, ada fitur coba langsung. Integrasi ke sistem kami selesai dalam sehari." },
    { n: "Maya", r: "Admin Kursus Online", t: "Pengingat jadwal kelas otomatis terkirim ke semua peserta. Follow-up drip campaign-nya ngebantu banget buat nurturing." },
    { n: "Andi", r: "UMKM Kuliner", t: "Harganya ramah buat usaha kecil. Autoreply keyword bikin chat pelanggan tetap terlayani walau lagi sibuk masak." },
    { n: "Dewi", r: "HR Startup", t: "Pesan terjadwal untuk pengumuman ke grup karyawan, plus webhook buat integrasi ke sistem internal. Stabil sejauh ini." },
  ];
  return (
    <section className="py-20 bg-white">
      <div className="max-w-6xl mx-auto px-4">
        <SectionHead kicker="Testimoni" title="Apa kata mereka?" />
        <div className="grid md:grid-cols-3 gap-5">
          {data.map((x, i) => (
            <Reveal key={x.n} delay={(i % 3) * 80}>
              <div className="h-full bg-slate-50 border border-slate-100 rounded-2xl p-6 flex flex-col">
                <div className="flex gap-0.5 mb-3">
                  {Array.from({ length: 5 }).map((_, s) => (
                    <Star key={s} className="w-4 h-4 fill-amber-400 text-amber-400" />
                  ))}
                </div>
                <p className="text-sm text-slate-600 flex-1">"{x.t}"</p>
                <div className="flex items-center gap-3 mt-5">
                  <span className="w-10 h-10 rounded-full bg-emerald-500/15 text-emerald-700 font-bold flex items-center justify-center">{x.n[0]}</span>
                  <div>
                    <p className="text-sm font-bold text-slate-900">{x.n}</p>
                    <p className="text-xs text-slate-400">{x.r}</p>
                  </div>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── Harga ──────────────────────────────────────────── */
type Paket = { nama: string; harga: number; pesan: string; device: number; fitur: string[]; populer?: boolean };
const paketBulanan: Paket[] = [
  {
    nama: "Free",
    harga: 0,
    pesan: "1.000 pesan/bulan",
    device: 1,
    fitur: ["Kirim personal", "Pesan terjadwal", "Pesan berulang", "Template pesan", "Autoreply keyword", "Webhook", "REST API"],
  },
  {
    nama: "Lite",
    harga: 25000,
    pesan: "1.000 pesan/bulan",
    device: 2,
    fitur: ["Semua fitur Free", "Kirim attachment", "Broadcast & CSV", "Notifikasi device", "Live chat", "Prioritas antrean"],
  },
  {
    nama: "Regular",
    harga: 66000,
    pesan: "10.000 pesan/bulan",
    device: 3,
    populer: true,
    fitur: ["Semua fitur Lite", "Drip campaign", "Kalender jadwal", "Analitik pengiriman", "Grup kontak", "2 device tambahan"],
  },
  {
    nama: "Pro",
    harga: 110000,
    pesan: "25.000 pesan/bulan",
    device: 5,
    fitur: ["Semua fitur Regular", "Multi device random", "Webhook retry", "Template unlimited", "Support prioritas"],
  },
  {
    nama: "Master",
    harga: 175000,
    pesan: "Unlimited pesan/bulan",
    device: 10,
    fitur: ["Semua fitur Pro", "Pesan tanpa batas", "10 device", "API limit tinggi", "Dedicated support"],
  },
];

type PlanDB = {
  id: number | string;
  name: string;
  slug: string;
  description?: string;
  price: number;
  duration?: string;
  maxDevices: number;
  maxMessages: number;
  maxContacts?: number;
  features: string[];
};

function kuotaLabel(maxMessages: number): string {
  if (!maxMessages || maxMessages >= 1000000) return "Unlimited pesan/bulan";
  return `${maxMessages.toLocaleString("id-ID")} pesan/bulan`;
}

function Harga() {
  const [tahunan, setTahunan] = useState(false);
  const [plans, setPlans] = useState<PlanDB[] | null>(null);
  useEffect(() => {
    let alive = true;
    fetch("/api/public/plans")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (alive && d && Array.isArray(d.plans) && d.plans.length > 0) setPlans(d.plans);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  const rp = (n: number) => (n === 0 ? "Rp 0" : "Rp " + Math.round(n).toLocaleString("id-ID"));
  const daftar: Paket[] = plans
    ? plans.map((p) => ({
        nama: p.name,
        harga: p.price,
        pesan: kuotaLabel(p.maxMessages),
        device: p.maxDevices,
        fitur: Array.isArray(p.features) ? p.features : [],
        populer: p.slug === "regular" || p.name.toLowerCase() === "regular",
      }))
    : paketBulanan;
  return (
    <section id="harga" className="py-20 bg-slate-50 scroll-mt-16">
      <div className="max-w-7xl mx-auto px-4">
        <SectionHead kicker="Paket" title="Harga yang ramah UMKM" desc="Mulai gratis. Upgrade kapan saja sesuai kebutuhan bisnis Anda." />
        <Reveal className="flex justify-center mb-10">
          <div className="bg-white border border-slate-200 rounded-full p-1 flex text-sm font-semibold">
            <button onClick={() => setTahunan(false)} className={`px-5 py-2 rounded-full transition-all ${!tahunan ? "bg-emerald-500 text-white shadow" : "text-slate-500"}`}>
              Bulanan
            </button>
            <button onClick={() => setTahunan(true)} className={`px-5 py-2 rounded-full transition-all ${tahunan ? "bg-emerald-500 text-white shadow" : "text-slate-500"}`}>
              Tahunan <span className="text-xs opacity-80">hemat 2 bulan</span>
            </button>
          </div>
        </Reveal>
        <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-5">
          {daftar.map((p, i) => {
            const harga = tahunan ? p.harga * 10 : p.harga;
            return (
              <Reveal key={p.nama} delay={i * 60}>
                <div className={`relative h-full rounded-2xl p-6 flex flex-col ${p.populer ? "bg-slate-900 text-white shadow-2xl lg:scale-105 border-2 border-emerald-400" : "bg-white border border-slate-200"}`}>
                  {p.populer && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-emerald-500 text-white text-xs font-bold px-3 py-1 rounded-full">PALING LARIS</span>
                  )}
                  <h3 className={`font-extrabold text-lg ${p.populer ? "text-white" : "text-slate-900"}`}>{p.nama}</h3>
                  <p className={`text-2xl font-extrabold mt-2 ${p.populer ? "text-emerald-400" : "text-emerald-600"}`}>{rp(harga)}</p>
                  <p className={`text-xs mt-1 ${p.populer ? "text-slate-400" : "text-slate-400"}`}>{tahunan ? "per tahun" : "per bulan"}</p>
                  <div className={`text-xs font-semibold mt-4 px-3 py-1.5 rounded-lg w-fit ${p.populer ? "bg-white/10 text-emerald-300" : "bg-emerald-50 text-emerald-700"}`}>
                    {p.pesan} · {p.device} device
                  </div>
                  <ul className="mt-4 space-y-2 flex-1">
                    {p.fitur.map((f) => (
                      <li key={f} className={`text-[13px] flex gap-2 ${p.populer ? "text-slate-300" : "text-slate-600"}`}>
                        <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" /> {f}
                      </li>
                    ))}
                  </ul>
                  <Link href="/register" className={`mt-6 text-center text-sm font-semibold rounded-xl px-4 py-2.5 transition-colors ${p.populer ? "bg-emerald-500 hover:bg-emerald-400 text-white" : "bg-slate-100 hover:bg-emerald-50 text-slate-700 hover:text-emerald-700"}`}>
                    {p.harga === 0 ? "Mulai Gratis" : "Pilih Paket"}
                  </Link>
                </div>
              </Reveal>
            );
          })}
        </div>
        <Reveal className="text-center mt-8">
          <p className="text-sm text-slate-400">Butuh pesan unlimited + attachment? Hubungi kami untuk paket <b>All Feature</b> khusus.</p>
        </Reveal>
      </div>
    </section>
  );
}

/* ── FAQ ────────────────────────────────────────────── */
function FAQ() {
  const [open, setOpen] = useState<number | null>(0);
  const items = [
    { q: "Apakah layanan ini resmi dari WhatsApp?", a: "WaGataway adalah layanan unofficial — sama seperti Fonnte dan sejenisnya. Kami mengotomatisasi WhatsApp Web melalui nomor Anda sendiri." },
    { q: "Apakah harus memakai WhatsApp Bisnis?", a: "Tidak. Anda bisa memakai WhatsApp reguler maupun WhatsApp Bisnis." },
    { q: "Apakah bisa dipakai gratis?", a: "Ya! Paket Free memberikan 1.000 pesan/bulan tanpa batas waktu, cocok untuk development dan mencoba semua fitur dasar." },
    { q: "Apakah pengiriman memakai nomor saya?", a: "Ya, nomor pengirim adalah nomor WhatsApp Anda sendiri. Kami sangat menyarankan memakai nomor sekunder khusus untuk otomatisasi." },
    { q: "Bisa kirim gambar, PDF, video, dan audio?", a: "Bisa, lewat fitur attachment yang tersedia mulai paket Lite. Paket Free hanya mendukung pesan teks." },
    { q: "Apakah ada risiko nomor di-banned?", a: "Ya, risikonya selalu ada pada layanan unofficial. Hindari mengirim banyak pesan sekaligus ke nomor yang belum pernah berinteraksi. WaGataway tidak bertanggung jawab atas banned dari pihak WhatsApp." },
    { q: "Berapa kecepatan pengiriman?", a: "Sistem kami membatasi sekitar 10 pesan per detik agar aman — hingga 600 pesan per menit selama tidak terkena limit WhatsApp." },
    { q: "Apakah data saya aman?", a: "Data tersimpan di akun masing-masing, tidak diakses publik, dan hanya dipakai untuk keperluan layanan. Data tidak digunakan untuk kepentingan lain." },
  ];
  return (
    <section id="faq" className="py-20 bg-white scroll-mt-16">
      <div className="max-w-3xl mx-auto px-4">
        <SectionHead kicker="FAQ" title="Pertanyaan yang sering ditanyakan" />
        <div className="space-y-3">
          {items.map((it, i) => (
            <Reveal key={i} delay={Math.min(i, 4) * 50}>
              <div className={`border rounded-2xl overflow-hidden transition-colors ${open === i ? "border-emerald-300 bg-emerald-50/40" : "border-slate-200 bg-white"}`}>
                <button onClick={() => setOpen(open === i ? null : i)} className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left">
                  <span className="font-semibold text-slate-900 text-[15px]">{it.q}</span>
                  <ChevronDown className={`w-5 h-5 text-emerald-600 shrink-0 transition-transform ${open === i ? "rotate-180" : ""}`} />
                </button>
                <div className={`grid transition-all duration-300 ${open === i ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
                  <div className="overflow-hidden">
                    <p className="px-5 pb-5 text-sm text-slate-600 leading-relaxed">{it.a}</p>
                  </div>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── CTA + Footer ───────────────────────────────────── */
function CTA() {
  return (
    <section className="relative py-20 overflow-hidden bg-slate-900">
      <div className="relative max-w-3xl mx-auto px-4 text-center">
        <Reveal>
          <h2 className="text-3xl md:text-4xl font-extrabold text-white tracking-tight">Siap mengotomatisasi WhatsApp bisnis Anda?</h2>
          <p className="text-slate-400 mt-4">Daftar gratis hari ini — 1.000 pesan pertama tiap bulan, tanpa kartu kredit.</p>
          <div className="flex flex-wrap justify-center gap-3 mt-8">
            <Link href="/register" className="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-white font-semibold px-8 py-3.5 rounded-xl transition-colors shadow-lg shadow-emerald-500/25">
              Coba Gratis Sekarang <ArrowRight className="w-4 h-4" />
            </Link>
            <Link href="/api-docs" className="inline-flex items-center gap-2 border border-white/20 hover:border-emerald-400 text-white font-semibold px-8 py-3.5 rounded-xl transition-colors">
              Baca Dokumentasi
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function Footer() {
  const [health, setHealth] = useState<boolean | null>(null);
  useEffect(() => {
    fetch("/health")
      .then((r) => setHealth(r.ok))
      .catch(() => setHealth(false));
  }, []);
  return (
    <footer className="bg-slate-950 text-slate-400 py-12">
      <div className="max-w-6xl mx-auto px-4">
        <div className="grid md:grid-cols-4 gap-8 mb-10">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center"><Send className="w-4 h-4 text-white" /></span>
              <span className="font-extrabold text-white">WaGataway</span>
            </div>
            <p className="text-sm">WhatsApp API Gateway Indonesia. Kirim pesan otomatis dengan mudah.</p>
          </div>
          <div>
            <p className="font-bold text-white text-sm mb-3">Produk</p>
            <div className="space-y-2 text-sm">
              <a href="#fitur" className="block hover:text-emerald-400">Fitur</a>
              <a href="#harga" className="block hover:text-emerald-400">Harga</a>
              <Link href="/api-docs" className="block hover:text-emerald-400">Dokumentasi API</Link>
            </div>
          </div>
          <div>
            <p className="font-bold text-white text-sm mb-3">Perusahaan</p>
            <div className="space-y-2 text-sm">
              <a href="#cara-kerja" className="block hover:text-emerald-400">Cara Kerja</a>
              <a href="#faq" className="block hover:text-emerald-400">FAQ</a>
              <Link href="/login" className="block hover:text-emerald-400">Masuk</Link>
            </div>
          </div>
          <div>
            <p className="font-bold text-white text-sm mb-3">Mulai</p>
            <div className="space-y-2 text-sm">
              <Link href="/register" className="block hover:text-emerald-400">Daftar Gratis</Link>
              <Link href="/api-docs" className="block hover:text-emerald-400">Coba API</Link>
            </div>
          </div>
        </div>
        <div className="border-t border-white/10 pt-6 flex flex-col md:flex-row justify-between gap-2 text-xs">
          <p>© 2026 WaGataway. Layanan unofficial, tidak berafiliasi dengan WhatsApp Inc.</p>
          <span className="inline-flex items-center gap-2 font-semibold">
            <span className="relative flex w-2.5 h-2.5">
              {health && <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />}
              <span className={`relative inline-flex rounded-full w-2.5 h-2.5 ${health === false ? "bg-red-500" : "bg-emerald-500"}`} />
            </span>
            <span className={health === false ? "text-red-400" : "text-emerald-400"}>
              {health === null ? "Memeriksa status…" : health ? "Semua sistem normal" : "Gangguan sistem"}
            </span>
          </span>
          <p>Gunakan nomor sekunder untuk keamanan.</p>
        </div>
      </div>
    </footer>
  );
}

/* ── Sticky CTA (mobile) ────────────────────────────── */
function StickyCTA() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const fn = () => {
      const y = window.scrollY;
      const nearBottom = window.innerHeight + y > document.documentElement.scrollHeight - 200;
      setShow(y > 600 && !nearBottom);
    };
    window.addEventListener("scroll", fn, { passive: true });
    fn();
    return () => window.removeEventListener("scroll", fn);
  }, []);
  return (
    <div
      aria-hidden={!show}
      className={`md:hidden fixed bottom-0 inset-x-0 z-40 transition-transform duration-300 ${show ? "translate-y-0" : "translate-y-full"}`}
    >
      <div className="bg-white border-t border-slate-200 shadow-[0_-4px_20px_rgba(0,0,0,0.08)] px-4 py-3 flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-slate-800">Siap otomatisasi WA bisnis?</p>
        <Link href="/register" className="bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors whitespace-nowrap">
          Coba Gratis
        </Link>
      </div>
    </div>
  );
}

export default function Landing() {
  return (
    <div className="min-h-screen bg-white font-sans antialiased">
      <Navbar />
      <Hero />
      <Kelebihan />
      <Fitur />
      <CaraKerja />
      <DemoSimulasi />
      <VsFonnte />
      <Integrasi />
      <Testimoni />
      <Harga />
      <FAQ />
      <CTA />
      <Footer />
      <StickyCTA />
    </div>
  );
}

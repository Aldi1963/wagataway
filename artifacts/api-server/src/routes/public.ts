import { Router, type IRouter, type Request, type Response } from "express";
import { db, settingsTable, plansTable } from "@workspace/db";
import { eq, asc } from "drizzle-orm";

const router: IRouter = Router();

async function getSetting(key: string, fallback = ""): Promise<string> {
  const [row] = await db.select().from(settingsTable).where(eq(settingsTable.key, key));
  return row?.value ?? fallback;
}

// GET /public/landing — returns all landing page content (no auth required)
router.get("/public/landing", async (_req: Request, res: Response): Promise<void> => {
  const [
    siteName, siteLogo, siteTagline,
    heroTitle, heroSubtitle, heroCta1, heroCta2, heroImage,
    statsRaw, featuresRaw, testimonialsRaw, faqsRaw, howItWorksRaw,
    contactEmail, contactWa, footerText, primaryColor,
    showPricing, showTestimonials, showStats, showHowItWorks,
    // SEO
    seoTitle, seoDescription, seoKeywords, seoOgImage, siteFavicon, seoAuthor, seoRobots,
  ] = await Promise.all([
    getSetting("site_name", "WA Gateway"),
    getSetting("site_logo", "⚡"),
    getSetting("site_tagline", "Platform WhatsApp #1 di Indonesia"),
    getSetting("hero_title", "Kelola WhatsApp\nBisnis Anda\ndengan Mudah"),
    getSetting("hero_subtitle", "Platform all-in-one untuk blast pesan massal, auto reply cerdas, CS Bot bertenaga AI, dan analitik real-time."),
    getSetting("hero_cta1", "Mulai Gratis Sekarang"),
    getSetting("hero_cta2", "Masuk ke Dashboard"),
    getSetting("hero_image", ""),
    getSetting("landing_stats", JSON.stringify([
      { label: "Pengguna Aktif", value: "10.000+" },
      { label: "Pesan Terkirim", value: "50 Juta+" },
      { label: "Uptime", value: "99.9%" },
      { label: "Rating", value: "4.9 / 5" },
    ])),
    getSetting("landing_features", JSON.stringify([
      { icon: "Zap", title: "Blast Pesan Massal", desc: "Kirim ke ribuan kontak WhatsApp sekaligus dengan mudah dan cepat." },
      { icon: "Bot", title: "CS Bot Bertenaga AI", desc: "Layanan pelanggan otomatis 24/7 dengan AI terdepan seperti GPT-4 & Gemini." },
      { icon: "MessageSquareText", title: "Live Chat Terpusat", desc: "Inbox terpusat untuk semua percakapan masuk — kelola tim CS Anda dengan mudah." },
      { icon: "Repeat2", title: "Auto Reply Cerdas", desc: "Atur balasan otomatis berdasarkan kata kunci, jam kerja, dan kondisi tertentu." },
      { icon: "BarChart2", title: "Analitik Real-time", desc: "Pantau performa pengiriman, open rate, dan respons pelanggan secara langsung." },
      { icon: "Smartphone", title: "Multi-Device", desc: "Hubungkan dan kelola banyak nomor WhatsApp dalam satu dashboard." },
    ])),
    getSetting("landing_testimonials", JSON.stringify([
      { name: "Budi Santoso", role: "CEO", company: "TokoBaju.id", text: "WA Gateway mengubah cara kami berkomunikasi dengan pelanggan. Blast ke 10.000 kontak dalam hitungan menit!", avatar: "BS" },
      { name: "Siti Rahayu", role: "Marketing Manager", company: "Kuliner Nusantara", text: "CS Bot AI-nya luar biasa! Bisa menjawab pertanyaan pelanggan 24 jam tanpa perlu tim tambahan.", avatar: "SR" },
      { name: "Ahmad Fauzi", role: "Founder", company: "EduTech Pro", text: "Fitur live chat-nya sangat membantu. Tim CS kami jadi jauh lebih produktif sekarang.", avatar: "AF" },
    ])),
    getSetting("landing_faqs", JSON.stringify([
      { q: "Apakah WA Gateway aman digunakan?", a: "Ya, sangat aman. Kami menggunakan Baileys — library open-source terpercaya yang terhubung langsung ke WhatsApp Web, tanpa melanggar TOS WhatsApp." },
      { q: "Berapa banyak nomor yang bisa saya hubungkan?", a: "Tergantung paket Anda. Paket Free mendukung 1 nomor, Basic hingga 3 nomor, Pro hingga 10 nomor, dan Enterprise tidak terbatas." },
      { q: "Apakah ada garansi uang kembali?", a: "Kami menyediakan trial gratis 7 hari untuk semua paket berbayar. Jika tidak puas, Anda bisa downgrade ke paket Free kapan saja." },
      { q: "Bagaimana cara menghubungkan nomor WhatsApp?", a: "Sangat mudah — cukup scan QR Code dari dashboard kami menggunakan aplikasi WhatsApp di ponsel Anda. Proses hanya membutuhkan 30 detik." },
      { q: "Apakah bisa integrasi dengan sistem lain?", a: "Ya! Kami menyediakan REST API lengkap dan Webhook untuk integrasi dengan CRM, e-commerce, ERP, dan sistem lainnya." },
    ])),
    getSetting("landing_how_it_works", JSON.stringify([
      { step: "1", title: "Daftar & Hubungkan", desc: "Buat akun gratis dan hubungkan nomor WhatsApp Anda dalam 30 detik." },
      { step: "2", title: "Konfigurasi Fitur", desc: "Atur auto reply, CS Bot, blast pesan, dan semua fitur sesuai kebutuhan bisnis Anda." },
      { step: "3", title: "Pantau & Optimalkan", desc: "Lihat analitik real-time dan optimalkan strategi komunikasi bisnis Anda." },
    ])),
    getSetting("contact_email", "support@wagateway.id"),
    getSetting("contact_whatsapp", ""),
    getSetting("footer_text", `© ${new Date().getFullYear()} WA Gateway. All rights reserved.`),
    getSetting("landing_primary_color", "#10b981"),
    getSetting("landing_show_pricing", "true"),
    getSetting("landing_show_testimonials", "true"),
    getSetting("landing_show_stats", "true"),
    getSetting("landing_show_how_it_works", "true"),
    // SEO
    getSetting("seo_title", "WA Gateway — WhatsApp Business Platform"),
    getSetting("seo_description", "Kelola semua pesan WhatsApp bisnis Anda dalam satu dashboard. Blast, Auto Reply, CS Bot AI, Multi Device."),
    getSetting("seo_keywords", "whatsapp gateway, whatsapp api, blast pesan, auto reply whatsapp, cs bot ai"),
    getSetting("seo_og_image", "/og-image.png"),
    getSetting("site_favicon", "/favicon.svg"),
    getSetting("seo_author", "WA Gateway"),
    getSetting("seo_robots", "index, follow"),
  ]);

  // Fetch plans for pricing section
  const plans = await db.select().from(plansTable).orderBy(asc(plansTable.sortOrder), asc(plansTable.priceUsd));

  const parseJSON = (raw: string, fallback: any) => {
    try { return JSON.parse(raw); } catch { return fallback; }
  };

  res.json({
    siteName,
    siteLogo,
    siteTagline,
    hero: { title: heroTitle, subtitle: heroSubtitle, cta1: heroCta1, cta2: heroCta2, image: heroImage },
    stats: parseJSON(statsRaw, []),
    features: parseJSON(featuresRaw, []),
    testimonials: parseJSON(testimonialsRaw, []),
    faqs: parseJSON(faqsRaw, []),
    howItWorks: parseJSON(howItWorksRaw, []),
    plans: plans.map((p) => ({
      id: p.slug, name: p.name, price: p.priceUsd, description: p.description,
      features: parseJSON(p.features ?? "[]", []),
    })),
    contact: { email: contactEmail, whatsapp: contactWa },
    footerText,
    primaryColor,
    show: {
      pricing: showPricing !== "false",
      testimonials: showTestimonials !== "false",
      stats: showStats !== "false",
      howItWorks: showHowItWorks !== "false",
    },
    seo: {
      title: seoTitle,
      description: seoDescription,
      keywords: seoKeywords,
      ogImage: seoOgImage,
      favicon: siteFavicon,
      author: seoAuthor,
      robots: seoRobots,
    },
  });
});

export default router;

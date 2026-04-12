import "dotenv/config";
import { db, settingsTable, plansTable } from "@workspace/db";
import { eq } from "drizzle-orm";

async function seed() {
  console.log("🌱 Seeding landing page data...");

  const settings = [
    { key: "site_name", value: "Gateway Pro" },
    { key: "site_logo", value: "🚀" },
    { key: "site_tagline", value: "WhatsApp Gateway #1 Terpercaya di Indonesia" },
    { key: "hero_title", value: "Automasi WhatsApp\nTanpa Ribet,\nBisnis Melejit." },
    { key: "hero_subtitle", value: "Hubungkan ribuan pelanggan dalam hitungan detik. Blast pesan massal, integrasi AI cerdas, dan kontrol penuh multi-perangkat dalam satu dashboard premium." },
    { key: "landing_stats", value: JSON.stringify([
      { label: "Pengguna Puas", value: "15.000+" },
      { label: "Pesan Terkirim", value: "120 Juta+" },
      { label: "SLA Gateway", value: "99.99%" },
      { label: "Uptime AI", value: "99.8%" },
    ])},
    { key: "landing_features", value: JSON.stringify([
      { icon: "Zap", title: "Smart Blast System", desc: "Kirim ribuan pesan sekaligus dengan algoritma anti-banned cerdas." },
      { icon: "Bot", title: "AI CS Assistant", desc: "AI yang mempelajari bisnis Anda dan membalas pelanggan secara otomatis 24/7." },
      { icon: "Shield", title: "Enterprise Security", desc: "Enkripsi tingkat tinggi dan perlindungan DDoS untuk menjaga data bisnis Anda." },
      { icon: "BarChart2", title: "Advanced Analytics", desc: "Pantau performa kampanye, open rate, dan respon audiens secara real-time." },
      { icon: "Repeat2", title: "Workflow Automation", desc: "Buat alur percakapan otomatis yang kompleks tanpa coding." },
      { icon: "Smartphone", title: "Full Multi-Device", desc: "Kelola puluhan nomor WhatsApp dari departemen berbeda dalam satu akun." },
    ])},
    { key: "landing_testimonials", value: JSON.stringify([
      { name: "Andi Wijaya", role: "Owner", company: "FashionHub", text: "Terbaik! Omzet naik 40% sejak pakai fitur blast dari Gateway Pro. Support-nya juga fast respon.", avatar: "AW" },
      { name: "Rina Kusuma", role: "Digital Marketer", company: "Agency Kita", text: "Bot AI-nya sangat membantu handling tanya-jawab stok barang. Tim kami jadi bisa fokus ke closing saja.", avatar: "RK" },
      { name: "Denny Setiawan", role: "CEO", company: "StartupX", text: "Integrasi API-nya sangat simpel. Kami menghubungkan sistem CRM kami hanya dalam 1 jam.", avatar: "DS" },
    ])},
    { key: "landing_faqs", value: JSON.stringify([
      { q: "Apakah akun saya akan terblokir?", a: "Kami menyediakan fitur Delay, Rotation, dan Random String untuk meminimalisir risiko banned. Namun, kami sarankan tetap gunakan nomor yang sudah berumur." },
      { q: "Bisa pakai nomor pribadi?", a: "Tentu! Anda bisa menggunakan nomor personal maupun WhatsApp Business dengan fitur Multi-Device." },
      { q: "Ada limit pesan per hari?", a: "Limit pesan ditentukan oleh Paket yang Anda pilih. Paket Enterprise bahkan memberikan quota Unlimited." },
      { q: "Bagaimana jika server mati?", a: "SLA kami adalah 99.9%. Jika terjadi kendala sistem, tim engineer kami standby 24 jam untuk pemulihan cepat." },
    ])},
  ];

  for (const s of settings) {
    const [existing] = await db.select().from(settingsTable).where(eq(settingsTable.key, s.key));
    if (existing) {
      await db.update(settingsTable).set({ value: s.value }).where(eq(settingsTable.id, existing.id));
    } else {
      await db.insert(settingsTable).values(s);
    }
  }

  console.log("📦 Seeding plans...");

  const plans = [
    {
      slug: "free",
      name: "Free Plan",
      description: "Cocok untuk eksplorasi awal",
      priceUsd: 0,
      priceIdr: 0,
      limitDevices: 1,
      limitMessagesPerDay: 50,
      features: JSON.stringify(["1 Perangkat", "50 Pesan/Hari", "Auto Reply Dasar", "Dashboard Analitik"]),
      sortOrder: 1,
    },
    {
      slug: "basic",
      name: "Basic",
      description: "Untuk UMKM yang mulai berkembang",
      priceUsd: 15,
      priceIdr: 149000,
      limitDevices: 3,
      limitMessagesPerDay: 500,
      isPopular: true,
      features: JSON.stringify(["3 Perangkat", "500 Pesan/Hari", "Blast Scheduling", "Customer Support 24/7", "Premium Template"]),
      sortOrder: 2,
    },
    {
      slug: "pro",
      name: "Professional",
      description: "Solusi lengkap untuk bisnis skala besar",
      priceUsd: 39,
      priceIdr: 499000,
      limitDevices: 10,
      limitMessagesPerDay: 5000,
      aiCsBotEnabled: true,
      liveChatEnabled: true,
      webhookEnabled: true,
      features: JSON.stringify(["10 Perangkat", "5.000 Pesan/Hari", "AI Chatbot Assistant", "Webhook & API Access", "Custom Integration"]),
      sortOrder: 3,
    },
  ];

  for (const p of plans) {
    const [existing] = await db.select().from(plansTable).where(eq(plansTable.slug, p.slug));
    if (existing) {
      await db.update(plansTable).set(p).where(eq(plansTable.id, existing.id));
    } else {
      await db.insert(plansTable).values(p);
    }
  }

  console.log("✅ Seeding complete!");
}

seed().catch(console.error);

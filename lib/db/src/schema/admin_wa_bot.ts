import { pgTable, text, serial, timestamp, boolean, integer } from "drizzle-orm/pg-core";

export const adminWaBotSettingsTable = pgTable("admin_wa_bot_settings", {
  id: serial("id").primaryKey(),
  deviceId: integer("device_id"),
  isEnabled: boolean("is_enabled").notNull().default(false),
  welcomeMessage: text("welcome_message").notNull().default(
    "👋 Halo! Selamat datang di *WA Center* {{appName}}.\n\nSilakan kirim *email* akun kamu untuk login dan melihat informasi langganan.\n\nContoh: email@kamu.com"
  ),
  menuMessage: text("menu_message").notNull().default(
    "📋 *Menu WA Center*\n\n" +
    "1️⃣ *cek* — Status akun & langganan\n" +
    "2️⃣ *paket* — Lihat semua paket\n" +
    "3️⃣ *langganan [nama]* — Berlangganan paket\n" +
    "4️⃣ *perpanjang* — Perpanjang paket aktif\n" +
    "5️⃣ *riwayat* — Riwayat transaksi\n" +
    "6️⃣ *topup* — Info top up saldo\n" +
    "7️⃣ *tiket [masalah]* — Buat tiket support\n\n" +
    "Ketik *menu* kapan saja untuk melihat ini lagi."
  ),
  helpMessage: text("help_message").notNull().default(
    "🆘 Butuh bantuan lebih lanjut? Hubungi tim support kami.\n\nKetik *menu* untuk melihat daftar perintah."
  ),
  footerText: text("footer_text").notNull().default("WA Gateway — Platform WhatsApp Profesional"),
  sessionTimeoutMinutes: integer("session_timeout_minutes").notNull().default(60),
  appName: text("app_name").notNull().default("WA Gateway"),
  // Reminder settings
  reminderEnabled: boolean("reminder_enabled").notNull().default(false),
  reminderDaysBefore: text("reminder_days_before").notNull().default("7,3,1"),
  reminderMessage: text("reminder_message").notNull().default(
    "⏰ *Reminder Langganan*\n\nHai *{{userName}}*!\n\nLangganan paket *{{planName}}* kamu akan berakhir pada *{{expiry}}* ({{daysLeft}} hari lagi).\n\nKetik *perpanjang* untuk memperpanjang sekarang."
  ),
  // Onboarding settings
  onboardingEnabled: boolean("onboarding_enabled").notNull().default(false),
  onboardingMessage: text("onboarding_message").notNull().default(
    "🎉 *Selamat bergabung di {{appName}}!*\n\nHai *{{userName}}*,\n\nAkun kamu sudah berhasil dibuat. Yuk mulai kirim pesan WhatsApp sekarang!\n\n📱 Tambah perangkat di: *Menu → Perangkat*\n📖 Panduan: ketik *bantuan* di sini\n\nKetik *menu* untuk melihat menu lengkap."
  ),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const adminWaBotSessionsTable = pgTable("admin_wa_bot_sessions", {
  id: serial("id").primaryKey(),
  phone: text("phone").notNull().unique(),
  userId: integer("user_id"),
  userEmail: text("user_email"),
  userName: text("user_name"),
  userPlan: text("user_plan"),
  step: text("step").notNull().default("await_email"),
  pendingPlanSlug: text("pending_plan_slug"),
  lastActivity: timestamp("last_activity", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const adminWaBotBroadcastsTable = pgTable("admin_wa_bot_broadcasts", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  status: text("status").notNull().default("draft"),
  targetCount: integer("target_count").notNull().default(0),
  sentCount: integer("sent_count").notNull().default(0),
  failCount: integer("fail_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
});

export const adminWaBotTicketsTable = pgTable("admin_wa_bot_tickets", {
  id: serial("id").primaryKey(),
  ticketCode: text("ticket_code").notNull(),
  phone: text("phone").notNull(),
  userId: integer("user_id"),
  userName: text("user_name"),
  userEmail: text("user_email"),
  message: text("message").notNull(),
  status: text("status").notNull().default("open"),
  adminReply: text("admin_reply"),
  repliedAt: timestamp("replied_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const adminWaBotConvLogsTable = pgTable("admin_wa_bot_conv_logs", {
  id: serial("id").primaryKey(),
  phone: text("phone").notNull(),
  userId: integer("user_id"),
  userName: text("user_name"),
  direction: text("direction").notNull(),
  message: text("message").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AdminWaBotSettings = typeof adminWaBotSettingsTable.$inferSelect;
export type AdminWaBotSession = typeof adminWaBotSessionsTable.$inferSelect;
export type AdminWaBotBroadcast = typeof adminWaBotBroadcastsTable.$inferSelect;
export type AdminWaBotTicket = typeof adminWaBotTicketsTable.$inferSelect;
export type AdminWaBotConvLog = typeof adminWaBotConvLogsTable.$inferSelect;

import { pgTable, text, serial, timestamp, boolean, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const csBotsTable = pgTable("cs_bots", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  deviceId: integer("device_id").notNull().unique(),
  isEnabled: boolean("is_enabled").notNull().default(false),
  botName: text("bot_name").notNull().default("CS Bot"),
  greetingMessage: text("greeting_message").notNull().default("Halo! Saya adalah asisten virtual. Ada yang bisa saya bantu? 😊"),
  fallbackMessage: text("fallback_message").notNull().default("Maaf, saya belum bisa menjawab pertanyaan itu. Ketik *menu* untuk melihat pilihan, atau ketunggu dibantu oleh agen kami."),
  offlineMessage: text("offline_message").notNull().default("Halo! Kami sedang tidak beroperasi saat ini. Silakan tinggalkan pesan dan kami akan segera merespons. 🙏"),
  menuMessage: text("menu_message").notNull().default("Ketik nomor untuk pilihan:\n1. Informasi produk\n2. Status pesanan\n3. Cara pembayaran\n4. Hubungi agen\n0. Kembali ke menu"),
  businessHoursEnabled: boolean("business_hours_enabled").notNull().default(false),
  businessHoursStart: text("business_hours_start").notNull().default("08:00"),
  businessHoursEnd: text("business_hours_end").notNull().default("17:00"),
  businessDays: text("business_days").notNull().default("1,2,3,4,5"),
  humanHandoffKeyword: text("human_handoff_keyword").notNull().default("agen,manusia,cs,operator"),
  humanHandoffMessage: text("human_handoff_message").notNull().default("Baik, saya akan menghubungkan Anda dengan agen kami. Mohon tunggu sebentar... 🙏"),
  sessionTimeoutMinutes: integer("session_timeout_minutes").notNull().default(30),
  showMenu: boolean("show_menu").notNull().default(true),
  // ── AI Fields ──────────────────────────────────────────────────────────────
  aiEnabled: boolean("ai_enabled").notNull().default(false),
  aiMode: text("ai_mode").notNull().default("ai_fallback"),
  aiModel: text("ai_model").notNull().default("gpt-4o-mini"),
  aiSystemPrompt: text("ai_system_prompt").notNull().default("Kamu adalah asisten customer service yang ramah dan profesional. Jawab pertanyaan pelanggan dengan singkat, jelas, dan sopan. Gunakan bahasa Indonesia yang baik."),
  aiBusinessContext: text("ai_business_context").notNull().default(""),
  aiMaxTokens: integer("ai_max_tokens").notNull().default(300),
  // ── AI Provider override ────────────────────────────────────────────────────
  aiProvider: text("ai_provider").notNull().default("platform"),
  aiApiKey: text("ai_api_key").default(""),
  // ── Language ────────────────────────────────────────────────────────────────
  language: text("language").notNull().default("id"),
  // ── Website Knowledge Base ──────────────────────────────────────────────────
  websiteUrl: text("website_url").default(""),
  websiteContent: text("website_content").default(""),
  websiteContentUpdatedAt: timestamp("website_content_updated_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertCsBotSchema = createInsertSchema(csBotsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCsBot = z.infer<typeof insertCsBotSchema>;
export type CsBot = typeof csBotsTable.$inferSelect;

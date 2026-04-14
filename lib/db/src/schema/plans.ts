import { pgTable, text, serial, timestamp, boolean, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const plansTable = pgTable("plans", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  priceUsd: integer("price_usd").notNull().default(0),
  priceIdr: integer("price_idr").notNull().default(0),
  priceUsdYearly: integer("price_usd_yearly").notNull().default(0),
  priceIdrYearly: integer("price_idr_yearly").notNull().default(0),
  yearlyDiscountPercent: integer("yearly_discount_percent").notNull().default(0),
  period: text("period").notNull().default("monthly"),
  features: text("features").notNull().default("[]"),
  limitDevices: integer("limit_devices").notNull().default(1),
  limitMessagesPerDay: integer("limit_messages_per_day").notNull().default(100),
  limitContacts: integer("limit_contacts").notNull().default(100),
  limitApiCallsPerDay: integer("limit_api_calls_per_day").notNull().default(1000),
  limitBulkRecipients: integer("limit_bulk_recipients").notNull().default(100),
  limitScheduledMessages: integer("limit_scheduled_messages").notNull().default(10),
  limitAutoReplies: integer("limit_auto_replies").notNull().default(5),
  planColor: text("plan_color").notNull().default(""),
  planIcon: text("plan_icon").notNull().default(""),
  trialDays: integer("trial_days").notNull().default(0),
  isPopular: boolean("is_popular").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  aiCsBotEnabled: boolean("ai_cs_bot_enabled").notNull().default(false),
  bulkMessagingEnabled: boolean("bulk_messaging_enabled").notNull().default(true),
  webhookEnabled: boolean("webhook_enabled").notNull().default(false),
  liveChatEnabled: boolean("live_chat_enabled").notNull().default(false),
  apiAccessEnabled: boolean("api_access_enabled").notNull().default(true),
  commerceEnabled: boolean("commerce_enabled").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPlanSchema = createInsertSchema(plansTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPlan = z.infer<typeof insertPlanSchema>;
export type Plan = typeof plansTable.$inferSelect;

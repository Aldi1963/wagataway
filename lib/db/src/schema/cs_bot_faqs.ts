import { pgTable, text, serial, timestamp, boolean, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const csBotFaqsTable = pgTable("cs_bot_faqs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  deviceId: integer("device_id").notNull(),
  category: text("category").notNull().default("Umum"),
  question: text("question").notNull(),
  keywords: text("keywords").notNull(),
  answer: text("answer").notNull(),
  matchType: text("match_type").notNull().default("contains"),
  sortOrder: integer("sort_order").notNull().default(0),
  triggerCount: integer("trigger_count").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  mediaUrl: text("media_url"),
  mediaCaption: text("media_caption"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertCsBotFaqSchema = createInsertSchema(csBotFaqsTable).omit({ id: true, createdAt: true, updatedAt: true, triggerCount: true });
export type InsertCsBotFaq = z.infer<typeof insertCsBotFaqSchema>;
export type CsBotFaq = typeof csBotFaqsTable.$inferSelect;

import { pgTable, text, serial, timestamp, boolean, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const autoRepliesTable = pgTable("auto_replies", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  deviceId: integer("device_id"),
  keyword: text("keyword").notNull(),
  matchType: text("match_type").notNull().default("contains"),
  reply: text("reply").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  triggerCount: integer("trigger_count").notNull().default(0),
  mediaUrl: text("media_url"),
  mediaCaption: text("media_caption"),
  scheduleFrom: text("schedule_from"),
  scheduleTo: text("schedule_to"),
  timezone: text("timezone").notNull().default("Asia/Jakarta"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertAutoReplySchema = createInsertSchema(autoRepliesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAutoReply = z.infer<typeof insertAutoReplySchema>;
export type AutoReply = typeof autoRepliesTable.$inferSelect;

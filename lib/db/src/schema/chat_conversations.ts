import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const chatConversationsTable = pgTable("chat_conversations", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  deviceId: integer("device_id").notNull(),
  jid: text("jid").notNull(),
  contactName: text("contact_name"),
  status: text("status").notNull().default("open"),
  assignedAgent: text("assigned_agent"),
  tags: text("tags"),
  slaDeadline: timestamp("sla_deadline", { withTimezone: true }),
  botPaused: boolean("bot_paused").notNull().default(false),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  summary: text("summary"),
  summaryUpdatedAt: timestamp("summary_updated_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const insertChatConversationSchema = createInsertSchema(chatConversationsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertChatConversation = z.infer<typeof insertChatConversationSchema>;
export type ChatConversation = typeof chatConversationsTable.$inferSelect;

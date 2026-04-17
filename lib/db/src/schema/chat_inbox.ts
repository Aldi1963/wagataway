import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const chatInboxTable = pgTable("chat_inbox", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  deviceId: integer("device_id").notNull(),
  jid: text("jid").notNull(),
  contactName: text("contact_name"),
  fromMe: boolean("from_me").notNull().default(false),
  messageId: text("message_id"),
  text: text("text"),
  mediaUrl: text("media_url"),
  mediaType: text("media_type"),
  status: text("status").notNull().default("received"),
  isRead: boolean("is_read").notNull().default(false),
  isInternal: boolean("is_internal").notNull().default(false),
  transcription: text("transcription"),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
});

export const insertChatInboxSchema = createInsertSchema(chatInboxTable).omit({ id: true, timestamp: true });
export type InsertChatInbox = z.infer<typeof insertChatInboxSchema>;
export type ChatInbox = typeof chatInboxTable.$inferSelect;

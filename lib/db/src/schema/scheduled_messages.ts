import { pgTable, text, serial, timestamp, integer, jsonb } from "drizzle-orm/pg-core";

export const scheduledMessagesTable = pgTable("scheduled_messages", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  deviceId: integer("device_id").notNull(),
  phone: text("phone").notNull(),
  message: text("message").notNull(),
  messageType: text("message_type").notNull().default("text"),
  extra: jsonb("extra"),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
  status: text("status").notNull().default("pending"),
  repeat: text("repeat").notNull().default("none"),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ScheduledMessage = typeof scheduledMessagesTable.$inferSelect;

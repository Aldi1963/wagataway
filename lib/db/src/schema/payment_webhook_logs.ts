import { integer, jsonb, numeric, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const paymentWebhookLogsTable = pgTable("payment_webhook_logs", {
  id: serial("id").primaryKey(),
  gateway: text("gateway").notNull().default("unknown"),
  orderId: text("order_id"),
  userId: integer("user_id"),
  eventStatus: text("event_status"),
  processingStatus: text("processing_status").notNull().default("received"),
  httpStatus: integer("http_status"),
  amount: numeric("amount", { precision: 15, scale: 2 }),
  project: text("project"),
  message: text("message"),
  payload: jsonb("payload").$type<Record<string, unknown> | null>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PaymentWebhookLog = typeof paymentWebhookLogsTable.$inferSelect;

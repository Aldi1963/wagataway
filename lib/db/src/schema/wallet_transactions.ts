import { pgTable, serial, integer, numeric, text, timestamp } from "drizzle-orm/pg-core";

export const walletTransactionsTable = pgTable("wallet_transactions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  amount: numeric("amount", { precision: 15, scale: 2 }).notNull(),
  type: text("type").notNull(), // "topup" | "auto_renew" | "manual_renew"
  status: text("status").notNull().default("pending"), // "pending" | "paid" | "failed"
  orderId: text("order_id"),
  description: text("description"),
  planId: text("plan_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type WalletTransaction = typeof walletTransactionsTable.$inferSelect;

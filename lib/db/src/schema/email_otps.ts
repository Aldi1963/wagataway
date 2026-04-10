import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";

export const emailOtpsTable = pgTable("email_otps", {
  id: serial("id").primaryKey(),
  email: text("email").notNull(),
  otp: text("otp").notNull(),
  type: text("type").notNull(), // "register" | "forgot_password"
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type EmailOtp = typeof emailOtpsTable.$inferSelect;

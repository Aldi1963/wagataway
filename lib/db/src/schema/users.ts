import { pgTable, text, serial, timestamp, boolean, integer, numeric, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  avatar: text("avatar"),
  plan: text("plan").notNull().default("free"),
  role: text("role").notNull().default("user"),
  isSuspended: boolean("is_suspended").notNull().default(false),
  googleId: text("google_id").unique(),
  openaiApiKey: text("openai_api_key"),
  aiSettings: jsonb("ai_settings").notNull().default({}),
  twoFaEnabled: boolean("two_fa_enabled").notNull().default(false),
  twoFaSecret: text("two_fa_secret"),
  cleanupDays: integer("cleanup_days").notNull().default(90),
  cleanupEnabled: boolean("cleanup_enabled").notNull().default(false),
  balance: numeric("balance", { precision: 15, scale: 2 }).notNull().default("0"),
  autoRenew: boolean("auto_renew").notNull().default(false),
  isReseller: boolean("is_reseller").notNull().default(false),
  parentId: integer("parent_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;

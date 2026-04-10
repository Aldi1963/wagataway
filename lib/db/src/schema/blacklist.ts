import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";

export const blacklistTable = pgTable("blacklist", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  phone: text("phone").notNull(),
  reason: text("reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Blacklist = typeof blacklistTable.$inferSelect;
export type NewBlacklist = typeof blacklistTable.$inferInsert;

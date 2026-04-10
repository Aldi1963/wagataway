import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";

export const shortLinksTable = pgTable("short_links", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  code: text("code").notNull().unique(),
  originalUrl: text("original_url").notNull(),
  title: text("title"),
  clicks: integer("clicks").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ShortLink = typeof shortLinksTable.$inferSelect;
export type NewShortLink = typeof shortLinksTable.$inferInsert;

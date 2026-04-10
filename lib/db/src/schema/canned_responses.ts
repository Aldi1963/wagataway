import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const cannedResponsesTable = pgTable("canned_responses", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  shortcut: text("shortcut").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const insertCannedResponseSchema = createInsertSchema(cannedResponsesTable).omit({ id: true, createdAt: true });
export type InsertCannedResponse = z.infer<typeof insertCannedResponseSchema>;
export type CannedResponse = typeof cannedResponsesTable.$inferSelect;

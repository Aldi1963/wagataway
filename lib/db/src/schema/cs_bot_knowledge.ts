import { pgTable, text, serial, timestamp, boolean, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { csBotsTable } from "./cs_bots";

export const csBotKnowledgeTable = pgTable("cs_bot_knowledge", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  botId: integer("bot_id").notNull(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  sourceType: text("source_type").notNull().default("manual"), // manual, website, file
  isActive: boolean("is_active").notNull().default(true),
  charCount: integer("char_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertCsBotKnowledgeSchema = createInsertSchema(csBotKnowledgeTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCsBotKnowledge = z.infer<typeof insertCsBotKnowledgeSchema>;
export type CsBotKnowledge = typeof csBotKnowledgeTable.$inferSelect;

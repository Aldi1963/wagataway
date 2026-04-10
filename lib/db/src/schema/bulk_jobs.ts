import { pgTable, text, serial, timestamp, integer, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const bulkJobsTable = pgTable("bulk_jobs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  deviceId: integer("device_id").notNull(),
  name: text("name").notNull().default(""),
  message: text("message").notNull(),
  mediaUrl: text("media_url"),
  mediaType: text("media_type"),
  total: integer("total").notNull().default(0),
  sent: integer("sent").notNull().default(0),
  failed: integer("failed").notNull().default(0),
  pending: integer("pending").notNull().default(0),
  status: text("status").notNull().default("running"),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
  recipients: jsonb("recipients").$type<{ phone: string; name?: string }[]>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  messageType: text("message_type").notNull().default("text"), // text, media, button, list
  extra: jsonb("extra"), // buttons, footer, sections, etc.
});

export const insertBulkJobSchema = createInsertSchema(bulkJobsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertBulkJob = z.infer<typeof insertBulkJobSchema>;
export type BulkJob = typeof bulkJobsTable.$inferSelect;

import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const contactGroupsTable = pgTable("contact_groups", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  name: text("name").notNull(),
  color: text("color").notNull().default("#3b82f6"),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const contactGroupMembersTable = pgTable("contact_group_members", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id").notNull(),
  contactId: integer("contact_id").notNull(),
  userId: integer("user_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertContactGroupSchema = createInsertSchema(contactGroupsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertContactGroup = z.infer<typeof insertContactGroupSchema>;
export type ContactGroup = typeof contactGroupsTable.$inferSelect;

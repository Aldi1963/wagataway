import { pgTable, text, serial, timestamp, integer, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const dripCampaignsTable = pgTable("drip_campaigns", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  deviceId: integer("device_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const dripStepsTable = pgTable("drip_steps", {
  id: serial("id").primaryKey(),
  campaignId: integer("campaign_id").notNull(),
  userId: integer("user_id").notNull(),
  stepOrder: integer("step_order").notNull().default(0),
  delayDays: integer("delay_days").notNull().default(0),
  message: text("message").notNull(),
  mediaUrl: text("media_url"),
  mediaType: text("media_type"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const dripEnrollmentsTable = pgTable("drip_enrollments", {
  id: serial("id").primaryKey(),
  campaignId: integer("campaign_id").notNull(),
  userId: integer("user_id").notNull(),
  phone: text("phone").notNull(),
  contactName: text("contact_name"),
  currentStep: integer("current_step").notNull().default(0),
  nextSendAt: timestamp("next_send_at", { withTimezone: true }),
  status: text("status").notNull().default("active"),
  enrolledAt: timestamp("enrolled_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export const insertDripCampaignSchema = createInsertSchema(dripCampaignsTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertDripStepSchema = createInsertSchema(dripStepsTable).omit({ id: true, createdAt: true });
export const insertDripEnrollmentSchema = createInsertSchema(dripEnrollmentsTable).omit({ id: true, enrolledAt: true });
export type DripCampaign = typeof dripCampaignsTable.$inferSelect;
export type DripStep = typeof dripStepsTable.$inferSelect;
export type DripEnrollment = typeof dripEnrollmentsTable.$inferSelect;

import {
  boolean,
  customType,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

/** Opt-in monthly readiness schedule. Missing row means off. */
export const monthlyReadinessSettings = pgTable("monthly_readiness_settings", {
  clientId: integer("client_id").primaryKey(),
  enabled: boolean("enabled").notNull().default(false),
  dayOfMonth: integer("day_of_month").notNull().default(1),
  truthFilePath: text("truth_file_path"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const monthlyReadinessReports = pgTable("monthly_readiness_reports", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull(),
  periodStart: date("period_start").notNull(),
  periodEnd: date("period_end").notNull(),
  generatedAt: timestamp("generated_at").defaultNow().notNull(),
  status: varchar("status", { length: 20 }).notNull().default("draft"),
  filename: varchar("filename", { length: 255 }).notNull(),
  pdf: bytea("pdf").notNull(),
  summary: jsonb("summary"),
}, (table) => ({
  periodIdx: uniqueIndex("monthly_readiness_reports_period_idx").on(
    table.clientId,
    table.periodStart,
    table.periodEnd,
  ),
  clientIdx: index("monthly_readiness_reports_client_idx").on(table.clientId),
}));

export type MonthlyReadinessSettings = typeof monthlyReadinessSettings.$inferSelect;
export type MonthlyReadinessReport = typeof monthlyReadinessReports.$inferSelect;

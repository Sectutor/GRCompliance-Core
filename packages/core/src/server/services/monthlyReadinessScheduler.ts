import { eq } from "drizzle-orm";
import { getDb } from "../../db";
import { monthlyReadinessSettings } from "../../schema";
import { generateMonthlyReadiness } from "../../lib/readiness/store";
import { schedulerEnabled, selectDueSettings } from "../../lib/readiness/period";

let timer: NodeJS.Timeout | null = null;

/** Generate drafts for workspaces that opted in and whose day of the month is today (UTC). Does not send email. */
export async function runDueReports(now = new Date()): Promise<void> {
  const db = await getDb();
  const rows = await db.select({
    clientId: monthlyReadinessSettings.clientId,
    enabled: monthlyReadinessSettings.enabled,
    dayOfMonth: monthlyReadinessSettings.dayOfMonth,
  }).from(monthlyReadinessSettings).where(eq(monthlyReadinessSettings.enabled, true));

  for (const row of selectDueSettings(rows, now)) {
    try {
      const stored = await generateMonthlyReadiness(row.clientId, { asOf: now, mode: "scheduled" });
      console.log(`[MonthlyReadiness] workspace ${row.clientId} stored ${stored.filename} (${stored.status})`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown";
      console.error(`[MonthlyReadiness] workspace ${row.clientId} failed: ${message}`);
    }
  }
}

/** Starts only when ENABLE_MONTHLY_READINESS_SCHEDULER is exactly "true". */
export function start(): void {
  if (!schedulerEnabled()) {
    console.log("[MonthlyReadiness] Scheduler is off. Set ENABLE_MONTHLY_READINESS_SCHEDULER=true to run it.");
    return;
  }
  stop();
  const tick = () => {
    runDueReports().catch((error) => {
      const message = error instanceof Error ? error.message : "unknown";
      console.error(`[MonthlyReadiness] tick failed: ${message}`);
    });
  };
  timer = setInterval(tick, 60 * 60 * 1000);
  tick();
  console.log("[MonthlyReadiness] Scheduler started");
}

export function stop(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

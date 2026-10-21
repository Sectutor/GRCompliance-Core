export interface ScheduleRow {
  clientId: number;
  enabled: boolean;
  dayOfMonth: number;
}

export function utcDayString(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseUtcDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

/** Period ending the day before asOf, starting one month before asOf. */
export function reportingPeriod(asOf: Date): { start: string; end: string; asOf: string } {
  const start = new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth() - 1, asOf.getUTCDate()));
  const end = new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate() - 1));
  return { start: utcDayString(start), end: utcDayString(end), asOf: utcDayString(asOf) };
}

export function schedulerEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.ENABLE_MONTHLY_READINESS_SCHEDULER === "true";
}

/** Workspaces whose monthly draft is due. Disabled rows never match. */
export function selectDueSettings(rows: ScheduleRow[], now: Date): ScheduleRow[] {
  const day = now.getUTCDate();
  return rows.filter((row) => row.enabled === true && row.dayOfMonth >= 1 && row.dayOfMonth <= 28 && row.dayOfMonth === day);
}

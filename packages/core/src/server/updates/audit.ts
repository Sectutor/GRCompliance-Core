import { sql } from "drizzle-orm";
import { getDb } from "../../db";
import { logActivity } from "../../lib/audit";
import type { UpdateAudit } from "./routes";

export async function auditUpdate(event: UpdateAudit): Promise<void> {
    await logActivity({
        userId: event.userId,
        action: event.action,
        entityType: "system",
        details: event.details,
        severity: event.severity || "info",
    });
}

export async function markUpgradeStarted(event: { userId: number; runId: string; version: string | null }): Promise<void> {
    const db = await getDb();
    await db.execute(sql`
        INSERT INTO upgrade_events (run_id, state, actor_user_id, details)
        VALUES (${event.runId}, 'started', ${event.userId}, ${JSON.stringify({ version: event.version })})
        ON CONFLICT (run_id) DO NOTHING
    `);
}

export async function noteUpgradeTerminal(event: {
    userId: number;
    runId: string;
    state: string;
    rolledBack: boolean;
    message: string | null;
    error: string | null;
    version: string | null;
}): Promise<void> {
    const db = await getDb();
    const existing = await db.execute(sql`SELECT state FROM upgrade_events WHERE run_id = ${event.runId}`);
    const rows = Array.isArray(existing) ? existing : [];
    const previous = rows[0] && typeof rows[0] === "object" ? String((rows[0] as { state?: string }).state || "") : "";
    if (previous === "succeeded" || previous === "failed") return;
    await db.execute(sql`
        INSERT INTO upgrade_events (run_id, state, actor_user_id, details)
        VALUES (${event.runId}, ${event.state}, ${event.userId}, ${JSON.stringify(event)})
        ON CONFLICT (run_id) DO UPDATE
        SET state = EXCLUDED.state, details = EXCLUDED.details
    `);
    const action = event.rolledBack
        ? "upgrade_rolled_back"
        : event.state === "succeeded"
            ? "upgrade_completed"
            : "upgrade_failed";
    await auditUpdate({
        userId: event.userId,
        action,
        severity: event.state === "succeeded" ? "info" : "warning",
        details: {
            runId: event.runId,
            version: event.version,
            message: event.message,
            error: event.error,
            rolledBack: event.rolledBack,
        },
    });
}

import { eq } from "drizzle-orm";
import { ANNEX_A_FRAMEWORK } from "../data/annexACatalog";
import { getDb } from "../db";
import { planAnnexACatalogSync } from "../lib/soaListing";
import { controls } from "../schema";

type Database = Awaited<ReturnType<typeof getDb>>;

/**
 * Idempotent Annex A load for a new or existing database.
 * Inserts catalog rows that are missing and renames the two legacy seed references.
 * Does not delete controls and does not update client_controls, so status and
 * justification already saved for a workspace stay as they are.
 */
export async function ensureAnnexACatalog(database?: Database) {
    const db = database ?? await getDb();
    const existing = await db.select({
        id: controls.id,
        controlId: controls.controlId,
        name: controls.name,
    }).from(controls);

    const plan = planAnnexACatalogSync(existing.map((row) => ({
        id: row.id,
        controlId: row.controlId,
        name: row.name,
    })));

    for (const rename of plan.renames) {
        await db.update(controls)
            .set({
                controlId: rename.to,
                ...(rename.name ? { name: rename.name } : {}),
                updatedAt: new Date(),
            })
            .where(eq(controls.id, rename.id));
    }

    for (const title of plan.titleUpdates) {
        await db.update(controls)
            .set({
                name: title.name,
                updatedAt: new Date(),
            })
            .where(eq(controls.id, title.id));
    }

    if (plan.inserts.length > 0) {
        await db.insert(controls).values(plan.inserts.map((row) => ({
            controlId: row.controlId,
            name: row.name,
            description: row.description,
            framework: ANNEX_A_FRAMEWORK,
            category: row.theme,
            grouping: row.theme,
            status: "active" as const,
            version: 1,
        })));
    }

    return {
        renamed: plan.renames.length,
        titlesAligned: plan.titleUpdates.length,
        inserted: plan.inserts.length,
    };
}

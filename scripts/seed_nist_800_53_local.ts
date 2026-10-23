import 'dotenv/config';
import { and, eq, isNull } from 'drizzle-orm';
import { getDb } from '../packages/core/src/db';
import { loadNist80053Rev5Controls } from '../packages/core/src/data/frameworks/nist80053Catalog';
import { controls } from '../packages/core/src/schema';

/**
 * Idempotent seed of NIST SP 800-53 Rev. 5.2.0 from the bundled OSCAL catalog.
 * Updates and inserts are limited to framework "NIST 800-53" rows with no client,
 * so a control id shared with FedRAMP or a workspace import is left alone.
 * Re-running updates catalog fields in place and inserts controls that are missing.
 */

const FRAMEWORK = "NIST 800-53";

async function seed() {
    const rows = loadNist80053Rev5Controls();
    console.log(`Loaded ${rows.length} controls from nist-800-53-rev5.json`);
    const db = await getDb();

    const existing = await db.select().from(controls).where(and(
        eq(controls.framework, FRAMEWORK),
        isNull(controls.clientId),
    ));
    const byControlId = new Map<string, typeof existing>();
    for (const row of existing) {
        const bucket = byControlId.get(row.controlId) ?? [];
        bucket.push(row);
        byControlId.set(row.controlId, bucket);
    }

    const toInsert = [];
    let updated = 0;
    for (const row of rows) {
        const matches = byControlId.get(row.controlId) ?? [];
        if (matches.length === 0) {
            toInsert.push({
                ...row,
                frequency: "Annual",
                evidenceType: "Document",
            });
            continue;
        }
        for (const match of matches) {
            await db.update(controls).set({
                name: row.name,
                description: row.description,
                category: row.category,
                grouping: row.grouping,
                status: row.status,
                version: row.version,
                implementationGuidance: row.implementationGuidance,
                updatedAt: new Date(),
            }).where(eq(controls.id, match.id));
            updated++;
        }
    }

    const chunkSize = 200;
    for (let i = 0; i < toInsert.length; i += chunkSize) {
        await db.insert(controls).values(toInsert.slice(i, i + chunkSize));
    }

    console.log(`Finished. Added: ${toInsert.length}, Updated: ${updated}`);
    process.exit(0);
}

seed().catch(err => {
    console.error("Seeding failed:", err);
    process.exit(1);
});

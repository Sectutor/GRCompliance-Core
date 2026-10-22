import { and, eq, inArray } from "drizzle-orm";
import { ANNEX_A_CONTROLS } from "../data/annexACatalog";
import { getDb } from "../db";
import { mergeSoaListing, type SoaListEntry } from "../lib/soaListing";
import { clientControls, controls } from "../schema";
import { ensureAnnexACatalog } from "./ensureAnnexACatalog";

const annexControlIds = ANNEX_A_CONTROLS.map((control) => control.controlId);

type Database = Awaited<ReturnType<typeof getDb>>;

/** Full Annex A statement for one workspace. Missing controls stay unadopted. */
export async function loadAnnexAStatement(clientId: number, database?: Database): Promise<SoaListEntry[]> {
    const db = database ?? await getDb();
    await ensureAnnexACatalog(db);

    const stored = await db.select({
        id: controls.id,
        controlId: controls.controlId,
        name: controls.name,
        description: controls.description,
        framework: controls.framework,
        category: controls.category,
    }).from(controls).where(inArray(controls.controlId, annexControlIds));

    const adopted = await db.select({
        clientControl: {
            id: clientControls.id,
            status: clientControls.status,
            applicability: clientControls.applicability,
            justification: clientControls.justification,
            implementationNotes: clientControls.implementationNotes,
            clientControlId: clientControls.clientControlId,
        },
        control: { controlId: controls.controlId },
    }).from(clientControls)
        .innerJoin(controls, eq(clientControls.controlId, controls.id))
        .where(and(
            eq(clientControls.clientId, clientId),
            inArray(controls.controlId, annexControlIds),
        ));

    return mergeSoaListing(stored, adopted);
}

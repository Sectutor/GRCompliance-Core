/**
 * @vitest-environment node
 */
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ANNEX_A_CONTROLS } from "../data/annexACatalog";
import { clientControls, controls } from "../schema";
import { ensureAnnexACatalog } from "./ensureAnnexACatalog";

const databaseUrl = process.env.SOA_CATALOG_DATABASE_URL;
const describeDb = databaseUrl ? describe : describe.skip;

describeDb("ensureAnnexACatalog on an existing database", () => {
    const sql = postgres(databaseUrl as string, { max: 1 });
    const db = drizzle(sql);

    beforeAll(async () => {
        await sql.unsafe(`
            DROP TABLE IF EXISTS client_controls;
            DROP TABLE IF EXISTS controls;
            DROP TYPE IF EXISTS client_control_status;
            DROP TYPE IF EXISTS control_status;
            CREATE TYPE control_status AS ENUM ('active', 'inactive', 'draft');
            CREATE TYPE client_control_status AS ENUM ('not_implemented', 'in_progress', 'implemented', 'not_applicable');
            CREATE TABLE controls (
                id serial PRIMARY KEY,
                control_id varchar(50) NOT NULL,
                name varchar(255) NOT NULL,
                description text,
                framework varchar(255) NOT NULL,
                owner varchar(255),
                frequency varchar(50),
                evidence_type varchar(100),
                status control_status DEFAULT 'draft',
                version integer DEFAULT 1 NOT NULL,
                category varchar(255),
                "grouping" varchar(255),
                implementation_guidance text,
                suggested_policies text,
                updated_at timestamp DEFAULT now(),
                created_at timestamp DEFAULT now(),
                client_id integer,
                ai_guidance text
            );
            CREATE TABLE client_controls (
                id serial PRIMARY KEY,
                client_id integer NOT NULL,
                control_id integer NOT NULL,
                client_control_id varchar(50),
                custom_description text,
                owner varchar(255),
                due_date timestamp,
                applicability varchar(50) DEFAULT 'applicable',
                justification text,
                implementation_date timestamp,
                implementation_notes text,
                evidence_location text,
                status client_control_status DEFAULT 'not_implemented',
                updated_at timestamp DEFAULT now(),
                created_at timestamp DEFAULT now()
            );
        `);
        await sql`
            INSERT INTO controls (control_id, name, description, framework, category, status)
            VALUES
                ('A.5-Policies', 'Information Security Policies', 'Legacy seed description', 'ISO 27001', 'Governance', 'active'),
                ('A.9-Access', 'Access Control', 'Legacy access description', 'ISO 27001', 'Access Control', 'active'),
                ('A.5.10', 'Acceptable use', 'Workspace wording for acceptable use.', 'ISO 27001', 'People', 'active'),
                ('CC6.1', 'Logical Access Controls', 'SOC control', 'SOC 2', 'Access Control', 'active')
        `;
        await sql`
            INSERT INTO client_controls (client_id, control_id, client_control_id, status, applicability, justification)
            VALUES (7, 1, 'CC-001', 'implemented', 'applicable', 'Do not touch this justification')
        `;
    });

    afterAll(async () => {
        await sql.end({ timeout: 5 });
    });

    it("loads all 93 controls through the bootstrap ensure step without changing workspace rows", async () => {
        const first = await ensureAnnexACatalog(db as never);
        expect(first.renamed).toBe(2);
        expect(first.inserted).toBe(90);

        const annexRows = await db.select({
            id: controls.id,
            controlId: controls.controlId,
            name: controls.name,
            description: controls.description,
            category: controls.category,
        }).from(controls);

        const byCode = new Map(annexRows.map((row) => [row.controlId, row]));
        expect(byCode.has("A.5-Policies")).toBe(false);
        expect(byCode.has("A.9-Access")).toBe(false);
        expect(ANNEX_A_CONTROLS.every((control) => byCode.has(control.controlId))).toBe(true);

        const policies = byCode.get("A.5.1");
        expect(policies).toMatchObject({ id: 1, name: "Policies for information security" });
        expect(policies?.description).toBe("Legacy seed description");
        expect(policies?.category).toBe("Governance");

        const acceptable = byCode.get("A.5.10");
        expect(acceptable).toMatchObject({
            name: "Acceptable use of information and other associated assets",
            description: "Workspace wording for acceptable use.",
            category: "People",
        });

        expect(byCode.get("CC6.1")?.name).toBe("Logical Access Controls");

        const [workspace] = await db.select().from(clientControls).where(eq(clientControls.clientId, 7));
        expect(workspace).toMatchObject({
            controlId: 1,
            clientControlId: "CC-001",
            status: "implemented",
            applicability: "applicable",
            justification: "Do not touch this justification",
        });
        const allWorkspace = await db.select({ id: clientControls.id }).from(clientControls);
        expect(allWorkspace).toHaveLength(1);

        const second = await ensureAnnexACatalog(db as never);
        expect(second).toEqual({ renamed: 0, titlesAligned: 0, inserted: 0 });
        const [again] = await db.select({
            status: clientControls.status,
            justification: clientControls.justification,
        }).from(clientControls);
        expect(again).toEqual({
            status: "implemented",
            justification: "Do not touch this justification",
        });
    });
});

import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import { sql } from 'drizzle-orm';
import postgres from 'postgres';
import { hashPassword } from '../packages/core/src/server/localAuth';
import { ensureDefaultDataSeeded, getDb, getUserByEmail, seedSampleData } from '../packages/core/src/db';
import { ensureAnnexACatalog } from '../packages/core/src/server/ensureAnnexACatalog';
import { users } from '../packages/core/src/schema';

function sslOption(databaseUrl: string) {
    const disabled = process.env.DATABASE_SSL === 'false' || /(?:\?|&)sslmode=disable(?:&|$)/.test(databaseUrl);
    return disabled ? false : { rejectUnauthorized: false as const };
}

async function applySchema(databaseUrl: string) {
    const client = postgres(databaseUrl, { max: 1, ssl: sslOption(databaseUrl) });
    try {
        const rows = await client`select to_regclass('public.users') as exists`;
        if (rows[0]?.exists) {
            console.log('[bootstrap] Schema already present');
            return;
        }
        const schemaPath = path.join(process.cwd(), 'docker/schema.sql');
        const ddl = fs.readFileSync(schemaPath, 'utf8')
            .split('\n')
            .filter((line) => !line.startsWith('\\'))
            .join('\n');
        await client.unsafe(ddl);
        console.log('[bootstrap] Schema applied');
    } finally {
        await client.end({ timeout: 5 });
    }
}

/**
 * evidence_requests.assignee_id stays the platform user. assignee_employee_id is the
 * People & Org person. Drizzle migrations do not run at boot, so existing databases
 * get the nullable column here. Fresh installs already have it from schema.sql.
 */
async function ensureEvidenceRequestAssignees() {
    const db = await getDb();
    await db.execute(sql`ALTER TABLE evidence_requests ADD COLUMN IF NOT EXISTS assignee_employee_id integer`);
    await db.execute(sql`ALTER TABLE evidence_requests ALTER COLUMN assignee_id DROP NOT NULL`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_er_assignee_employee ON evidence_requests (assignee_employee_id)`);
}

async function ensureLocalCredentialsTable() {
    const db = await getDb();
    await db.execute(sql`
        CREATE TABLE IF NOT EXISTS local_credentials (
            user_id integer PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
            password_hash text NOT NULL,
            created_at timestamp DEFAULT now()
        )
    `);
}

async function ensureAdmin() {
    const email = process.env.ADMIN_EMAIL || 'admin@grcompliance.local';
    const password = process.env.ADMIN_PASSWORD;
    if (!password) {
        throw new Error('ADMIN_PASSWORD is required');
    }

    const db = await getDb();
    let user = await getUserByEmail(email);
    if (!user) {
        const [created] = await db.insert(users).values({
            email,
            name: 'Alex Morgan',
            openId: `local:${randomUUID()}`,
            loginMethod: 'local',
            role: 'admin',
            maxClients: 2,
            hasSeenTour: true,
            planTier: 'free',
        }).returning();
        user = created;
        console.log(`[bootstrap] Created administrator ${email}`);
    }

    const existing = await db.execute(sql`select user_id from local_credentials where user_id = ${user.id} limit 1`);
    const hasCredential = Array.isArray(existing) && existing.length > 0;
    if (!hasCredential) {
        const passwordHash = await hashPassword(password);
        await db.execute(sql`insert into local_credentials (user_id, password_hash) values (${user.id}, ${passwordHash})`);
        console.log('[bootstrap] Stored administrator credential');
    }
    return user;
}

async function ensureLatore(userId: number) {
    const db = await getDb();
    const existing = await db.execute(sql`select id from clients where name = 'Latore LTD' limit 1`);
    if (Array.isArray(existing) && existing.length > 0) {
        console.log('[bootstrap] Latore LTD demo workspace already present');
        return;
    }
    try {
        await seedSampleData(userId, { name: 'Latore LTD', industry: 'Professional services' });
        console.log('[bootstrap] Seeded Latore LTD demo workspace');
    } catch (error) {
        console.error('[bootstrap] Latore LTD seed failed:', error instanceof Error ? error.message : 'unknown');
    }
}

async function main() {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
        throw new Error('DATABASE_URL is required');
    }
    await applySchema(databaseUrl);
    await ensureEvidenceRequestAssignees();
    await ensureDefaultDataSeeded();
    await ensureLocalCredentialsTable();
    if (process.env.AUTH_MODE === 'local') {
        const user = await ensureAdmin();
        await ensureLatore(user.id);
    }
    // After the demo seed so a fresh Latore workspace is not bulk-assigned the
    // whole catalog. Existing client_controls are left untouched.
    const catalog = await ensureAnnexACatalog();
    console.log(`[bootstrap] Annex A catalog ready (inserted ${catalog.inserted}, renamed ${catalog.renamed}, titles ${catalog.titlesAligned})`);
    console.log('[bootstrap] Ready');
}

main().catch((error) => {
    console.error('[bootstrap] Failed:', error instanceof Error ? error.message : 'unknown');
    process.exit(1);
});

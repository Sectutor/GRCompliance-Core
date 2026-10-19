import { randomUUID } from 'crypto';
import path from 'path';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { hashPassword } from '../packages/core/src/server/localAuth';
import { ensureDefaultDataSeeded, getDb, getUserByEmail, seedSampleData } from '../packages/core/src/db';
import { users } from '../packages/core/src/schema';

function sslOption(databaseUrl: string) {
    const disabled = process.env.DATABASE_SSL === 'false' || /(?:\?|&)sslmode=disable(?:&|$)/.test(databaseUrl);
    return disabled ? false : { rejectUnauthorized: false as const };
}

async function applyMigrations(databaseUrl: string) {
    const client = postgres(databaseUrl, { max: 1, ssl: sslOption(databaseUrl) });
    try {
        await migrate(drizzle(client), { migrationsFolder: path.join(process.cwd(), 'packages/core/drizzle') });
        console.log('[bootstrap] Migrations applied');
    } finally {
        await client.end({ timeout: 5 });
    }
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
            name: 'Administrator',
            openId: `local:${randomUUID()}`,
            loginMethod: 'local',
            role: 'user',
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
    await applyMigrations(databaseUrl);
    await ensureDefaultDataSeeded();
    await ensureLocalCredentialsTable();
    if (process.env.AUTH_MODE === 'local') {
        const user = await ensureAdmin();
        await ensureLatore(user.id);
    }
    console.log('[bootstrap] Ready');
}

main().catch((error) => {
    console.error('[bootstrap] Failed:', error instanceof Error ? error.message : 'unknown');
    process.exit(1);
});

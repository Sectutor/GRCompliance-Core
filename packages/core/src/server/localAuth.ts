import { createHash, createHmac, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'crypto';
import { escapeHtml } from './recordAccess';
import type { Request, Response } from 'express';
import { eq, sql } from 'drizzle-orm';
import { assignUserToClient, createClient, getDb } from '../db';
import { users } from '../schema';
import { appOrigin } from '../lib/publicUrl';
import { signupIsEnabled } from '../lib/signupAccess';

export { appOrigin };

const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7;

function scryptAsync(password: string, salt: string, keylen: number): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        scrypt(password, salt, keylen, (err, derived) => {
            if (err) reject(err);
            else resolve(derived);
        });
    });
}

export async function hashPassword(password: string): Promise<string> {
    const salt = randomBytes(16).toString('hex');
    const derived = await scryptAsync(password, salt, 64);
    return `scrypt$${salt}$${derived.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
    const [scheme, salt, hash] = stored.split('$');
    if (scheme !== 'scrypt' || !salt || !hash) return false;
    const derived = await scryptAsync(password, salt, 64);
    const expected = Buffer.from(hash, 'hex');
    if (expected.length !== derived.length) return false;
    return timingSafeEqual(expected, derived);
}

function b64url(value: Buffer | string): string {
    return Buffer.from(value).toString('base64url');
}

export function signLocalToken(claims: { sub: string; email: string }): string {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
        throw new Error('JWT_SECRET is required');
    }
    const now = Math.floor(Date.now() / 1000);
    const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const payload = b64url(JSON.stringify({
        sub: claims.sub,
        email: claims.email,
        aal: 'aal1',
        iss: 'grcompliance',
        iat: now,
        exp: now + TOKEN_TTL_SECONDS,
    }));
    const data = `${header}.${payload}`;
    const signature = createHmac('sha256', secret).update(data).digest('base64url');
    return `${data}.${signature}`;
}

export function verifyLocalToken(token: string): { sub: string; email?: string; aal?: string; exp: number } | null {
    const secret = process.env.JWT_SECRET;
    if (!secret) return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, payload, signature] = parts;
    const expected = createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
    const given = Buffer.from(signature);
    const wanted = Buffer.from(expected);
    if (given.length !== wanted.length || !timingSafeEqual(given, wanted)) return null;
    try {
        const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
        if (!claims?.sub || typeof claims.exp !== 'number') return null;
        if (claims.exp < Math.floor(Date.now() / 1000) - 30) return null;
        return claims;
    } catch {
        return null;
    }
}

export function isLocalAuthMode(): boolean {
    return process.env.AUTH_MODE === 'local';
}

export function localSignupEnabled(): boolean {
    return signupIsEnabled(process.env.AUTH_MODE, process.env.GRC_ALLOW_SIGNUP);
}

/** A new password for an administrator to hand to the user. Not logged. */
export function generateLocalPassword(): string {
    return randomBytes(18).toString('hex');
}

export async function upsertLocalCredential(userId: number, password: string): Promise<void> {
    const db = await getDb();
    const passwordHash = await hashPassword(password);
    await db.execute(sql`
        INSERT INTO local_credentials (user_id, password_hash)
        VALUES (${userId}, ${passwordHash})
        ON CONFLICT (user_id) DO UPDATE SET password_hash = EXCLUDED.password_hash
    `);
}

export async function createLocalAccount(input: {
    email: string;
    name: string;
    password: string;
    role?: string;
    planTier?: string | null;
    maxClients?: number | null;
    accessExpiresAt?: Date | null;
}) {
    const db = await getDb();
    const [created] = await db.insert(users).values({
        email: input.email,
        name: input.name,
        openId: `local:${randomUUID()}`,
        loginMethod: 'local',
        role: input.role || 'user',
        planTier: input.planTier || undefined,
        maxClients: input.maxClients ?? 2,
        subscriptionStatus: 'active',
        accessExpiresAt: input.accessExpiresAt ?? null,
    }).returning();
    await upsertLocalCredential(created.id, input.password);
    return created;
}

function sessionPayload(user: { openId: string; email: string | null; name: string | null }, email: string) {
    const accessToken = signLocalToken({ sub: user.openId, email: user.email || email });
    const expiresAt = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS;
    return {
        access_token: accessToken,
        token_type: 'bearer' as const,
        expires_at: expiresAt,
        user: {
            id: user.openId,
            email: user.email,
            aud: 'authenticated',
            role: 'authenticated',
            app_metadata: {},
            user_metadata: { name: user.name, full_name: user.name },
        },
    };
}

/**
 * Free local account. No payment step. Off unless GRC_ALLOW_SIGNUP is set.
 * The account is a normal user, not a second global administrator.
 */
export async function localRegisterHandler(req: Request, res: Response): Promise<void> {
    if (!isLocalAuthMode()) {
        res.status(404).json({ error: 'Local authentication is not enabled' });
        return;
    }
    if (!localSignupEnabled()) {
        res.status(403).json({ error: 'Sign-up is disabled on this server. An administrator creates accounts.' });
        return;
    }
    const email = typeof req.body?.email === 'string' ? req.body.email.trim() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const organizationName = typeof req.body?.organizationName === 'string' ? req.body.organizationName.trim() : '';
    if (!email || !email.includes('@') || email.length > 320) {
        res.status(400).json({ error: 'A valid email is required' });
        return;
    }
    if (password.length < 8 || password.length > 200) {
        res.status(400).json({ error: 'Password must be at least 8 characters' });
        return;
    }
    if (name.length < 2 || name.length > 200) {
        res.status(400).json({ error: 'Enter your name' });
        return;
    }
    if (organizationName.length < 2 || organizationName.length > 200) {
        res.status(400).json({ error: 'Enter an organization name' });
        return;
    }
    try {
        const db = await getDb();
        const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
        if (existing) {
            res.status(409).json({ error: 'An account with this email already exists. Sign in instead.' });
            return;
        }
        const created = await createLocalAccount({
            email,
            name,
            password,
            role: 'user',
            planTier: 'free',
        });
        const client = await createClient({ name: organizationName, status: 'active' });
        await assignUserToClient(created.id, client.id, 'owner');
        res.status(201).json(sessionPayload(created, email));
    } catch (error) {
        console.error('[local-auth] sign-up failed:', error instanceof Error ? error.message : 'unknown');
        res.status(500).json({ error: 'Could not create the account' });
    }
}

export async function localLoginHandler(req: Request, res: Response): Promise<void> {
    if (process.env.AUTH_MODE !== 'local') {
        res.status(404).json({ error: 'Local authentication is not enabled' });
        return;
    }
    const email = typeof req.body?.email === 'string' ? req.body.email.trim() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!email || !password) {
        res.status(400).json({ error: 'Email and password are required' });
        return;
    }

    try {
        const db = await getDb();
        const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
        if (!user) {
            res.status(401).json({ error: 'Invalid email or password' });
            return;
        }
        const rows = await db.execute(sql`select password_hash from local_credentials where user_id = ${user.id} limit 1`);
        const row = Array.isArray(rows) ? rows[0] as { password_hash?: string } : undefined;
        const passwordHash = row?.password_hash;
        if (!passwordHash || !(await verifyPassword(password, passwordHash))) {
            res.status(401).json({ error: 'Invalid email or password' });
            return;
        }

        await db.update(users).set({ lastSignedIn: new Date() }).where(eq(users.id, user.id));
        res.json(sessionPayload(user, email));
    } catch (error) {
        console.error('[local-auth] login failed:', error instanceof Error ? error.message : 'unknown');
        res.status(500).json({ error: 'Sign-in failed' });
    }
}

const RESET_TTL_SECONDS = 60 * 60 * 24;

async function credentialFingerprint(userId: number): Promise<string> {
    const db = await getDb();
    const rows = await db.execute(sql`select password_hash from local_credentials where user_id = ${userId} limit 1`);
    const row = Array.isArray(rows) ? rows[0] as { password_hash?: string } : undefined;
    if (!row?.password_hash) return 'none';
    return createHash('sha256').update(row.password_hash).digest('hex').slice(0, 16);
}

/**
 * Signed reset link. The credential fingerprint makes the link single-use:
 * setting a password changes the hash, so the same token cannot be reused.
 * The token is not logged.
 */
export async function createPasswordResetToken(userId: number, email: string): Promise<string> {
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error('JWT_SECRET is required');
    const cred = await credentialFingerprint(userId);
    const exp = Math.floor(Date.now() / 1000) + RESET_TTL_SECONDS;
    const payload = b64url(JSON.stringify({ purpose: 'password-reset', uid: userId, email, exp, cred }));
    const signature = createHmac('sha256', secret).update(payload).digest('base64url');
    return `${payload}.${signature}`;
}

export async function completePasswordReset(token: string, password: string): Promise<void> {
    if (typeof password !== 'string' || password.length < 12 || password.length > 200) {
        throw new Error('Password must be at least 12 characters');
    }
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error('JWT_SECRET is required');
    const parts = typeof token === 'string' ? token.split('.') : [];
    if (parts.length !== 2) throw new Error('Invalid or expired reset link');
    const [payload, signature] = parts;
    const expected = createHmac('sha256', secret).update(payload).digest('base64url');
    const given = Buffer.from(signature);
    const wanted = Buffer.from(expected);
    if (given.length !== wanted.length || !timingSafeEqual(given, wanted)) {
        throw new Error('Invalid or expired reset link');
    }
    let claims: { purpose?: string; uid?: number; email?: string; exp?: number; cred?: string };
    try {
        claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    } catch {
        throw new Error('Invalid or expired reset link');
    }
    if (
        claims.purpose !== 'password-reset'
        || typeof claims.uid !== 'number'
        || typeof claims.email !== 'string'
        || typeof claims.exp !== 'number'
        || typeof claims.cred !== 'string'
        || claims.exp < Math.floor(Date.now() / 1000)
    ) {
        throw new Error('Invalid or expired reset link');
    }
    const db = await getDb();
    const [user] = await db.select().from(users).where(eq(users.id, claims.uid)).limit(1);
    if (!user?.email || user.email.toLowerCase() !== claims.email.toLowerCase()) {
        throw new Error('Invalid or expired reset link');
    }
    if ((await credentialFingerprint(user.id)) !== claims.cred) {
        throw new Error('Invalid or expired reset link');
    }
    await upsertLocalCredential(user.id, password);
}

export async function localForgotPasswordHandler(req: Request, res: Response): Promise<void> {
    if (process.env.AUTH_MODE !== 'local') {
        res.status(404).json({ error: 'Local authentication is not enabled' });
        return;
    }
    const email = typeof req.body?.email === 'string' ? req.body.email.trim() : '';
    if (!email || !email.includes('@') || email.length > 320) {
        res.status(400).json({ error: 'A valid email is required' });
        return;
    }
    try {
        const db = await getDb();
        const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
        if (user?.id && user.email) {
            const token = await createPasswordResetToken(user.id, user.email);
            const resetUrl = `${appOrigin()}/update-password?token=${encodeURIComponent(token)}`;
            const { sendEmail } = await import('../lib/email/transporter');
            await sendEmail({
                to: user.email,
                subject: 'Reset your GRCompliance password',
                html: `<p>Use this link to set a new password. It expires in 24 hours.</p><p><a href="${escapeHtml(resetUrl)}">Set your password</a></p>`,
            });
        }
    } catch (error) {
        console.error('[local-auth] password reset email failed:', error instanceof Error ? error.message : 'unknown');
    }
    res.json({ ok: true });
}

export async function localResetPasswordHandler(req: Request, res: Response): Promise<void> {
    if (process.env.AUTH_MODE !== 'local') {
        res.status(404).json({ error: 'Local authentication is not enabled' });
        return;
    }
    const token = typeof req.body?.token === 'string' ? req.body.token : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    try {
        await completePasswordReset(token, password);
        res.json({ ok: true });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Reset failed';
        res.status(400).json({ error: message });
    }
}

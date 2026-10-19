import { createHmac, randomBytes, scrypt, timingSafeEqual } from 'crypto';
import type { Request, Response } from 'express';
import { eq, sql } from 'drizzle-orm';
import { getDb } from '../db';
import { users } from '../schema';

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
        const accessToken = signLocalToken({ sub: user.openId, email: user.email || email });
        const expiresAt = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS;
        res.json({
            access_token: accessToken,
            token_type: 'bearer',
            expires_at: expiresAt,
            user: {
                id: user.openId,
                email: user.email,
                aud: 'authenticated',
                role: 'authenticated',
                app_metadata: {},
                user_metadata: { name: user.name },
            },
        });
    } catch (error) {
        console.error('[local-auth] login failed:', error instanceof Error ? error.message : 'unknown');
        res.status(500).json({ error: 'Sign-in failed' });
    }
}

import { createHmac, timingSafeEqual } from "crypto";
import { z } from "zod";
import * as db from "../../db";
import * as schema from "../../schema";
import { eq, and, desc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { requireWorkspaceRole } from "../recordAccess";

/**
 * Documents a trust centre may publish.
 * Locked rows are omitted entirely, so their file URLs never leave the server.
 */
export function publishedTrustDocuments<T extends { isLocked?: boolean | null }>(docs: T[]): T[] {
    return docs.filter((doc) => doc.isLocked !== true);
}

/**
 * Stateless proof that this caller just registered as this visitor.
 * Uses the existing JWT_SECRET. No new secret is introduced.
 */
export function issueTrustAccessToken(clientId: number, visitorId: number, email: string): string | null {
    const secret = process.env.JWT_SECRET;
    if (!secret) return null;
    return createHmac("sha256", secret)
        .update(`trust-center:${clientId}:${visitorId}:${email.trim().toLowerCase()}`)
        .digest("base64url");
}

function trustAccessTokenMatches(expected: string | null, given: string): boolean {
    if (!expected) return false;
    const wanted = Buffer.from(expected);
    const presented = Buffer.from(given);
    if (wanted.length !== presented.length) return false;
    return timingSafeEqual(wanted, presented);
}

export const createTrustCenterRouter = (t: any, publicProcedure: any, protectedProcedure: any) => {
    return t.router({
        getPublicData: publicProcedure
            .input(z.object({ clientId: z.number() }))
            .query(async ({ input }: any) => {
                const dbConn = await db.getDb();

                const docs = await dbConn.select().from(schema.trustDocuments)
                    .where(eq(schema.trustDocuments.clientId, input.clientId));

                return {
                    documents: publishedTrustDocuments(docs).filter((doc) => doc.clientId === input.clientId),
                };
            }),

        requestAccess: publicProcedure
            .input(z.object({
                clientId: z.number(),
                email: z.string().email(),
                name: z.string(),
                company: z.string().optional()
            }))
            .mutation(async ({ input }: any) => {
                const dbConn = await db.getDb();

                // 1. Basic Competitor Check
                const competitorDomains = ['competitor.com', 'rival.io', 'badguy.net'];
                const domain = input.email.split('@')[1];
                if (competitorDomains.includes(domain)) {
                    throw new TRPCError({
                        code: 'FORBIDDEN',
                        message: "Access restricted for competitors. Please contact sales@grcompliance.com"
                    });
                }

                // 2. Register/Update Visitor
                let [visitor] = await dbConn.select().from(schema.trustCenterVisitors)
                    .where(and(
                        eq(schema.trustCenterVisitors.clientId, input.clientId),
                        eq(schema.trustCenterVisitors.email, input.email)
                    )).limit(1);

                if (!visitor) {
                    [visitor] = await dbConn.insert(schema.trustCenterVisitors).values({
                        clientId: input.clientId,
                        email: input.email,
                        name: input.name,
                        company: input.company || null,
                    }).returning();
                } else {
                    await dbConn.update(schema.trustCenterVisitors)
                        .set({ lastSeenAt: new Date(), name: input.name, company: input.company || null })
                        .where(eq(schema.trustCenterVisitors.id, visitor.id));
                }

                return {
                    visitorId: visitor.id,
                    accessToken: issueTrustAccessToken(input.clientId, visitor.id, input.email),
                    success: true,
                };
            }),

        signNDA: publicProcedure
            .input(z.object({
                clientId: z.number(),
                visitorId: z.number(),
                signatureText: z.string()
            }))
            .mutation(async ({ input, ctx }: any) => {
                const dbConn = await db.getDb();
                const ipAddress = ctx.req?.headers['x-forwarded-for'] || ctx.req?.socket?.remoteAddress || 'unknown';

                // 1. Check if already signed
                const existing = await dbConn.select().from(schema.ndaSignatures)
                    .where(and(
                        eq(schema.ndaSignatures.clientId, input.clientId),
                        eq(schema.ndaSignatures.visitorId, input.visitorId)
                    )).limit(1);

                if (existing.length > 0) return { success: true };

                // 2. Sign
                await dbConn.insert(schema.ndaSignatures).values({
                    clientId: input.clientId,
                    visitorId: input.visitorId,
                    signatureText: input.signatureText,
                    ndaVersion: "v1.0",
                    ipAddress: String(ipAddress).split(',')[0],
                });

                return { success: true };
            }),

        getAccessStatus: publicProcedure
            .input(z.object({
                clientId: z.number(),
                email: z.string().email().optional(),
                accessToken: z.string().min(1).max(512).optional(),
            }))
            .query(async ({ input, ctx }: any) => {
                const dbConn = await db.getDb();
                const sessionEmail = typeof ctx.user?.email === "string" ? ctx.user.email.trim().toLowerCase() : null;
                const requestedEmail = typeof input.email === "string" ? input.email.trim().toLowerCase() : null;
                const denied = { signed: false, isLoggedIn: !!ctx.user };

                // A visitor record is returned only to the holder of the access
                // token issued by requestAccess, or to the signed-in user for
                // their own email. An email by itself is not enough.
                let checkEmail: string | null = null;
                if (input.accessToken) {
                    checkEmail = requestedEmail || sessionEmail;
                    if (!checkEmail) return denied;
                } else if (sessionEmail && (!requestedEmail || requestedEmail === sessionEmail)) {
                    checkEmail = sessionEmail;
                } else {
                    return denied;
                }

                const visitors = await dbConn.select().from(schema.trustCenterVisitors)
                    .where(and(
                        eq(schema.trustCenterVisitors.clientId, input.clientId),
                        eq(schema.trustCenterVisitors.email, checkEmail)
                    )).limit(1);
                const visitor = (visitors as any[]).find((row) =>
                    String(row.email || "").trim().toLowerCase() === checkEmail && row.clientId === input.clientId
                );

                if (input.accessToken) {
                    if (!visitor) return denied;
                    const expected = issueTrustAccessToken(input.clientId, visitor.id, visitor.email);
                    if (!trustAccessTokenMatches(expected, input.accessToken)) return denied;
                }

                if (!visitor && ctx.user && !input.accessToken) {
                    return {
                        signed: false,
                        isLoggedIn: true,
                        user: {
                            name: ctx.user.name,
                            email: ctx.user.email,
                            company: "Internal User"
                        }
                    };
                }

                if (!visitor) return denied;

                const signatures = await dbConn.select().from(schema.ndaSignatures)
                    .where(and(
                        eq(schema.ndaSignatures.clientId, input.clientId),
                        eq(schema.ndaSignatures.visitorId, visitor.id)
                    )).limit(1);
                const signature = (signatures as any[]).filter((row) =>
                    row.clientId === input.clientId && row.visitorId === visitor.id
                );

                return {
                    signed: signature.length > 0,
                    visitorId: visitor.id,
                    isLoggedIn: !!ctx.user,
                    user: visitor
                };
            }),

        // Admin methods to manage documents
        addDocument: protectedProcedure
            .input(z.object({
                clientId: z.number(),
                name: z.string(),
                description: z.string().optional(),
                fileUrl: z.string(),
                isLocked: z.boolean().default(false),
                category: z.string().optional()
            }))
            .mutation(async ({ input, ctx }: any) => {
                await requireWorkspaceRole({ user: ctx.user, clientId: input.clientId, minRole: "editor" });
                const dbConn = await db.getDb();
                return await dbConn.insert(schema.trustDocuments).values(input).returning();
            }),

        listVisitors: protectedProcedure
            .input(z.object({ clientId: z.number() }))
            .query(async ({ input }: any) => {
                const dbConn = await db.getDb();
                return await dbConn.select().from(schema.trustCenterVisitors)
                    .where(eq(schema.trustCenterVisitors.clientId, input.clientId))
                    .orderBy(desc(schema.trustCenterVisitors.createdAt));
            })
    });
};

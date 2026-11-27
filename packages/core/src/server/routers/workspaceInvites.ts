import { z } from "zod";
import { getDb } from "../../db";
import { userInvitations } from "../../schema";
import { appOrigin } from "../../lib/publicUrl";
import { createInviteToken } from "../../lib/security/inviteToken";
import { buildWorkspaceInviteLink, inviteExpiresAt } from "../../lib/security/workspaceInvite";

/**
 * Copyable one-time invite. Nothing is emailed. The existing acceptInvitation
 * path marks the token accepted, so it cannot be reused.
 */
export const createWorkspaceInvitesRouter = (t: any, clientEditorProcedure: any) => {
    return t.router({
        createLink: clientEditorProcedure
            .input(z.object({
                clientId: z.number().int().positive(),
                email: z.string().email(),
                role: z.enum(["viewer", "editor", "admin"]).default("viewer"),
            }))
            .mutation(async ({ input, ctx }: any) => {
                const db = await getDb();
                const token = createInviteToken();
                const expiresAt = inviteExpiresAt();
                await db.insert(userInvitations).values({
                    email: input.email,
                    role: input.role,
                    clientId: input.clientId,
                    invitedBy: ctx.user.id,
                    token,
                    status: "pending",
                    expiresAt,
                });
                return {
                    url: buildWorkspaceInviteLink(appOrigin(), token),
                    expiresAt: expiresAt.toISOString(),
                    email: input.email,
                };
            }),
    });
};

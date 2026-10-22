import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { policyTemplates } from "../schema";
import { authorizeWorkspace, isPlatformAdmin } from "./workspaceAccess";

type TemplateRow = typeof policyTemplates.$inferSelect;

/**
 * A signed-in user may read a template when it is public, they own it,
 * they are a platform admin, or they belong to the template's workspace.
 * Private templates with no owner and no workspace stay hidden.
 */
export async function assertTemplateReadable(ctx: any, templateId: number): Promise<TemplateRow> {
    const db = await getDb();
    const [template] = await db.select().from(policyTemplates).where(eq(policyTemplates.id, templateId)).limit(1);
    if (!template) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Template not found" });
    }
    if (template.isPublic) return template;
    if (ctx.user?.id != null && template.ownerId === ctx.user.id) return template;
    if (isPlatformAdmin(ctx.user?.role)) return template;
    if (template.clientId) {
        try {
            await authorizeWorkspace(ctx, template.clientId);
            return template;
        } catch (err) {
            if (err instanceof TRPCError && err.code === "FORBIDDEN") {
                throw new TRPCError({ code: "FORBIDDEN", message: "Private template" });
            }
            throw err;
        }
    }
    throw new TRPCError({ code: "FORBIDDEN", message: "Private template" });
}

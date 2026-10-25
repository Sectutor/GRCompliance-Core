import { TRPCError } from "@trpc/server";
import { isPlatformAdmin } from "./workspaceAccess";

const WORKSPACE_LICENSE_ADMINS = new Set(["owner", "admin"]);

type LicenseActor = {
    user?: { role?: string | null } | null;
    clientRole?: string | null;
};

/**
 * Workspace owners and workspace admins may upload, activate, or deactivate
 * a license for their workspace. Platform admins may as well. Editors,
 * viewers, auditors, and other members may not.
 */
export function assertCanManageLicense(ctx: LicenseActor): void {
    if (isPlatformAdmin(ctx.user?.role)) return;
    if (WORKSPACE_LICENSE_ADMINS.has(ctx.clientRole || "")) return;
    throw new TRPCError({
        code: "FORBIDDEN",
        message: "Admin access required to manage a license",
    });
}

/** Instance-wide license lists. These rows include license keys. */
export function assertPlatformLicenseAdmin(ctx: LicenseActor): void {
    if (isPlatformAdmin(ctx.user?.role)) return;
    throw new TRPCError({
        code: "FORBIDDEN",
        message: "Admin access required",
    });
}

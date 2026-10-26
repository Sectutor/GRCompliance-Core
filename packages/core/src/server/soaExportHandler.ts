import type { Request, Response } from "express";
import {
    soaApplicabilityValue,
    soaExportFilename,
    soaToCsv,
    type SoaListEntry,
} from "../lib/soaListing";
import type { SoAExportData } from "../lib/soaExport";

const WORKSPACE_ADMIN_ROLES = new Set(["admin", "super_admin"]);

export type SoaExportUser = { id: number; role?: string | null } | null | undefined;

export type SoaExportMembership = {
    userId: number;
    clientId: number;
    accessExpiresAt?: Date | string | null;
} | null;

export function soaExportAccess(input: {
    user: SoaExportUser;
    clientId: number;
    membership: SoaExportMembership;
}): { ok: true } | { ok: false; status: 400 | 401 | 403; message: string } {
    if (!input.user) return { ok: false, status: 401, message: "Authentication required" };
    if (!Number.isInteger(input.clientId) || input.clientId <= 0) {
        return { ok: false, status: 400, message: "A workspace id is required" };
    }
    if (WORKSPACE_ADMIN_ROLES.has(input.user.role || "")) return { ok: true };
    const membership = input.membership;
    if (!membership || membership.userId !== input.user.id || membership.clientId !== input.clientId) {
        return { ok: false, status: 403, message: "No access to this client workspace" };
    }
    if (membership.accessExpiresAt && new Date(membership.accessExpiresAt).getTime() < Date.now()) {
        return { ok: false, status: 403, message: "Your access to this workspace has expired" };
    }
    return { ok: true };
}

export type SoaExportDeps = {
    loadMembership: (userId: number, clientId: number) => Promise<SoaExportMembership>;
    loadClientName: (clientId: number) => Promise<string | null>;
    loadStatement: (clientId: number) => Promise<SoaListEntry[]>;
    generateDocx: (data: SoAExportData) => Promise<Buffer>;
};

type ExportResponse = Response & { headersSent?: boolean };

export async function handleSoaExport(req: Request, res: ExportResponse, deps: SoaExportDeps) {
    try {
        const user = (req as Request & { user?: SoaExportUser }).user ?? null;
        const clientId = Number.parseInt(String(req.params.clientId ?? ""), 10);
        const membership = user && !WORKSPACE_ADMIN_ROLES.has(user.role || "")
            ? await deps.loadMembership(user.id, clientId)
            : null;
        const access = soaExportAccess({ user, clientId, membership });
        if (!access.ok) {
            res.status(access.status).send(access.message);
            return;
        }

        const clientName = await deps.loadClientName(clientId);
        if (!clientName) {
            res.status(404).send("Workspace not found");
            return;
        }

        const format = String(req.query.format || "docx").toLowerCase();
        if (format !== "docx" && format !== "csv") {
            res.status(400).send("Unsupported export format");
            return;
        }

        const statement = await deps.loadStatement(clientId);
        if (format === "csv") {
            res.setHeader("Content-Type", "text/csv; charset=utf-8");
            res.setHeader("Content-Disposition", `attachment; filename="${soaExportFilename(clientName, "csv")}"`);
            res.send(soaToCsv(statement));
            return;
        }

        const buffer = await deps.generateDocx({
            clientName,
            generatedDate: new Date(),
            controls: statement.map((entry) => ({
                code: entry.control.controlId,
                name: entry.control.name,
                framework: entry.control.framework,
                applicability: soaApplicabilityValue(entry),
                justification: entry.clientControl.justification || "",
                status: entry.clientControl.status,
            })),
        });
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
        res.setHeader("Content-Disposition", `attachment; filename="${soaExportFilename(clientName, "docx")}"`);
        res.send(buffer);
    } catch (error) {
        console.error("Export SoA Error:", error);
        if (!res.headersSent) res.status(500).send("Error generating the Statement of Applicability");
    }
}

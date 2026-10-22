import { describe, expect, it, vi } from "vitest";
import { initTRPC } from "@trpc/server";

const harness = vi.hoisted(() => {
    const tables: Record<string, any[]> = {};
    const sendEmail = vi.fn(async () => ({ success: true }));
    function write(result: any[] = [{ id: 1 }]) {
        const api: any = {
            set() { return api; },
            where() { return api; },
            values() { return api; },
            returning() { return Promise.resolve(result); },
            then(ok: any, err: any) { return Promise.resolve(result).then(ok, err); },
        };
        return api;
    }
    return {
        tables,
        sendEmail,
        reset() {
            sendEmail.mockClear();
            for (const key of Object.keys(tables)) delete tables[key];
        },
        async getDb() {
            const { getTableName } = await import("drizzle-orm");
            return {
                select() {
                    let name = "";
                    const rows = () => tables[name] ?? [];
                    const api: any = {
                        from(table: any) {
                            name = getTableName(table);
                            return api;
                        },
                        where() { return api; },
                        orderBy() { return Promise.resolve(rows()); },
                        leftJoin() { return api; },
                        innerJoin() { return api; },
                        groupBy() { return Promise.resolve([]); },
                        limit(n?: number) {
                            const all = rows();
                            return Promise.resolve(typeof n === "number" ? all.slice(0, n) : all);
                        },
                        then(ok: any, err: any) { return Promise.resolve(rows()).then(ok, err); },
                    };
                    return api;
                },
                insert: () => write(),
                update: () => write(),
                delete: () => write(),
                execute: async () => ({ rows: [] }),
                query: {
                    auditFindings: {
                        findMany: async () => tables.audit_findings ?? [],
                    },
                    complianceFrameworks: {
                        findFirst: async () => null,
                    },
                    implementationPhases: {
                        findFirst: async () => null,
                    },
                },
            };
        },
    };
});

vi.mock("../db", () => ({
    getDb: () => harness.getDb(),
    bulkAssignControls: async () => 0,
}));

vi.mock("../lib/email/transporter", () => ({
    sendEmail: harness.sendEmail,
}));

import { createAuditRouter } from "./routers/audit";
import { createFindingsRouter } from "./routers/findings";
import { createFrameworksRouter } from "./routers/frameworks";
import { createCompliancePlanningRouter } from "./routers/compliancePlanning";
import { createTrustCenterRouter, issueTrustAccessToken } from "./routers/trustCenter";

const t = initTRPC.context<{ user: { id: number; role?: string | null; email?: string; name?: string } | null }>().create();
const audit = t.router({ audit: createAuditRouter(t, t.procedure) });
const findings = t.router({ findings: createFindingsRouter(t, t.procedure) });
const frameworks = t.router({ frameworks: createFrameworksRouter(t, t.procedure) });
const planning = t.router({ compliancePlanning: createCompliancePlanningRouter(t, t.procedure) });
const trust = t.router({ trustCenter: createTrustCenterRouter(t, t.procedure, t.procedure) });

function member(clientId: number, role = "viewer") {
    harness.tables.user_clients = [{ userId: 4, clientId, role, joinedAt: new Date(0) }];
}

const editor = { id: 4, role: "user" };

describe("audit, findings, frameworks, and trust centre access", () => {
    it("lets only an owner invite an auditor", async () => {
        harness.reset();
        const anon = audit.createCaller({ user: null });
        await expect(anon.audit.inviteAuditor({ clientId: 7, email: "auditor@example.com" })).rejects.toMatchObject({
            code: "UNAUTHORIZED",
        });

        member(7, "editor");
        const caller = audit.createCaller({ user: editor });
        await expect(caller.audit.inviteAuditor({ clientId: 7, email: "auditor@example.com" })).rejects.toMatchObject({
            code: "FORBIDDEN",
        });
        await expect(caller.audit.inviteAuditor({ clientId: 9, email: "auditor@example.com" })).rejects.toMatchObject({
            code: "FORBIDDEN",
        });
        expect(harness.sendEmail).not.toHaveBeenCalled();

        member(7, "owner");
        const invited = await caller.audit.inviteAuditor({ clientId: 7, email: "auditor@example.com" });
        expect(invited.success).toBe(true);
        expect(harness.sendEmail).toHaveBeenCalledOnce();
    });

    it("requires membership to read audits and an editor to change them", async () => {
        harness.reset();
        member(7, "viewer");
        harness.tables.certification_audits = [{ id: 7, clientId: 9, status: "scheduled" }];
        harness.tables.implementation_plans = [{ id: 7, clientId: 9 }];
        const caller = audit.createCaller({ user: editor });

        await expect(caller.audit.list({ clientId: 9 })).rejects.toMatchObject({ code: "FORBIDDEN" });
        await expect(caller.audit.create({ clientId: 7, frameworkId: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
        await expect(caller.audit.updateStatus({ auditId: 7, status: "completed" })).rejects.toMatchObject({ code: "FORBIDDEN" });
        await expect(caller.audit.getReadinessStats({ planId: 7, frameworkId: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
        await expect(caller.audit.scheduleAudit({
            clientId: 7,
            title: "Stage 1",
            type: "Internal",
            plannedDate: "2026-11-01",
        })).rejects.toMatchObject({ code: "FORBIDDEN" });

        harness.tables.certification_audits = [{ id: 1, clientId: 7, status: "scheduled" }];
        const listed = await caller.audit.list({ clientId: 7 });
        expect(Array.isArray(listed)).toBe(true);
    });

    it("binds findings to the workspace, including an id that matches the caller workspace", async () => {
        harness.reset();
        member(7, "viewer");
        harness.tables.audit_findings = [{ id: 7, clientId: 9, title: "Gap" }];
        const anon = findings.createCaller({ user: null });
        await expect(anon.findings.stats({ clientId: 7 })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
        await expect(anon.findings.list({ clientId: 7 })).rejects.toMatchObject({ code: "UNAUTHORIZED" });

        const caller = findings.createCaller({ user: editor });
        await expect(caller.findings.list({ clientId: 9 })).rejects.toMatchObject({ code: "FORBIDDEN" });
        await expect(caller.findings.stats({ clientId: 9 })).rejects.toMatchObject({ code: "FORBIDDEN" });
        await expect(caller.findings.create({ clientId: 7, title: "New", severity: "low" })).rejects.toMatchObject({
            code: "FORBIDDEN",
        });
        await expect(caller.findings.update({ id: 7, status: "closed" })).rejects.toMatchObject({ code: "FORBIDDEN" });

        const stats = await caller.findings.stats({ clientId: 7 });
        expect(stats.bySeverity).toEqual([]);
        const listed = await caller.findings.list({ clientId: 7 });
        expect(Array.isArray(listed)).toBe(true);
    });

    it("requires membership to list frameworks and an editor to import", async () => {
        harness.reset();
        member(7, "viewer");
        const caller = frameworks.createCaller({ user: editor });
        await expect(caller.frameworks.list({ clientId: 9 })).rejects.toMatchObject({ code: "FORBIDDEN" });
        await expect(caller.frameworks.importCustom({ clientId: 7, type: "iso27001" })).rejects.toMatchObject({
            code: "FORBIDDEN",
        });
        const listed = await caller.frameworks.list({ clientId: 7 });
        expect(Array.isArray(listed)).toBe(true);
    });

    it("requires an editor to generate a compliance plan", async () => {
        harness.reset();
        member(7, "viewer");
        const caller = planning.createCaller({ user: editor });
        await expect(caller.compliancePlanning.generatePlan({ clientId: 9, framework: "ISO27001" })).rejects.toMatchObject({
            code: "FORBIDDEN",
        });
        await expect(caller.compliancePlanning.generatePlan({ clientId: 7, framework: "ISO27001" })).rejects.toMatchObject({
            code: "FORBIDDEN",
        });
    });

    it("publishes unlocked trust documents only and never a locked file URL", async () => {
        harness.reset();
        const lockedUrl = "https://files.example/locked-only.pdf";
        harness.tables.trust_documents = [
            { id: 1, clientId: 7, name: "Public", isLocked: false, fileUrl: "https://files.example/public.pdf" },
            { id: 2, clientId: 7, name: "Locked", isLocked: true, fileUrl: lockedUrl },
            { id: 3, clientId: 9, name: "Other", isLocked: false, fileUrl: "https://files.example/other.pdf" },
        ];
        const anon = trust.createCaller({ user: null });
        const published = await anon.trustCenter.getPublicData({ clientId: 7 });
        expect(published.documents.map((doc: any) => doc.id)).toEqual([1]);
        expect(JSON.stringify(published)).not.toContain(lockedUrl);
        expect(published.documents.some((doc: any) => doc.fileUrl && doc.isLocked)).toBe(false);
    });

    it("returns trust-centre visitor status only to the access-token holder", async () => {
        harness.reset();
        const previous = process.env.JWT_SECRET;
        process.env.JWT_SECRET = "unit-test";
        try {
            harness.tables.trust_center_visitors = [{
                id: 3,
                clientId: 7,
                email: "visitor@example.com",
                name: "Visitor Name",
                company: "Example Co",
            }];
            harness.tables.nda_signatures = [{ id: 1, clientId: 7, visitorId: 3 }];
            const anon = trust.createCaller({ user: null });
            const leaked = await anon.trustCenter.getAccessStatus({
                clientId: 7,
                email: "visitor@example.com",
            });
            expect(JSON.stringify(leaked)).not.toContain("Visitor Name");
            expect(leaked).toEqual({ signed: false, isLoggedIn: false });

            const token = issueTrustAccessToken(7, 3, "visitor@example.com");
            expect(token).toBeTruthy();
            const held = await anon.trustCenter.getAccessStatus({
                clientId: 7,
                email: "visitor@example.com",
                accessToken: token!,
            });
            expect(held.signed).toBe(true);
            expect(held.user.name).toBe("Visitor Name");

            const wrong = await anon.trustCenter.getAccessStatus({
                clientId: 7,
                email: "visitor@example.com",
                accessToken: "not-a-valid-token",
            });
            expect(JSON.stringify(wrong)).not.toContain("Visitor Name");
        } finally {
            if (previous === undefined) delete process.env.JWT_SECRET;
            else process.env.JWT_SECRET = previous;
        }
    });

    it("requires an editor to add a trust document", async () => {
        harness.reset();
        member(7, "viewer");
        const caller = trust.createCaller({ user: editor });
        await expect(caller.trustCenter.addDocument({
            clientId: 7,
            name: "SOC 2",
            fileUrl: "https://files.example/soc.pdf",
        })).rejects.toMatchObject({ code: "FORBIDDEN" });
        await expect(caller.trustCenter.addDocument({
            clientId: 9,
            name: "SOC 2",
            fileUrl: "https://files.example/soc.pdf",
        })).rejects.toMatchObject({ code: "FORBIDDEN" });
    });
});

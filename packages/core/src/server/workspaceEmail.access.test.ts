import { readFileSync } from "fs";
import path from "path";
import { getTableName } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { employees, notificationLog, userClients, users } from "../schema";
import { completePasswordReset } from "./localAuth";
import { escapeHtml } from "./recordAccess";

const harness = vi.hoisted(() => ({
    tables: {} as Record<string, any[]>,
    writes: [] as string[],
    getClientPolicyById: vi.fn(),
    updateClientPolicy: vi.fn(async () => undefined),
    getUserById: vi.fn(async () => ({ id: 4, maxClients: 5, email: "owner@example.com", role: "user" })),
    getUserByEmail: vi.fn(async () => undefined),
    createUser: vi.fn(async (data: { email: string; name: string; password?: string }) => ({
        id: 99,
        email: data.email,
        name: data.name,
    })),
    onboardClient: vi.fn(async () => ({ id: 9 })),
    getClientById: vi.fn(async () => ({ id: 9, planTier: "enterprise" })),
    getClientUsers: vi.fn(async () => []),
    isUserAllowedForClient: vi.fn(async () => false),
    assignUserToClient: vi.fn(async () => undefined),
    updateClient: vi.fn(async () => undefined),
}));

vi.mock("../db", () => {
    const { getTableName: tableName } = require("drizzle-orm") as typeof import("drizzle-orm");
    function select() {
        let rows: any[] = [];
        const chain: any = {
            from(table: any) {
                try {
                    rows = harness.tables[tableName(table)] ?? [];
                } catch {
                    rows = [];
                }
                return chain;
            },
            where() { return chain; },
            orderBy() { return chain; },
            innerJoin() { return chain; },
            leftJoin() { return chain; },
            limit(n?: number) { return Promise.resolve(typeof n === "number" ? rows.slice(0, n) : rows); },
            then(onFulfilled: any, onRejected: any) { return Promise.resolve(rows).then(onFulfilled, onRejected); },
        };
        return chain;
    }
    const conn = {
        select,
        insert() { return { values: () => Promise.resolve() }; },
        update() {
            return {
                set: () => ({
                    where: () => {
                        harness.writes.push("update");
                        return Promise.resolve();
                    },
                }),
            };
        },
        delete() { return { where: () => Promise.resolve() }; },
        execute: async () => {
            harness.writes.push("execute");
            return [];
        },
    };
    return {
        getDb: async () => conn,
        getClientPolicyById: harness.getClientPolicyById,
        updateClientPolicy: harness.updateClientPolicy,
        getUserById: harness.getUserById,
        getUserByEmail: harness.getUserByEmail,
        createUser: harness.createUser,
        onboardClient: harness.onboardClient,
        getClientById: harness.getClientById,
        getClientUsers: harness.getClientUsers,
        isUserAllowedForClient: harness.isUserAllowedForClient,
        assignUserToClient: harness.assignUserToClient,
        updateClient: harness.updateClient,
    };
});

vi.mock("../lib/email/transporter", () => ({
    sendEmail: vi.fn(async () => ({ success: true })),
}));

import { sendEmail } from "../lib/email/transporter";
import { createAuditorsRouter } from "./routers/auditors";
import { createClientPoliciesRouter } from "./routers/clientPolicies";
import { createClientsRouter } from "./routers/clients";
import { createNotificationsRouter } from "./routers/notifications";
import { createProjectsRouter } from "./routers/projects";
import {
    adminProcedure,
    clientEditorProcedure,
    clientProcedure,
    isAuthed,
    protectedProcedure,
    publicProcedure,
    requiresMFA,
    t,
} from "./trpc";

const api = t.router({
    clients: createClientsRouter(t, adminProcedure, clientProcedure, clientEditorProcedure, publicProcedure, isAuthed, requiresMFA),
    notifications: createNotificationsRouter(t, clientProcedure, adminProcedure, protectedProcedure),
    clientPolicies: createClientPoliciesRouter(t, clientProcedure, adminProcedure, publicProcedure, clientEditorProcedure),
    auditors: createAuditorsRouter(t, adminProcedure, clientProcedure),
    projects: createProjectsRouter(t, clientProcedure),
});

function caller(user: { id: number; role: string; email?: string; name?: string }, clientId = 9) {
    return api.createCaller({ user, aal: "aal2", clientId } as any);
}

function membership(role: "viewer" | "editor" | "owner") {
    harness.tables[getTableName(userClients)] = [{
        userId: 4,
        clientId: 9,
        role,
        joinedAt: new Date("2020-01-01"),
        accessExpiresAt: null,
    }];
}

describe("workspace emails and role grants", () => {
    beforeEach(() => {
        harness.tables = {};
        harness.writes.length = 0;
        vi.clearAllMocks();
    });

    it("escapes welcomeMessage and the organization name in the email HTML", async () => {
        const previousSecret = process.env.JWT_SECRET;
        process.env.JWT_SECRET = "unit-test";
        try {
            const result = await caller({
                id: 4,
                role: "user",
                email: "owner@example.com",
                name: "Owner",
            }).clients.create({
                name: "Acme <img src=x onerror=alert(1)>",
                adminEmail: "new@example.com",
                welcomeMessage: "Hello\n<script>alert(1)</script>",
            });
            expect(result).toMatchObject({ id: 9 });
            const html = String(vi.mocked(sendEmail).mock.calls[0][0].html);
            expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
            expect(html).toContain("Acme &lt;img src=x onerror=alert(1)&gt;");
            expect(html).toContain("<br/>");
            expect(html).not.toContain("<script");
            expect(html).not.toContain("<img");
            expect(html).toContain("Set your password");
            expect(html).not.toMatch(/Math\.random|password is/i);
            expect(harness.createUser).toHaveBeenCalledWith({
                email: "new@example.com",
                name: "new",
            });
            expect(harness.writes).toContain("execute");
        } finally {
            if (previousSecret === undefined) delete process.env.JWT_SECRET;
            else process.env.JWT_SECRET = previousSecret;
        }
    });

    it("rejects an editor granting the owner role", async () => {
        membership("editor");
        await expect(caller({ id: 4, role: "user", email: "editor@example.com" }).clients.inviteUser({
            clientId: 9,
            email: "new-owner@example.com",
            role: "owner",
        })).rejects.toMatchObject({ code: "FORBIDDEN", message: "Owner access required" });
        expect(harness.assignUserToClient).not.toHaveBeenCalled();
    });

    it("lets an owner grant the owner role", async () => {
        membership("owner");
        await caller({ id: 4, role: "user", email: "owner@example.com" }).clients.inviteUser({
            clientId: 9,
            email: "new-owner@example.com",
            role: "owner",
        });
        expect(harness.assignUserToClient).toHaveBeenCalledWith(99, 9, "owner");
    });

    it("rejects a non-admin grantSelfAccess", async () => {
        await expect(caller({ id: 4, role: "user", email: "user@example.com" }).clients.grantSelfAccess({
            clientId: 9,
            role: "owner",
        })).rejects.toMatchObject({ code: "FORBIDDEN" });
        expect(harness.assignUserToClient).not.toHaveBeenCalled();
    });

    it("lets a platform admin grant themselves access", async () => {
        await caller({ id: 4, role: "admin", email: "admin@example.com" }).clients.grantSelfAccess({
            clientId: 9,
            role: "owner",
        });
        expect(harness.assignUserToClient).toHaveBeenCalledWith(4, 9, "owner");
    });

    it("escapes policy review messages, names, and approval notes", async () => {
        membership("editor");
        harness.getClientPolicyById.mockResolvedValue({
            clientPolicy: { id: 3, clientId: 9, status: "draft", name: "Policy <b>name</b>" },
        });
        harness.tables[getTableName(employees)] = [{
            id: 5,
            email: "reviewer@example.com",
            firstName: "<img>",
            lastName: "Reviewer",
        }];
        harness.tables[getTableName(users)] = [{ id: 1, email: "reviewer@example.com" }];

        await caller({ id: 4, role: "user", email: "editor@example.com", name: "Ada <script>" }).clientPolicies.requestReview({
            id: 3,
            clientId: 9,
            reviewers: ["5"],
            message: "<script>alert(1)</script>",
        });

        const reviewHtml = String(vi.mocked(sendEmail).mock.calls[0][0].html);
        expect(reviewHtml).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
        expect(reviewHtml).toContain("Policy &lt;b&gt;name&lt;/b&gt;");
        expect(reviewHtml).toContain("Ada &lt;script&gt;");
        expect(reviewHtml).toContain("&lt;img&gt;");
        expect(reviewHtml).not.toContain("<script");
        expect(reviewHtml).not.toContain("<img");
        expect(reviewHtml).not.toContain("<b>");

        vi.mocked(sendEmail).mockClear();
        harness.getClientPolicyById.mockResolvedValue({
            clientPolicy: {
                id: 3,
                clientId: 9,
                status: "review",
                name: "Pol <i>icy</i>",
                owner: "owner@example.com",
            },
        });
        await caller({ id: 4, role: "user", email: "editor@example.com", name: "Ada" }).clientPolicies.submitApproval({
            id: 3,
            clientId: 9,
            decision: "approved",
            notes: "<script>notes</script>",
        });
        const approvalHtml = String(vi.mocked(sendEmail).mock.calls[0][0].html);
        expect(approvalHtml).toContain("&lt;script&gt;notes&lt;/script&gt;");
        expect(approvalHtml).toContain("Pol &lt;i&gt;icy&lt;/i&gt;");
        expect(approvalHtml).not.toContain("<script");
        expect(approvalHtml).not.toContain("<i>");
    });

    it("escapes the client id in the auditor notice", async () => {
        membership("editor");
        harness.tables[getTableName(users)] = [{ id: 8, email: "aud@example.com", name: "Aud" }];
        await caller({ id: 4, role: "user", email: "editor@example.com" }).auditors.invite({
            email: "aud@example.com",
            clientId: 9,
        });
        const html = String(vi.mocked(sendEmail).mock.calls[0][0].html);
        expect(html).toBe(`<p>You have been granted auditor access to client #${escapeHtml(9)}. Log in to view.</p>`);
    });

    it("matches markAsRead to the notification user", async () => {
        harness.tables[getTableName(notificationLog)] = [{ id: 6, userId: 99 }];
        await expect(caller({ id: 4, role: "user" }).notifications.markAsRead({ id: 6 }))
            .rejects.toMatchObject({ code: "FORBIDDEN" });
        expect(harness.writes).not.toContain("update");

        harness.tables[getTableName(notificationLog)] = [{ id: 5, userId: 4 }];
        await caller({ id: 4, role: "user" }).notifications.markAsRead({ id: 5 });
        expect(harness.writes).toContain("update");
    });

    it("requires an editor for a workspace-scoped project delete", async () => {
        membership("viewer");
        await expect(caller({ id: 4, role: "user" }).projects.delete({ id: 1, clientId: 9 }))
            .rejects.toMatchObject({ code: "FORBIDDEN", message: "Read-only access" });

        membership("editor");
        await expect(caller({ id: 4, role: "user" }).projects.delete({ id: 1, clientId: 9 }))
            .resolves.toMatchObject({ success: true });
    });

    it("rejects a short or unsigned password reset", async () => {
        const previousSecret = process.env.JWT_SECRET;
        process.env.JWT_SECRET = "unit-test";
        try {
            await expect(completePasswordReset("not-a-token", "short")).rejects.toThrow(/12 characters/);
            await expect(completePasswordReset("aaaa.bbbb", "a-long-enough-password")).rejects.toThrow(/Invalid or expired/);
        } finally {
            if (previousSecret === undefined) delete process.env.JWT_SECRET;
            else process.env.JWT_SECRET = previousSecret;
        }
    });

    it("keeps the guessable password generator and the old incident label out of the source", () => {
        const clientsSource = readFileSync(path.resolve(__dirname, "routers/clients.ts"), "utf8");
        expect(clientsSource).not.toContain("Math.random");
        const labelSource = readFileSync(path.resolve(__dirname, "../pages/cyber/CyberIncidentReporting.tsx"), "utf8");
        expect(labelSource).toContain("Detected at (UTC)");
        expect(labelSource).not.toContain("Detailed at");
    });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName, type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { TRPCError } from "@trpc/server";

/**
 * Two workspaces whose user ids and employee ids overlap.
 * User 1 in workspace 1 is Alex. Employee 1 (workspace 2) is Charlie, and
 * Charlie's email belongs to user 3 in workspace 2. The old lookup treated
 * the selected user id as an employee id and would mail Charlie / notify Casey.
 */
const world = {
    users: [
        { id: 1, email: "alex@workspace.example", name: "Alex O'Brian", deletedAt: null as Date | null },
        { id: 2, email: "bianca@workspace.example", name: "Bianca Lee", deletedAt: null },
        { id: 3, email: "casey@other.example", name: "Casey Ng", deletedAt: null },
        { id: 4, email: null as string | null, name: "No Email", deletedAt: null },
        { id: 5, email: "deleted@workspace.example", name: "Deleted User", deletedAt: new Date("2020-01-01") },
    ],
    memberships: [
        { userId: 1, clientId: 1 },
        { userId: 2, clientId: 1 },
        { userId: 3, clientId: 2 },
        { userId: 4, clientId: 1 },
        { userId: 5, clientId: 1 },
    ],
    employees: [
        { id: 1, clientId: 2, email: "casey@other.example", firstName: "Charlie", lastName: "Davies" },
        { id: 3, clientId: 1, email: "sam.employee@workspace.example", firstName: "Sam", lastName: "Local" },
    ],
};

const dialect = new PgDialect();

type RecordedQuery = { table: string; joins: string[]; sql: string; params: unknown[] };

function numericParams(sql: string, params: unknown[], pattern: RegExp): number[] {
    const match = sql.match(pattern);
    if (!match) return [];
    const placeholders = match[1].match(/\$(\d+)/g) ?? [];
    return placeholders
        .map((placeholder) => params[Number(placeholder.slice(1)) - 1])
        .filter((value): value is number => typeof value === "number");
}

function createDirectory() {
    const queries: RecordedQuery[] = [];

    function execute(table: string, joins: string[], whereSql: SQL | undefined) {
        const rendered = whereSql ? dialect.sqlToQuery(whereSql) : { sql: "", params: [] as unknown[] };
        const sql = rendered.sql;
        const params = rendered.params;
        queries.push({ table, joins, sql, params });

        if (table === "employees") {
            const ids = numericParams(sql, params, /"employees"\."id" in \(([^)]+)\)/);
            return world.employees
                .filter((employee) => ids.includes(employee.id))
                .map((employee) => ({
                    id: employee.id,
                    email: employee.email,
                    firstName: employee.firstName,
                    lastName: employee.lastName,
                }));
        }

        if (table === "users" && joins.includes("user_clients")) {
            const clientIds = numericParams(sql, params, /"user_clients"\."client_id" = (\$\d+)/);
            const userIds = numericParams(sql, params, /"users"\."id" in \(([^)]+)\)/);
            const hideDeleted = /"users"\."deleted_at" is null/i.test(sql);
            return world.users
                .filter((user) => userIds.includes(user.id))
                .filter((user) => clientIds.length === 0
                    || world.memberships.some((membership) => membership.userId === user.id && clientIds.includes(membership.clientId)))
                .filter((user) => !hideDeleted || user.deletedAt == null)
                .map((user) => ({ id: user.id, email: user.email, name: user.name }));
        }

        if (table === "users" && /"users"\."id" in/.test(sql)) {
            const userIds = numericParams(sql, params, /"users"\."id" in \(([^)]+)\)/);
            return world.users
                .filter((user) => userIds.includes(user.id))
                .map((user) => ({ id: user.id, email: user.email, name: user.name }));
        }

        if (table === "users") {
            const match = sql.match(/"users"\."email" = (\$\d+)/);
            const email = match ? params[Number(match[1].slice(1)) - 1] : undefined;
            return world.users
                .filter((user) => user.email === email)
                .map((user) => ({ id: user.id, email: user.email }));
        }

        return [];
    }

    const db = {
        queries,
        select() {
            const state = { table: "", joins: [] as string[] };
            const chain = {
                from(table: Parameters<typeof getTableName>[0]) {
                    state.table = getTableName(table);
                    return chain;
                },
                innerJoin(table: Parameters<typeof getTableName>[0], _on?: SQL) {
                    state.joins.push(getTableName(table));
                    return chain;
                },
                leftJoin(table: Parameters<typeof getTableName>[0], _on?: SQL) {
                    state.joins.push(getTableName(table));
                    return chain;
                },
                where(condition: SQL) {
                    const rows = execute(state.table, state.joins, condition);
                    return {
                        limit(count: number) {
                            return Promise.resolve(rows.slice(0, count));
                        },
                        then(resolve: (value: typeof rows) => unknown, reject?: (reason: unknown) => unknown) {
                            return Promise.resolve(rows).then(resolve, reject);
                        },
                    };
                },
            };
            return chain;
        },
    };

    return db;
}

type StoredPolicy = {
    clientPolicy: {
        id: number;
        clientId: number;
        status: string;
        name: string;
        owner: string;
    };
};

const harness = vi.hoisted(() => ({
    directory: null as ReturnType<typeof createDirectory> | null,
    policy: null as StoredPolicy | null,
}));

vi.mock("../../db", () => ({
    getDb: vi.fn(async () => harness.directory),
    getClientPolicyById: vi.fn(async () => harness.policy),
    updateClientPolicy: vi.fn(async () => undefined),
}));

vi.mock("../../lib/audit", () => ({
    logActivity: vi.fn(async () => undefined),
}));

vi.mock("../../lib/notificationService", () => ({
    notifyUsers: vi.fn(async () => ({ success: true, count: 0 })),
}));

vi.mock("../../lib/email/service", () => ({
    EmailService: {
        send: vi.fn(async () => ({ success: true })),
    },
}));

vi.mock("../../lib/policy/policy-generation", () => ({
    policyGenerator: {},
}));

import * as db from "../../db";
import { logActivity } from "../../lib/audit";
import { notifyUsers } from "../../lib/notificationService";
import { EmailService } from "../../lib/email/service";
import { createClientPoliciesRouter } from "./clientPolicies";

const procedure = {
    input: () => ({
        query: (handler: unknown) => handler,
        mutation: (handler: unknown) => handler,
    }),
};

type ReviewerCtx = { user: { id: number; name: string } };

type RequestReviewInput = {
    id: number;
    clientId: number;
    reviewers: string[];
    message?: string;
    dueDate?: string;
};

type SubmitApprovalInput = {
    id: number;
    clientId: number;
    decision: "approved" | "changes_requested";
    notes?: string;
};

const router = createClientPoliciesRouter(
    { router: (handlers: unknown) => handlers },
    procedure,
    procedure,
    procedure,
    procedure,
) as {
    requestReview: (opts: { input: RequestReviewInput; ctx: ReviewerCtx }) => Promise<{ success: boolean }>;
    submitApproval: (opts: { input: SubmitApprovalInput; ctx: ReviewerCtx }) => Promise<{ success: boolean }>;
};

const ctx = { user: { id: 9, name: "Quinn <admin>" } };

function policy(overrides: Partial<StoredPolicy["clientPolicy"]> = {}) {
    return {
        clientPolicy: {
            id: 42,
            clientId: 1,
            status: "draft",
            name: "Access & Control <draft>",
            owner: "alex@workspace.example",
            ...overrides,
        },
    };
}

async function requestReview(reviewers: string[], extra: Partial<Pick<RequestReviewInput, "message" | "dueDate">> = {}) {
    return router.requestReview({
        input: {
            id: 42,
            clientId: 1,
            reviewers,
            message: `Please review <img src=x onerror=alert(1)>`,
            ...extra,
        },
        ctx,
    });
}

describe("clientPolicies review notifications", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        harness.directory = createDirectory();
        harness.policy = policy();
        vi.stubEnv("APP_URL", "https://grc.example.com/");
        vi.stubEnv("VITE_APP_URL", "https://vite.example/");
        vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
        vi.stubEnv("PORT", "");
        vi.stubEnv("APP_PORT", "");
    });

    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it("notifies only the selected workspace users when ids collide with another tenant's employees", async () => {
        const result = await requestReview(["1", "2", "1"]);

        expect(result).toEqual({ success: true });
        expect(db.updateClientPolicy).toHaveBeenCalledWith(42, expect.objectContaining({
            approvalStatus: "requested",
            reviewers: ["1", "2"],
            status: "review",
        }));

        expect(harness.directory!.queries.map((query) => query.table)).toEqual(["users"]);
        expect(harness.directory!.queries[0].joins).toContain("user_clients");
        expect(harness.directory!.queries[0].sql).toContain('"user_clients"."client_id"');
        expect(harness.directory!.queries[0].params).toContain(1);

        expect(notifyUsers).toHaveBeenCalledTimes(1);
        expect(notifyUsers).toHaveBeenCalledWith([1, 2], expect.objectContaining({
            type: "policy_review_requested",
            link: "/clients/1/policies/42",
        }));

        const emails = vi.mocked(EmailService.send).mock.calls.map((call) => call[0]);
        expect(emails.map((email) => email.to)).toEqual([
            "alex@workspace.example",
            "bianca@workspace.example",
        ]);
        expect(JSON.stringify(emails)).not.toContain("casey@other.example");
        expect(JSON.stringify(emails)).not.toContain("sam.employee@workspace.example");
        expect(JSON.stringify(emails)).not.toContain("Charlie");

        const html = emails[0].html;
        expect(html).toContain("Hello Alex O&#39;Brian");
        expect(html).toContain("Quinn &lt;admin&gt;");
        expect(html).toContain("Access &amp; Control &lt;draft&gt;");
        expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
        expect(html).toContain('href="https://grc.example.com/clients/1/policies/42"');
        expect(html).not.toContain("https://vite.example");
        expect(html).not.toContain("<img");
        expect(html).not.toContain("<draft>");
        expect(emails[0].subject).not.toMatch(/[\r\n]/);
    });

    it("does not fall back to VITE_APP_URL when the server URL is unset", async () => {
        vi.stubEnv("APP_URL", "");
        vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
        vi.stubEnv("VITE_APP_URL", "https://vite.example/");
        vi.stubEnv("PORT", "3002");

        await requestReview(["1"]);

        const html = vi.mocked(EmailService.send).mock.calls[0][0].html;
        expect(html).toContain('href="http://localhost:3002/clients/1/policies/42"');
        expect(html).not.toContain("vite.example");
    });

    it("rejects a reviewer who only exists in another workspace, even when that id is an employee here", async () => {
        await expect(requestReview(["3"])).rejects.toBeInstanceOf(TRPCError);
        await expect(requestReview(["3"])).rejects.toMatchObject({ code: "BAD_REQUEST" });

        expect(db.updateClientPolicy).not.toHaveBeenCalled();
        expect(logActivity).not.toHaveBeenCalled();
        expect(notifyUsers).not.toHaveBeenCalled();
        expect(EmailService.send).not.toHaveBeenCalled();
        expect(harness.directory!.queries.every((query) => query.table !== "employees")).toBe(true);
    });

    it("rejects the whole request when any selected id is outside the workspace", async () => {
        await expect(requestReview(["1", "3"])).rejects.toMatchObject({ code: "BAD_REQUEST" });

        expect(db.updateClientPolicy).not.toHaveBeenCalled();
        expect(notifyUsers).not.toHaveBeenCalled();
        expect(EmailService.send).not.toHaveBeenCalled();
    });

    it("rejects a deleted member and does not mail the remaining reviewers", async () => {
        await expect(requestReview(["1", "5"])).rejects.toMatchObject({ code: "BAD_REQUEST" });
        expect(EmailService.send).not.toHaveBeenCalled();
        expect(notifyUsers).not.toHaveBeenCalled();
    });

    it("notifies a member who has no email address without sending mail", async () => {
        await requestReview(["4"]);

        expect(notifyUsers).toHaveBeenCalledWith([4], expect.anything());
        expect(EmailService.send).not.toHaveBeenCalled();
    });

    it("rejects ids that are not workspace user ids before writing", async () => {
        await expect(requestReview(["1 OR 1=1"])).rejects.toMatchObject({ code: "BAD_REQUEST" });
        expect(db.updateClientPolicy).not.toHaveBeenCalled();
        expect(harness.directory!.queries).toEqual([]);
        expect(EmailService.send).not.toHaveBeenCalled();
    });

    it("does not notify anyone when the policy belongs to a different workspace", async () => {
        harness.policy = policy({ clientId: 2 });

        await expect(requestReview(["1"])).rejects.toMatchObject({ code: "FORBIDDEN" });
        expect(EmailService.send).not.toHaveBeenCalled();
        expect(notifyUsers).not.toHaveBeenCalled();
    });

    it("escapes the approval email and links it with the server app URL", async () => {
        harness.policy = policy({
            status: "review",
            name: "Policy <b>Secret</b>\nBcc: eve@evil.example",
            owner: "alex@workspace.example",
        });

        await router.submitApproval({
            input: {
                id: 42,
                clientId: 1,
                decision: "changes_requested",
                notes: `click <a href="http://evil.test">here</a>`,
            },
            ctx,
        });

        const email = vi.mocked(EmailService.send).mock.calls[0][0];
        expect(email.to).toBe("alex@workspace.example");
        expect(email.subject).not.toMatch(/[\r\n]/);
        expect(email.html).toContain("Policy &lt;b&gt;Secret&lt;/b&gt;");
        expect(email.html).toContain("click &lt;a href=&quot;http://evil.test&quot;&gt;here&lt;/a&gt;");
        expect(email.html).toContain('href="https://grc.example.com/clients/1/policies/42"');
        expect(email.html).not.toContain("https://vite.example");
        expect(email.html).not.toContain("<b>");
        expect(email.html).not.toContain("<a href=\"http://evil.test\"");
        expect(notifyUsers).toHaveBeenCalledWith([1], expect.objectContaining({
            type: "policy_changes_requested",
        }));
    });
});

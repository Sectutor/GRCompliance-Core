import { describe, expect, it, vi } from "vitest";
import { initTRPC } from "@trpc/server";

const harness = vi.hoisted(() => {
    const tables: Record<string, any[]> = {};
    function write(result: any[] = [{ id: 1, filename: "a.pdf", fileUrl: "/u", fileKey: "k", contentType: "application/pdf", fileSize: 1, createdAt: new Date(), description: "title" }]) {
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
        reset() {
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
                        orderBy() { return api; },
                        leftJoin() { return api; },
                        innerJoin() { return api; },
                        limit(n?: number) {
                            const all = rows();
                            return Promise.resolve(typeof n === "number" ? all.slice(0, n) : all);
                        },
                        then(ok: any, err: any) {
                            return Promise.resolve(rows()).then(ok, err);
                        },
                    };
                    return api;
                },
                insert: () => write(),
                update: () => write(),
                delete: () => write(),
            };
        },
    };
});

vi.mock("../../db", () => ({
    getDb: () => harness.getDb(),
    getEvidence: async () => [],
}));

import { createEvidenceRouter } from "./evidence";
import { createEvidenceFilesRouter } from "./evidenceFiles";

const t = initTRPC.context<{ user: { id: number; role?: string | null } | null }>().create();
const app = t.router({
    evidence: createEvidenceRouter(t, t.procedure, t.procedure, t.procedure),
    evidenceFiles: createEvidenceFilesRouter(t, t.procedure, t.procedure),
});

const anon = app.createCaller({ user: null });
const viewer = app.createCaller({ user: { id: 4, role: "user" } });
const editor = app.createCaller({ user: { id: 4, role: "user" } });

function seedMember(clientId: number, role: string) {
    harness.tables.user_clients = [{ userId: 4, clientId, role, joinedAt: new Date("2020-01-01") }];
}

describe("evidence and file workspace access", () => {
    it("rejects anonymous calls", async () => {
        harness.reset();
        const calls: Array<Promise<unknown>> = [
            anon.evidence.listOpenRequests({ clientId: 1 }),
            anon.evidence.getByControl({ clientControlId: 1 }),
            anon.evidence.delete({ id: 1 }),
            anon.evidence.update({ id: 1, description: "x" }),
            anon.evidence.updateStatus({ evidenceId: 1, status: "verified" }),
            anon.evidence.getFiles({ evidenceId: 1 }),
            anon.evidence.linkIntegration({ evidenceId: 1, provider: "github", resourceId: "r" }),
            anon.evidence.addComment({ evidenceId: 1, content: "hi" }),
            anon.evidence.getComments({ evidenceId: 1 }),
            anon.evidence.getAllComments({ clientId: 1 }),
            anon.evidenceFiles.list({ evidenceId: 1 }),
            anon.evidenceFiles.listAll({ clientId: 1 }),
            anon.evidenceFiles.delete({ id: 1 }),
            anon.evidenceFiles.registerQuickUpload({
                clientId: 1,
                title: "t",
                filename: "a.pdf",
                fileKey: "clients/1/evidence/a.pdf",
                url: "https://example.test/a.pdf",
            }),
        ];
        for (const call of calls) {
            await expect(call).rejects.toMatchObject({ code: "UNAUTHORIZED" });
        }
    });

    it("forbids a member of workspace A from workspace B rows", async () => {
        harness.reset();
        seedMember(7, "editor");
        harness.tables.evidence = [{ id: 3, clientId: 9, clientControlId: 4 }];
        harness.tables.client_controls = [{ id: 4, clientId: 9 }];
        harness.tables.evidence_files = [{ id: 8, evidenceId: 3 }];

        await expect(editor.evidence.delete({ id: 3 })).rejects.toMatchObject({ code: "FORBIDDEN" });
        await expect(editor.evidence.listOpenRequests({ clientId: 9 })).rejects.toMatchObject({ code: "FORBIDDEN" });
        await expect(editor.evidence.getByControl({ clientControlId: 4 })).rejects.toMatchObject({ code: "FORBIDDEN" });
        await expect(editor.evidence.getFiles({ evidenceId: 3 })).rejects.toMatchObject({ code: "FORBIDDEN" });
        await expect(editor.evidenceFiles.list({ evidenceId: 3 })).rejects.toMatchObject({ code: "FORBIDDEN" });
        await expect(editor.evidenceFiles.delete({ id: 8 })).rejects.toMatchObject({ code: "FORBIDDEN" });
        await expect(editor.evidenceFiles.listAll({ clientId: 9 })).rejects.toMatchObject({ code: "FORBIDDEN" });
        await expect(editor.evidenceFiles.registerQuickUpload({
            clientId: 9,
            title: "t",
            filename: "a.pdf",
            fileKey: "clients/9/evidence/a.pdf",
            url: "https://example.test/a.pdf",
        })).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("forbids the id collision where evidence id equals the caller's workspace id", async () => {
        harness.reset();
        seedMember(7, "editor");
        harness.tables.evidence = [{ id: 7, clientId: 9 }];
        await expect(editor.evidence.update({ id: 7, description: "moved" })).rejects.toMatchObject({ code: "FORBIDDEN" });
        await expect(editor.evidence.delete({ id: 7 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("lets a viewer read and refuses viewer writes", async () => {
        harness.reset();
        seedMember(7, "viewer");
        harness.tables.evidence = [{ id: 3, clientId: 7, clientControlId: 4, evidenceId: "REQ", description: "d", framework: "ISO", status: "pending" }];
        harness.tables.client_controls = [{ id: 4, clientId: 7 }];
        harness.tables.evidence_files = [];

        await expect(viewer.evidence.getFiles({ evidenceId: 3 })).resolves.toEqual([]);
        await expect(viewer.evidence.getByControl({ clientControlId: 4 })).resolves.toEqual(harness.tables.evidence);
        await expect(viewer.evidenceFiles.list({ evidenceId: 3 })).resolves.toEqual([]);
        await expect(viewer.evidence.delete({ id: 3 })).rejects.toMatchObject({ code: "FORBIDDEN" });
        await expect(viewer.evidence.updateStatus({ evidenceId: 3, status: "verified" })).rejects.toMatchObject({ code: "FORBIDDEN" });
        await expect(viewer.evidence.addComment({ evidenceId: 3, content: "no" })).rejects.toMatchObject({ code: "FORBIDDEN" });
        await expect(viewer.evidenceFiles.delete({ id: 8 })).rejects.toMatchObject({ code: "NOT_FOUND" });
        await expect(viewer.evidenceFiles.registerQuickUpload({
            clientId: 7,
            title: "t",
            filename: "a.pdf",
            fileKey: "clients/7/evidence/a.pdf",
            url: "https://example.test/a.pdf",
        })).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("lets an editor register a file only under that workspace key", async () => {
        harness.reset();
        seedMember(7, "editor");
        await expect(editor.evidenceFiles.registerQuickUpload({
            clientId: 7,
            title: "t",
            filename: "a.pdf",
            fileKey: "clients/9/evidence/a.pdf",
            url: "https://example.test/a.pdf",
        })).rejects.toMatchObject({ code: "FORBIDDEN" });

        const registered = await editor.evidenceFiles.registerQuickUpload({
            clientId: 7,
            title: "t",
            filename: "a.pdf",
            fileKey: "clients/7/evidence/a.pdf",
            url: "https://example.test/a.pdf",
        });
        expect(registered.id).toBe(1);
    });
});

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => {
    const tables: Record<string, any[]> = {};
    const stored: string[] = [];
    return {
        tables,
        stored,
        reset() {
            stored.length = 0;
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
            };
        },
    };
});

vi.mock("../db", () => ({
    getDb: () => harness.getDb(),
}));

vi.mock("../storage", () => ({
    storagePut: async (key: string) => {
        harness.stored.push(key);
        return { key, url: `/uploads/${key}` };
    },
}));

import { authorizeUploadDownload, handleUpload, safeUploadFolder } from "./uploadAccess";

function mockRes() {
    const res: any = { statusCode: 200, body: undefined };
    res.status = (code: number) => {
        res.statusCode = code;
        return res;
    };
    res.json = (body: unknown) => {
        res.body = body;
        return res;
    };
    return res;
}

describe("upload and download workspace keys", () => {
    it("rejects a folder of ../", async () => {
        expect(safeUploadFolder("../")).toBeNull();
        expect(safeUploadFolder("evidence/../../etc")).toBeNull();
        const res = mockRes();
        await handleUpload({
            user: { id: 4, role: "user" },
            body: { filename: "a.pdf", data: Buffer.from("hi").toString("base64"), folder: "../", clientId: 7 },
            headers: {},
        }, res);
        expect(res.statusCode).toBe(400);
        expect(harness.stored).toEqual([]);
    });

    it("stores an editor upload under clients/<id>/", async () => {
        harness.reset();
        harness.tables.user_clients = [{ userId: 4, clientId: 7, role: "editor", joinedAt: new Date(0) }];
        const res = mockRes();
        await handleUpload({
            user: { id: 4, role: "user" },
            body: {
                filename: "report.pdf",
                data: Buffer.from("hi").toString("base64"),
                folder: "evidence",
                clientId: 7,
                contentType: "application/pdf",
            },
            headers: {},
        }, res);
        expect(res.statusCode).toBe(200);
        expect(harness.stored[0]).toMatch(/^clients\/7\/evidence\/\d+-report\.pdf$/);
        expect(res.body.key).toBe(harness.stored[0]);
    });

    it("forbids a viewer upload and a cross-workspace upload", async () => {
        harness.reset();
        harness.tables.user_clients = [{ userId: 4, clientId: 7, role: "viewer", joinedAt: new Date(0) }];
        const viewerRes = mockRes();
        await handleUpload({
            user: { id: 4, role: "user" },
            body: { filename: "a.pdf", data: Buffer.from("hi").toString("base64"), folder: "evidence", clientId: 7 },
            headers: {},
        }, viewerRes);
        expect(viewerRes.statusCode).toBe(403);

        const other = mockRes();
        await handleUpload({
            user: { id: 4, role: "user" },
            body: { filename: "a.pdf", data: Buffer.from("hi").toString("base64"), folder: "evidence", clientId: 9 },
            headers: {},
        }, other);
        expect(other.statusCode).toBe(403);
    });

    it("authorizes a download only for the key's workspace", async () => {
        harness.reset();
        harness.tables.user_clients = [{ userId: 4, clientId: 7, role: "viewer", joinedAt: new Date(0) }];

        const anon = mockRes();
        let nexted = false;
        await authorizeUploadDownload({ user: null, path: "/clients/7/evidence/a.pdf" }, anon, () => { nexted = true; });
        expect(anon.statusCode).toBe(401);
        expect(nexted).toBe(false);

        const foreign = mockRes();
        await authorizeUploadDownload({ user: { id: 4, role: "user" }, path: "/clients/9/evidence/a.pdf" }, foreign, () => { nexted = true; });
        expect(foreign.statusCode).toBe(403);
        expect(nexted).toBe(false);

        const bare = mockRes();
        await authorizeUploadDownload({ user: { id: 4, role: "user" }, path: "/evidence/secret.pdf" }, bare, () => { nexted = true; });
        expect(bare.statusCode).toBe(403);

        const own = mockRes();
        await authorizeUploadDownload({ user: { id: 4, role: "user" }, path: "/clients/7/evidence/a.pdf" }, own, () => { nexted = true; });
        expect(nexted).toBe(true);
    });

    it("removes the debug globals route", () => {
        const source = readFileSync(path.resolve(__dirname, "../../../../server_entry.ts"), "utf8");
        expect(source).not.toContain("/debug/globals");
        expect(source).not.toContain("/api/debug/globals");
    });
});

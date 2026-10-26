import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { ANNEX_A_CONTROLS } from "../data/annexACatalog";
import { mergeSoaListing } from "../lib/soaListing";
import { handleSoaExport, type SoaExportDeps } from "./soaExportHandler";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

function mockRes() {
    const headers = new Map<string, string>();
    return {
        statusCode: 200,
        headersSent: false,
        body: undefined as unknown,
        status(code: number) {
            this.statusCode = code;
            return this;
        },
        setHeader(name: string, value: string) {
            headers.set(name, value);
        },
        getHeader(name: string) {
            return headers.get(name);
        },
        send(body: unknown) {
            this.body = body;
            this.headersSent = true;
            return this;
        },
    };
}

function statement() {
    return mergeSoaListing(
        [{
            id: 1,
            controlId: "A.5.1",
            name: "Policies for information security",
            description: "Publish the rules.",
            framework: "ISO 27001",
            category: "Governance",
        }],
        [{
            control: { controlId: "A.5.1" },
            clientControl: {
                id: 41,
                status: "implemented",
                applicability: "applicable",
                justification: "Covered by the information security policy.",
                implementationNotes: null,
                clientControlId: "CC-001",
            },
        }],
    );
}

function deps(overrides: Partial<SoaExportDeps> = {}): SoaExportDeps {
    return {
        loadMembership: vi.fn(async () => ({ userId: 5, clientId: 1, accessExpiresAt: null })),
        loadClientName: vi.fn(async () => "Latore LTD"),
        loadStatement: vi.fn(async () => statement()),
        generateDocx: vi.fn(async () => Buffer.from("docx-bytes")),
        ...overrides,
    };
}

function request(input: { user?: { id: number; role?: string } | null; clientId?: string; format?: string }) {
    return {
        user: input.user === undefined ? { id: 5, role: "member" } : input.user,
        params: { clientId: input.clientId ?? "1" },
        query: input.format ? { format: input.format } : {},
    } as any;
}

describe("SoA export route", () => {
    it("returns Word and CSV downloads for a member of that workspace", async () => {
        const wordDeps = deps();
        const word = mockRes();
        await handleSoaExport(request({}), word as any, wordDeps);
        expect(word.statusCode).toBe(200);
        expect(word.getHeader("Content-Type")).toContain("wordprocessingml");
        expect(word.getHeader("Content-Disposition")).toContain("Latore-LTD-Statement-of-Applicability.docx");
        expect(word.body).toEqual(Buffer.from("docx-bytes"));
        expect(wordDeps.generateDocx).toHaveBeenCalledWith(expect.objectContaining({
            clientName: "Latore LTD",
            controls: expect.arrayContaining([
                expect.objectContaining({ code: "A.5.1", applicability: "applicable", justification: "Covered by the information security policy." }),
                expect.objectContaining({ code: "A.7.1", applicability: "not_assessed" }),
            ]),
        }));
        expect((wordDeps.generateDocx as any).mock.calls[0][0].controls).toHaveLength(ANNEX_A_CONTROLS.length);

        const csv = mockRes();
        await handleSoaExport(request({ format: "csv" }), csv as any, deps());
        expect(csv.statusCode).toBe(200);
        expect(csv.getHeader("Content-Type")).toContain("text/csv");
        expect(String(csv.body)).toContain("Reference,Title,Theme");
        expect(String(csv.body)).toContain("Covered by the information security policy.");
        expect(String(csv.body)).toContain("A.7.1");
        expect(String(csv.body)).toContain("Not yet assessed");
        expect(String(csv.body)).toContain("Governance");
    });

    it("denies an anonymous caller and a member of another workspace", async () => {
        const anonymous = mockRes();
        const anonymousDeps = deps();
        await handleSoaExport(request({ user: null }), anonymous as any, anonymousDeps);
        expect(anonymous.statusCode).toBe(401);
        expect(anonymousDeps.loadStatement).not.toHaveBeenCalled();

        const otherWorkspace = mockRes();
        const otherDeps = deps({
            loadMembership: vi.fn(async () => null),
        });
        await handleSoaExport(request({ user: { id: 5, role: "member" }, clientId: "2" }), otherWorkspace as any, otherDeps);
        expect(otherWorkspace.statusCode).toBe(403);
        expect(otherWorkspace.body).toBe("No access to this client workspace");
        expect(otherDeps.loadClientName).not.toHaveBeenCalled();
        expect(otherDeps.loadStatement).not.toHaveBeenCalled();

        const expired = mockRes();
        await handleSoaExport(request({}), expired as any, deps({
            loadMembership: vi.fn(async () => ({
                userId: 5,
                clientId: 1,
                accessExpiresAt: new Date(Date.now() - 60_000),
            })),
        }));
        expect(expired.statusCode).toBe(403);
    });

    it("stays on the community export router and is not premium gated", () => {
        const source = readFileSync(path.join(root, "packages/core/src/server/routers/export.ts"), "utf8");
        expect(source).toContain('"/soa/:clientId"');
        expect(source).toContain("Community feature");
        expect(source).not.toContain("checkPremiumAccess");
        expect(source).not.toContain("premiumClientProcedure");
        const controls = readFileSync(path.join(root, "packages/core/src/pages/ClientControlsPage.tsx"), "utf8");
        expect(controls).not.toContain("window.location.assign");
        expect(controls).toContain("SoaExportButton");
        const soa = readFileSync(path.join(root, "packages/core/src/pages/iso27001/StatementOfApplicability.tsx"), "utf8");
        expect(soa).toContain("SoaExportButton");
    });
});

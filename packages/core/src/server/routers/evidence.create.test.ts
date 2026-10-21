import { beforeEach, describe, expect, it, vi } from "vitest";

const mockDb = {
    select: vi.fn(),
    insert: vi.fn(),
};

vi.mock("../../db", () => ({
    getDb: vi.fn(async () => mockDb),
    getEvidence: vi.fn(),
}));

vi.mock("../../lib/llm/service", () => ({
    llmService: {},
}));

vi.mock("../services/riskService", () => ({
    recalculateRiskScore: vi.fn(),
}));

import { createEvidenceRouter } from "./evidence";

function procedure() {
    const chain: any = {
        input: () => chain,
        query: (handler: any) => (input: any) => handler({ input }),
        mutation: (handler: any) => (input: any) => handler({ input }),
    };
    return chain;
}

describe("evidence.create", () => {
    const router = createEvidenceRouter({ router: (routes: any) => routes }, procedure(), procedure(), procedure()) as any;

    beforeEach(() => {
        vi.clearAllMocks();
    });

    function mockExisting(ids: string[]) {
        const where = vi.fn().mockResolvedValue(ids.map((evidenceId) => ({ evidenceId })));
        const from = vi.fn().mockReturnValue({ where });
        mockDb.select.mockReturnValue({ from });

        const inserted: any[] = [];
        const returning = vi.fn(async () => [{ id: 1, ...inserted[0] }]);
        const values = vi.fn((row: any) => {
            inserted.push(row);
            return { returning };
        });
        mockDb.insert.mockReturnValue({ values });
        return inserted;
    }

    it("allocates the next workspace id when the dialog omits evidenceId", async () => {
        const inserted = mockExisting(["LTD-EV-008"]);
        await router.create({
            clientId: 1,
            clientControlId: 4,
            description: "Firewall rules",
        });
        expect(inserted[0].evidenceId).toBe("LTD-EV-009");
    });

    it("keeps a free id and replaces one that is already taken", async () => {
        const inserted = mockExisting(["LTD-EV-001", "LTD-EV-008"]);
        await router.create({
            clientId: 1,
            clientControlId: 4,
            evidenceId: "LTD-EV-009",
            description: "Exit plan",
        });
        expect(inserted[0].evidenceId).toBe("LTD-EV-009");

        const collided = mockExisting(["LTD-EV-008"]);
        await router.create({
            clientId: 1,
            clientControlId: 4,
            evidenceId: "LTD-EV-008",
            description: "Duplicate",
        });
        expect(collided[0].evidenceId).toBe("LTD-EV-009");
    });

    it("uses EVD-001 only when the workspace has no evidence", async () => {
        const inserted = mockExisting([]);
        await router.create({
            clientId: 1,
            clientControlId: 4,
            description: "First record",
        });
        expect(inserted[0].evidenceId).toBe("EVD-001");
    });
});

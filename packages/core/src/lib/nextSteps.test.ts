import { describe, expect, it } from "vitest";
import { buildNextSteps, type NextStepsSnapshot } from "./nextSteps";

function snapshot(overrides: Partial<NextStepsSnapshot> = {}): NextStepsSnapshot {
    return {
        clientId: 7,
        now: "2026-11-27T00:00:00.000Z",
        frameworks: ["ISO 27001:2022"],
        controls: [
            { id: 1, code: "A.5.1", title: "Policies", owner: "Ada", dueDate: "2026-12-01", evidenceCount: 1 },
        ],
        policies: [],
        ...overrides,
    };
}

describe("next steps", () => {
    it("reports all four rules done when the workspace is in order", () => {
        const result = buildNextSteps(snapshot());
        expect(result.done).toBe(4);
        expect(result.total).toBe(4);
        expect(result.items).toEqual([]);
    });

    it("lists a missing framework, an unowned control, missing evidence, and an overdue policy", () => {
        const result = buildNextSteps(snapshot({
            frameworks: ["SAMM"],
            controls: [
                { id: 3, code: "A.5.2", title: "Roles", owner: "  ", dueDate: "2026-01-01", evidenceCount: 0 },
            ],
            policies: [{ id: 9, title: "Access policy", reviewDueDate: "2026-11-01" }],
        }));
        expect(result.done).toBe(0);
        expect(result.items.map((item) => item.rule)).toEqual([
            "no_framework",
            "unowned_controls",
            "missing_evidence",
            "overdue_reviews",
        ]);
        expect(result.items[3].href).toBe("/clients/7/policies/9");
        expect(result.items[1].href).toBe("/clients/7/controls");
    });

    it("does not treat the built-in catalogues as the chosen framework", () => {
        const result = buildNextSteps(snapshot({ frameworks: ["ASVS", ""] }));
        expect(result.items.some((item) => item.rule === "no_framework")).toBe(true);
    });
});

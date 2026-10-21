import { describe, expect, it } from "vitest";
import { equivalentControlIds, evidenceLinkedToControl } from "./evidenceLink";

describe("evidenceLinkedToControl", () => {
    const evidence = [
        { id: 1, evidenceId: "LTD-EV-001", control: { id: 10 } },
        { id: 2, evidenceId: "LTD-EV-002", control: { id: 20 } },
        { id: 3, evidenceId: "LTD-EV-003", control: { id: 30 } },
    ];

    it("returns evidence on the same master control the Evidence page joins", () => {
        expect(evidenceLinkedToControl(evidence, 10, []).map((item) => item.id)).toEqual([1]);
    });

    it("includes evidence linked through an equivalent control", () => {
        const mappings = [
            { sourceControlId: 10, targetControlId: 20 },
            { sourceControlId: 20, targetControlId: 30 },
        ];
        expect(evidenceLinkedToControl(evidence, 10, mappings).map((item) => item.id)).toEqual([1, 2, 3]);
    });

    it("does not treat a missing master control as a match-all", () => {
        expect(evidenceLinkedToControl(evidence, null, [])).toEqual([]);
        expect(equivalentControlIds(10, undefined)).toEqual(new Set([10]));
    });
});

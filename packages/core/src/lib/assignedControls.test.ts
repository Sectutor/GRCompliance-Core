import { describe, expect, it } from "vitest";
import { assignedControlCounts, assignedControlLabel, assignedControlRate, shouldOfferDemoImport, workspaceCompliancePercent } from "./assignedControls";

describe("assigned control counts", () => {
    it("uses every assigned row, including not-applicable, as the controls page does", () => {
        const statuses = [
            ...Array.from({ length: 14 }, () => "implemented"),
            ...Array.from({ length: 8 }, () => "in_progress"),
            ...Array.from({ length: 4 }, () => "not_implemented"),
            ...Array.from({ length: 4 }, () => "not_applicable"),
        ];
        const counts = assignedControlCounts(statuses);
        expect(counts).toEqual({ total: 30, implemented: 14 });
        expect(assignedControlLabel(counts)).toBe("14/30");
        expect(assignedControlRate(counts)).toBe(47);
        expect(workspaceCompliancePercent(14, 30)).toBe(47);
        expect(workspaceCompliancePercent(14, 26)).toBe(54);
        expect(workspaceCompliancePercent(0, 0)).toBe(0);
    });

    it("offers demo import only for an empty workspace", () => {
        expect(shouldOfferDemoImport(0)).toBe(true);
        expect(shouldOfferDemoImport(30)).toBe(false);
    });
});

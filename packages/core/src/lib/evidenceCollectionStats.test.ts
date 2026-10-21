import { describe, expect, it } from "vitest";
import { evidenceCollectionStats, matchesEvidenceStatusFilter } from "./evidenceCollectionStats";

const rows = [
    { statuses: ["verified"] },
    { statuses: ["collected"] },
    { statuses: [] as string[] },
    { statuses: ["pending"] },
];

describe("evidenceCollectionStats", () => {
    it("counts workspace totals, with no evidence yet separate from not-yet-verified", () => {
        expect(evidenceCollectionStats(rows)).toEqual({
            total: 4,
            verified: 1,
            noEvidence: 1,
            completion: 25,
        });
    });

    it("uses the same no-evidence rule as the filter, which does not change the totals", () => {
        const visible = rows.filter((row) => matchesEvidenceStatusFilter(row.statuses, "no_evidence"));
        expect(visible).toEqual([{ statuses: [] }]);
        expect(evidenceCollectionStats(rows).noEvidence).toBe(visible.length);
        expect(matchesEvidenceStatusFilter(["collected"], "need_documents")).toBe(false);
        expect(matchesEvidenceStatusFilter([], "need_documents")).toBe(true);
    });
});

import { describe, expect, it } from "vitest";
import { isSoaExcluded, soaStats } from "./soaStats";

describe("soaStats", () => {
    it("counts status not_applicable as excluded even when applicability was left applicable", () => {
        const rows = [
            { status: "implemented", applicability: "applicable" },
            { status: "in_progress", applicability: "applicable" },
            { status: "not_applicable", applicability: "applicable" },
            { status: "not_implemented", applicability: "not_applicable" },
        ];
        expect(isSoaExcluded(rows[2])).toBe(true);
        expect(soaStats(rows)).toEqual({
            total: 4,
            applicable: 2,
            implemented: 1,
            excluded: 2,
            rate: 50,
        });
    });

    it("returns a null rate when every control is excluded", () => {
        expect(soaStats([{ status: "not_applicable", applicability: "applicable" }]).rate).toBeNull();
    });
});

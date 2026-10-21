import { describe, expect, it } from "vitest";
import {
    EVIDENCE_STATUSES,
    evidenceStatusBadgeClass,
    evidenceStatusDotClass,
    evidenceStatusLabel,
} from "./evidenceStatus";

describe("evidenceStatusLabel", () => {
    it("uses one label for each stored status", () => {
        expect(EVIDENCE_STATUSES.map((status) => evidenceStatusLabel(status))).toEqual([
            "Pending",
            "Collected",
            "Verified",
            "Rejected",
            "Expired",
            "Not applicable",
        ]);
    });

    it("does not rename collected or verified to audit-only words", () => {
        expect(evidenceStatusLabel("collected")).toBe("Collected");
        expect(evidenceStatusLabel("verified")).toBe("Verified");
        expect(evidenceStatusLabel("pending")).not.toBe("Open");
        expect(evidenceStatusLabel(null)).toBe("Pending");
    });

    it("keeps a colour for collected instead of treating it as unnamed", () => {
        expect(evidenceStatusDotClass("collected")).toBe("bg-amber-400");
        expect(evidenceStatusDotClass("verified")).toBe("bg-green-500");
        expect(evidenceStatusBadgeClass("verified")).toContain("emerald");
        expect(evidenceStatusBadgeClass("collected")).toContain("amber");
    });
});

import { describe, expect, it } from "vitest";
import { canLinkEvidenceToControl } from "./linkEvidence";

describe("canLinkEvidenceToControl", () => {
    it("allows a link inside one workspace and rejects a cross-workspace id", () => {
        expect(canLinkEvidenceToControl(1, 1)).toBe(true);
        expect(canLinkEvidenceToControl(1, 2)).toBe(false);
        expect(canLinkEvidenceToControl(null, 1)).toBe(false);
    });
});

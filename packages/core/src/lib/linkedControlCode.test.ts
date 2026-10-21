import { describe, expect, it } from "vitest";
import { controlCodeFromEvidenceRow, linkedControlCode } from "./linkedControlCode";

describe("linkedControlCode", () => {
    it("prefers the workspace control code", () => {
        expect(linkedControlCode({ clientControlCode: "CC-006", masterControlId: "A.5.24" })).toBe("CC-006");
    });

    it("falls back to the master control id and ignores blanks", () => {
        expect(linkedControlCode({ clientControlCode: "  ", masterControlId: "A.5.24" })).toBe("A.5.24");
        expect(linkedControlCode({ clientControlCode: null, masterControlId: null })).toBeNull();
    });
});

describe("controlCodeFromEvidenceRow", () => {
    it("reads the code getEvidence already joined", () => {
        expect(controlCodeFromEvidenceRow({
            clientControl: { clientControlId: "CC-006" },
            control: { controlId: "A.5.24" },
        })).toBe("CC-006");
        expect(controlCodeFromEvidenceRow({
            controlCode: "CC-003",
            control: { controlId: "A.5.24" },
        })).toBe("CC-003");
    });
});

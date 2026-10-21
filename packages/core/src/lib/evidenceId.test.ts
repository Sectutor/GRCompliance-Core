import { describe, expect, it } from "vitest";
import { nextEvidenceId, resolveEvidenceId } from "./evidenceId";

describe("nextEvidenceId", () => {
    it("starts at EVD-001 when the workspace has no evidence", () => {
        expect(nextEvidenceId([])).toBe("EVD-001");
        expect(nextEvidenceId([null, undefined, "  "])).toBe("EVD-001");
    });

    it("continues a prefixed workspace scheme", () => {
        const existing = ["LTD-EV-001", "LTD-EV-008", "LTD-EV-002"];
        expect(nextEvidenceId(existing)).toBe("LTD-EV-009");
    });

    it("prefers the scheme that most of the workspace already uses", () => {
        const existing = ["EVD-001", "LTD-EV-007", "LTD-EV-008"];
        expect(nextEvidenceId(existing)).toBe("LTD-EV-009");
    });

    it("increments an EVD series when that is the only scheme", () => {
        expect(nextEvidenceId(["EVD-001", "EVD-004"])).toBe("EVD-005");
    });
});

describe("resolveEvidenceId", () => {
    it("keeps a requested id that is not already taken", () => {
        expect(resolveEvidenceId(["LTD-EV-001"], "LTD-EV-009")).toBe("LTD-EV-009");
    });

    it("allocates the next id when the requested one collides or is missing", () => {
        expect(resolveEvidenceId(["LTD-EV-008"], "LTD-EV-008")).toBe("LTD-EV-009");
        expect(resolveEvidenceId(["LTD-EV-008"], "  ")).toBe("LTD-EV-009");
        expect(resolveEvidenceId(["LTD-EV-008"])).toBe("LTD-EV-009");
    });

    it("falls back to EVD-001 only for an empty workspace", () => {
        expect(resolveEvidenceId([], undefined)).toBe("EVD-001");
    });
});

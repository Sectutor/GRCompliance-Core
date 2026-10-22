import { describe, expect, it } from "vitest";
import { openEvidenceRequestLink, requestClosedByEvidenceLink } from "./openEvidenceRequestLink";

describe("requestClosedByEvidenceLink", () => {
    const link = { clientId: 1, clientControlId: 6 };

    it("closes an open request for the same control in the same workspace", () => {
        expect(requestClosedByEvidenceLink({ clientId: 1, clientControlId: 6, status: "open" }, link)).toBe(true);
        expect(openEvidenceRequestLink(link)).toEqual({ clientId: 1, clientControlId: 6, status: "open" });
    });

    it("leaves other controls, other workspaces, and requests that are already closed", () => {
        expect(requestClosedByEvidenceLink({ clientId: 1, clientControlId: 7, status: "open" }, link)).toBe(false);
        expect(requestClosedByEvidenceLink({ clientId: 2, clientControlId: 6, status: "open" }, link)).toBe(false);
        expect(requestClosedByEvidenceLink({ clientId: 1, clientControlId: 6, status: "fulfilled" }, link)).toBe(false);
        expect(requestClosedByEvidenceLink({ clientId: 1, clientControlId: 6, status: "rejected" }, link)).toBe(false);
    });
});

import { describe, expect, it } from "vitest";
import {
    NIST_800_171_ACTIVE_COUNT,
    NIST_800_171_REQUIREMENT_COUNT,
    NIST_800_171_VERSION,
    NIST_800_171_WITHDRAWN_COUNT,
    nist800171ControlById,
    nist800171Controls,
    nist800171Rev2ToRev3,
} from "./nist-800-171";

/** Identifiers in the previous Revision 2 catalog file. 3.13.12 (active in Rev 2) was missing from that file. Rev 2 has no requirement 3.11.4. */
const PREVIOUS_REVISION_2_IDS = [
    "3.1.1", "3.1.2", "3.1.3", "3.1.4", "3.1.5", "3.1.6", "3.1.7", "3.1.8", "3.1.9", "3.1.10",
    "3.1.11", "3.1.12", "3.1.13", "3.1.14", "3.1.15", "3.1.16", "3.1.17", "3.1.18", "3.1.19", "3.1.20",
    "3.1.21", "3.1.22",
    "3.2.1", "3.2.2", "3.2.3",
    "3.3.1", "3.3.2", "3.3.3", "3.3.4", "3.3.5", "3.3.6", "3.3.7", "3.3.8", "3.3.9",
    "3.4.1", "3.4.2", "3.4.3", "3.4.4", "3.4.5", "3.4.6", "3.4.7", "3.4.8", "3.4.9",
    "3.5.1", "3.5.2", "3.5.3", "3.5.4", "3.5.5", "3.5.6", "3.5.7", "3.5.8", "3.5.9", "3.5.10", "3.5.11",
    "3.6.1", "3.6.2", "3.6.3",
    "3.7.1", "3.7.2", "3.7.3", "3.7.4", "3.7.5", "3.7.6",
    "3.8.1", "3.8.2", "3.8.3", "3.8.4", "3.8.5", "3.8.6", "3.8.7", "3.8.8", "3.8.9",
    "3.9.1", "3.9.2",
    "3.10.1", "3.10.2", "3.10.3", "3.10.4", "3.10.5", "3.10.6",
    "3.11.1", "3.11.2", "3.11.3",
    "3.12.1", "3.12.2", "3.12.3", "3.12.4",
    "3.13.1", "3.13.2", "3.13.3", "3.13.4", "3.13.5", "3.13.6", "3.13.7", "3.13.8", "3.13.9", "3.13.10",
    "3.13.11", "3.13.13", "3.13.14", "3.13.15", "3.13.16",
    "3.14.1", "3.14.2", "3.14.3", "3.14.4", "3.14.5", "3.14.6", "3.14.7",
];

describe("NIST SP 800-171 Revision 3 catalog", () => {
    it("ships every Section 3 requirement from the publication, including withdrawn rows", () => {
        expect(NIST_800_171_VERSION).toBe("Revision 3");
        expect(nist800171Controls).toHaveLength(NIST_800_171_REQUIREMENT_COUNT);
        expect(NIST_800_171_REQUIREMENT_COUNT).toBe(130);
        const active = nist800171Controls.filter((control) => control.status === "active");
        const withdrawn = nist800171Controls.filter((control) => control.status === "withdrawn");
        expect(active).toHaveLength(NIST_800_171_ACTIVE_COUNT);
        expect(withdrawn).toHaveLength(NIST_800_171_WITHDRAWN_COUNT);
        expect(active).toHaveLength(97);
        expect(withdrawn).toHaveLength(33);
        const ids = nist800171Controls.map((control) => control.id);
        expect(new Set(ids).size).toBe(ids.length);
        for (const control of nist800171Controls) {
            expect(control.id.length).toBeLessThanOrEqual(50);
            expect(control.name.length).toBeLessThanOrEqual(255);
            expect(control.description.trim().length).toBeGreaterThan(10);
            expect(control.source.document).toBe("NIST SP 800-171");
            expect(control.source.version).toBe("Revision 3");
            expect(control.source.section).toContain(control.id);
            expect(control.source.url).toContain(`#sec-sec_${control.id}`);
            expect(control.implementationGuidance).toContain("https://doi.org/10.6028/NIST.SP.800-171r3");
        }
    });

    it("uses the publication wording for an active requirement and a withdrawal", () => {
        expect(nist800171ControlById("03.01.02")?.description).toBe(
            "Enforce approved authorizations for logical access to CUI and system resources in accordance with applicable access control policies.",
        );
        expect(nist800171ControlById("03.01.02")?.category).toBe("Access Control");
        expect(nist800171ControlById("03.01.02")?.sourceControls).toEqual(["AC-03"]);
        const withdrawn = nist800171ControlById("03.01.13");
        expect(withdrawn?.status).toBe("withdrawn");
        expect(withdrawn?.description).toBe("Addressed by 03.13.08.");
        expect(withdrawn?.incorporatedInto).toEqual(["03.13.08"]);
    });

    it("keeps every previous Revision 2 identifier resolvable", () => {
        expect(PREVIOUS_REVISION_2_IDS).toHaveLength(109);
        for (const legacyId of PREVIOUS_REVISION_2_IDS) {
            expect(nist800171Rev2ToRev3[legacyId], legacyId).toBeTruthy();
            const control = nist800171ControlById(legacyId);
            expect(control, legacyId).toBeDefined();
            expect(control?.legacyIds).toContain(legacyId);
        }
        expect(nist800171Rev2ToRev3["3.1.1"]).toBe("03.01.01");
        expect(nist800171ControlById("3.1.1")?.name).toContain("Account Management");
        expect(nist800171Rev2ToRev3["3.11.4"]).toBeUndefined();
        expect(nist800171ControlById("3.11.4")).toBeUndefined();
        expect(nist800171Controls.some((control) => control.legacyIds.includes("3.11.4"))).toBe(false);
        expect(nist800171Rev2ToRev3["3.12.4"]).toBe("03.15.02");
        expect(nist800171Rev2ToRev3["3.13.12"]).toBe("03.13.12");
        expect(nist800171ControlById("03.13.12")?.status).toBe("active");
        expect(nist800171Controls.find((control) => control.id === "03.15.02")?.category).toBe("Planning");
        expect(nist800171Controls.find((control) => control.id === "03.17.01")?.category).toBe("Supply Chain Risk Management");
    });

    it("uses the DOI PDF withdrawal wording and full incident-reporting text", () => {
        const withdrawn = nist800171ControlById("03.04.09");
        expect(withdrawn?.description).toBe(
            "Addressed by 03.01.05, 03.01.06, 03.01.07, 03.04.08, and 03.12.03.",
        );
        expect(withdrawn?.incorporatedInto).toEqual([
            "03.01.05",
            "03.01.06",
            "03.01.07",
            "03.04.08",
            "03.12.03",
        ]);
        expect(nist800171ControlById("03.06.02")?.description).toContain(
            "b. Report suspected incidents to the organizational incident response capability within [Assignment: organization-defined time period].",
        );
    });

    it("does not leave a requirement list item as only an assignment placeholder", () => {
        const listItem = /(?:^|\n)\s*(?:[a-z]|\d+)\.\s+([^\n]+)/g;
        for (const control of nist800171Controls) {
            for (const match of control.description.matchAll(listItem)) {
                expect(match[1].trim(), control.id).not.toMatch(/^\[Assignment:[^\]]*\]\.?$/);
            }
        }
    });
});

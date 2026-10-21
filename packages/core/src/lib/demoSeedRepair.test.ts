import { describe, expect, it } from "vitest";
import {
    DEMO_NOT_APPLICABLE_CONTROL_IDS,
    demoApplicabilityRepair,
    demoControlPatch,
    FIREWALL_EVIDENCE_REQUEST,
    shouldRetargetFirewallRequest,
} from "./demoSeedRepair";

describe("demoControlPatch", () => {
    it("sets applicability when the demo cycle status is not applicable", () => {
        for (const clientControlId of DEMO_NOT_APPLICABLE_CONTROL_IDS) {
            const index = Number(clientControlId.slice(3)) - 1;
            expect(demoControlPatch(index)).toEqual({
                status: "not_applicable",
                applicability: "not_applicable",
            });
        }
        expect(demoControlPatch(0)).toEqual({ status: "implemented" });
        expect(demoControlPatch(2)).toEqual({ status: "in_progress" });
    });
});

describe("demoApplicabilityRepair", () => {
    it("corrects only the four seeded controls that are still not applicable", () => {
        expect(demoApplicabilityRepair({
            clientControlId: "CC-007",
            status: "not_applicable",
            applicability: "applicable",
        })).toBe("not_applicable");
        expect(demoApplicabilityRepair({
            clientControlId: "CC-028",
            status: "not_applicable",
            applicability: null,
        })).toBe("not_applicable");
    });

    it("leaves user edits and other controls alone", () => {
        expect(demoApplicabilityRepair({
            clientControlId: "CC-007",
            status: "implemented",
            applicability: "applicable",
        })).toBeNull();
        expect(demoApplicabilityRepair({
            clientControlId: "CC-007",
            status: "not_applicable",
            applicability: "not_applicable",
        })).toBeNull();
        expect(demoApplicabilityRepair({
            clientControlId: "CC-003",
            status: "not_applicable",
            applicability: "applicable",
        })).toBeNull();
        expect(demoApplicabilityRepair({
            clientControlId: "CC-007",
            status: "not_applicable",
            applicability: "custom",
        })).toBeNull();
        expect(demoApplicabilityRepair({
            clientControlId: null,
            status: "not_applicable",
            applicability: "applicable",
        })).toBeNull();
    });
});

describe("shouldRetargetFirewallRequest", () => {
    it("moves the seeded request off a demo control that is not network monitoring", () => {
        expect(shouldRetargetFirewallRequest({
            description: FIREWALL_EVIDENCE_REQUEST,
            clientControlCode: "CC-003",
            masterControlId: "A.5.2",
        })).toBe(true);
        expect(shouldRetargetFirewallRequest({
            description: FIREWALL_EVIDENCE_REQUEST,
            clientControlCode: "CC-001",
            masterControlId: "A.5.10",
        })).toBe(true);
    });

    it("does not move a request that is already correct, edited, or user-created", () => {
        expect(shouldRetargetFirewallRequest({
            description: FIREWALL_EVIDENCE_REQUEST,
            clientControlCode: "CC-013",
            masterControlId: "A.8.16",
        })).toBe(false);
        expect(shouldRetargetFirewallRequest({
            description: "Please provide the latest firewall configuration backup",
            clientControlCode: "CC-003",
            masterControlId: "A.5.2",
        })).toBe(false);
        expect(shouldRetargetFirewallRequest({
            description: FIREWALL_EVIDENCE_REQUEST,
            clientControlCode: "FW-1",
            masterControlId: "A.5.2",
        })).toBe(false);
        expect(shouldRetargetFirewallRequest({
            description: FIREWALL_EVIDENCE_REQUEST,
            clientControlCode: "CC-031",
            masterControlId: "A.5.2",
        })).toBe(false);
        expect(shouldRetargetFirewallRequest({
            description: null,
            clientControlCode: "CC-003",
            masterControlId: "A.5.2",
        })).toBe(false);
    });
});

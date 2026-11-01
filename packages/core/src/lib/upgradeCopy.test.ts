import { describe, expect, it } from "vitest";
import { PREMIUM_CAPABILITIES, upgradeBody, upgradeHeadline } from "./upgradeCopy";

const CONFIRMED = [
    "MCP",
    "automatic evidence collection",
    "API evidence ingest",
    "GitHub",
    "SIEM",
    "SOAR",
    "threat intel",
    "vulnerability scanners",
    "Prowler",
    "Trivy",
    "multilingual support",
];

describe("upgrade copy", () => {
    it("does not repeat Premium Feature or name Pro, Enterprise, or unlimited users", () => {
        expect(upgradeHeadline("Premium Feature")).toBe("Premium");
        expect(upgradeBody("Premium Feature")).not.toMatch(/\bPro\b|\bEnterprise\b|unlimited users|Premium Feature is a Premium Feature/);
        expect(upgradeBody("Premium Feature")).toContain("Premium");
        expect(upgradeBody("Premium Feature")).toContain("self-hosted");
    });

    it("lists only the confirmed Premium capabilities", () => {
        const body = upgradeBody("Risk Management Reporting");
        for (const item of CONFIRMED) {
            expect(body).toContain(item);
        }
        expect(body).not.toMatch(/advanced reporting|AI automation|AI-Powered|unlimited users/);
        expect(body).not.toContain("Risk Management Reporting");
        expect(PREMIUM_CAPABILITIES).toHaveLength(5);
    });
});

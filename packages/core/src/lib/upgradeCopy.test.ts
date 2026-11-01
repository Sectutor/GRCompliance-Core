import { describe, expect, it } from "vitest";
import { upgradeBody, upgradeHeadline } from "./upgradeCopy";

describe("upgrade copy", () => {
    it("does not repeat Premium Feature or name Pro, Enterprise, or unlimited users", () => {
        expect(upgradeHeadline("Premium Feature")).toBe("Premium");
        expect(upgradeBody("Premium Feature")).not.toMatch(/Pro|Enterprise|unlimited users|Premium Feature is a Premium Feature/);
        expect(upgradeBody("Premium Feature")).toContain("Premium");
        expect(upgradeBody("Premium Feature")).toContain("self-hosted");
    });

    it("keeps a specific feature name without doubling the plan label", () => {
        expect(upgradeHeadline("Custom Frameworks")).toBe("Custom Frameworks is part of Premium");
        expect(upgradeBody("Risk Management Reporting")).toContain("Risk Management Reporting");
        expect(upgradeBody("Risk Management Reporting")).not.toMatch(/Pro or Enterprise/);
    });
});

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isPremiumPlan } from "./licenseLabel";
import { getPlanLimits, PLAN_LIMITS } from "./planLimits";

const srcRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

describe("isPremiumPlan", () => {
    it("treats premium and the legacy paid names as paid", () => {
        for (const tier of ["premium", "Premium", "pro", "PRO", "enterprise", "Enterprise"]) {
            expect(isPremiumPlan(tier), tier).toBe(true);
        }
    });

    it("treats community, free, and trial as unpaid", () => {
        for (const tier of ["community", "free", "trial", "", null, undefined]) {
            expect(isPremiumPlan(tier)).toBe(false);
        }
    });

    it("gives a premium row paid limits and a community row the free limits", () => {
        expect(getPlanLimits("premium")).toBe(PLAN_LIMITS.enterprise);
        expect(getPlanLimits("enterprise")).toBe(PLAN_LIMITS.enterprise);
        expect(getPlanLimits("pro")).toBe(PLAN_LIMITS.pro);
        expect(getPlanLimits("community")).toBe(PLAN_LIMITS.free);
        expect(getPlanLimits("free")).toBe(PLAN_LIMITS.free);
        expect(getPlanLimits("premium").maxPolicies).not.toBe(PLAN_LIMITS.free.maxPolicies);
    });

    it("is the paid-plan check for checkout, the premium flag, and workspace settings", () => {
        const layout = readFileSync(path.join(srcRoot, "components/DashboardLayout.tsx"), "utf8");
        const settings = readFileSync(path.join(srcRoot, "pages/ClientSettings.tsx"), "utf8");
        const frameworks = readFileSync(path.join(srcRoot, "pages/FrameworksDashboard.tsx"), "utf8");
        expect(layout).toContain("isPremiumPlan(planTier)");
        expect(layout).toContain("isPremiumPlan(clientInfo?.planTier)");
        expect(layout).not.toMatch(/planTier === ['"]pro['"] \|\| .*(planTier|clientInfo)/);
        expect(settings).toContain("isPremiumPlan(client?.planTier)");
        expect(frameworks).toContain("isPremiumPlan(client?.planTier)");
    });
});

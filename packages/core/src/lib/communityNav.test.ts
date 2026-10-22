import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { filterNavForEdition, isCommunityEdition, type EditionNavGroup } from "./communityNav";

const navigation: EditionNavGroup[] = [
    {
        label: "Governance",
        items: [
            { label: "Dashboard", path: "/governance" },
            { label: "Controls", path: "/client-controls" },
            { label: "Workbench", path: "/governance/workbench", isPremium: true },
        ],
    },
    {
        label: "AI & App Security",
        items: [
            { label: "Security Projects", path: "/projects" },
            { label: "AI Governance", path: "/ai-governance", isPremium: true },
            { label: "Threat Modeling", path: "/dev/projects", isPremium: true },
        ],
    },
    {
        label: "Marketing",
        items: [
            { label: "CRM Dashboard", path: "/sales", isPremium: true },
        ],
    },
    {
        label: "Administration",
        items: [
            { label: "Advisor Workbench", path: "/advisor/workbench", isPremium: true },
            { label: "Activity Log", path: "/activity" },
        ],
    },
];

function labels(groups: EditionNavGroup[]): string[] {
    return groups.flatMap((group) => group.items.map((item) => item.label));
}

describe("community navigation", () => {
    it("treats only the exact premium flag as the commercial edition", () => {
        expect(isCommunityEdition("false")).toBe(true);
        expect(isCommunityEdition(false)).toBe(true);
        expect(isCommunityEdition("true")).toBe(false);
        expect(isCommunityEdition(true)).toBe(false);
        expect(isCommunityEdition(undefined)).toBe(true);
        expect(isCommunityEdition("TRUE")).toBe(true);
        expect(isCommunityEdition("")).toBe(true);
    });

    it("hides premium-only items and keeps community items such as Controls", () => {
        const visible = filterNavForEdition(navigation, true);
        const names = labels(visible);

        expect(names).toContain("Controls");
        expect(names).toContain("Dashboard");
        expect(names).toContain("Security Projects");
        expect(names).toContain("Activity Log");
        expect(names).not.toContain("Workbench");
        expect(names).not.toContain("AI Governance");
        expect(names).not.toContain("Threat Modeling");
        expect(names).not.toContain("CRM Dashboard");
        expect(names).not.toContain("Advisor Workbench");
        expect(visible.map((group) => group.label)).not.toContain("Marketing");
        expect(visible.flatMap((group) => group.items).every((item) => !item.isPremium)).toBe(true);
    });

    it("keeps premium items, including the Pro badge flag, when the edition is not community", () => {
        const visible = filterNavForEdition(navigation, false);
        const workbench = visible
            .flatMap((group) => group.items)
            .find((item) => item.label === "Workbench");

        expect(workbench?.isPremium).toBe(true);
        expect(labels(visible)).toContain("CRM Dashboard");
    });

    it("does not mark Governance Controls as premium in the sidebar source", () => {
        const layoutPath = [
            path.resolve("packages/core/src/components/DashboardLayout.tsx"),
            path.resolve("src/components/DashboardLayout.tsx"),
        ].find((candidate) => {
            try {
                readFileSync(candidate);
                return true;
            } catch {
                return false;
            }
        });
        expect(layoutPath).toBeTruthy();
        const source = readFileSync(layoutPath as string, "utf8");
        const start = source.indexOf('label: "Governance"');
        const governance = source.slice(start, source.indexOf('label: "Risk Management"', start + 1));

        const controlsLine = governance.split("\n").find((line) => line.includes('label: "Controls"'));
        const workbenchLine = governance.split("\n").find((line) => line.includes('label: "Workbench"'));
        expect(controlsLine).toBeDefined();
        expect(controlsLine).not.toContain("isPremium");
        expect(workbenchLine).toContain("isPremium: true");
        expect(source).toContain("filterNavForEdition");
    });

    it("does not render the governance dashboard Premium badge in the community edition", () => {
        const pagePath = [
            path.resolve("packages/core/src/pages/governance/GovernanceDashboard.tsx"),
            path.resolve("src/pages/governance/GovernanceDashboard.tsx"),
        ].find((candidate) => {
            try {
                readFileSync(candidate);
                return true;
            } catch {
                return false;
            }
        });
        expect(pagePath).toBeTruthy();
        const source = readFileSync(pagePath as string, "utf8");
        expect(source).toContain("isCommunityEdition");
        expect(source).toContain("!isCommunityEdition(import.meta.env.VITE_ENABLE_PREMIUM)");
    });
});

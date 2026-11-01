import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function source(relativePath: string): string {
    return readFileSync(path.resolve(__dirname, relativePath), "utf8");
}

describe("launch copy follow-ups", () => {
    it("drops the orchestrate button and its help step", () => {
        const plan = source("../components/implementation/MultiFrameworkPlanView.tsx");
        expect(plan).not.toContain("Orchestrate AI Lifecycle");
        expect(plan).not.toContain("auto-generate tasks");
    });

    it("titles workspace settings from the selected tab and spells Licence", () => {
        const settings = source("./ClientSettings.tsx");
        expect(settings).toContain('license: "Licence"');
        expect(settings).toContain("title={settingsTitle}");
        expect(settings).toContain("value={activeTab}");
        expect(settings).toContain(">\n                            Licence");
        expect(settings).toContain('value="license"');
    });

    it("does not let a tabbed settings item match every settings tab", () => {
        const layout = source("../components/DashboardLayout.tsx");
        expect(layout).toContain("if (navTab)");
        expect(layout).toContain("navTab === currTab");
    });

    it("removes the second Dashboard heading", () => {
        const dashboard = source("./Dashboard.tsx");
        expect(dashboard).not.toContain(">Dashboard</h2>");
    });

    it("redirects /clients/:id/settings/billing to the billing tab", () => {
        const app = source("../App.tsx");
        expect(app).toContain('path="/clients/:id/settings/billing"');
        expect(app).toContain("/settings?tab=billing");
    });
});

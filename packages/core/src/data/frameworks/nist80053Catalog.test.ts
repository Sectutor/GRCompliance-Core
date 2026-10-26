import { describe, expect, it } from "vitest";
import { loadNist80053Rev5Controls } from "./nist80053Catalog";

describe("NIST SP 800-53 Rev. 5.2.0 OSCAL catalog", () => {
    it("loads every base control and enhancement from nist-800-53-rev5.json", () => {
        const controls = loadNist80053Rev5Controls();
        expect(controls.length).toBeGreaterThan(1000);
        expect(controls).toHaveLength(1196);
        expect(new Set(controls.map((control) => control.controlId)).size).toBe(1196);
        expect(controls.filter((control) => control.status === "active")).toHaveLength(1014);
        expect(controls.filter((control) => control.status === "inactive")).toHaveLength(182);

        const ac1 = controls.find((control) => control.controlId === "AC-1");
        expect(ac1?.name).toBe("Policy and Procedures");
        expect(ac1?.framework).toBe("NIST 800-53");
        expect(ac1?.category).toBe("Access Control");
        expect(ac1?.status).toBe("active");
        expect(ac1?.description).toContain("Develop, document, and disseminate to [organization-defined personnel or roles]");

        expect(controls.find((control) => control.controlId === "AC-2(1)")?.name).toBe("Automated System Account Management");
        expect(controls.find((control) => control.controlId === "IA-13")?.status).toBe("active");
        expect(controls.find((control) => control.controlId === "AC-13")?.status).toBe("inactive");
        for (const control of controls) {
            expect(control.name.length).toBeLessThanOrEqual(255);
            expect(control.controlId.length).toBeLessThanOrEqual(50);
        }
    });
});

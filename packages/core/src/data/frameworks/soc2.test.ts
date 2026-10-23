import { describe, expect, it } from "vitest";
import { frameworks } from "./index";
import { SOC2_CRITERIA_COUNT, SOC2_VERSION, soc2Controls } from "./soc2";

const ADDED = [
    "CC1.2", "CC1.3", "CC1.4", "CC1.5",
    "CC2.2", "CC2.3",
    "CC3.2", "CC3.3", "CC3.4",
    "CC4.2",
    "CC5.2", "CC5.3",
    "CC6.4", "CC6.5", "CC6.8",
    "CC7.3", "CC7.4", "CC7.5",
    "CC9.2",
    "A1.3",
    "PI1.1", "PI1.2", "PI1.3", "PI1.4", "PI1.5",
    "P1.1", "P2.1", "P3.1", "P3.2", "P4.1", "P4.2", "P4.3",
    "P5.1", "P5.2",
    "P6.1", "P6.2", "P6.3", "P6.4", "P6.5", "P6.6", "P6.7",
    "P7.1", "P8.1",
];

describe("SOC 2 2017 Trust Services Criteria catalog", () => {
    it("ships the full 2017 criterion identifier set", () => {
        expect(soc2Controls).toHaveLength(61);
        expect(SOC2_CRITERIA_COUNT).toBe(61);
        const ids = soc2Controls.map((control) => control.id);
        expect(new Set(ids).size).toBe(ids.length);
        for (const id of ADDED) {
            expect(ids).toContain(id);
        }
    });

    it("keeps AICPA criterion wording out of the bundled rows", () => {
        for (const control of soc2Controls) {
            expect(control.name.length).toBeGreaterThan(0);
            expect(control.name.length).toBeLessThan(80);
            expect(control.description.toLowerCase()).not.toContain("the entity demonstrates");
            expect(control.description.toLowerCase()).not.toContain("the entity selects and develops");
            expect(control.name.toLowerCase()).not.toContain("coso principle");
        }
    });

    it("records version and count on the framework list entry", () => {
        const soc2 = frameworks.find((framework) => framework.id === "soc-2");
        expect(soc2?.version).toBe(SOC2_VERSION);
        expect(soc2?.controlsCount).toBe(61);
        expect(soc2?.contentPolicy).toBe("bundled");
    });
});

import { describe, expect, it } from "vitest";
import { frameworks } from "./index";
import { bundledFrameworks } from "./bundledCatalogs";

const expected: Record<string, number> = {
    nist_csf_2: 106,
    essential_eight: 304,
    nist_800_161: 297,
    owasp_asvs: 286,
    owasp_masvs: 20,
    owasp_aisvs: 191,
    owasp_samm: 90,
    owasp_api_top10: 10,
    owasp_top10: 10,
    owasp_top10_2021: 10,
    owasp_ml_top10: 10,
};

describe("bundled framework catalogs", () => {
    it("ships the public and CC-licensed catalogs with their source sentences", () => {
        expect(bundledFrameworks.map((entry) => entry.type).sort()).toEqual(Object.keys(expected).sort());
        for (const entry of bundledFrameworks) {
            expect(entry.controls).toHaveLength(expected[entry.type]);
            expect(new Set(entry.controls.map((control) => control.id)).size).toBe(entry.controls.length);
            for (const control of entry.controls) {
                expect(control.name.length).toBeLessThanOrEqual(255);
                expect(control.id.length).toBeLessThanOrEqual(50);
                expect(control.description.trim().length).toBeGreaterThan(10);
            }
        }

        const csf = bundledFrameworks.find((entry) => entry.type === "nist_csf_2");
        expect(csf?.controls.find((control) => control.id === "GV.OC-01")?.description).toBe(
            "The organizational mission is understood and informs cybersecurity risk management",
        );
        const asvs = bundledFrameworks.find((entry) => entry.type === "owasp_asvs");
        expect(asvs?.controls.find((control) => control.id === "V1.1.1")?.description.startsWith(
            "Verify the use of a secure software development lifecycle that addresses security in all stages of development.",
        )).toBe(true);
        const masvs = bundledFrameworks.find((entry) => entry.type === "owasp_masvs");
        expect(masvs?.controls.find((control) => control.id === "MASVS-STORAGE-1")?.name).toBe(
            "The app securely stores sensitive data.",
        );
        const aisvs = bundledFrameworks.find((entry) => entry.type === "owasp_aisvs");
        expect(aisvs?.controls.find((control) => control.id === "1.1.1")?.description).toBe(
            "Verify that training data includes only features, attributes, and fields required for the model's stated purpose.",
        );
        const samm = bundledFrameworks.find((entry) => entry.type === "owasp_samm");
        expect(samm?.controls.find((control) => control.id === "D-SA-1-A")?.name).toBe(
            "Adhere to basic security principles",
        );
        const top10 = bundledFrameworks.find((entry) => entry.type === "owasp_top10_2021");
        expect(top10?.controls.find((control) => control.id === "A01:2021")?.description).toContain(
            "Access control enforces policy",
        );
        const api = bundledFrameworks.find((entry) => entry.type === "owasp_api_top10");
        expect(api?.controls.find((control) => control.id === "API1:2023")?.description).toContain(
            "Object level authorization is an access control mechanism",
        );
        const ml = bundledFrameworks.find((entry) => entry.type === "owasp_ml_top10");
        expect(ml?.controls.find((control) => control.id === "ML01:2023")?.description).toContain(
            "Input Manipulation Attacks",
        );
        const essential = bundledFrameworks.find((entry) => entry.type === "essential_eight");
        expect(essential?.controls.find((control) => control.id === "E8-ML1-PA-01")?.description).toBe(
            "An automated method of asset discovery is used at least fortnightly to support the detection of assets for subsequent vulnerability scanning activities.",
        );
        const scr = bundledFrameworks.find((entry) => entry.type === "nist_800_161");
        expect(scr?.controls.find((control) => control.id === "AT-3(6)")?.name).toBe("Counterintelligence Training");
        expect(scr?.controls.find((control) => control.id === "IA-13")).toBeUndefined();
    });

    it("records the same counts and licensing policy on the framework list", () => {
        const listCounts: Record<string, number> = {
            "nist-csf": 106,
            "owasp-aisvs": 191,
            "owasp-asvs": 286,
            "owasp_masvs": 20,
            "owasp_samm": 90,
            "owasp_api_top10": 10,
            "owasp_top10": 10,
            "owasp_top10_2021": 10,
            "owasp_ml_top10": 10,
            "essential-eight": 304,
            "nist-800-161": 297,
        };
        for (const [id, count] of Object.entries(listCounts)) {
            const framework = frameworks.find((entry) => entry.id === id);
            expect(framework?.controlsCount).toBe(count);
            expect(framework?.contentPolicy).toBe("bundled");
        }
        for (const id of ["soc-1", "tisax", "scf"]) {
            const framework = frameworks.find((entry) => entry.id === id);
            expect(framework?.contentPolicy).toBe("bring-your-own");
            expect(framework?.controlsCount).toBeUndefined();
        }
        expect(frameworks.find((entry) => entry.id === "pci-dss-v4")?.contentPolicy).toBeUndefined();
    });
});

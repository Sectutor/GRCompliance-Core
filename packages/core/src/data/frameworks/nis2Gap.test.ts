import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { frameworks } from "./index";
import {
    NIS2_ELI,
    NIS2_GAP_FRAMEWORK,
    nis2Article21Controls,
    nis2GapById,
    nis2GapControlIdScore,
    nis2GapControls,
    nis2Source,
} from "./nis2Gap";

const repoCore = path.resolve(import.meta.dirname, "../..");

const OFFICIAL: Record<string, string> = {
    a: "policies on risk analysis and information system security",
    b: "incident handling",
    c: "business continuity, such as backup management and disaster recovery, and crisis management",
    d: "supply chain security, including security-related aspects concerning the relationships between each entity and its direct suppliers or service providers",
    e: "security in network and information systems acquisition, development and maintenance, including vulnerability handling and disclosure",
    f: "policies and procedures to assess the effectiveness of cybersecurity risk-management measures",
    g: "basic cyber hygiene practices and cybersecurity training",
    h: "policies and procedures regarding the use of cryptography and, where appropriate, encryption",
    i: "human resources security, access control policies and asset management",
    j: "the use of multi-factor authentication or continuous authentication solutions, secured voice, video and text communications and secured emergency communication systems within the entity, where appropriate",
};

describe("NIS2 gap-analysis catalog", () => {
    it("loads ten Article 21(2) items with the official labels and a source on each", () => {
        expect(nis2Article21Controls).toHaveLength(10);
        expect(nis2Article21Controls.map((item) => item.point)).toEqual(["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"]);
        for (const item of nis2Article21Controls) {
            expect(item.controlId).toBe(`NIS2-21-${item.point}`);
            expect(item.name.length).toBeGreaterThan(0);
            expect(item.name.length).toBeLessThanOrEqual(255);
            expect(item.requirement.toLowerCase()).toContain(OFFICIAL[item.point]);
            expect(item.description).toContain(item.requirement);
            expect(item.source).toBe(nis2Source(`Article 21(2)(${item.point})`));
            expect(item.description).toContain(NIS2_ELI);
            expect(item.description).toContain("OJ L 333");
        }
    });

    it("keeps point (i) on human resources, access control policies and asset management, and point (j) on authentication and secured communications", () => {
        const hr = nis2GapById("NIS2-21-i");
        const auth = nis2GapById("NIS2-21-j");
        expect(hr.name).toBe("Human resources security, access control policies and asset management");
        expect(hr.name.toLowerCase()).not.toBe("access and asset management");
        expect(auth.name.toLowerCase()).toContain("multi-factor authentication or continuous authentication");
        expect(auth.name.toLowerCase()).toContain("secured emergency communication systems");
        expect(auth.name.toLowerCase()).not.toContain("asset management");
        expect(auth.requirement.toLowerCase()).not.toContain("access control policies and asset management");
        expect(auth.category).toBe("Authentication");
        expect(hr.category).toBe("HR security");
    });

    it("matches the other Article 21(2) points to the EUR-Lex list, including effectiveness rather than vulnerability disclosure at (f)", () => {
        expect(nis2GapById("NIS2-21-c").requirement.toLowerCase()).toContain("crisis management");
        expect(nis2GapById("NIS2-21-e").requirement.toLowerCase()).toContain("vulnerability handling and disclosure");
        const effectiveness = nis2GapById("NIS2-21-f");
        expect(effectiveness.requirement.toLowerCase()).toContain("assess the effectiveness of cybersecurity risk-management measures");
        expect(effectiveness.requirement.toLowerCase()).not.toContain("disclose vulnerabilities");
        expect(nis2GapById("NIS2-21-h").requirement.toLowerCase()).toContain("where appropriate, encryption");
    });

    it("adds Article 20 and Article 23 as separate items", () => {
        expect(nis2GapControls).toHaveLength(12);
        expect(nis2GapById("NIS2-20").name).toBe("Governance");
        expect(nis2GapById("NIS2-20").source).toContain("Article 20");
        expect(nis2GapById("NIS2-23").name).toBe("Reporting obligations");
        expect(nis2GapById("NIS2-23").requirement).toContain("within 72 hours of becoming aware");
        expect(nis2GapById("NIS2-23").requirement).toContain("one month after the submission of the incident notification");
        expect(nis2GapById("NIS2-23").source).toContain("Article 23(1) and Article 23(4)");
    });

    it("is registered for the gap picker, scoring and the framework list", () => {
        const listed = frameworks.find((entry) => entry.id === "nis2");
        expect(listed?.name).toBe(NIS2_GAP_FRAMEWORK);
        expect(listed?.controlsCount).toBe(12);
        expect(nis2GapControlIdScore("NIS2-21-j")).toBeGreaterThan(nis2GapControlIdScore("NIS2-21-g") ?? 0);
        expect(nis2GapControlIdScore("A.5.1")).toBeNull();

        const picker = readFileSync(path.join(repoCore, "pages/gap-analysis/NewGapAnalysis.tsx"), "utf8");
        expect(picker).toContain('value="NIS2"');
        const scoring = readFileSync(path.join(repoCore, "server/routers/gapAnalysis.ts"), "utf8");
        expect(scoring).toContain("nis2GapControlIdScore");
        const radar = readFileSync(path.join(repoCore, "components/gap-analysis/GapRadarChart.tsx"), "utf8");
        expect(radar).toContain("NIS2_GAP_DOMAINS");
    });

    it("seeds point (j) as authentication and moves the access-control policy link onto point (i)", () => {
        const db = readFileSync(path.join(repoCore, "db.ts"), "utf8");
        expect(db).toContain("nis2GapControls");
        expect(db).toContain("reconcileNis2GapControls");
        expect(db).not.toContain('name: "Access and asset management"');
        expect(db).toContain('"Access Control Policy": ["A.5.15", "A.8.2", "A.8.5", "NIS2-21-i"]');
        expect(db).toContain('"NIS2 Incident Notification Policy": ["NIS2-23", "A.5.24"]');
        expect(db).not.toContain('"NIS2-21-j"');
    });
});

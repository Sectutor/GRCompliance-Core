import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
    PCI_DSS_CATALOG_ROW_COUNT,
    PCI_DSS_HEADING_COUNT,
    PCI_DSS_NOTICE,
    PCI_DSS_REQUIREMENT_COUNT,
    PCI_DSS_VERSION,
    pciControls,
} from "./pci";

/** Longest allowed topic is the Requirement 4 area name. A longer label is requirement text. */
const SHORT_TOPIC_NAME_LIMIT = 95;
const ALLOWED_TOPICS = [
    "Install and Maintain Network Security Controls",
    "Apply Secure Configurations to All System Components",
    "Protect Stored Account Data",
    "Protect Cardholder Data with Strong Cryptography During Transmission Over Open, Public Networks",
    "Protect All Systems and Networks from Malicious Software",
    "Develop and Maintain Secure Systems and Software",
    "Restrict Access to System Components and Cardholder Data by Business Need to Know",
    "Identify Users and Authenticate Access to System Components",
    "Restrict Physical Access to Cardholder Data",
    "Log and Monitor All Access to System Components and Cardholder Data",
    "Test Security of Systems and Networks Regularly",
    "Support Information Security with Organizational Policies and Programs",
    "Multi-tenant service providers",
    "SSL and early TLS",
    "Designated entities supplemental validation",
];
const ENTRY_KEYS = [
    "applicability",
    "bestPracticeUntil31March2025",
    "id",
    "isHeading",
    "parentId",
    "supersededBy",
    "topic",
];
const TEXT_FIELDS = ["description", "guidance", "implementationGuidance", "name", "requirementText", "summary", "text"];

/** Requirement IDs in the previous pci.ts catalog (requirements 1-12, including overview rows). */
const PREVIOUS_IDS = [
    "1.1", "1.1.1", "1.1.2", "1.2", "1.2.1", "1.2.2", "1.2.3", "1.2.4", "1.2.5", "1.2.6", "1.2.7", "1.2.8",
    "1.3", "1.3.1", "1.3.2", "1.3.3", "1.4", "1.4.1", "1.4.2", "1.4.3", "1.4.4", "1.4.5", "1.5", "1.5.1",
    "2.1", "2.1.1", "2.1.2", "2.2", "2.2.1", "2.2.2", "2.2.3", "2.2.4", "2.2.5", "2.2.6", "2.2.7", "2.3", "2.3.1", "2.3.2",
    "3.1", "3.1.1", "3.1.2", "3.2", "3.2.1", "3.3", "3.3.1", "3.3.1.1", "3.3.1.2", "3.3.1.3", "3.3.2", "3.3.3",
    "3.4", "3.4.1", "3.4.2", "3.5", "3.5.1", "3.5.1.1", "3.5.1.2", "3.5.1.3", "3.6", "3.6.1", "3.6.1.1", "3.6.1.2", "3.6.1.3", "3.6.1.4",
    "3.7", "3.7.1", "3.7.2", "3.7.3", "3.7.4", "3.7.5", "3.7.6", "3.7.7", "3.7.8", "3.7.9",
    "4.1", "4.1.1", "4.1.2", "4.2", "4.2.1", "4.2.1.1", "4.2.1.2", "4.2.2",
    "5.1", "5.1.1", "5.1.2", "5.2", "5.2.1", "5.2.2", "5.2.3", "5.2.3.1", "5.3", "5.3.1", "5.3.2", "5.3.2.1", "5.3.3", "5.3.4", "5.3.5", "5.4", "5.4.1",
    "6.1", "6.1.1", "6.1.2", "6.2", "6.2.1", "6.2.2", "6.2.3", "6.2.3.1", "6.2.4", "6.3", "6.3.1", "6.3.2", "6.3.3", "6.4", "6.4.1", "6.4.2", "6.4.3",
    "6.5", "6.5.1", "6.5.2", "6.5.3", "6.5.4", "6.5.5", "6.5.6",
    "7.1", "7.1.1", "7.1.2", "7.2", "7.2.1", "7.2.2", "7.2.3", "7.2.4", "7.2.5", "7.2.5.1", "7.2.6", "7.3", "7.3.1", "7.3.2", "7.3.3",
    "8.1", "8.1.1", "8.1.2", "8.2", "8.2.1", "8.2.2", "8.2.3", "8.2.4", "8.2.5", "8.2.6", "8.2.7", "8.2.8",
    "8.3", "8.3.1", "8.3.2", "8.3.3", "8.3.4", "8.3.5", "8.3.6", "8.3.7", "8.3.8", "8.3.9", "8.3.10", "8.3.10.1", "8.3.11",
    "8.4", "8.4.1", "8.4.2", "8.4.3", "8.5", "8.5.1", "8.6", "8.6.1", "8.6.2", "8.6.3",
    "9.1", "9.1.1", "9.1.2", "9.2", "9.2.1", "9.2.1.1", "9.2.2", "9.2.3", "9.2.4", "9.3", "9.3.1", "9.3.1.1", "9.3.2", "9.3.3", "9.3.4",
    "9.4", "9.4.1", "9.4.1.1", "9.4.1.2", "9.4.2", "9.4.3", "9.4.4", "9.4.5", "9.4.5.1", "9.4.6", "9.4.7",
    "9.5", "9.5.1", "9.5.1.1", "9.5.1.2", "9.5.1.2.1", "9.5.1.3",
    "10.1", "10.1.1", "10.1.2", "10.2", "10.2.1", "10.2.1.1", "10.2.1.2", "10.2.1.3", "10.2.1.4", "10.2.1.5", "10.2.1.6", "10.2.1.7", "10.2.2",
    "10.3", "10.3.1", "10.3.2", "10.3.3", "10.3.4", "10.4", "10.4.1", "10.4.1.1", "10.4.2", "10.4.2.1", "10.4.3", "10.5", "10.5.1",
    "10.6", "10.6.1", "10.6.2", "10.6.3", "10.7", "10.7.1", "10.7.2", "10.7.3",
    "11.1", "11.1.1", "11.1.2", "11.2", "11.2.1", "11.2.2", "11.3", "11.3.1", "11.3.1.1", "11.3.1.2", "11.3.1.3", "11.3.2", "11.3.2.1",
    "11.4", "11.4.1", "11.4.2", "11.4.3", "11.4.4", "11.4.5", "11.4.6", "11.4.7", "11.5", "11.5.1", "11.5.1.1", "11.5.2", "11.6", "11.6.1",
    "12.1", "12.1.1", "12.1.2", "12.1.3", "12.1.4", "12.2", "12.2.1", "12.3", "12.3.1", "12.3.2", "12.3.3", "12.3.4",
    "12.4", "12.4.1", "12.4.2", "12.4.2.1", "12.5", "12.5.1", "12.5.2", "12.5.2.1", "12.5.3",
    "12.6", "12.6.1", "12.6.2", "12.6.3", "12.6.3.1", "12.6.3.2", "12.7", "12.7.1",
    "12.8", "12.8.1", "12.8.2", "12.8.3", "12.8.4", "12.8.5", "12.9", "12.9.1", "12.9.2",
    "12.10", "12.10.1", "12.10.2", "12.10.3", "12.10.4", "12.10.4.1", "12.10.5", "12.10.6", "12.10.7",
];

describe("PCI DSS v4.0.1 catalog", () => {
    it("keeps requirement IDs separate from section headings", () => {
        expect(PCI_DSS_VERSION).toBe("v4.0.1");
        expect(pciControls).toHaveLength(PCI_DSS_CATALOG_ROW_COUNT);
        expect(PCI_DSS_CATALOG_ROW_COUNT).toBe(351);
        const headings = pciControls.filter((entry) => entry.isHeading);
        const requirements = pciControls.filter((entry) => !entry.isHeading);
        expect(headings).toHaveLength(PCI_DSS_HEADING_COUNT);
        expect(requirements).toHaveLength(PCI_DSS_REQUIREMENT_COUNT);
        expect(PCI_DSS_HEADING_COUNT).toBe(71);
        expect(PCI_DSS_REQUIREMENT_COUNT).toBe(280);
        expect(PCI_DSS_HEADING_COUNT + PCI_DSS_REQUIREMENT_COUNT).toBe(PCI_DSS_CATALOG_ROW_COUNT);
        expect(PREVIOUS_IDS).toHaveLength(313);
        const ids = pciControls.map((entry) => entry.id);
        expect(new Set(ids).size).toBe(ids.length);
        for (const id of PREVIOUS_IDS) {
            expect(ids, id).toContain(id);
        }
        for (const id of ["A1.1.1", "A1.2.3", "A2.1", "A2.1.1", "A2.1.3", "A3.1.1", "A3.2.6.1", "A3.5.1"]) {
            expect(ids).toContain(id);
        }
        const byId = new Map(pciControls.map((entry) => [entry.id, entry]));
        expect(byId.get("A2.1")?.isHeading).toBe(true);
        expect(byId.get("A2.1")?.parentId).toBeNull();
        expect(byId.get("A2.1.1")?.parentId).toBe("A2.1");
        expect(byId.get("1.1")?.isHeading).toBe(true);
        expect(byId.get("1.1.1")?.isHeading).toBe(false);
        expect(byId.get("A3.3")?.isHeading).toBe(true);
        for (const entry of pciControls) {
            expect(entry.isHeading).toBe(entry.id.split(".").length === 2);
            if (entry.parentId) {
                expect(ids, entry.id).toContain(entry.parentId);
                expect(entry.id.startsWith(`${entry.parentId}.`), entry.id).toBe(true);
            }
        }
    });

    it("rejects requirement text, guidance, and labels longer than a topic name", () => {
        const source = readFileSync(new URL("./pci.ts", import.meta.url), "utf8");
        expect(source).toContain("No PCI SSC licence agreement was accepted.");
        expect(source).not.toContain("Original paraphrase");
        expect(source).not.toContain("implementationGuidance");
        expect(PCI_DSS_NOTICE).toBe(
            "PCI DSS is a trademark of PCI Security Standards Council, LLC (www.pcisecuritystandards.org). GRCompliance is not affiliated with, or endorsed by, PCI SSC.",
        );
        for (const topic of ALLOWED_TOPICS) {
            expect(topic.length).toBeLessThanOrEqual(SHORT_TOPIC_NAME_LIMIT);
        }
        for (const entry of pciControls) {
            expect(Object.keys(entry).sort()).toEqual(ENTRY_KEYS);
            for (const field of TEXT_FIELDS) {
                expect(entry, entry.id).not.toHaveProperty(field);
            }
            expect(entry.topic.length, entry.id).toBeLessThanOrEqual(SHORT_TOPIC_NAME_LIMIT);
            expect(ALLOWED_TOPICS, entry.id).toContain(entry.topic);
            expect(entry.id.length).toBeLessThanOrEqual(50);
        }
    });

    it("records applicability and the 31 March 2025 flag without requirement sentences", () => {
        const byId = new Map(pciControls.map((entry) => [entry.id, entry]));
        expect(byId.get("3.3.1")?.applicability).toBe("all-entities");
        expect(byId.get("3.3.3")?.applicability).toBe("issuers");
        expect(byId.get("12.4.1")?.applicability).toBe("service-providers");
        expect(byId.get("11.4.7")?.applicability).toBe("multi-tenant-service-providers");
        expect(byId.get("A2.1")?.applicability).toBe("ssl-early-tls-pos-poi");
        expect(byId.get("A2.1.1")?.applicability).toBe("ssl-early-tls-pos-poi");
        expect(byId.get("A2.1.2")?.applicability).toBe("ssl-early-tls-pos-poi-service-providers");
        expect(byId.get("A2.1.3")?.applicability).toBe("ssl-early-tls-pos-poi-service-providers");
        expect(byId.get("8.3.10")?.supersededBy).toBe("8.3.10.1");
        for (const entry of pciControls.filter((row) => row.id.startsWith("A1"))) {
            expect(entry.applicability, entry.id).toBe("multi-tenant-service-providers");
        }
        for (const entry of pciControls.filter((row) => row.id.startsWith("A3"))) {
            expect(entry.applicability, entry.id).toBe("designated-entities");
        }
        expect(byId.get("6.4.1")?.bestPracticeUntil31March2025).toBeNull();
        expect(byId.get("6.4.1")?.supersededBy).toBe("6.4.2");
        expect(byId.get("10.7.1")?.bestPracticeUntil31March2025).toBeNull();
        expect(byId.get("10.7.1")?.supersededBy).toBe("10.7.2");
        expect(byId.get("6.4.2")?.bestPracticeUntil31March2025).toBe("item");
        expect(byId.get("10.7.2")?.bestPracticeUntil31March2025).toBe("item");
        for (const id of ["3.2.1", "3.3.3", "3.6.1.1", "4.2.1", "12.10.5", "A3.3.1"]) {
            expect(byId.get(id)?.bestPracticeUntil31March2025, id).toBe("part");
        }
        expect(byId.get("A3.3")?.bestPracticeUntil31March2025).toBeNull();
    });
});

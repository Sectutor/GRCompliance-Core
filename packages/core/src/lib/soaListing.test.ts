import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ANNEX_A_CONTROLS, annexTheme } from "../data/annexACatalog";
import { iso27001Controls } from "../data/frameworks/iso27001";
import {
    customCategoryLabel,
    filterSoaEntries,
    mergeSoaListing,
    planAnnexACatalogSync,
    soaAdoptionPatch,
    soaHeaderStats,
    soaJustificationText,
    soaListLayout,
    type AdoptedAnnexRow,
    type StoredAnnexControl,
} from "./soaListing";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

describe("Annex A catalog", () => {
    it("lists 93 controls split 37/8/14/34 across the 2022 themes", () => {
        const counts = { Organizational: 0, People: 0, Physical: 0, Technological: 0 };
        for (const control of ANNEX_A_CONTROLS) {
            counts[control.theme] += 1;
            expect(annexTheme(control.controlId)).toBe(control.theme);
            expect(control.name.trim().length).toBeGreaterThan(0);
            expect(control.description.trim().length).toBeGreaterThan(0);
        }
        expect(ANNEX_A_CONTROLS).toHaveLength(93);
        expect(counts).toEqual({ Organizational: 37, People: 8, Physical: 14, Technological: 34 });
        expect(new Set(ANNEX_A_CONTROLS.map((control) => control.controlId)).size).toBe(93);
    });

    it("has no gaps in A.5.1–A.5.37, A.6.1–A.6.8, A.7.1–A.7.14, or A.8.1–A.8.34", () => {
        const expectRange = (group: number, count: number) => {
            const numbers = ANNEX_A_CONTROLS
                .filter((control) => control.controlId.startsWith(`A.${group}.`))
                .map((control) => Number(control.controlId.split(".")[2]));
            expect(numbers).toEqual(Array.from({ length: count }, (_, index) => index + 1));
        };
        expectRange(5, 37);
        expectRange(6, 8);
        expectRange(7, 14);
        expectRange(8, 34);
    });

    it("does not copy the ISO control text already stored in the old catalog file", () => {
        const published = new Set(iso27001Controls.map((control) => control.description));
        const copied = ANNEX_A_CONTROLS.filter((control) => published.has(control.description));
        expect(copied).toEqual([]);
        expect(ANNEX_A_CONTROLS.every((control) => !/\bshould\b/i.test(control.description))).toBe(true);
    });
});

describe("planAnnexACatalogSync", () => {
    const seeded = [
        { id: 1, controlId: "A.5-Policies", name: "Information Security Policies" },
        { id: 2, controlId: "A.9-Access", name: "Access Control" },
        { id: 3, controlId: "A.5.10", name: "Acceptable use" },
        { id: 4, controlId: "A.5.2", name: "Custom roles title" },
        { id: 5, controlId: "CC6.1", name: "Logical Access Controls" },
    ];

    it("maps the legacy references once and leaves an edited title alone", () => {
        const plan = planAnnexACatalogSync(seeded);
        expect(plan.renames).toEqual([
            { id: 1, from: "A.5-Policies", to: "A.5.1", name: "Policies for information security" },
            { id: 2, from: "A.9-Access", to: "A.5.15", name: "Access control" },
        ]);
        expect(plan.titleUpdates).toContainEqual({
            id: 3,
            controlId: "A.5.10",
            name: "Acceptable use of information and other associated assets",
        });
        expect(plan.titleUpdates.find((update) => update.id === 4)).toBeUndefined();
        expect(plan.inserts.some((row) => row.controlId === "A.5.1" || row.controlId === "CC6.1")).toBe(false);
        expect(plan.inserts).toHaveLength(93 - 4);
        for (const change of [...plan.renames, ...plan.titleUpdates]) {
            expect(change).not.toHaveProperty("justification");
            expect(change).not.toHaveProperty("status");
            expect(change).not.toHaveProperty("description");
            expect(change).not.toHaveProperty("category");
        }
        for (const insert of plan.inserts) {
            expect(insert.description.length).toBeGreaterThan(0);
        }
        expect(plan).not.toHaveProperty("deletes");
    });

    it("is a no-op the second time and does not rename when the 2022 id already exists", () => {
        const plan = planAnnexACatalogSync(seeded);
        const next = seeded.map((row) => {
            const rename = plan.renames.find((item) => item.id === row.id);
            if (rename) return { ...row, controlId: rename.to, name: rename.name ?? row.name };
            const title = plan.titleUpdates.find((item) => item.id === row.id);
            if (title) return { ...row, name: title.name };
            return row;
        });
        const inserted = plan.inserts.map((row, index) => ({
            id: 100 + index,
            controlId: row.controlId,
            name: row.name,
        }));
        expect(planAnnexACatalogSync([...next, ...inserted])).toEqual({
            renames: [],
            titleUpdates: [],
            inserts: [],
        });

        const blocked = planAnnexACatalogSync([
            { id: 1, controlId: "A.5-Policies", name: "Information Security Policies" },
            { id: 9, controlId: "A.5.1", name: "Policies for information security" },
        ]);
        expect(blocked.renames).toEqual([]);
        expect(blocked.inserts.some((row) => row.controlId === "A.5.1")).toBe(false);
    });
});

describe("SoA listing", () => {
    const stored: StoredAnnexControl[] = ANNEX_A_CONTROLS.slice(0, 2).map((control, index) => ({
        id: index + 1,
        controlId: control.controlId,
        name: control.name,
        description: control.description,
        framework: "ISO 27001",
        category: index === 1 ? "People" : "Organizational",
    }));
    stored.push({
        id: 10,
        controlId: "A.5.10",
        name: "Acceptable use of information and other associated assets",
        description: "Workspace wording for acceptable use.",
        framework: "ISO 27001",
        category: "People",
    });

    const adopted: AdoptedAnnexRow[] = [
        {
            control: { controlId: "A.5.1" },
            clientControl: {
                id: 41,
                status: "implemented",
                applicability: "applicable",
                justification: "Covered by the information security policy.",
                implementationNotes: "Reviewed annually",
                clientControlId: "CC-001",
            },
        },
        {
            control: { controlId: "A.5.2" },
            clientControl: {
                id: 42,
                status: "not_applicable",
                applicability: "applicable",
                justification: "Roles sit with the parent company.",
                implementationNotes: null,
                clientControlId: "CC-007",
            },
        },
    ];

    const listing = mergeSoaListing(stored, adopted);

    it("lists every Annex A control and keeps saved status and justification", () => {
        expect(listing).toHaveLength(93);
        expect(listing.filter((row) => !row.adopted)).toHaveLength(91);
        const policies = listing.find((row) => row.control.controlId === "A.5.1");
        expect(policies?.adopted).toBe(true);
        expect(policies?.clientControl.justification).toBe("Covered by the information security policy.");
        expect(policies?.clientControl.status).toBe("implemented");
        const roles = listing.find((row) => row.control.controlId === "A.5.2");
        expect(roles?.clientControl.justification).toBe("Roles sit with the parent company.");
        const physical = listing.find((row) => row.control.controlId === "A.7.1");
        expect(physical).toMatchObject({
            adopted: false,
            control: { theme: "Physical" },
            clientControl: { id: null, status: "not_assessed", justification: null },
        });
    });

    it("keeps header counts consistent and shows the 2022 theme beside a custom category", () => {
        const stats = soaHeaderStats(listing);
        expect(stats).toEqual({ total: 93, applicable: 1, implemented: 1, excluded: 1, notAssessed: 91 });
        expect(stats.applicable + stats.excluded + stats.notAssessed).toBe(stats.total);
        const acceptableUse = listing.find((row) => row.control.controlId === "A.5.10");
        expect(acceptableUse?.control.theme).toBe("Organizational");
        expect(customCategoryLabel(acceptableUse?.control.category, acceptableUse?.control.theme)).toBe("People");
        expect(customCategoryLabel("Organizational Controls", "Organizational")).toBeNull();
        expect(soaJustificationText(null)).toBe("No justification recorded");
        expect(soaJustificationText("  Kept locally.  ")).toBe("Kept locally.");
    });

    it("filters the SoA by reference, wording, and justification", () => {
        expect(filterSoaEntries(listing, "")).toHaveLength(93);
        expect(filterSoaEntries(listing, "a.7.1").map((row) => row.control.controlId)).toEqual(["A.7.1"]);
        expect(filterSoaEntries(listing, "parent company").map((row) => row.control.controlId)).toEqual(["A.5.2"]);
        const physical = filterSoaEntries(listing, "Physical");
        expect(physical).toHaveLength(14);
        expect(physical.every((row) => row.control.theme === "Physical")).toBe(true);
    });
});

describe("SoA presentation helpers", () => {
    it("uses a grid class only for the grid view", () => {
        expect(soaListLayout("grid")).toContain("grid");
        expect(soaListLayout("grid")).toContain("md:grid-cols-2");
        expect(soaListLayout("list")).not.toContain("grid-cols");
    });

    it("requires a justification before a control can be excluded", () => {
        expect(soaAdoptionPatch({ applicability: "not_applicable", justification: "  " })).toEqual({
            error: "Justification is required for excluded controls",
        });
        expect(soaAdoptionPatch({
            applicability: "not_applicable",
            justification: "No office of our own.",
            status: "implemented",
        })).toEqual({
            applicability: "not_applicable",
            status: "not_applicable",
            justification: "No office of our own.",
        });
        expect(soaAdoptionPatch({ applicability: "applicable", status: "not_assessed" }).status).toBe("not_implemented");
    });
});

describe("bootstrap catalog load", () => {
    it("runs the catalog ensure step after the demo seed and does not delete client controls", () => {
        const bootstrap = readFileSync(path.join(root, "docker/bootstrap.ts"), "utf8");
        const main = bootstrap.slice(bootstrap.indexOf("async function main"));
        expect(main.indexOf("ensureLatore")).toBeGreaterThan(-1);
        expect(main.indexOf("ensureAnnexACatalog")).toBeGreaterThan(main.indexOf("ensureLatore"));
        const ensure = readFileSync(path.join(root, "packages/core/src/server/ensureAnnexACatalog.ts"), "utf8");
        expect(ensure).not.toContain("clientControls");
        expect(ensure).not.toContain(".delete(");
        expect(bootstrap).not.toContain("delete from client_controls");
    });
});

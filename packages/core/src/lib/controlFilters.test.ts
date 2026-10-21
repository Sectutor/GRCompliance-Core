import { describe, expect, it } from "vitest";
import { filterWorkspaceControls, libraryStatusCondition, libraryStatusFilter } from "./controlFilters";

describe("libraryStatusFilter", () => {
    it("keeps real control statuses and drops values the column does not have", () => {
        expect(libraryStatusFilter(["active", "domain", "draft", "risk"])).toEqual(["active", "draft"]);
        expect(libraryStatusCondition(["inactive"])).toEqual(["inactive"]);
        expect(libraryStatusCondition(undefined)).toEqual([]);
        expect(libraryStatusCondition("nope")).toEqual([]);
    });
});

describe("filterWorkspaceControls", () => {
    const rows = [
        { control: { framework: "ISO 27001", category: "People" }, clientControl: { status: "implemented" } },
        { control: { framework: "ISO 27001", category: "Governance" }, clientControl: { status: "not_applicable" } },
        { control: { framework: "NIS2", category: "Incident" }, clientControl: { status: "in_progress" } },
    ];

    it("filters by implementation status and framework together", () => {
        expect(filterWorkspaceControls(rows, { status: "not_applicable" })).toHaveLength(1);
        expect(filterWorkspaceControls(rows, { framework: "ISO 27001", status: "implemented" })).toEqual([rows[0]]);
        expect(filterWorkspaceControls(rows, { status: "implemented" })[0].control.category).toBe("People");
        expect(filterWorkspaceControls(rows, { framework: "all", status: "all" })).toHaveLength(3);
    });
});

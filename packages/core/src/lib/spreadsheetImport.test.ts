import { describe, expect, it } from "vitest";
import { parseCalendarDate, parseScore, planSpreadsheetImport, rowsToSave } from "./spreadsheetImport";

describe("spreadsheet import planner", () => {
    it("turns score words and numbers into 1 to 5", () => {
        expect(parseScore("high", "Impact").value).toBe(4);
        expect(parseScore("3", "Likelihood").value).toBe(3);
        expect(parseScore("9", "Impact").error).toMatch(/not a number from 1 to 5/);
        expect(parseScore("banana", "Likelihood").error).toMatch(/not a number from 1 to 5/);
    });

    it("rejects a date that is not on the calendar", () => {
        expect(parseCalendarDate("32/13/2026", "Date").error).toMatch(/not a real calendar date/);
        expect(parseCalendarDate("2026-02-29", "Date").error).toMatch(/not a real calendar date/);
        expect(parseCalendarDate("2024-02-29", "Date").value).toBe("2024-02-29");
    });

    it("marks a bad control row as skip and keeps a valid new row", () => {
        const plan = planSpreadsheetImport({
            kind: "controls",
            existingKeys: ["A.5.1"],
            members: ["Ada Lovelace"],
            rows: [
                { controlCode: "A.5.1", title: "Policies", owner: "Ada Lovelace", dueDate: "2026-06-01" },
                { controlCode: "", title: "Missing id" },
                { controlCode: "A.5.2", title: "Roles", dueDate: "32/13/2026" },
                { controlCode: "A.5.3", title: "New", owner: "Unknown Person" },
            ],
        });
        expect(plan.rows[0].action).toBe("update");
        expect(plan.rows[1].action).toBe("skip");
        expect(plan.rows[1].errors).toContain("Control ID is empty.");
        expect(plan.rows[2].errors[0]).toMatch(/not a real calendar date/);
        expect(plan.rows[3].action).toBe("create");
        expect(plan.rows[3].warnings[0]).toMatch(/not a person in this workspace/);
        expect(plan.summary).toMatchObject({ create: 1, update: 1, errors: 2 });
        expect(rowsToSave(plan).map((row) => row.values.controlCode)).toEqual(["A.5.1", "A.5.3"]);
    });

    it("does not save a repeated risk title", () => {
        const plan = planSpreadsheetImport({
            kind: "risks",
            rows: [
                { title: "Phishing", likelihood: "low", impact: "high" },
                { title: "Phishing", likelihood: "1", impact: "1" },
            ],
        });
        expect(plan.rows[1].errors[0]).toMatch(/appears more than once/);
        expect(rowsToSave(plan)).toHaveLength(1);
        expect(plan.rows[0].values.likelihood).toBe(2);
        expect(plan.rows[0].values.impact).toBe(4);
    });
});

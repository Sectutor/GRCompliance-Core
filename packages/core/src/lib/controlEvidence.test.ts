import { describe, expect, it } from "vitest";
import { controlEvidenceRows } from "./controlEvidence";

describe("controlEvidenceRows", () => {
    it("shows the flat rows getByControl returns for a control", () => {
        const rows = controlEvidenceRows([
            { id: 4, clientControlId: 15, description: "Approved information security policy", type: "document" },
            { id: 5, clientControlId: 15, description: "Communication record", type: "document", owner: "Alex Morgan" },
        ]);
        expect(rows).toHaveLength(2);
        expect(rows[0].description).toBe("Approved information security policy");
    });

    it("does not require the nested evidence object that evidence.list no longer returns", () => {
        const flattenedList = [
            { id: 4, description: "Approved information security policy", evidenceId: "LTD-EV-001", control: { name: "Policies for information security" } },
        ];
        const oldCount = flattenedList.filter((item) => (item as { evidence?: { clientControlId?: number } }).evidence?.clientControlId === 15).length;
        expect(oldCount).toBe(0);
        expect(controlEvidenceRows(flattenedList)).toHaveLength(1);
    });
});

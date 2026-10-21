import { describe, expect, it } from "vitest";
import { controlDisplayName, controlsForTreatment } from "./treatmentControlNames";

describe("treatment control names", () => {
    it("prefers the dictionary name, then the client description, then the client control id", () => {
        expect(controlDisplayName(
            { id: 4, controlId: 9, customDescription: "Local note", clientControlId: "CC-4" },
            [{ id: 9, name: "Encrypt data at rest" }],
        )).toBe("Encrypt data at rest");
        expect(controlDisplayName(
            { id: 4, controlId: 9, customDescription: "Local note", clientControlId: "CC-4" },
            [],
        )).toBe("Local note");
        expect(controlDisplayName({ id: 4, clientControlId: "CC-4" }, [])).toBe("CC-4");
        expect(controlDisplayName({ id: 4 }, [])).toBe("Control 4");
    });

    it("lists only the controls linked to that treatment", () => {
        const names = controlsForTreatment(
            8,
            [
                { treatmentId: 8, controlId: 4 },
                { treatmentId: 9, controlId: 5 },
                { treatmentId: 8, controlId: 12 },
            ],
            [{ id: 4, controlId: 9, customDescription: "ignored" }],
            [{ id: 9, name: "Access review" }],
        );
        expect(names).toEqual([
            { id: 4, name: "Access review" },
            { id: 12, name: "Control 12" },
        ]);
    });
});

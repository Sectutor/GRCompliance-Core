import { describe, expect, it, vi } from "vitest";
import { authorizeEvidenceLink, parseEvidenceDueDate } from "./linkEvidence";

describe("parseEvidenceDueDate", () => {
    it("keeps a date from the audit request form and drops a blank one", () => {
        expect(parseEvidenceDueDate("2026-10-30")?.toISOString().slice(0, 10)).toBe("2026-10-30");
        expect(parseEvidenceDueDate("")).toBeNull();
        expect(parseEvidenceDueDate(null)).toBeNull();
    });

    it("rejects a value that is not a date", () => {
        expect(() => parseEvidenceDueDate("next week")).toThrow(/Due date/);
    });
});

describe("authorizeEvidenceLink", () => {
    it("uses the control row's workspace and returns the due date", async () => {
        const canEdit = vi.fn(async () => true);
        const linked = await authorizeEvidenceLink({
            userId: 3,
            clientControlId: 6,
            dueDate: "2026-10-30",
            loadControl: async () => ({ id: 6, clientId: 4 }),
            canEdit,
        });
        expect(linked.clientId).toBe(4);
        expect(linked.clientControlId).toBe(6);
        expect(linked.dueDate?.toISOString().slice(0, 10)).toBe("2026-10-30");
        expect(canEdit).toHaveBeenCalledWith(3, 4);
    });

    it("does not authorize a caller who cannot edit that workspace", async () => {
        const canEdit = vi.fn(async () => false);
        await expect(authorizeEvidenceLink({
            userId: 8,
            clientControlId: 6,
            dueDate: "",
            loadControl: async () => ({ id: 6, clientId: 4 }),
            canEdit,
        })).rejects.toMatchObject({ code: "FORBIDDEN" });
        expect(canEdit).toHaveBeenCalledWith(8, 4);
    });
});

import { describe, expect, it } from "vitest";
import { duePhrase, reviewDuePhrase } from "./duePhrase";

describe("duePhrase", () => {
    it("uses Due and the date when a due date exists", () => {
        expect(duePhrase(new Date(2026, 10, 2))).toBe(`Due ${new Date(2026, 10, 2).toLocaleDateString()}`);
        expect(duePhrase("2026-11-02")).toMatch(/^Due /);
    });

    it("says No due date when the date is missing", () => {
        expect(duePhrase(null)).toBe("No due date");
        expect(duePhrase(undefined)).toBe("No due date");
        expect(duePhrase("")).toBe("No due date");
        expect(duePhrase("not-a-date")).toBe("No due date");
    });

    it("uses Review due for a policy review date", () => {
        const date = new Date(2026, 10, 2);
        expect(reviewDuePhrase(date)).toBe(`Review due ${date.toLocaleDateString()}`);
        expect(reviewDuePhrase(null)).toBe("No review date");
    });
});
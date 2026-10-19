import { describe, expect, it } from "vitest";
import { marketingConsentEnabled } from "./runtimeConfig";

describe("marketing consent", () => {
    it("stays off unless an operator opts in", () => {
        expect(marketingConsentEnabled(undefined)).toBe(false);
        expect(marketingConsentEnabled(false)).toBe(false);
        expect(marketingConsentEnabled("false")).toBe(false);
        expect(marketingConsentEnabled("")).toBe(false);
        expect(marketingConsentEnabled(null)).toBe(false);
    });

    it("accepts the documented opt-in values", () => {
        expect(marketingConsentEnabled(true)).toBe(true);
        expect(marketingConsentEnabled("true")).toBe(true);
        expect(marketingConsentEnabled("1")).toBe(true);
    });
});

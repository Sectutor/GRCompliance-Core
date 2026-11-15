import { describe, expect, it } from "vitest";
import { signupIsEnabled } from "./signupAccess";

describe("signupIsEnabled", () => {
    it("hides sign-up on a self-hosted install unless the operator turns it on", () => {
        expect(signupIsEnabled("local", undefined)).toBe(false);
        expect(signupIsEnabled("local", false)).toBe(false);
        expect(signupIsEnabled("local", "0")).toBe(false);
        expect(signupIsEnabled("local", "1")).toBe(true);
        expect(signupIsEnabled("local", true)).toBe(true);
    });

    it("keeps hosted sign-up available unless it is explicitly disabled", () => {
        expect(signupIsEnabled("supabase", undefined)).toBe(true);
        expect(signupIsEnabled(undefined, undefined)).toBe(true);
        expect(signupIsEnabled("supabase", "false")).toBe(false);
    });
});

import { describe, expect, it } from "vitest";
import { normalizeControlOwner } from "./controlOwner";

describe("control owner", () => {
    it("turns a blank owner into null and keeps a name", () => {
        expect(normalizeControlOwner("  ")).toBeNull();
        expect(normalizeControlOwner("Grace Smith")).toBe("Grace Smith");
        expect(normalizeControlOwner("x".repeat(300))?.length).toBe(255);
    });
});

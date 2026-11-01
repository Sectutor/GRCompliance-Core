import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("workspace home route", () => {
    it("opens the workspace itself instead of the premium governance page", () => {
        const appPath = [
            path.resolve("packages/core/src/App.tsx"),
            path.resolve("src/App.tsx"),
        ].find((candidate) => {
            try {
                readFileSync(candidate);
                return true;
            } catch {
                return false;
            }
        });
        expect(appPath).toBeTruthy();
        const source = readFileSync(appPath as string, "utf8");
        const marker = 'path="/clients/:id"';
        const start = source.lastIndexOf(marker);
        const block = source.slice(start, source.indexOf("</Route>", start));
        expect(block).toContain("ClientWorkspace");
        expect(block).not.toContain("governance");
        expect(block).not.toContain("requirePremium");
    });
});

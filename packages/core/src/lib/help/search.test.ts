import { describe, expect, it } from "vitest";
import { HELP_ARTICLES } from "./articles";
import { searchHelp } from "./search";

describe("help search", () => {
    it("finds the import article and does not quote a standard", () => {
        const found = searchHelp("spreadsheet");
        expect(found[0]?.id).toBe("import");
        const joined = HELP_ARTICLES.map((article) => article.body).join("\n");
        expect(joined).toContain("A.5.1");
        expect(joined).not.toMatch(/The organization shall/);
    });
});

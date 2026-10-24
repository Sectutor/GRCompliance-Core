import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import i18n, { changeLanguage, supportedLanguages } from "./index";

const localeDir = path.resolve(__dirname, "locales");

describe("community locales", () => {
    it("enables English only, even if a German file is present on disk", async () => {
        expect(existsSync(path.join(localeDir, "de", "translation.json"))).toBe(true);
        expect(supportedLanguages.map((language) => language.code)).toEqual(["en"]);
        expect(i18n.options.resources).not.toHaveProperty("de");
        expect(i18n.options.supportedLngs).toContain("en");
        expect(i18n.options.supportedLngs).not.toContain("de");

        const source = readFileSync(path.join(__dirname, "index.ts"), "utf8");
        expect(source).not.toContain("locales/de");
        expect(source).not.toContain("deTranslation");

        await changeLanguage("de");
        await changeLanguage("fr");
        expect(i18n.resolvedLanguage || i18n.language).toMatch(/^en/);
    });
});

import { describe, expect, it } from "vitest";
import { escapeHtml, sanitizeEmailSubject } from "./escapeHtml";

describe("escapeHtml", () => {
    it("escapes every character that can change HTML structure", () => {
        expect(escapeHtml(`A & B <tag> "quoted" 'apos'`)).toBe(
            "A &amp; B &lt;tag&gt; &quot;quoted&quot; &#39;apos&#39;",
        );
    });

    it("does not double-escape", () => {
        expect(escapeHtml("A & B")).toBe("A &amp; B");
        expect(escapeHtml("A &amp; B")).toBe("A &amp;amp; B");
    });

    it("stringifies empty values without throwing", () => {
        expect(escapeHtml(null)).toBe("");
        expect(escapeHtml(undefined)).toBe("");
        expect(escapeHtml(12)).toBe("12");
    });
});

describe("sanitizeEmailSubject", () => {
    it("removes line breaks that would inject extra headers", () => {
        expect(sanitizeEmailSubject("Review\r\nBcc: eve@evil.example")).toBe(
            "Review Bcc: eve@evil.example",
        );
        expect(sanitizeEmailSubject("Review\nBcc: eve@evil.example")).not.toMatch(/[\r\n]/);
    });
});

import { describe, expect, it } from "vitest";
import { escapeHtml } from "./escapeHtml";
import { gapInviteHtml } from "./gapInviteEmail";
import { createInviteToken } from "./inviteToken";

describe("gap questionnaire invites", () => {
    it("escapes notes and the link before they are placed in the email", () => {
        const html = gapInviteHtml({
            notes: `<script>alert("x")</script> & 'quote'`,
            inviteUrl: `https://example.test/portal?token=abc&next="on"`,
            expiresOn: "10/21/2026",
        });
        expect(html).not.toContain("<script>");
        expect(html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
        expect(html).toContain("&amp;");
        expect(html).toContain("&#39;quote&#39;");
        expect(html).toContain("https://example.test/portal?token=abc&amp;next=&quot;on&quot;");
        expect(escapeHtml(`<b>`)).toBe("&lt;b&gt;");
    });

    it("builds an unguessable token that fits the token column", () => {
        const tokens = new Set(Array.from({ length: 20 }, () => createInviteToken()));
        expect(tokens.size).toBe(20);
        for (const token of tokens) {
            expect(token.length).toBeGreaterThanOrEqual(32);
            expect(token.length).toBeLessThanOrEqual(64);
            expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
            expect(token).not.toMatch(/^[0-9a-z]{10,28}$/);
        }
    });
});

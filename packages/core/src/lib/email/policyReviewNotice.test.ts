import { describe, expect, it } from "vitest";
import { buildReviewDecisionEmail, buildReviewRequestedEmail } from "./policyReviewNotice";

describe("policy review email HTML", () => {
    it("escapes every interpolated value and the link attribute", () => {
        const notice = buildReviewRequestedEmail({
            reviewerName: `Alex O'Brian`,
            requesterName: `Quinn <admin>`,
            policyName: `Access & Control <draft>\r\nBcc: eve@evil.example`,
            dueDate: "2026-10-21",
            message: `Please review <img src=x onerror=alert(1)> "now"`,
            policyUrl: `https://grc.example.com/clients/1/policies/4?q="><script>alert(1)</script>`,
        });

        expect(notice.subject).not.toMatch(/[\r\n]/);
        expect(notice.subject).toContain("Access & Control <draft>");
        expect(notice.html).toContain("Alex O&#39;Brian");
        expect(notice.html).toContain("Quinn &lt;admin&gt;");
        expect(notice.html).toContain("Access &amp; Control &lt;draft&gt;");
        expect(notice.html).toContain("&lt;img src=x onerror=alert(1)&gt;");
        expect(notice.html).toContain("&quot;now&quot;");
        expect(notice.html).toContain("href=\"https://grc.example.com/clients/1/policies/4?q=&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;\"");
        expect(notice.html).not.toContain("<img");
        expect(notice.html).not.toContain("<script");
        expect(notice.html).not.toContain("<draft>");
        expect(notice.html).toContain("Due Date:");
    });

    it("escapes the decision email the same way", () => {
        const notice = buildReviewDecisionEmail({
            policyName: `Policy <b>Secret</b>\nBcc: eve@evil.example`,
            decision: "changes_requested",
            notes: `click <a href="http://evil.test">here</a>`,
            policyUrl: "https://grc.example.com/clients/2/policies/9",
        });

        expect(notice.subject).not.toMatch(/[\r\n]/);
        expect(notice.html).toContain("Policy &lt;b&gt;Secret&lt;/b&gt;");
        expect(notice.html).toContain("changes requested");
        expect(notice.html).toContain("click &lt;a href=&quot;http://evil.test&quot;&gt;here&lt;/a&gt;");
        expect(notice.html).toContain('href="https://grc.example.com/clients/2/policies/9"');
        expect(notice.html).not.toContain("<b>");
        expect(notice.html).not.toContain("<a href=\"http://evil.test\"");
    });
});

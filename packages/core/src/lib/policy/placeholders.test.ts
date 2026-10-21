import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
    ADVERTISED_POLICY_PLACEHOLDERS,
    MISSING_POLICY_NAME,
    MISSING_SYSTEM_SCOPE,
    createdPolicyIsAiGenerated,
    resolveSystemScope,
    substitutePolicyVariables,
    type PolicyVariableClient,
} from "./placeholders";

const here = path.dirname(fileURLToPath(import.meta.url));

const client: PolicyVariableClient = {
    name: "Latore LTD",
    industry: "Software $1",
    cisoName: "Alex Morgan",
    headquarters: "Sofia",
    region: "EU",
    primaryContactEmail: "ops@latore.example",
};

const now = new Date(2026, 9, 21);

function format(date: Date): string {
    return date.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

describe("substitutePolicyVariables", () => {
    it("substitutes every placeholder the template UI advertises", () => {
        const review = new Date(now.getTime());
        review.setFullYear(review.getFullYear() + 1);
        const content = [
            ...ADVERTISED_POLICY_PLACEHOLDERS,
            ...ADVERTISED_POLICY_PLACEHOLDERS.map((token) => token.toUpperCase()),
            "systems within {{system_scope}} operated by {{company_name}}",
            "Title: {{ policy_name }}",
        ].join("\n");

        const result = substitutePolicyVariables(content, client, {}, {
            policyName: "Access Control Policy",
            workspaceScope: null,
            now,
        });

        expect(result).toContain("Latore LTD");
        expect(result).toContain("Access Control Policy");
        expect(result).toContain(format(now));
        expect(result).toContain(format(review));
        expect(result).toContain(`systems within ${MISSING_SYSTEM_SCOPE} operated by Latore LTD`);
        expect(result).toContain("Title: Access Control Policy");
        for (const token of ADVERTISED_POLICY_PLACEHOLDERS) {
            expect(result.toLowerCase()).not.toContain(token.toLowerCase());
        }
    });

    it("prefers a system_scope tailoring answer over the workspace scope", () => {
        const result = substitutePolicyVariables(
            "Scope: {{system_scope}}",
            client,
            { SYSTEM_SCOPE: "customer portal and CI" },
            { workspaceScope: "<p>Everything else</p>", policyName: "Access Control Policy", now },
        );
        expect(result).toBe("Scope: customer portal and CI");
    });

    it("uses the workspace scope statement when no tailoring answer is set", () => {
        const result = substitutePolicyVariables(
            "within {{system_scope}}",
            client,
            {},
            {
                policyName: "Access Control Policy",
                workspaceScope: "<p>Production SaaS&nbsp;and corporate laptops</p>",
                now,
            },
        );
        expect(result).toBe("within Production SaaS and corporate laptops");
    });

    it("uses a visible marker when the workspace has no scope", () => {
        expect(resolveSystemScope({ workspaceScope: "<p><br></p>" })).toBe(MISSING_SYSTEM_SCOPE);
        expect(resolveSystemScope({ workspaceScope: "  {{system_scope}}  " })).toBe(MISSING_SYSTEM_SCOPE);
        expect(resolveSystemScope({
            answers: { system_scope: "{{ system_scope }}" },
            workspaceScope: "Production SaaS",
        })).toBe("Production SaaS");
        const result = substitutePolicyVariables("within {{system_scope}}", client, { system_scope: "   " }, {
            policyName: "Access Control Policy",
            workspaceScope: null,
            now,
        });
        expect(result).toBe(`within ${MISSING_SYSTEM_SCOPE}`);
        expect(result).not.toContain("{{");
    });

    it("fills {{policy_name}} from the policy title and marks a missing title", () => {
        expect(substitutePolicyVariables("{{policy_name}}", client, {}, { policyName: "NIS2 Incident Notification Policy", now }))
            .toBe("NIS2 Incident Notification Policy");
        expect(substitutePolicyVariables("{{policy_name}}", client, {}, { now })).toBe(MISSING_POLICY_NAME);
    });

    it("inserts values that contain replacement tokens literally", () => {
        const named = { ...client, name: "Cost $100 ($& $1)" };
        const result = substitutePolicyVariables(
            "{{company_name}} / {{note}} / [a.b]",
            named,
            { note: "keep $& and $1", "a.b": "dotted" },
            { policyName: "Access Control Policy", workspaceScope: null, now },
        );
        expect(result).toBe("Cost $100 ($& $1) / keep $& and $1 / dotted");
    });

    it("escapes tailoring-answer keys so they are not regular expressions", () => {
        const result = substitutePolicyVariables(
            "token {{a.b}} and neighbor {{axb}} and junk aaaa",
            client,
            { "a.b": "exact", "(a+)+": "no-redos" },
            { policyName: "Access Control Policy", workspaceScope: null, now },
        );
        expect(result).toContain("token exact");
        expect(result).toContain("neighbor {{axb}}");
        expect(result).toContain("junk aaaa");
        expect(result).not.toContain("{{a.b}}");
    });

    it("still substitutes the legacy bracket placeholders", () => {
        const result = substitutePolicyVariables(
            "[COMPANY NAME] in [Industry], approved by [CISO Name]",
            client,
            {},
            { policyName: "Access Control Policy", now },
        );
        expect(result).toBe("Latore LTD in Software $1, approved by Alex Morgan");
    });
});

describe("createdPolicyIsAiGenerated", () => {
    it("is true only when generation reports that the model wrote the draft", () => {
        expect(createdPolicyIsAiGenerated(undefined)).toBe(false);
        expect(createdPolicyIsAiGenerated(null)).toBe(false);
        expect(createdPolicyIsAiGenerated({ aiGenerated: false })).toBe(false);
        expect(createdPolicyIsAiGenerated({ aiGenerated: true })).toBe(true);
    });
});

describe("template editor placeholder list", () => {
    it("renders the shared advertised list instead of a hardcoded copy", () => {
        const page = readFileSync(path.resolve(here, "../../pages/PolicyTemplates.tsx"), "utf8");
        expect(page).toContain("ADVERTISED_POLICY_PLACEHOLDERS");
        for (const token of ADVERTISED_POLICY_PLACEHOLDERS) {
            expect(page).not.toContain(`{"${token}"}`);
        }
    });
});

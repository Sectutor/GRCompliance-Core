import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { PolicyLinter } from "./PolicyLinter";
import { COMMUNITY_AI_REWRITE_NOTE } from "@/lib/policy/communityAiRewrite";

const { mutate } = vi.hoisted(() => ({ mutate: vi.fn() }));

vi.mock("@/lib/trpc", () => ({
    trpc: {
        clientPolicies: {
            incorporateLinterSections: {
                useMutation: () => ({ mutate, isPending: false }),
            },
        },
    },
}));

vi.mock("sonner", () => ({
    toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const incompletePolicy = "<p>This draft has no required sections yet.</p>";

function renderLinter(premiumFlag: string | boolean) {
    return render(
        <PolicyLinter
            content={incompletePolicy}
            onInsertSection={vi.fn()}
            clientId={1}
            policyId={2}
            premiumFlag={premiumFlag}
        />,
    );
}

describe("Policy Linter Fix All with AI", () => {
    it("shows the Premium note instead of Fix All with AI in the community build", () => {
        renderLinter(false);

        expect(screen.getByTestId("community-ai-rewrite-note")).toHaveTextContent(COMMUNITY_AI_REWRITE_NOTE);
        expect(screen.queryByRole("button", { name: /fix all with ai/i })).not.toBeInTheDocument();
        expect(screen.queryByText(/VITE_ENABLE_PREMIUM/)).not.toBeInTheDocument();
    });

    it("keeps Fix All with AI in a premium build and still runs the fix", async () => {
        mutate.mockClear();
        const user = userEvent.setup();
        renderLinter("true");

        expect(screen.queryByTestId("community-ai-rewrite-note")).not.toBeInTheDocument();
        await user.click(screen.getByRole("button", { name: /fix all with ai/i }));
        expect(mutate).toHaveBeenCalledOnce();
        expect(mutate.mock.calls[0][0]).toMatchObject({ clientId: 1, policyId: 2, content: incompletePolicy });
    });

    it("does not add the note when the policy has no missing sections", () => {
        const complete = [
            "Purpose and objective",
            "Scope applies",
            "Roles and responsibilities",
            "Policy requirements",
            "Procedures and steps",
            "Exceptions",
            "Enforcement",
            "Definitions",
            "References and standards",
            "Revision history",
        ].join(". ");

        render(
            <PolicyLinter
                content={complete}
                onInsertSection={vi.fn()}
                premiumFlag={false}
            />,
        );

        expect(screen.queryByRole("button", { name: /fix all with ai/i })).not.toBeInTheDocument();
        expect(screen.queryByTestId("community-ai-rewrite-note")).not.toBeInTheDocument();
        expect(screen.getByText("No issues")).toBeInTheDocument();
    });
});

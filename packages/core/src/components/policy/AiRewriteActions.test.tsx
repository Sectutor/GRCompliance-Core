import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { TooltipProvider } from "@complianceos/ui/ui/tooltip";
import { AiRewriteToolbarActions, CommunityAiRewriteNote } from "./AiRewriteActions";
import { COMMUNITY_AI_REWRITE_NOTE } from "@/lib/policy/communityAiRewrite";

function readSrc(relativePath: string): string {
    const candidates = [
        path.resolve("packages/core/src", relativePath),
        path.resolve("src", relativePath),
    ];
    for (const candidate of candidates) {
        try {
            return readFileSync(candidate, "utf8");
        } catch {
            // try the next layout
        }
    }
    throw new Error(`Could not read ${relativePath}`);
}

function renderToolbar(premiumFlag: string | boolean, handlers?: { onRewrite?: () => void; onFix?: () => void }) {
    return render(
        <TooltipProvider>
            <AiRewriteToolbarActions
                premiumFlag={premiumFlag}
                onRewrite={handlers?.onRewrite ?? vi.fn()}
                onFix={handlers?.onFix ?? vi.fn()}
            />
        </TooltipProvider>,
    );
}

describe("community AI rewrite controls", () => {
    it("uses plain language and never names an environment variable", () => {
        expect(COMMUNITY_AI_REWRITE_NOTE).toBe("AI rewrite is available in GRCompliance Premium.");
        expect(COMMUNITY_AI_REWRITE_NOTE).not.toMatch(/VITE_|env var|ENABLE_PREMIUM/i);
    });

    it("replaces Rewrite and Fix with the Premium note in the community build", () => {
        renderToolbar(false);

        expect(screen.getByTestId("community-ai-rewrite-note")).toHaveTextContent(COMMUNITY_AI_REWRITE_NOTE);
        expect(screen.queryByRole("button", { name: /rewrite with ai/i })).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /fix with ai/i })).not.toBeInTheDocument();
        expect(screen.queryByText(/VITE_ENABLE_PREMIUM/)).not.toBeInTheDocument();
    });

    it("keeps the rewrite and fix buttons in a premium build", async () => {
        const onRewrite = vi.fn();
        const onFix = vi.fn();
        const user = userEvent.setup();
        renderToolbar("true", { onRewrite, onFix });

        expect(screen.queryByTestId("community-ai-rewrite-note")).not.toBeInTheDocument();
        await user.click(screen.getByRole("button", { name: /rewrite with ai/i }));
        await user.click(screen.getByRole("button", { name: /fix with ai/i }));
        expect(onRewrite).toHaveBeenCalledOnce();
        expect(onFix).toHaveBeenCalledOnce();
    });

    it("hides the sidebar note when rewrite is offered", () => {
        const { rerender } = render(<CommunityAiRewriteNote premiumFlag="true" />);
        expect(screen.queryByTestId("community-ai-rewrite-note")).not.toBeInTheDocument();

        rerender(<CommunityAiRewriteNote premiumFlag="false" />);
        expect(screen.getByTestId("community-ai-rewrite-note")).toHaveTextContent(COMMUNITY_AI_REWRITE_NOTE);
    });

    it("removes the developer notice from the policy editor and gates the sidebar control", () => {
        const policy = readSrc("pages/PolicyEditor.tsx");
        const editor = readSrc("components/RichTextEditor.tsx");

        expect(policy).not.toContain("Enable Premium (VITE_ENABLE_PREMIUM=true) to use AI rewrite");
        expect(policy).not.toContain("VITE_ENABLE_PREMIUM=true");
        expect(policy).toContain("CommunityAiRewriteNote");
        expect(policy).toContain("communityEdition ?");
        expect(editor).toContain("AiRewriteToolbarActions");
        expect(editor).not.toContain("Rewrite with AI");
        expect(editor).not.toContain("Fix with AI");
    });
});

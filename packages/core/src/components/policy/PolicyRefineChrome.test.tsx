import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { TooltipProvider } from "@complianceos/ui/ui/tooltip";

const entitlement = vi.hoisted(() => ({ allowed: false }));

vi.mock("quill", () => {
    class Quill {
        static import() {
            return {};
        }
        root = { innerHTML: "<p>Hello</p>" };
        clipboard = { dangerouslyPasteHTML() { } };
        on() { }
        getSelection() { return null; }
        setSelection() { }
        getText() { return ""; }
        getBounds() { return null; }
        focus() { }
        history = { undo() { }, redo() { } };
    }
    return { default: Quill };
});

vi.mock("quill/dist/quill.snow.css", () => ({}));

vi.mock("@/lib/trpc", () => {
    const useMutation = () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false });
    function useQuery(path: string) {
        if (path.endsWith("refineAllowed")) {
            if (!entitlement.allowed) {
                return {
                    data: undefined,
                    isLoading: false,
                    isError: true,
                    error: { data: { code: "FORBIDDEN" } },
                };
            }
            return { data: { allowed: true }, isLoading: false, isError: false };
        }
        return { data: undefined, isLoading: false, refetch: vi.fn() };
    }
    function node(path: string): any {
        return new Proxy(() => undefined, {
            get(_target, prop) {
                if (prop === "useQuery") return () => useQuery(path);
                if (prop === "useMutation") return useMutation;
                if (prop === "then" || typeof prop === "symbol") return undefined;
                return node(`${path}.${String(prop)}`);
            },
        });
    }
    return { trpc: node("trpc") };
});

import { PolicyRefineChrome } from "./PolicyRefineChrome";

function renderChrome() {
    return render(
        <TooltipProvider>
            <PolicyRefineChrome
                clientId={3}
                content="Hello"
                onChange={() => undefined}
                onAiRewrite={() => undefined}
                onAiFix={() => undefined}
                linter={{ onInsertSection: () => undefined }}
            />
        </TooltipProvider>,
    );
}

describe("policy refine buttons", () => {
    it("does not render the refine buttons in Core without a Premium licence", () => {
        entitlement.allowed = false;
        renderChrome();
        expect(screen.queryByRole("button", { name: "Rewrite with AI" })).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Fix with AI" })).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /Fix All with AI/ })).not.toBeInTheDocument();
        expect(screen.queryByText("AI rewrite is part of the paid edition.")).not.toBeInTheDocument();
    });

    it("shows the full rewrite labels when the server entitlement allows refine", () => {
        entitlement.allowed = true;
        renderChrome();
        const rewrite = screen.getByRole("button", { name: "Rewrite with AI" });
        const fix = screen.getByRole("button", { name: "Fix with AI" });
        expect(rewrite).toHaveTextContent("Rewrite with AI");
        expect(fix).toHaveTextContent("Fix with AI");
        expect(rewrite.className).not.toContain("hidden");
        expect(screen.getByRole("button", { name: /Fix All with AI/ })).toBeInTheDocument();
    });
});

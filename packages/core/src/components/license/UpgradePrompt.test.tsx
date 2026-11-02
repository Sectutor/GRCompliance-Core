import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { COMMUNITY_WORKSPACE_LIMIT_MESSAGE } from "@/lib/edition";

vi.mock("@/lib/trpc", () => {
    function useQuery() {
        return { data: { purchaseUrl: null }, isLoading: false, refetch: vi.fn() };
    }
    function node(path: string): object {
        return new Proxy(() => undefined, {
            get(_target, prop: string | symbol) {
                if (prop === "useQuery") return useQuery;
                if (prop === "useMutation") return () => ({ mutate: () => undefined, isPending: false });
                if (prop === "then" || typeof prop === "symbol") return undefined;
                return node(`${path}.${String(prop)}`);
            },
        });
    }
    return { trpc: node("trpc") };
});

import { COMMUNITY_WORKSPACE_LIMIT_EVENT, CommunityWorkspaceLimitHost } from "./UpgradePrompt";

describe("CommunityWorkspaceLimitHost", () => {
    it("shows the upgrade prompt for the community workspace limit", async () => {
        render(<CommunityWorkspaceLimitHost />);
        act(() => {
            window.dispatchEvent(new CustomEvent(COMMUNITY_WORKSPACE_LIMIT_EVENT, {
                detail: { message: COMMUNITY_WORKSPACE_LIMIT_MESSAGE },
            }));
        });
        expect(await screen.findByText("Additional workspaces")).toBeInTheDocument();
        expect(screen.getByText("Community Edition is limited to a single workspace.")).toBeInTheDocument();
        expect(screen.getAllByText("Premium is available.")).toHaveLength(1);
    });

    it("ignores a different forbidden message", async () => {
        render(<CommunityWorkspaceLimitHost />);
        act(() => {
            window.dispatchEvent(new CustomEvent(COMMUNITY_WORKSPACE_LIMIT_EVENT, {
                detail: { message: "Read-only access" },
            }));
        });
        expect(screen.queryByText("Additional workspaces")).not.toBeInTheDocument();
    });
});

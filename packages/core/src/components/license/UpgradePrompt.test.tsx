import { act, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { COMMUNITY_WORKSPACE_LIMIT_MESSAGE } from "@/lib/edition";
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
        expect(screen.getByText(COMMUNITY_WORKSPACE_LIMIT_MESSAGE)).toBeInTheDocument();
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

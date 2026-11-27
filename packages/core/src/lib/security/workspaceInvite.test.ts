import { describe, expect, it } from "vitest";
import { buildWorkspaceInviteLink, inviteExpiresAt } from "./workspaceInvite";

describe("workspace invite links", () => {
    it("expires a week later and puts the token only in the query", () => {
        const expires = inviteExpiresAt(new Date("2026-11-27T12:00:00.000Z"));
        expect(expires.toISOString().slice(0, 10)).toBe("2026-12-04");
        const link = buildWorkspaceInviteLink("http://grc.example.com", "abc_token");
        expect(link).toBe("http://grc.example.com/auth/accept-invite?token=abc_token");
        expect(link).not.toContain("grcompliance.com");
    });

    it("makes a fresh token long enough to be unguessable", () => {
        const link = buildWorkspaceInviteLink("http://127.0.0.1:3001");
        const token = new URL(link).searchParams.get("token") || "";
        expect(token.length).toBeGreaterThanOrEqual(40);
    });
});

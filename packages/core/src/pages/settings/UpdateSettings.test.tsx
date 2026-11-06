import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import UpdateSettings from "./UpdateSettings";

vi.mock("@/lib/authedFetch", () => ({
    authedFetch: vi.fn(),
}));

import { authedFetch } from "@/lib/authedFetch";

const authed = vi.mocked(authedFetch);

function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
    });
}

describe("UpdateSettings", () => {
    beforeEach(() => {
        authed.mockReset();
    });

    it("shows the upgrade button when a pinned release is available", async () => {
        authed.mockImplementation(async (input, init) => {
            const url = String(input);
            if (url.endsWith("/check") || (init && "method" in (init as RequestInit) && (init as RequestInit).method === "POST")) {
                return json({
                    edition: "core",
                    updater: "ok",
                    currentVersion: "1.0.0",
                    schemaVersion: 1,
                    airgap: false,
                    state: "idle",
                    progress: 0,
                    message: "Update available: 1.1.0",
                    error: null,
                    available: { edition: "core", version: "1.1.0", notes: "Pinned", changelogUrl: "https://example.com/changelog" },
                    rolledBack: false,
                    canUpgrade: true,
                    runId: null,
                });
            }
            return json({
                edition: "core",
                updater: "ok",
                currentVersion: "1.0.0",
                schemaVersion: 1,
                airgap: false,
                state: "idle",
                progress: 0,
                message: null,
                error: null,
                available: null,
                rolledBack: false,
                canUpgrade: false,
                runId: null,
            });
        });

        render(<UpdateSettings />);
        expect(await screen.findByTestId("upgrade-now")).toHaveTextContent("Update available → Upgrade now");
        expect(screen.getByTestId("current-version")).toHaveTextContent("1.0.0");
        expect(screen.getByTestId("schema-version")).toHaveTextContent("1");
        expect(screen.getByText(/does not enable Premium/)).toBeInTheDocument();
        expect(screen.getByText(/workspace cap/)).toBeInTheDocument();
    });

    it("disables the button for an air-gapped install", async () => {
        authed.mockResolvedValue(json({
            edition: "core",
            updater: "ok",
            currentVersion: "1.0.0",
            schemaVersion: 1,
            airgap: true,
            state: "idle",
            progress: 0,
            message: "Updates are disabled",
            error: null,
            available: null,
            rolledBack: false,
            canUpgrade: false,
            runId: null,
        }));
        render(<UpdateSettings />);
        const button = await screen.findByTestId("upgrade-now");
        await waitFor(() => expect(button).toBeDisabled());
        expect(button).toHaveTextContent("Updates disabled");
    });
});

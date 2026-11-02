import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { licenseValidator, type LicenseInfo } from "@/lib/license";
import { COMMUNITY_WORKSPACE_LIMIT_MESSAGE } from "@/lib/edition";
import { COMMUNITY_WORKSPACE_LIMIT_EVENT } from "./UpgradePrompt";

vi.mock("@/components/DashboardLayout", () => ({
    default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/Breadcrumb", () => ({
    Breadcrumb: () => null,
}));

vi.mock("wouter", () => ({
    useParams: () => ({ id: "1" }),
    useLocation: () => ["/clients/1/license", vi.fn()],
    Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
    Redirect: () => null,
}));

vi.mock("@/lib/trpc", () => {
    function useQuery(path: string) {
        if (path.includes("getLicenseStatus")) {
            return {
                data: {
                    type: "trial",
                    status: "active",
                    features: ["Enterprise Scalability", "30 day trial", "enterprise.scalability"],
                    issuedTo: "Example",
                    licenseKey: "hidden",
                },
                isLoading: false,
                refetch: vi.fn(),
            };
        }
        if (path.endsWith(".get")) {
            return {
                data: { id: 1, name: "Example Workspace" },
                isLoading: false,
                refetch: vi.fn(),
            };
        }
        return { data: undefined, isLoading: false, refetch: vi.fn() };
    }
    function useMutation() {
        return { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false };
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

import { InlineUpgradePrompt, UpgradePrompt, CommunityWorkspaceLimitHost } from "./UpgradePrompt";
import { LicenseActivationSuccess } from "./LicenseActivationSuccess";
import { PremiumSlotEnhanced } from "../PremiumSlotEnhanced";
import { useLicenseProtectedAction } from "./LicenseProtectedButton";
import ClientLicenseActivation from "@/pages/ClientLicenseActivation";
import LicenseManagement from "@/pages/LicenseManagement";
import AdminLicenseManagement from "@/pages/admin/LicenseManagement";

function communityLicense(): LicenseInfo {
    return {
        type: "community",
        status: "valid",
        issuedTo: "Community User",
        issuedAt: new Date(),
        features: [],
    };
}

function assertNoCommercialWording(text: string) {
    expect(text, text).not.toContain("$");
    expect(text, text).not.toMatch(/trial/i);
    expect(text, text).not.toContain("Enterprise");
}

function renderedText(): string {
    return document.body.textContent || "";
}

afterEach(() => {
    licenseValidator.updateLicense(communityLicense());
    cleanup();
});

describe("upgrade and licence copy", () => {
    it("renders the upgrade prompt without a price, trial, or Enterprise tier", () => {
        render(
            <UpgradePrompt
                open
                featureName="Additional workspaces"
                featureDescription={COMMUNITY_WORKSPACE_LIMIT_MESSAGE}
            />,
        );
        const text = renderedText();
        assertNoCommercialWording(text);
        expect(text).toContain("Premium is available.");
        expect(screen.getByRole("link", { name: /Premium is available/ })).toHaveAttribute("href", "/pricing");
    });

    it("renders the inline upgrade prompt the same way", () => {
        render(<InlineUpgradePrompt featureName="workspaces" />);
        const text = renderedText();
        assertNoCommercialWording(text);
        expect(text).toContain("Premium is available.");
        expect(screen.getByRole("link", { name: /Premium is available/ })).toHaveAttribute("href", "/pricing");
    });

    it("renders the workspace-limit upgrade prompt without an Enterprise tier", async () => {
        render(<CommunityWorkspaceLimitHost />);
        act(() => {
            window.dispatchEvent(new CustomEvent(COMMUNITY_WORKSPACE_LIMIT_EVENT, {
                detail: { message: COMMUNITY_WORKSPACE_LIMIT_MESSAGE },
            }));
        });
        expect(await screen.findByText("Additional workspaces")).toBeInTheDocument();
        assertNoCommercialWording(renderedText());
    });

    it("renders the licence activation page without a trial card or a price", async () => {
        const user = userEvent.setup();
        render(<ClientLicenseActivation />);
        assertNoCommercialWording(renderedText());
        for (const name of ["License Status", "Available Features", "Help & Support"]) {
            await user.click(screen.getByRole("tab", { name }));
            assertNoCommercialWording(renderedText());
        }
        await user.click(screen.getByRole("tab", { name: "Available Features" }));
        expect(renderedText()).toContain("Premium is available.");
        expect(screen.getByRole("link", { name: /Premium is available/ })).toHaveAttribute("href", "/pricing");
        expect(screen.queryByRole("button", { name: /Start Trial/i })).not.toBeInTheDocument();
    });

    it("renders licence management for a legacy trial record without that tier", async () => {
        const user = userEvent.setup();
        licenseValidator.updateLicense({
            ...communityLicense(),
            type: "trial",
        });
        render(<LicenseManagement />);
        assertNoCommercialWording(renderedText());
        await user.click(screen.getByRole("tab", { name: "Features" }));
        assertNoCommercialWording(renderedText());
        await user.click(screen.getByRole("tab", { name: "Management" }));
        assertNoCommercialWording(renderedText());
        expect(renderedText()).toContain("Premium is available.");
    });

    it("renders the admin licence screen and a legacy trial activation without that tier", () => {
        render(<AdminLicenseManagement />);
        assertNoCommercialWording(renderedText());
        cleanup();

        const { unmount } = render(
            <LicenseActivationSuccess
                license={{
                    type: "trial",
                    status: "active",
                    issuedTo: "Example",
                    features: ["Enterprise Scalability"],
                }}
            />,
        );
        assertNoCommercialWording(renderedText());
        expect(screen.getByText("Community")).toBeInTheDocument();
        unmount();

        render(
            <LicenseActivationSuccess
                license={{
                    type: "Enterprise",
                    status: "active",
                    issuedTo: "Example",
                    features: ["Enterprise Scalability"],
                }}
            />,
        );
        assertNoCommercialWording(renderedText());
        expect(screen.getByText("Premium")).toBeInTheDocument();
    });

    it("renders the premium slot and the locked-action note without an enterprise licence line", () => {
        licenseValidator.updateLicense({
            ...communityLicense(),
            type: "trial",
        });
        render(
            <PremiumSlotEnhanced
                featureId="enterprise.scalability"
                title="Extra capacity"
                description="Premium is available."
            />,
        );
        assertNoCommercialWording(renderedText());

        function Probe() {
            const { checkLicense } = useLicenseProtectedAction("ai.evidence_analysis");
            return <button onClick={() => checkLicense()}>Check access</button>;
        }
        cleanup();
        render(<Probe />);
        fireEvent.click(screen.getByRole("button", { name: "Check access" }));
        assertNoCommercialWording(renderedText());
        expect(renderedText()).toContain("This feature is part of Premium.");
    });
});

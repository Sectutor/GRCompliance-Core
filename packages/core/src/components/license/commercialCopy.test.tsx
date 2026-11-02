import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import fs from "node:fs";
import path from "node:path";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { licenseValidator, type LicenseInfo } from "@/lib/license";
import { COMMUNITY_WORKSPACE_LIMIT_MESSAGE } from "@/lib/edition";
import { COMMUNITY_SITE_URL } from "@/lib/licenseLabel";
import { COMMUNITY_WORKSPACE_LIMIT_EVENT } from "./UpgradePrompt";

const harness = vi.hoisted(() => ({
    failActivation: false,
    purchaseUrl: null as string | null,
    toastError: vi.fn(),
    toastSuccess: vi.fn(),
}));

vi.mock("sonner", () => ({
    toast: {
        error: (...args: unknown[]) => harness.toastError(...args),
        success: (...args: unknown[]) => harness.toastSuccess(...args),
    },
}));

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
        if (path.endsWith("getPremiumOffer")) {
            return {
                data: { purchaseUrl: harness.purchaseUrl },
                isLoading: false,
                refetch: vi.fn(),
            };
        }
        return { data: undefined, isLoading: false, refetch: vi.fn() };
    }
    function useMutation(opts?: { onError?: (error: { message: string }) => void }) {
        return {
            mutate: () => {
                if (harness.failActivation) opts?.onError?.({ message: "Invalid license key" });
            },
            mutateAsync: vi.fn(),
            isPending: false,
        };
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
    harness.failActivation = false;
    harness.purchaseUrl = null;
    harness.toastError.mockClear();
    harness.toastSuccess.mockClear();
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
        expect(screen.getByRole("link", { name: /Premium is available/ })).toHaveAttribute("href", COMMUNITY_SITE_URL);
        expect(screen.getByRole("link", { name: /Premium is available/ })).toHaveAttribute("target", "_blank");
    });

    it("renders the inline upgrade prompt the same way", () => {
        render(<InlineUpgradePrompt featureName="workspaces" />);
        const text = renderedText();
        assertNoCommercialWording(text);
        expect(text).toContain("Premium is available.");
        expect(screen.getByRole("link", { name: /Premium is available/ })).toHaveAttribute("href", COMMUNITY_SITE_URL);
        expect(screen.getByRole("link", { name: /Premium is available/ })).toHaveAttribute("target", "_blank");
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
        expect(renderedText().match(/Premium is available\./g)).toHaveLength(1);
    });

    it("renders the licence activation page without a trial card or a price", async () => {
        const user = userEvent.setup();
        render(<ClientLicenseActivation />);
        assertNoCommercialWording(renderedText());
        expect(screen.getByPlaceholderText("Enter your license key")).toBeInTheDocument();
        expect(renderedText()).not.toContain("Gumroad license key");
        for (const name of ["License Status", "Available Features", "Help & Support"]) {
            await user.click(screen.getByRole("tab", { name }));
            assertNoCommercialWording(renderedText());
        }
        await user.click(screen.getByRole("tab", { name: "Available Features" }));
        expect(renderedText()).toContain("Premium is available.");
        expect(screen.getByRole("link", { name: /Premium is available/ })).toHaveAttribute("href", COMMUNITY_SITE_URL);
        expect(screen.getByRole("link", { name: /Premium is available/ })).toHaveAttribute("target", "_blank");
        expect(screen.queryByRole("button", { name: /Start Trial/i })).not.toBeInTheDocument();
        expect(screen.queryByRole("link", { name: "Purchase License" })).not.toBeInTheDocument();
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

    it("hides the purchase button until PREMIUM_PURCHASE_URL is set", async () => {
        const user = userEvent.setup();
        render(<ClientLicenseActivation />);
        expect(screen.queryByRole("link", { name: "Purchase License" })).not.toBeInTheDocument();
        const note = screen.getByRole("link", { name: /Premium is available/ });
        expect(note).toHaveAttribute("href", COMMUNITY_SITE_URL);
        expect(note).toHaveAttribute("target", "_blank");

        cleanup();
        harness.purchaseUrl = "https://example.com/premium";
        render(<ClientLicenseActivation />);
        const purchase = screen.getByRole("link", { name: "Purchase License" });
        expect(purchase).toHaveAttribute("href", "https://example.com/premium");
        expect(purchase).toHaveAttribute("target", "_blank");
        await user.click(screen.getByRole("tab", { name: "Available Features" }));
        expect(screen.getByRole("link", { name: /Premium is available/ })).toHaveAttribute("href", "https://example.com/premium");

        cleanup();
        render(
            <UpgradePrompt
                open
                featureName="Additional workspaces"
                featureDescription={COMMUNITY_WORKSPACE_LIMIT_MESSAGE}
            />,
        );
        expect(screen.getByRole("link", { name: /Premium is available/ })).toHaveAttribute("href", "https://example.com/premium");
    });

    it("shows an invalid licence key error with the mounted toast", async () => {
        const user = userEvent.setup();
        harness.failActivation = true;
        render(<ClientLicenseActivation />);
        await user.type(screen.getByLabelText("License Key"), "not-a-real-key");
        await user.click(screen.getByRole("button", { name: "Activate License" }));
        expect(harness.toastError).toHaveBeenCalledWith("Invalid license key");
        const source = fs.readFileSync(
            path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../pages/ClientLicenseActivation.tsx"),
            "utf8",
        );
        expect(source).toContain('from "sonner"');
        expect(source).not.toContain("use-toast");
    });

    it("scans user-facing source for edition names and prices", () => {
        const failures = scanCommercialCopy();
        expect(failures, failures.join("\n")).toEqual([]);
    });
});

const COMMERCIAL_COPY_ROOTS = ["pages", "components", "lib/email/templates"];

/** Product-edition phrases are never allowlisted. */
const COMMERCIAL_COPY_DENY = [
    /Managed SaaS/,
    /Enterprise Scalability/,
    /Enterprise Storage/,
    /GRCompliance Enterprise/,
    /GRCompliance Trial/,
    /Pro and Enterprise/,
    /\bfree trial\b/i,
    /\$\d+(?:\.\d+)?\s*\/\s*(?:mo|month)\b/i,
];

/**
 * Small explicit allowlist. A new price, trial, or edition name still fails.
 * Risk-cost placeholders and testimonial figures are the dollar amounts that
 * are not a product price. System names and vendor categories are listed so
 * those words are not treated as a plan.
 */
const COMMERCIAL_COPY_ALLOWLIST: { reason: string; pattern: RegExp }[] = [
    { reason: "risk cost placeholder", pattern: /Financial loss > \$50k/ },
    { reason: "risk cost placeholder", pattern: /Financial Loss (?:&lt;|<) \$10k/ },
    { reason: "risk cost placeholder", pattern: /\$50,000 \/ year/ },
    { reason: "risk cost placeholder", pattern: /\$5,000/ },
    { reason: "risk cost placeholder", pattern: /\$10,000\/yr/ },
    { reason: "risk cost placeholder", pattern: /Cost: \$50K \(self-assessed\)/ },
    { reason: "risk cost placeholder", pattern: /\$50K – \$200K\+/ },
    { reason: "risk cost placeholder", pattern: /Initial cost: \$500K–\$2M\+/ },
    { reason: "risk cost placeholder", pattern: /\$500K – \$2M\+/ },
    { reason: "testimonial figure", pattern: /saving \$2M/ },
    { reason: "testimonial figure", pattern: /audit costs by \$50K/ },
    { reason: "testimonial figure", pattern: /worth \$5M/ },
    { reason: "testimonial figure", pattern: /\$50M in DoD/ },
    { reason: "system or program name", pattern: /Enterprise Risk Matrix/ },
    { reason: "system or program name", pattern: /Enterprise-wide/ },
    { reason: "system or program name", pattern: /Enterprise BCP/ },
    { reason: "system or program name", pattern: /Enterprise Resource Planning/ },
    { reason: "system or program name", pattern: /Enterprise Customers/ },
    { reason: "system or program name", pattern: /Enterprise customers/ },
    { reason: "system or program name", pattern: /Enterprise Cloud/ },
    { reason: "system or program name", pattern: /Enterprise Asset Inventory/ },
    { reason: "system or program name", pattern: /Enterprise Security Transformation/ },
    { reason: "vendor, cloud, or industry category", pattern: /\bSaaS\b/ },
];

const COMMERCIAL_COPY_RULES = [
    { name: "Enterprise", re: /\bEnterprise\b/g },
    { name: "trial", re: /\btrial\b/gi },
    { name: "SaaS", re: /\bSaaS\b/g },
    { name: "price", re: /\$\d+/g },
];

function stripSourceComments(src: string): string {
    let out = "";
    let i = 0;
    let quote: "'" | "\"" | "`" | null = null;
    while (i < src.length) {
        const c = src[i];
        const next = src[i + 1];
        if (quote) {
            out += c;
            if (c === "\\" && quote !== "`") {
                out += next ?? "";
                i += 2;
                continue;
            }
            if (c === quote) quote = null;
            i += 1;
            continue;
        }
        if (c === "'" || c === "\"" || c === "`") {
            quote = c;
            out += c;
            i += 1;
            continue;
        }
        if (c === "/" && next === "/") {
            while (i < src.length && src[i] !== "\n") i += 1;
            continue;
        }
        if (c === "/" && next === "*") {
            i += 2;
            while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) i += 1;
            i += 2;
            continue;
        }
        out += c;
        i += 1;
    }
    return out;
}

function walkSource(dir: string, out: string[] = []): string[] {
    if (!fs.existsSync(dir)) return out;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walkSource(full, out);
        else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.(ts|tsx)$/.test(entry.name)) out.push(full);
    }
    return out;
}

function tokenAllowed(ruleName: string, line: string): boolean {
    if (COMMERCIAL_COPY_DENY.some((pattern) => pattern.test(line))) return false;
    return COMMERCIAL_COPY_ALLOWLIST.some((entry) => {
        if (!entry.pattern.test(line)) return false;
        if (ruleName === "SaaS") return entry.reason.startsWith("vendor");
        if (ruleName === "Enterprise") return entry.reason === "system or program name";
        if (ruleName === "price") return entry.reason === "risk cost placeholder" || entry.reason === "testimonial figure";
        return false;
    });
}

function ignoredPriceToken(line: string, token: string): boolean {
    return /\.replace\(/.test(line) && /^\$\d$/.test(token);
}

function scanCommercialCopy(): string[] {
    const srcRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
    const failures: string[] = [];
    for (const root of COMMERCIAL_COPY_ROOTS) {
        for (const file of walkSource(path.join(srcRoot, root))) {
            const lines = stripSourceComments(fs.readFileSync(file, "utf8")).split("\n");
            lines.forEach((line, index) => {
                if (COMMERCIAL_COPY_DENY.some((pattern) => pattern.test(line))) {
                    failures.push(`${path.relative(srcRoot, file)}:${index + 1} ${line.trim().slice(0, 180)}`);
                    return;
                }
                for (const rule of COMMERCIAL_COPY_RULES) {
                    const re = new RegExp(rule.re.source, rule.re.flags);
                    let match: RegExpExecArray | null;
                    while ((match = re.exec(line))) {
                        if (rule.name === "price" && ignoredPriceToken(line, match[0])) continue;
                        if (tokenAllowed(rule.name, line)) continue;
                        failures.push(`${rule.name} ${path.relative(srcRoot, file)}:${index + 1} ${line.trim().slice(0, 180)}`);
                        break;
                    }
                }
            });
        }
    }
    return failures;
}

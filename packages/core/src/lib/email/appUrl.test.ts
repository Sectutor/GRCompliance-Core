import { afterEach, describe, expect, it, vi } from "vitest";
import { appLink, getAppBaseUrl } from "./appUrl";

const KEYS = ["APP_URL", "NEXT_PUBLIC_APP_URL", "VITE_APP_URL", "PORT", "APP_PORT"] as const;

function env(values: Partial<Record<(typeof KEYS)[number], string>>): Record<string, string | undefined> {
    const base: Record<string, string | undefined> = {};
    for (const key of KEYS) base[key] = "";
    return { ...base, ...values };
}

describe("getAppBaseUrl", () => {
    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it("uses the server APP_URL and ignores the unset Vite variable", () => {
        expect(getAppBaseUrl(env({
            APP_URL: "https://grc.example.com/",
            VITE_APP_URL: "https://vite.example/",
            PORT: "3002",
        }))).toBe("https://grc.example.com");
    });

    it("keeps a path on APP_URL and drops a trailing slash", () => {
        expect(getAppBaseUrl(env({ APP_URL: "https://grc.example.com/app/" }))).toBe(
            "https://grc.example.com/app",
        );
    });

    it("falls back to the legacy public URL when APP_URL is unset", () => {
        expect(getAppBaseUrl(env({
            NEXT_PUBLIC_APP_URL: "https://legacy.example.com/",
            VITE_APP_URL: "https://vite.example/",
        }))).toBe("https://legacy.example.com");
    });

    it("ignores non-http values and falls back to the process port", () => {
        expect(getAppBaseUrl(env({
            APP_URL: "javascript:alert(1)",
            VITE_APP_URL: "https://vite.example/",
            PORT: "3002",
        }))).toBe("http://localhost:3002");
    });

    it("ignores a scheme-less APP_URL instead of building a broken relative link", () => {
        expect(getAppBaseUrl(env({
            APP_URL: "localhost:3001",
            VITE_APP_URL: "https://vite.example/",
        }))).toBe("http://localhost:3001");
    });

    it("uses APP_PORT when PORT is unset, then 3001", () => {
        expect(getAppBaseUrl(env({ APP_PORT: "3010" }))).toBe("http://localhost:3010");
        expect(getAppBaseUrl(env({}))).toBe("http://localhost:3001");
    });

    it("builds an absolute policy link", () => {
        expect(appLink("/clients/7/policies/8", env({ APP_URL: "https://grc.example.com/" }))).toBe(
            "https://grc.example.com/clients/7/policies/8",
        );
    });
});

import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { appOrigin, isVendorHostname } from "./publicUrl";

const repoRoot = path.resolve(__dirname, "../../../..");

const envKeys = ["APP_URL", "NEXT_PUBLIC_APP_URL", "VITE_APP_URL", "NODE_ENV"] as const;
const previous: Record<string, string | undefined> = {};

function saveEnv() {
    for (const key of envKeys) previous[key] = process.env[key];
}

function restoreEnv() {
    for (const key of envKeys) {
        if (previous[key] === undefined) delete process.env[key];
        else process.env[key] = previous[key];
    }
}

describe("instance link origin", () => {
    afterEach(() => {
        restoreEnv();
    });

    it("uses the operator address and ignores vendor hosts", () => {
        saveEnv();
        process.env.NODE_ENV = "production";
        process.env.APP_URL = "https://grc.example.com:8443/app";
        process.env.NEXT_PUBLIC_APP_URL = "https://app.grcompliance.com";
        expect(appOrigin()).toBe("https://grc.example.com:8443");
        expect(isVendorHostname("demo.grcompliance.com")).toBe(true);
        expect(isVendorHostname("grcompliance.com")).toBe(true);
    });

    it("accepts an explicit local APP_URL and refuses to invent one in production", () => {
        saveEnv();
        process.env.NODE_ENV = "production";
        process.env.APP_URL = "http://localhost:3001";
        expect(appOrigin()).toBe("http://localhost:3001");

        delete process.env.APP_URL;
        delete process.env.NEXT_PUBLIC_APP_URL;
        delete process.env.VITE_APP_URL;
        expect(() => appOrigin()).toThrow(/APP_URL is required in production/);
    });

    it("refuses grcompliance.com and demo.grcompliance.com even when configured", () => {
        saveEnv();
        process.env.NODE_ENV = "development";
        for (const host of ["https://grcompliance.com", "https://demo.grcompliance.com", "https://app.grcompliance.com"]) {
            process.env.APP_URL = host;
            expect(() => appOrigin()).toThrow(/own address/);
        }
    });

    it("falls back to the dev server only outside production", () => {
        saveEnv();
        process.env.NODE_ENV = "test";
        delete process.env.APP_URL;
        delete process.env.NEXT_PUBLIC_APP_URL;
        delete process.env.VITE_APP_URL;
        expect(appOrigin()).toBe("http://localhost:3001");
    });

    it("does not hardcode vendor or localhost fallbacks in operational link builders", () => {
        const files = [
            "packages/core/src/server/routers/users.ts",
            "packages/core/src/server/routers/integrations.ts",
            "packages/core/src/server/services/policyReviewScheduler.ts",
            "packages/core/src/server/routers/audit.ts",
            "packages/core/src/server/routers/magicLinks.ts",
            "packages/core/src/server/routers/vendorAssessments.ts",
            "packages/core/src/server/routers/waitlist.ts",
            "packages/core/src/server/routers/questionnaire.ts",
            "packages/core/src/server/routers/evidence.ts",
            "packages/core/src/server/routers/auditors.ts",
            "packages/core/src/server/routers/clientPolicies.ts",
            "packages/core/src/server/routers/compliance.ts",
            "packages/core/src/server/services/AuthorizationEngine.ts",
            "packages/core/src/emailNotification.ts",
            "packages/core/src/routers.ts",
            "packages/core/src/App.tsx",
            "packages/core/src/polyfill.ts",
            "server_entry.ts",
            "netlify/functions/api.ts",
            "docker/entrypoint.sh",
        ];
        for (const file of files) {
            const source = readFileSync(path.join(repoRoot, file), "utf8");
            expect(source, file).not.toContain("app.grcompliance.com");
            expect(source, file).not.toContain("demo.grcompliance.com");
            expect(source, file).not.toContain("https://grcompliance.com");
            expect(source, file).not.toContain("http://localhost:3000");
            expect(source, file).not.toContain("http://localhost:3002");
            if (file !== "server_entry.ts") {
                expect(source, file).not.toContain("http://localhost:5173");
            }
        }
        const entrypoint = readFileSync(path.join(repoRoot, "docker/entrypoint.sh"), "utf8");
        expect(entrypoint).not.toContain("APP_URL:-http://localhost");
    });
});

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { Breadcrumb } from "@/components/Breadcrumb";
import { workspaceBreadcrumbLabel } from "./workspaceLabel";

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

describe("workspaceBreadcrumbLabel", () => {
    it("uses the workspace name when one is loaded", () => {
        expect(workspaceBreadcrumbLabel("Latore LTD", 1)).toBe("Latore LTD");
        expect(workspaceBreadcrumbLabel("  Northwind  ", 4)).toBe("Northwind");
    });

    it("falls back to Client {id} only when the name is missing", () => {
        expect(workspaceBreadcrumbLabel(undefined, 1)).toBe("Client 1");
        expect(workspaceBreadcrumbLabel(null, 2)).toBe("Client 2");
        expect(workspaceBreadcrumbLabel("   ", 3)).toBe("Client 3");
    });

    it("renders the workspace name in the breadcrumb", () => {
        render(
            <Breadcrumb
                items={[
                    { label: "Clients", href: "/clients" },
                    { label: workspaceBreadcrumbLabel("Latore LTD", 1), href: "/clients/1" },
                    { label: "Policies", href: "/clients/1/policies" },
                ]}
            />,
        );

        expect(screen.getByText("Latore LTD")).toBeInTheDocument();
        expect(screen.queryByText("Client 1")).not.toBeInTheDocument();
    });

    it("wires the policy and SSP editors to the workspace name", () => {
        const policy = readSrc("pages/PolicyEditor.tsx");
        const ssp = readSrc("pages/federal/SSPEditor.tsx");

        expect(policy).toContain("workspaceBreadcrumbLabel(clientData?.name, clientId)");
        expect(ssp).toContain("workspaceBreadcrumbLabel(clientData?.name, clientId)");
        expect(ssp).toContain("trpc.clients.get.useQuery");
        expect(policy).not.toContain("`Client ${clientId}`");
        expect(ssp).not.toContain("`Client ${clientId}`");
    });
});

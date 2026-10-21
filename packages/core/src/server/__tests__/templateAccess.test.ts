import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
    templates: [] as Array<Record<string, unknown>>,
    memberships: [] as Array<{ clientId: number; role: string }>,
}));

function tableName(table: object): string {
    for (const key of Object.getOwnPropertySymbols(table)) {
        if (key.description === "drizzle:Name") return String((table as Record<symbol, unknown>)[key]);
    }
    return "";
}

vi.mock("../../db", () => ({
    getDb: async () => ({
        select: () => ({
            from: (table: object) => {
                const name = tableName(table);
                return {
                    where: () => ({
                        limit: async () => (name === "policy_templates" ? state.templates : state.memberships),
                        orderBy: async () => state.memberships,
                    }),
                    innerJoin: () => ({
                        where: () => ({
                            orderBy: async () => [],
                        }),
                    }),
                };
            },
        }),
    }),
    getUserById: async () => ({ maxClients: 5 }),
}));

import { assertTemplateReadable } from "../templateAccess";

const user = { id: 10, role: "user" };

describe("assertTemplateReadable", () => {
    it("denies a private template from another workspace", async () => {
        state.templates = [{ id: 3, isPublic: false, ownerId: 99, clientId: 2, name: "Secret" }];
        state.memberships = [];
        await expect(assertTemplateReadable({ user }, 3)).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("allows a public template and a template in the caller's workspace", async () => {
        state.templates = [{ id: 1, isPublic: true, ownerId: 99, clientId: 2, name: "Public" }];
        await expect(assertTemplateReadable({ user }, 1)).resolves.toMatchObject({ id: 1 });

        state.templates = [{ id: 4, isPublic: false, ownerId: 99, clientId: 8, name: "Team" }];
        state.memberships = [{ clientId: 8, role: "editor" }];
        await expect(assertTemplateReadable({ user }, 4)).resolves.toMatchObject({ id: 4, name: "Team" });
    });

    it("keeps system templates with no owner and no workspace hidden", async () => {
        state.templates = [{ id: 6, isPublic: false, ownerId: null, clientId: null, name: "Seed" }];
        state.memberships = [{ clientId: 1, role: "owner" }];
        await expect(assertTemplateReadable({ user }, 6)).rejects.toMatchObject({ code: "FORBIDDEN" });
    });
});

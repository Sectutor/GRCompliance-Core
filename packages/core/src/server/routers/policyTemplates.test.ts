import { beforeEach, describe, expect, it, vi } from "vitest";
import {
    createPolicyTemplateInput,
    createPolicyTemplatesRouter,
    updatePolicyTemplateInput,
} from "./policyTemplates";

const mockDb = {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
};

vi.mock("../../db", () => ({
    getDb: vi.fn(() => Promise.resolve(mockDb)),
}));

function procedure() {
    const chain = {
        use() {
            return chain;
        },
        input(schema: { parse: (value: unknown) => unknown }) {
            return {
                query(handler: Function) {
                    return Object.assign(handler, { _def: { type: "query", input: schema } });
                },
                mutation(handler: Function) {
                    return Object.assign(handler, { _def: { type: "mutation", input: schema } });
                },
            };
        },
    };
    return chain;
}

const t = { router: (handlers: Record<string, unknown>) => handlers };
const ctx = { user: { id: 7, role: "admin", name: "Ada" } };

function selectResults(...results: unknown[][]) {
    const where = vi.fn();
    for (const result of results) where.mockResolvedValueOnce(result);
    mockDb.select.mockReturnValue({ from: () => ({ where }) });
    return where;
}

describe("policyTemplates router", () => {
    let router: any;

    beforeEach(() => {
        vi.clearAllMocks();
        router = createPolicyTemplatesRouter(t, procedure(), procedure());
    });

    it("keeps framework and templateId in the create and update schemas", () => {
        const created = createPolicyTemplateInput.parse({
            name: "Access Control Policy",
            templateId: "  POL-042  ",
            framework: "ISO 27001",
            ignored: true,
        });
        expect(created.templateId).toBe("POL-042");
        expect(created.framework).toBe("ISO 27001");
        expect(created).not.toHaveProperty("ignored");
        expect(router.create._def.input).toBe(createPolicyTemplateInput);

        const updated = updatePolicyTemplateInput.parse({
            id: 3,
            templateId: "POL-042",
            framework: "SOC 2",
        });
        expect(updated.templateId).toBe("POL-042");
        expect(updated.framework).toBe("SOC 2");
        expect(router.update._def.input).toBe(updatePolicyTemplateInput);
    });

    it("saves the chosen framework and typed template id", async () => {
        selectResults([]);
        const values = vi.fn();
        const returning = vi.fn();
        mockDb.insert.mockReturnValue({ values });
        values.mockReturnValue({ returning });
        returning.mockResolvedValue([{
            id: 10,
            templateId: "POL-042",
            name: "Access Control Policy",
            frameworks: JSON.stringify(JSON.stringify(["ISO 27001"])),
        }]);

        const input = createPolicyTemplateInput.parse({
            name: "Access Control Policy",
            templateId: "POL-042",
            framework: "ISO 27001",
            content: "Least privilege.",
        });
        const result = await router.create({ input, ctx });

        expect(values).toHaveBeenCalledWith(expect.objectContaining({
            templateId: "POL-042",
            frameworks: ["ISO 27001"],
            name: "Access Control Policy",
            ownerId: 7,
        }));
        expect(result.templateId).toBe("POL-042");
        expect(result.frameworks).toEqual(["ISO 27001"]);
    });

    it("still generates a template id when the editor does not send one", async () => {
        selectResults([]);
        mockDb.insert.mockReturnValue({
            values: (row: { templateId: string; frameworks?: string[] }) => ({
                returning: async () => [row],
            }),
        });

        const input = createPolicyTemplateInput.parse({ name: "Untitled", framework: "SOC 2" });
        const result = await router.create({ input, ctx });
        expect(result.templateId).toMatch(/^tpl_\d+_\d+$/);
        expect(result.frameworks).toEqual(["SOC 2"]);
    });

    it("rejects a template id that is already in use", async () => {
        selectResults([{ id: 2 }]);
        const input = createPolicyTemplateInput.parse({
            name: "Duplicate",
            templateId: "POL-001",
            framework: "ISO 27001",
        });
        await expect(router.create({ input, ctx })).rejects.toMatchObject({ code: "CONFLICT" });
    });

    it("turns a unique-constraint race into a conflict", async () => {
        selectResults([]);
        const duplicate = Object.assign(new Error("duplicate key"), { code: "23505" });
        mockDb.insert.mockReturnValue({
            values: () => ({ returning: () => Promise.reject(duplicate) }),
        });
        const input = createPolicyTemplateInput.parse({
            name: "Race",
            templateId: "POL-007",
            framework: "SOC 2",
        });
        await expect(router.create({ input, ctx })).rejects.toMatchObject({ code: "CONFLICT" });
    });

    it("saves a changed framework and template id when a template is edited", async () => {
        selectResults(
            [{ id: 3, ownerId: 7, templateId: "POL-003", frameworks: ["SOC 2"] }],
            [],
        );
        const set = vi.fn();
        mockDb.update.mockReturnValue({
            set: (data: unknown) => {
                set(data);
                return {
                    where: () => ({
                        returning: async () => [{
                            id: 3,
                            templateId: "POL-042",
                            frameworks: JSON.stringify(JSON.stringify(["ISO 27001"])),
                        }],
                    }),
                };
            },
        });

        const input = updatePolicyTemplateInput.parse({
            id: 3,
            name: "Access Control Policy",
            templateId: "POL-042",
            framework: "ISO 27001",
        });
        const result = await router.update({ input, ctx });

        expect(set).toHaveBeenCalledWith(expect.objectContaining({
            templateId: "POL-042",
            frameworks: ["ISO 27001"],
            name: "Access Control Policy",
        }));
        expect(set.mock.calls[0][0]).not.toHaveProperty("framework");
        expect(result).toMatchObject({ templateId: "POL-042", frameworks: ["ISO 27001"] });
    });

    it("keeps extra stored frameworks when the editor resubmits the first one", async () => {
        selectResults([{ id: 5, ownerId: 7, templateId: "POL-005", frameworks: ["ISO 27001", "NIS2"] }]);
        const set = vi.fn();
        mockDb.update.mockReturnValue({
            set: (data: unknown) => {
                set(data);
                return { where: () => ({ returning: async () => [{ id: 5, ...data as object }] }) };
            },
        });

        const input = updatePolicyTemplateInput.parse({
            id: 5,
            templateId: "POL-005",
            framework: "ISO 27001",
        });
        const result = await router.update({ input, ctx });
        expect(result.frameworks).toEqual(["ISO 27001", "NIS2"]);
    });

    it("returns the templates whose frameworks contain the filter, including double-encoded rows", async () => {
        const rows = [
            { id: 1, templateId: "POL-001", frameworks: ["ISO 27001"], isPublic: true },
            { id: 3, templateId: "POL-003", frameworks: JSON.stringify(JSON.stringify(["SOC 2"])), isPublic: true },
            { id: 5, templateId: "POL-005", frameworks: JSON.stringify(JSON.stringify(["ISO 27001", "NIS2"])), isPublic: true },
        ];
        selectResults(rows);

        const iso = await router.list({ input: { framework: "ISO 27001" }, ctx });
        expect(iso.map((row: { templateId: string }) => row.templateId)).toEqual(["POL-001", "POL-005"]);
        expect(iso.every((row: { frameworks: string[] }) => Array.isArray(row.frameworks))).toBe(true);

        selectResults(rows);
        const soc = await router.list({ input: { framework: "SOC 2" }, ctx });
        expect(soc.map((row: { templateId: string }) => row.templateId)).toEqual(["POL-003"]);
        expect(soc[0].frameworks).toEqual(["SOC 2"]);

        selectResults(rows);
        const all = await router.list({ input: { framework: "all" }, ctx });
        expect(all).toHaveLength(3);
    });
});

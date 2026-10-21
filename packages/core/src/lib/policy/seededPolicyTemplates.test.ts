import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { policyTemplates, type InsertPolicyTemplate } from "../../schema";
import {
  SEEDED_SYSTEM_POLICY_TEMPLATE_IDS,
  defaultPolicyTemplates,
  drizzlePolicyTemplateStore,
  ensurePolicyTemplatesSeeded,
  isUnpublishedSeededSystemTemplate,
  seededSystemTemplateRepairCondition,
  type PolicyTemplateVisibility,
  type PolicyTemplateVisibilityStore,
} from "./seededPolicyTemplates";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../../");

type StoredTemplate = PolicyTemplateVisibility & {
  name: string;
  content: string | null;
  frameworks: string[] | null;
  sections: unknown;
};

/**
 * Same visibility rule as `policyTemplates.list`: public, owned by the caller,
 * or tagged with the workspace id the caller passed. Null owner and null
 * workspace are not enough.
 */
function visibleInPolicyTemplateList(
  row: Pick<PolicyTemplateVisibility, "isPublic" | "ownerId" | "clientId">,
  userId: number,
  clientId?: number,
): boolean {
  return row.isPublic === true
    || row.ownerId === userId
    || (clientId != null && row.clientId === clientId);
}

function memoryStore(initial: StoredTemplate[]) {
  const rows = initial.map((row) => ({
    ...row,
    frameworks: row.frameworks ? [...row.frameworks] : row.frameworks,
  }));
  let nextId = rows.reduce((max, row) => Math.max(max, row.id), 0) + 1;
  const insertedBatches: InsertPolicyTemplate[][] = [];
  const publishedIds: number[][] = [];

  const store: PolicyTemplateVisibilityStore = {
    async countTemplates() {
      return rows.length;
    },
    async insertTemplates(values) {
      insertedBatches.push(values.map((value) => ({ ...value })));
      for (const value of values) {
        rows.push({
          id: nextId++,
          templateId: value.templateId,
          name: value.name,
          content: value.content ?? null,
          ownerId: value.ownerId ?? null,
          clientId: value.clientId ?? null,
          isPublic: value.isPublic ?? null,
          frameworks: value.frameworks ? [...value.frameworks] : null,
          sections: value.sections,
        });
      }
    },
    async listVisibility() {
      return rows.map((row) => ({
        id: row.id,
        templateId: row.templateId,
        ownerId: row.ownerId,
        clientId: row.clientId,
        isPublic: row.isPublic,
      }));
    },
    async markPublicByIds(ids) {
      publishedIds.push([...ids]);
      const repaired: string[] = [];
      for (const row of rows) {
        if (!ids.includes(row.id)) continue;
        row.isPublic = true;
        repaired.push(row.templateId);
      }
      return repaired;
    },
  };

  return { rows, insertedBatches, publishedIds, store };
}

function snapshot(rows: StoredTemplate[]) {
  return rows.map((row) => ({
    id: row.id,
    templateId: row.templateId,
    name: row.name,
    content: row.content,
    ownerId: row.ownerId,
    clientId: row.clientId,
    isPublic: row.isPublic,
    frameworks: row.frameworks,
    sections: row.sections,
  }));
}

describe("default policy templates", () => {
  it("ships the six system templates as public, with no owner and no workspace", () => {
    const templates = defaultPolicyTemplates();

    expect(templates.map((template) => template.templateId)).toEqual([
      ...SEEDED_SYSTEM_POLICY_TEMPLATE_IDS,
    ]);
    expect(templates.map((template) => template.name)).toEqual([
      "Information Security Policy",
      "Access Control Policy",
      "Incident Response Policy",
      "Vendor Risk Management Policy",
      "Business Continuity Policy",
      "NIS2 Incident Notification Policy",
    ]);
    for (const template of templates) {
      expect(template.isPublic).toBe(true);
      expect(template.ownerId).toBeNull();
      expect(template.clientId).toBeNull();
      expect(template.content).toEqual(expect.any(String));
      expect(template.sections?.length).toBeGreaterThan(0);
    }
    expect(templates[0]?.content).toContain("[COMPANY NAME]");
    expect(templates[4]?.frameworks).toEqual(["ISO 27001", "NIS2"]);
  });
});

describe("ensurePolicyTemplatesSeeded", () => {
  it("inserts public system templates on an empty library and does not rewrite them on the next start", async () => {
    const handle = memoryStore([]);

    const first = await ensurePolicyTemplatesSeeded(handle.store);
    const afterFirst = snapshot(handle.rows);

    expect(first.inserted).toBe(6);
    expect(first.repaired).toEqual([]);
    expect(handle.insertedBatches).toHaveLength(1);
    expect(handle.insertedBatches[0]?.every((row) => row.isPublic === true)).toBe(true);
    expect(handle.insertedBatches[0]?.every((row) => row.ownerId == null && row.clientId == null)).toBe(true);
    expect(handle.publishedIds).toEqual([]);
    expect(handle.rows).toHaveLength(6);
    for (const row of handle.rows) {
      expect(visibleInPolicyTemplateList(row, 42)).toBe(true);
    }

    const second = await ensurePolicyTemplatesSeeded(handle.store);

    expect(second).toEqual({ inserted: 0, repaired: [] });
    expect(handle.insertedBatches).toHaveLength(1);
    expect(handle.publishedIds).toEqual([]);
    expect(snapshot(handle.rows)).toEqual(afterFirst);
  });

  it("publishes broken seeded rows on the next start without reseeding or touching user templates", async () => {
    const customizedSections = [{ id: "purpose", title: "Purpose", content: "kept", optional: false, defaultEnabled: true }];
    const handle = memoryStore([
      {
        id: 1,
        templateId: "POL-001",
        name: "Information Security Policy (edited)",
        content: "USER EDITED CONTENT",
        ownerId: null,
        clientId: null,
        isPublic: false,
        frameworks: ["ISO 27001", "Custom"],
        sections: customizedSections,
      },
      {
        id: 2,
        templateId: "POL-002",
        name: "Access Control Policy",
        content: "original",
        ownerId: null,
        clientId: null,
        isPublic: null,
        frameworks: ["ISO 27001"],
        sections: [],
      },
      {
        id: 3,
        templateId: "POL-003",
        name: "Incident Response Policy",
        content: "owned copy",
        ownerId: 7,
        clientId: null,
        isPublic: false,
        frameworks: ["SOC 2"],
        sections: [],
      },
      {
        id: 4,
        templateId: "POL-004",
        name: "Vendor Risk Management Policy",
        content: "workspace copy",
        ownerId: null,
        clientId: 3,
        isPublic: false,
        frameworks: ["SOC 2"],
        sections: [],
      },
      {
        id: 5,
        templateId: "POL-005",
        name: "Business Continuity Policy",
        content: "already shared",
        ownerId: null,
        clientId: null,
        isPublic: true,
        frameworks: ["ISO 27001", "NIS2"],
        sections: [],
      },
      {
        id: 6,
        templateId: "POL-006",
        name: "NIS2 Incident Notification Policy",
        content: "hidden system row",
        ownerId: null,
        clientId: null,
        isPublic: false,
        frameworks: ["NIS2"],
        sections: [],
      },
      {
        id: 7,
        templateId: "tpl_private_ownerless",
        name: "My private draft",
        content: "do not publish",
        ownerId: null,
        clientId: null,
        isPublic: false,
        frameworks: ["ISO 27001"],
        sections: [{ id: "secret", title: "Secret", content: "stay", optional: true, defaultEnabled: false }],
      },
      {
        id: 8,
        templateId: "POL-0010",
        name: "Looks similar",
        content: "prefix must not match",
        ownerId: null,
        clientId: null,
        isPublic: false,
        frameworks: null,
        sections: [],
      },
      {
        id: 9,
        templateId: "tpl_owned",
        name: "Owned private",
        content: "mine",
        ownerId: 4,
        clientId: 8,
        isPublic: false,
        frameworks: null,
        sections: [],
      },
    ]);
    const before = snapshot(handle.rows);

    const outcome = await ensurePolicyTemplatesSeeded(handle.store);

    expect(outcome.inserted).toBe(0);
    expect(outcome.repaired).toEqual(["POL-001", "POL-002", "POL-006"]);
    expect(handle.insertedBatches).toEqual([]);
    expect(handle.publishedIds).toEqual([[1, 2, 6]]);
    expect(handle.rows).toHaveLength(before.length);

    const byId = new Map(handle.rows.map((row) => [row.id, row]));
    for (const original of before) {
      const current = byId.get(original.id);
      expect(current).toBeDefined();
      expect(current).toMatchObject({
        templateId: original.templateId,
        name: original.name,
        content: original.content,
        ownerId: original.ownerId,
        clientId: original.clientId,
        frameworks: original.frameworks,
        sections: original.sections,
      });
    }
    expect(byId.get(1)?.isPublic).toBe(true);
    expect(byId.get(2)?.isPublic).toBe(true);
    expect(byId.get(6)?.isPublic).toBe(true);
    expect(byId.get(3)?.isPublic).toBe(false);
    expect(byId.get(4)?.isPublic).toBe(false);
    expect(byId.get(5)?.isPublic).toBe(true);
    expect(byId.get(7)?.isPublic).toBe(false);
    expect(byId.get(8)?.isPublic).toBe(false);
    expect(byId.get(9)?.isPublic).toBe(false);

    const viewerId = 42;
    for (const templateId of ["POL-001", "POL-002", "POL-005", "POL-006"]) {
      expect(visibleInPolicyTemplateList(byId.get(
        before.find((row) => row.templateId === templateId)!.id,
      )!, viewerId)).toBe(true);
    }
    expect(visibleInPolicyTemplateList(byId.get(3)!, viewerId)).toBe(false);
    expect(visibleInPolicyTemplateList(byId.get(3)!, 7)).toBe(true);
    expect(visibleInPolicyTemplateList(byId.get(4)!, viewerId)).toBe(false);
    expect(visibleInPolicyTemplateList(byId.get(4)!, viewerId, 3)).toBe(true);
    expect(visibleInPolicyTemplateList(byId.get(4)!, viewerId, 9)).toBe(false);
    expect(visibleInPolicyTemplateList(byId.get(7)!, viewerId)).toBe(false);
    expect(visibleInPolicyTemplateList(byId.get(7)!, viewerId, 1)).toBe(false);
    expect(visibleInPolicyTemplateList(byId.get(8)!, viewerId)).toBe(false);
    expect(visibleInPolicyTemplateList(byId.get(9)!, viewerId, 8)).toBe(true);
    expect(visibleInPolicyTemplateList(byId.get(9)!, viewerId)).toBe(false);

    const afterRepair = snapshot(handle.rows);
    const again = await ensurePolicyTemplatesSeeded(handle.store);
    expect(again).toEqual({ inserted: 0, repaired: [] });
    expect(handle.publishedIds).toEqual([[1, 2, 6]]);
    expect(handle.insertedBatches).toEqual([]);
    expect(snapshot(handle.rows)).toEqual(afterRepair);
  });

  it("does not treat an ownerless private template as a system template", () => {
    expect(isUnpublishedSeededSystemTemplate({
      id: 1,
      templateId: "tpl_user",
      ownerId: null,
      clientId: null,
      isPublic: false,
    })).toBe(false);
    expect(isUnpublishedSeededSystemTemplate({
      id: 2,
      templateId: "POL-001",
      ownerId: 5,
      clientId: null,
      isPublic: false,
    })).toBe(false);
    expect(isUnpublishedSeededSystemTemplate({
      id: 3,
      templateId: "POL-001",
      ownerId: null,
      clientId: 5,
      isPublic: false,
    })).toBe(false);
    expect(isUnpublishedSeededSystemTemplate({
      id: 4,
      templateId: "POL-001",
      ownerId: null,
      clientId: null,
      isPublic: true,
    })).toBe(false);
    expect(isUnpublishedSeededSystemTemplate({
      id: 5,
      templateId: "POL-001",
      ownerId: null,
      clientId: null,
      isPublic: false,
    })).toBe(true);
  });
});

describe("drizzle policy template repair", () => {
  it("updates only is_public, and only for the system-template predicate", async () => {
    const update = vi.fn();
    let captured: { values: { isPublic: boolean }; condition: unknown } | undefined;
    update.mockImplementation(() => ({
      set: (values: { isPublic: boolean }) => ({
        where: (condition: unknown) => ({
          returning: () => {
            captured = { values, condition };
            return Promise.resolve([{ templateId: "POL-001" }]);
          },
        }),
      }),
    }));

    const store = drizzlePolicyTemplateStore({ update } as never);
    const repaired = await store.markPublicByIds([11, 12]);

    expect(repaired).toEqual(["POL-001"]);
    expect(update).toHaveBeenCalledTimes(1);
    expect(captured?.values).toEqual({ isPublic: true });

    const dialect = new PgDialect();
    const compiled = dialect.sqlToQuery(dialect.buildUpdateQuery({
      table: policyTemplates,
      set: captured!.values,
      where: captured!.condition as ReturnType<typeof seededSystemTemplateRepairCondition>,
    }));
    const sqlText = compiled.sql.toLowerCase();
    const whereAt = sqlText.indexOf(" where ");
    expect(whereAt).toBeGreaterThan(0);
    const setClause = sqlText.slice(0, whereAt);
    const whereClause = sqlText.slice(whereAt);

    expect(setClause).toContain("is_public");
    expect(setClause).not.toMatch(/content|sections|frameworks|owner_id|client_id|template_id|"name"/);
    expect(whereClause).toContain("template_id");
    expect(whereClause).toContain("owner_id");
    expect(whereClause).toContain("client_id");
    expect(whereClause).toContain("is null");
    expect(whereClause).toContain("is_public");
    expect(sqlText).not.toMatch(/\b(delete|truncate|drop)\b/);

    const stringParams = compiled.params.filter((param): param is string => typeof param === "string");
    expect(stringParams).toEqual([...SEEDED_SYSTEM_POLICY_TEMPLATE_IDS]);
    expect(compiled.params).toContain(true);
    expect(compiled.params).toContain(false);
    expect(compiled.params).toContain(11);
    expect(compiled.params).toContain(12);
    expect(compiled.params).not.toContain("POL-0010");
    expect(compiled.params).not.toContain("tpl_private_ownerless");
  });

  it("does not issue an update when there is nothing to repair", async () => {
    const update = vi.fn();
    const store = drizzlePolicyTemplateStore({ update } as never);
    await expect(store.markPublicByIds([])).resolves.toEqual([]);
    expect(update).not.toHaveBeenCalled();
  });

  it("treats a string count from postgres as a number so a non-empty library is not reseeded", async () => {
    const select = vi.fn()
      .mockImplementationOnce(() => ({ from: () => Promise.resolve([{ count: "2" }]) }))
      .mockImplementationOnce(() => ({
        from: () => Promise.resolve([
          { id: 1, templateId: "POL-001", ownerId: null, clientId: null, isPublic: false },
          { id: 2, templateId: "tpl_user", ownerId: null, clientId: null, isPublic: false },
        ]),
      }));
    const insert = vi.fn();
    let capturedCondition: unknown;
    const update = vi.fn(() => ({
      set: (values: { isPublic: boolean }) => ({
        where: (condition: unknown) => ({
          returning: () => {
            capturedCondition = condition;
            expect(values).toEqual({ isPublic: true });
            return Promise.resolve([{ templateId: "POL-001" }]);
          },
        }),
      }),
    }));
    const store = drizzlePolicyTemplateStore({ select, insert, update } as never);

    const outcome = await ensurePolicyTemplatesSeeded(store);

    expect(outcome).toEqual({ inserted: 0, repaired: ["POL-001"] });
    expect(insert).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledTimes(1);
    const compiled = new PgDialect().sqlToQuery(
      capturedCondition as ReturnType<typeof seededSystemTemplateRepairCondition>,
    );
    expect(compiled.params).toContain(1);
    expect(compiled.params).not.toContain(2);
    expect(compiled.params.filter((param) => typeof param === "string")).toEqual([
      ...SEEDED_SYSTEM_POLICY_TEMPLATE_IDS,
    ]);
  });

  it("keeps the repair condition aligned with the unpublished-system predicate", () => {
    const condition = seededSystemTemplateRepairCondition();
    const compiled = new PgDialect().sqlToQuery(condition);
    const text = compiled.sql.toLowerCase();

    expect(text).toContain("template_id");
    expect(text).toContain("owner_id");
    expect(text).toContain("client_id");
    expect(text).toContain("is null");
    expect(text).toContain("is_public");
    expect(compiled.params.filter((param) => typeof param === "string")).toEqual([
      ...SEEDED_SYSTEM_POLICY_TEMPLATE_IDS,
    ]);
    expect(compiled.params).toContain(false);
    expect(compiled.params).not.toContain(true);
  });
});

describe("boot path", () => {
  it("runs the correction from container start and does not depend on migration files", () => {
    const dockerfile = readFileSync(path.join(repoRoot, "Dockerfile"), "utf8");
    const entrypoint = readFileSync(path.join(repoRoot, "docker/entrypoint.sh"), "utf8");
    const bootstrap = readFileSync(path.join(repoRoot, "docker/bootstrap.ts"), "utf8");
    const dbSource = readFileSync(path.join(repoRoot, "packages/core/src/db.ts"), "utf8");
    const router = readFileSync(
      path.join(repoRoot, "packages/core/src/server/routers/policyTemplates.ts"),
      "utf8",
    );

    expect(dockerfile).toContain('ENTRYPOINT ["docker/entrypoint.sh"]');
    expect(entrypoint).toContain("docker/bootstrap.ts");

    const mainBody = bootstrap.slice(bootstrap.indexOf("async function main"));
    expect(mainBody).toContain("await ensureDefaultDataSeeded()");
    expect(mainBody).not.toMatch(/migrate\(/);
    expect(bootstrap).toContain("to_regclass('public.users')");
    expect(bootstrap).toContain("Schema already present");
    expect(bootstrap).not.toContain("packages/core/drizzle");
    expect(bootstrap).not.toContain("packages/core/migrations");

    expect(dbSource).toContain("ensurePolicyTemplatesSeeded(drizzlePolicyTemplateStore(db))");
    expect(dbSource).not.toContain('templateId: "POL-001"');

    const listSource = router.slice(
      router.indexOf("list: publicProcedure"),
      router.indexOf("get: publicProcedure"),
    );
    expect(listSource).toContain("eq(policyTemplates.isPublic, true)");
    expect(listSource).toContain("eq(policyTemplates.ownerId, ctx.user.id)");
    expect(listSource).toContain("eq(policyTemplates.clientId, input.clientId)");
    expect(listSource).not.toMatch(/isNull\(policyTemplates\.ownerId\)|owner_id is null/i);
  });
});

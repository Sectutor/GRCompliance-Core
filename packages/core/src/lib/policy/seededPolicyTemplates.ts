import { type SQL, and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { policyTemplates, type InsertPolicyTemplate } from "../../schema";

/**
 * Global templates shipped with a fresh install.
 *
 * `policyTemplates.list` keeps a row when it is public, owned by the caller,
 * or tied to the requested workspace. These six rows are global, so they have
 * to be public to appear. Rows outside this id list are never modified.
 */
export const SEEDED_SYSTEM_POLICY_TEMPLATE_IDS = [
  "POL-001",
  "POL-002",
  "POL-003",
  "POL-004",
  "POL-005",
  "POL-006",
] as const;

export type SeededSystemPolicyTemplateId = (typeof SEEDED_SYSTEM_POLICY_TEMPLATE_IDS)[number];

const SEEDED_SYSTEM_POLICY_TEMPLATE_ID_SET = new Set<string>(SEEDED_SYSTEM_POLICY_TEMPLATE_IDS);

export type PolicyTemplateVisibility = {
  id: number;
  templateId: string;
  ownerId: number | null;
  clientId: number | null;
  isPublic: boolean | null;
};

const standardSections = [
  { id: "purpose", title: "Purpose", content: "", optional: false, defaultEnabled: true },
  { id: "scope", title: "Scope", content: "", optional: false, defaultEnabled: true },
  { id: "statement", title: "Policy Statement", content: "", optional: false, defaultEnabled: true },
  { id: "procedures", title: "Procedures", content: "", optional: false, defaultEnabled: true },
  { id: "approval", title: "Review & Approval", content: "", optional: false, defaultEnabled: true },
];

/**
 * Catalog inserted only when the template table is empty.
 * `isPublic` is set explicitly because the column defaults to false.
 */
export function defaultPolicyTemplates(): InsertPolicyTemplate[] {
  return [
    {
      templateId: "POL-001",
      name: "Information Security Policy",
      frameworks: ["ISO 27001"],
      ownerId: null,
      clientId: null,
      isPublic: true,
      sections: [
        { id: "purpose", title: "Purpose", content: "", optional: false, defaultEnabled: true },
        { id: "scope", title: "Scope", content: "", optional: false, defaultEnabled: true },
        { id: "roles", title: "Roles & Responsibilities", content: "", optional: false, defaultEnabled: true },
        { id: "statement", title: "Policy Statement", content: "", optional: false, defaultEnabled: true },
        { id: "procedures", title: "Procedures", content: "", optional: false, defaultEnabled: true },
        { id: "approval", title: "Review & Approval", content: "", optional: false, defaultEnabled: true },
      ],
      content: "[COMPANY NAME] establishes an Information Security Policy to protect information assets.",
    },
    {
      templateId: "POL-002",
      name: "Access Control Policy",
      frameworks: ["ISO 27001"],
      ownerId: null,
      clientId: null,
      isPublic: true,
      sections: standardSections.map((section) => ({ ...section })),
      content: "Access to systems and data is granted based on least privilege and business need.",
    },
    {
      templateId: "POL-003",
      name: "Incident Response Policy",
      frameworks: ["SOC 2"],
      ownerId: null,
      clientId: null,
      isPublic: true,
      sections: standardSections.map((section) => ({ ...section })),
      content: "Defines processes to respond to and recover from security incidents.",
    },
    {
      templateId: "POL-004",
      name: "Vendor Risk Management Policy",
      frameworks: ["SOC 2"],
      ownerId: null,
      clientId: null,
      isPublic: true,
      sections: standardSections.map((section) => ({ ...section })),
      content: "Establishes due diligence and monitoring of third-party service providers.",
    },
    {
      templateId: "POL-005",
      name: "Business Continuity Policy",
      frameworks: ["ISO 27001", "NIS2"],
      ownerId: null,
      clientId: null,
      isPublic: true,
      sections: [
        { id: "purpose", title: "Purpose", content: "", optional: false, defaultEnabled: true },
        { id: "scope", title: "Scope", content: "", optional: false, defaultEnabled: true },
        { id: "statement", title: "Policy Statement", content: "", optional: false, defaultEnabled: true },
      ],
      content: "[COMPANY NAME] maintains backups and recovery objectives for essential services.",
    },
    {
      templateId: "POL-006",
      name: "NIS2 Incident Notification Policy",
      frameworks: ["NIS2"],
      ownerId: null,
      clientId: null,
      isPublic: true,
      sections: [
        { id: "purpose", title: "Purpose", content: "", optional: false, defaultEnabled: true },
        { id: "scope", title: "Scope", content: "", optional: false, defaultEnabled: true },
        { id: "statement", title: "Policy Statement", content: "", optional: false, defaultEnabled: true },
      ],
      content: "[COMPANY NAME] notifies the competent authority of significant incidents within the NIS2 time limits.",
    },
  ];
}

/**
 * True only for an unpublished copy of a shipped system template that still
 * has no owner and no workspace. User-created rows, including private rows
 * that happen to have a null owner, do not match.
 */
export function isUnpublishedSeededSystemTemplate(row: PolicyTemplateVisibility): boolean {
  return SEEDED_SYSTEM_POLICY_TEMPLATE_ID_SET.has(row.templateId)
    && row.ownerId == null
    && row.clientId == null
    && row.isPublic !== true;
}

/**
 * SQL form of {@link isUnpublishedSeededSystemTemplate}. Both gates are applied
 * on update so a drift in either direction does not publish a user template.
 */
export function seededSystemTemplateRepairCondition(): SQL {
  const condition = and(
    inArray(policyTemplates.templateId, [...SEEDED_SYSTEM_POLICY_TEMPLATE_IDS]),
    isNull(policyTemplates.ownerId),
    isNull(policyTemplates.clientId),
    or(eq(policyTemplates.isPublic, false), isNull(policyTemplates.isPublic)),
  );
  if (!condition) {
    throw new Error("seeded policy template repair filter is empty");
  }
  return condition;
}

export type PolicyTemplateVisibilityStore = {
  countTemplates(): Promise<number>;
  insertTemplates(rows: InsertPolicyTemplate[]): Promise<void>;
  listVisibility(): Promise<PolicyTemplateVisibility[]>;
  /**
   * Sets `is_public` on the given ids. Implementations must also require the
   * system-template repair condition so an unexpected id cannot publish a
   * user-owned or workspace-scoped template.
   */
  markPublicByIds(ids: number[]): Promise<string[]>;
};

export type PolicyTemplateSeedOutcome = {
  inserted: number;
  repaired: string[];
};

/**
 * Inserts the catalog only when the table is empty, then publishes broken
 * system rows. A second call inserts nothing and rewrites nothing that is
 * already public. Content, name, frameworks, and ownership are never updated.
 */
export async function ensurePolicyTemplatesSeeded(
  store: PolicyTemplateVisibilityStore,
): Promise<PolicyTemplateSeedOutcome> {
  const count = await store.countTemplates();
  let inserted = 0;
  if (!count) {
    const templates = defaultPolicyTemplates();
    await store.insertTemplates(templates);
    inserted = templates.length;
  }

  const rows = await store.listVisibility();
  const toRepair = rows.filter(isUnpublishedSeededSystemTemplate);
  const repaired = toRepair.length === 0
    ? []
    : await store.markPublicByIds(toRepair.map((row) => row.id));
  return { inserted, repaired };
}

type TemplateSeedExecutor = {
  select: (shape: Record<string, unknown>) => { from: (table: unknown) => Promise<unknown> };
  insert: (table: unknown) => { values: (rows: InsertPolicyTemplate[]) => Promise<unknown> };
  update: (table: unknown) => {
    set: (values: { isPublic: true }) => {
      where: (condition: SQL) => {
        returning: (shape: Record<string, unknown>) => Promise<Array<{ templateId: string }>>;
      };
    };
  };
};

export function drizzlePolicyTemplateStore(db: TemplateSeedExecutor): PolicyTemplateVisibilityStore {
  return {
    async countTemplates() {
      const rows = await db
        .select({ count: sql<number>`count(*)` })
        .from(policyTemplates) as Array<{ count: number | string | null }>;
      return Number(rows[0]?.count ?? 0);
    },
    async insertTemplates(rows) {
      if (rows.length === 0) return;
      await db.insert(policyTemplates).values(rows);
    },
    async listVisibility() {
      const rows = await db.select({
        id: policyTemplates.id,
        templateId: policyTemplates.templateId,
        ownerId: policyTemplates.ownerId,
        clientId: policyTemplates.clientId,
        isPublic: policyTemplates.isPublic,
      }).from(policyTemplates);
      return rows as PolicyTemplateVisibility[];
    },
    async markPublicByIds(ids) {
      if (ids.length === 0) return [];
      const scoped = and(inArray(policyTemplates.id, ids), seededSystemTemplateRepairCondition());
      if (!scoped) return [];
      const updated = await db.update(policyTemplates)
        .set({ isPublic: true })
        .where(scoped)
        .returning({ templateId: policyTemplates.templateId });
      return updated.map((row) => row.templateId);
    },
  };
}

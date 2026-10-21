import { beforeEach, describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import { PUBLISH_REQUIRES_APPROVAL_MESSAGE } from "../../lib/policy/policyVersions";

const harness = vi.hoisted(() => {
  const state = {
    policy: null as any,
    versions: [] as Array<{ id: number; clientPolicyId: number; version: string; status: string | null; content?: string }>,
    updates: [] as any[],
    versionInserts: [] as any[],
    publishSets: [] as any[],
    nextId: 1,
  };

  const dbConn = {
    query: {
      clientPolicies: {
        findFirst: async () => state.policy,
      },
    },
    select: (shape?: Record<string, unknown>) => ({
      from: () => ({
        where: async () => {
          const keys = shape ? Object.keys(shape) : [];
          if (keys.includes("status") && keys.includes("id")) {
            return state.versions
              .filter((version) => version.clientPolicyId === state.policy?.id)
              .map((version) => ({ id: version.id, status: version.status }));
          }
          return [];
        },
      }),
    }),
    insert: () => ({
      values: async (row: any) => {
        const stored = { id: state.nextId++, ...row };
        state.versionInserts.push({ ...stored });
        state.versions.push(stored);
        return stored;
      },
    }),
    update: () => ({
      set: (values: any) => ({
        where: async () => {
          state.publishSets.push({ ...values });
          if (state.policy) Object.assign(state.policy, values);
        },
      }),
    }),
  };

  return { state, dbConn };
});

vi.mock("../../db", () => ({
  getDb: vi.fn(async () => harness.dbConn),
  getClientPolicyById: vi.fn(async (id: number) => {
    if (!harness.state.policy || harness.state.policy.id !== id) return undefined;
    return { clientPolicy: harness.state.policy };
  }),
  updateClientPolicy: vi.fn(async (_id: number, data: any) => {
    harness.state.updates.push(data);
  }),
}));

vi.mock("../../lib/audit", () => ({
  logActivity: vi.fn(async () => undefined),
}));

vi.mock("../../lib/notificationService", () => ({
  notifyUsers: vi.fn(async () => undefined),
}));

vi.mock("../../lib/email/service", () => ({
  EmailService: { send: vi.fn(async () => undefined) },
}));

vi.mock("../../lib/policy/policy-generation", () => ({
  policyGenerator: {},
}));

import { createClientPoliciesRouter } from "./clientPolicies";

const procedure = () => ({
  input: () => ({
    query: (handler: any) => handler,
    mutation: (handler: any) => handler,
  }),
});

const router = createClientPoliciesRouter(
  { router: (handlers: any) => handlers },
  procedure(),
  procedure(),
  procedure(),
  procedure(),
);

const ctx = { user: { id: 9, name: "Alex Morgan" } };

function policy(overrides: Record<string, unknown> = {}) {
  return {
    id: 4,
    clientId: 1,
    name: "Access Control",
    content: "<p>Body</p>",
    status: "draft",
    approvalStatus: "pending",
    version: 1,
    nextReviewDate: new Date("2027-10-21T00:00:00.000Z"),
    reviewDueDate: new Date("2026-11-01T00:00:00.000Z"),
    ...overrides,
  };
}

describe("clientPolicies review dates and publish", () => {
  beforeEach(() => {
    harness.state.policy = policy();
    harness.state.versions = [];
    harness.state.updates = [];
    harness.state.versionInserts = [];
    harness.state.publishSets = [];
    harness.state.nextId = 1;
  });

  it("stores a next-review date without changing the request due date", async () => {
    await router.update({
      input: { id: 4, clientId: 1, nextReviewDate: "2028-05-01" },
      ctx,
    });

    expect(harness.state.updates).toHaveLength(1);
    expect(harness.state.updates[0].nextReviewDate.toISOString()).toBe("2028-05-01T00:00:00.000Z");
    expect(harness.state.updates[0]).not.toHaveProperty("reviewDueDate");
    expect(harness.state.policy.reviewDueDate.toISOString()).toBe("2026-11-01T00:00:00.000Z");
  });

  it("stores a request due date without changing the next-review date", async () => {
    await router.update({
      input: { id: 4, clientId: 1, reviewDueDate: "2026-12-15" },
      ctx,
    });

    expect(harness.state.updates[0].reviewDueDate.toISOString()).toBe("2026-12-15T00:00:00.000Z");
    expect(harness.state.updates[0]).not.toHaveProperty("nextReviewDate");
    expect(harness.state.policy.nextReviewDate.toISOString()).toBe("2027-10-21T00:00:00.000Z");
  });

  it("does not change the next-review date when a review is requested with no due date", async () => {
    const nextReview = harness.state.policy.nextReviewDate;

    await router.requestReview({
      input: { id: 4, clientId: 1, reviewers: ["8"] },
      ctx,
    });

    expect(harness.state.updates[0].reviewDueDate).toBeNull();
    expect(harness.state.updates[0]).not.toHaveProperty("nextReviewDate");
    expect(harness.state.updates[0].approvalStatus).toBe("requested");
    expect(harness.state.policy.nextReviewDate).toBe(nextReview);
  });

  it("keeps the next-review date when a review request has its own due date", async () => {
    await router.requestReview({
      input: { id: 4, clientId: 1, reviewers: ["8"], dueDate: "2026-12-01" },
      ctx,
    });

    expect(harness.state.updates[0].reviewDueDate.toISOString()).toBe("2026-12-01T00:00:00.000Z");
    expect(harness.state.updates[0]).not.toHaveProperty("nextReviewDate");
    expect(harness.state.policy.nextReviewDate.toISOString()).toBe("2027-10-21T00:00:00.000Z");
  });

  it("refuses to publish a policy that has not been approved", async () => {
    for (const current of [
      policy({ status: "draft", approvalStatus: "pending" }),
      policy({ status: "review", approvalStatus: "requested" }),
      policy({ status: "draft", approvalStatus: "changes_requested" }),
    ]) {
      harness.state.policy = current;
      harness.state.versionInserts = [];
      harness.state.publishSets = [];

      await expect(router.publish({ input: { id: 4, clientId: 1 }, ctx })).rejects.toMatchObject({
        code: "BAD_REQUEST",
        message: PUBLISH_REQUIRES_APPROVAL_MESSAGE,
      });
      await expect(router.publish({ input: { id: 4, clientId: 1 }, ctx })).rejects.toBeInstanceOf(TRPCError);
    }

    expect(harness.state.versionInserts).toHaveLength(0);
    expect(harness.state.publishSets).toHaveLength(0);
    expect(harness.state.policy.version).toBe(1);
  });

  it("publishes the first version as v1.0 and the next as v2.0", async () => {
    harness.state.policy = policy({ status: "approved", approvalStatus: "approved", version: 1 });

    const first = await router.publish({ input: { id: 4, clientId: 1, notes: "Initial" }, ctx });
    expect(first).toEqual({ success: true, version: "v1.0" });
    expect(harness.state.policy.version).toBe(1);
    expect(harness.state.versionInserts.map((row) => row.version)).toEqual(["v1.0"]);

    const second = await router.publish({ input: { id: 4, clientId: 1 }, ctx });
    expect(second.version).toBe("v2.0");
    expect(harness.state.policy.version).toBe(2);
    expect(harness.state.versions.map((row) => row.version)).toEqual(["v1.0", "v2.0"]);
  });

  it("leaves an existing v2.0 snapshot in place and publishes the next number", async () => {
    const existing = { id: 10, clientPolicyId: 4, version: "v2.0", status: "approved", content: "old" };
    const draftSnapshot = { id: 11, clientPolicyId: 4, version: "v1.0-pre-restore", status: "draft", content: "draft" };
    harness.state.policy = policy({ status: "approved", approvalStatus: "pending", version: 2 });
    harness.state.versions = [existing, draftSnapshot];
    harness.state.nextId = 12;
    const before = structuredClone(harness.state.versions);

    const result = await router.publish({ input: { id: 4, clientId: 1 }, ctx });

    expect(result.version).toBe("v3.0");
    expect(harness.state.policy.version).toBe(3);
    expect(harness.state.versions.filter((row) => row.id === 10 || row.id === 11)).toEqual(before);
    expect(harness.state.versionInserts).toHaveLength(1);
    expect(harness.state.versionInserts[0].version).toBe("v3.0");
    expect(harness.state.publishSets[0]).not.toHaveProperty("nextReviewDate");
    expect(harness.state.publishSets[0]).not.toHaveProperty("reviewDueDate");
  });

  it("does not treat a restore snapshot as an already published version", async () => {
    harness.state.policy = policy({ status: "draft", approvalStatus: "approved", version: 2 });
    harness.state.versions = [
      { id: 11, clientPolicyId: 4, version: "v1.0-pre-restore", status: "draft" },
    ];
    harness.state.nextId = 12;

    const result = await router.publish({ input: { id: 4, clientId: 1 }, ctx });

    expect(result.version).toBe("v2.0");
    expect(harness.state.versions.find((row) => row.id === 11)?.version).toBe("v1.0-pre-restore");
  });
});

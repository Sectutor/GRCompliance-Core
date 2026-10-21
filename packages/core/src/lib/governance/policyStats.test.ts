import { describe, expect, it } from "vitest";
import { policyStatusEnum } from "../../schema";
import {
  APPROVED_POLICY_STATUS,
  HEALTH_SCORE_APPROVED_STATUSES,
  POLICIES_LIST_MODULE,
  approvedPolicyStatusClause,
  policyApprovalStats,
} from "./policyStats";

describe("policyApprovalStats", () => {
  it("matches the policies list instead of reading status on the join wrapper", () => {
    const rows = [
      { clientPolicy: { status: "approved", module: "general" }, template: null },
      { clientPolicy: { status: "approved", module: "general" }, template: null },
      { clientPolicy: { status: "draft", module: "general" }, template: null },
      { clientPolicy: { status: "review", module: "general" }, template: null },
      { clientPolicy: { status: "archived", module: "general" }, template: null },
      { clientPolicy: { status: "approved", module: "privacy" }, template: null },
      { clientPolicy: { status: "approved", module: "cyber" }, template: null },
      { clientPolicy: { status: "approved", module: null }, template: null },
    ];

    const legacy = {
      approved: rows.filter((row) => (row as { status?: string }).status === "approved").length,
      total: rows.length,
    };
    expect(legacy).toEqual({ approved: 0, total: 8 });

    const listed = rows.filter((row) => row.clientPolicy.module === POLICIES_LIST_MODULE);
    expect(policyApprovalStats(rows)).toEqual({
      approved: listed.filter((row) => row.clientPolicy.status === APPROVED_POLICY_STATUS).length,
      total: listed.length,
    });
    expect(policyApprovalStats(rows)).toEqual({ approved: 2, total: 5 });
  });

  it("counts a policy once after review, approval, and publish", () => {
    // submitApproval and publish both persist status 'approved'.
    const policy = { status: "approved", module: "general", name: "Access Control" };
    const listRow = { ...policy, clientPolicy: policy, template: { framework: "ISO" } };
    expect(policyApprovalStats([listRow])).toEqual({ approved: 1, total: 1 });
  });

  it("returns zero when the client has no general policies", () => {
    expect(policyApprovalStats([])).toEqual({ approved: 0, total: 0 });
    expect(policyApprovalStats([
      { clientPolicy: { status: "approved", module: "privacy" }, template: null },
      { clientPolicy: null, template: null },
    ])).toEqual({ approved: 0, total: 0 });
  });

  it("keeps draft, review, and archived general policies in the total only", () => {
    expect(policyApprovalStats([
      { status: "draft", module: "general" },
      { status: "review", module: "general" },
      { status: "archived", module: "general" },
    ])).toEqual({ approved: 0, total: 3 });
  });
});

describe("approved policy status", () => {
  it("uses a policy_status value and does not treat published as approved", () => {
    expect([...policyStatusEnum.enumValues]).toEqual(["draft", "review", "approved", "archived"]);
    expect(policyStatusEnum.enumValues).not.toContain("published");
    expect(policyStatusEnum.enumValues).toContain(APPROVED_POLICY_STATUS);
    expect(HEALTH_SCORE_APPROVED_STATUSES).toEqual(["approved"]);
    expect(approvedPolicyStatusClause()).toBe("status = 'approved'");
    expect(approvedPolicyStatusClause()).not.toContain("published");

    expect(policyApprovalStats([
      { clientPolicy: { status: "published", module: "general" }, template: null },
    ])).toEqual({ approved: 0, total: 1 });
  });
});

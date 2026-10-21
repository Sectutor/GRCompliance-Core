import { describe, expect, it } from "vitest";
import {
  countPublishedVersions,
  isPolicyApprovedForPublish,
  nextPublishedVersion,
  PUBLISH_REQUIRES_APPROVAL_MESSAGE,
} from "./policyVersions";

describe("policy publish versions", () => {
  it("publishes a new policy as v1.0", () => {
    expect(nextPublishedVersion(1, 0)).toEqual({ versionNum: 1, versionLabel: "v1.0" });
    expect(nextPublishedVersion(null, 0)).toEqual({ versionNum: 1, versionLabel: "v1.0" });
    expect(nextPublishedVersion(0, 0)).toEqual({ versionNum: 1, versionLabel: "v1.0" });
  });

  it("increments after the first published snapshot", () => {
    expect(nextPublishedVersion(1, 1)).toEqual({ versionNum: 2, versionLabel: "v2.0" });
    expect(nextPublishedVersion(2, 2)).toEqual({ versionNum: 3, versionLabel: "v3.0" });
  });

  it("does not renumber a history that already starts at v2.0", () => {
    expect(nextPublishedVersion(2, 1)).toEqual({ versionNum: 3, versionLabel: "v3.0" });
  });

  it("keeps a higher working version when nothing has been published yet", () => {
    expect(nextPublishedVersion(5, 0)).toEqual({ versionNum: 5, versionLabel: "v5.0" });
  });

  it("ignores restore snapshots when counting publishes", () => {
    const versions = [
      { clientPolicyId: 4, status: "draft" },
      { clientPolicyId: 4, status: "approved" },
      { clientPolicyId: 9, status: "approved" },
      { clientPolicyId: 4, status: null },
    ];
    expect(countPublishedVersions(versions, 4)).toBe(1);
    expect(countPublishedVersions([{ clientPolicyId: 4, status: "draft" }], 4)).toBe(0);
  });

  it("requires approval the same way the publish button does", () => {
    expect(PUBLISH_REQUIRES_APPROVAL_MESSAGE).toBe("Policy must be approved before publishing.");
    expect(isPolicyApprovedForPublish({ status: "draft", approvalStatus: "pending" })).toBe(false);
    expect(isPolicyApprovedForPublish({ status: "review", approvalStatus: "requested" })).toBe(false);
    expect(isPolicyApprovedForPublish({ status: "draft", approvalStatus: "changes_requested" })).toBe(false);
    expect(isPolicyApprovedForPublish({ status: "archived", approvalStatus: "pending" })).toBe(false);
    expect(isPolicyApprovedForPublish({ status: "approved", approvalStatus: "pending" })).toBe(true);
    expect(isPolicyApprovedForPublish({ status: "draft", approvalStatus: "approved" })).toBe(true);
  });
});

/** Snapshot status written by publish. Restore snapshots use "draft" and are not publishes. */
export const PUBLISHED_VERSION_STATUS = "approved";

export const PUBLISH_REQUIRES_APPROVAL_MESSAGE = "Policy must be approved before publishing.";

/**
 * Same rule as the Publish button: either the policy status or the approval status is approved.
 * Assigned-reviewer checks are intentionally not part of this rule.
 */
export function isPolicyApprovedForPublish(policy: {
  status?: string | null;
  approvalStatus?: string | null;
}): boolean {
  return policy.status === "approved" || policy.approvalStatus === "approved";
}

export function countPublishedVersions(
  versions: Array<{ clientPolicyId: number; status?: string | null }>,
  policyId: number,
): number {
  return versions.filter(
    (version) => version.clientPolicyId === policyId && version.status === PUBLISHED_VERSION_STATUS,
  ).length;
}

/**
 * A new policy's working version is already 1. The first publish keeps that number (v1.0).
 * Later publishes add 1. When published snapshots already exist, their labels are left alone
 * and the next label continues from the current working version.
 */
export function nextPublishedVersion(
  currentVersion: number | null | undefined,
  publishedVersionCount: number,
): { versionNum: number; versionLabel: string } {
  const parsed = Number(currentVersion);
  const current = Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : 1;
  const published = Number.isFinite(publishedVersionCount) && publishedVersionCount > 0
    ? Math.trunc(publishedVersionCount)
    : 0;
  const versionNum = published === 0 ? current : current + 1;
  return { versionNum, versionLabel: `v${versionNum}.0` };
}

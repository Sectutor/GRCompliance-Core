import { bandForScore, canonicalFramework, isPlaceholder } from "./allowed";
import type { TruthFile, WorkspaceDifference, WorkspaceSnapshot } from "./types";

function norm(value: string): string {
  return value.trim().toLowerCase();
}

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const key = value.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(key);
  }
  return result;
}

function truthControlIds(truth: TruthFile): Set<string> {
  const ids = new Set<string>();
  for (const finding of truth.findings) {
    if (!isPlaceholder(finding.control)) ids.add(finding.control.trim());
  }
  for (const item of truth.evidence) {
    for (const control of item.controls) {
      if (!isPlaceholder(control)) ids.add(control.trim());
    }
  }
  return ids;
}

/**
 * Compare a validated truth file with the workspace fields the app already stores.
 * This does not write to the database. Seed quirks show up here as differences
 * when the truth file records the corrected value and the workspace does not.
 */
export function compareTruthFileWithWorkspace(
  truth: TruthFile,
  snapshot: WorkspaceSnapshot,
): WorkspaceDifference[] {
  const differences: WorkspaceDifference[] = [];

  const names = [snapshot.name, snapshot.legalName]
    .filter((value): value is string => !!value && value.trim() !== "")
    .map(norm);
  if (names.length > 0 && !names.includes(norm(truth.client_legal_name))) {
    differences.push({
      code: "name",
      message: `workspace name "${snapshot.name ?? ""}" does not match truth file legal name "${truth.client_legal_name}"`,
    });
  }

  if (
    snapshot.industry &&
    !isPlaceholder(truth.identity.industry) &&
    norm(snapshot.industry) !== norm(truth.identity.industry)
  ) {
    differences.push({
      code: "industry",
      message: `workspace industry "${snapshot.industry}" does not match the truth file industry "${truth.identity.industry}"`,
    });
  }

  const truthFrameworks = new Set<string>();
  for (const id of truth.frameworks) {
    const canonical = canonicalFramework(id);
    if (canonical) truthFrameworks.add(canonical);
  }
  const workspaceFrameworks = new Map<string, string>();
  for (const raw of unique(snapshot.frameworks)) {
    const canonical = canonicalFramework(raw);
    if (!canonical) {
      differences.push({
        code: "framework",
        message: `workspace framework "${raw}" is not a known truth-file framework`,
      });
      continue;
    }
    workspaceFrameworks.set(canonical, raw);
  }
  for (const [canonical, raw] of workspaceFrameworks) {
    if (!truthFrameworks.has(canonical)) {
      differences.push({
        code: "framework",
        message: `workspace framework "${raw}" is not in the truth file frameworks list`,
      });
    }
  }
  for (const canonical of truthFrameworks) {
    if (!workspaceFrameworks.has(canonical)) {
      differences.push({
        code: "framework",
        message: `truth file framework "${canonical}" is not assigned in the workspace`,
      });
    }
  }

  const truthScopeBlank = isPlaceholder(truth.scope.statement);
  const workspaceScopeBlank = isPlaceholder(snapshot.scope);
  if (truthScopeBlank && !workspaceScopeBlank) {
    differences.push({
      code: "scope",
      message: "workspace risk_settings.scope is set and the truth file scope statement is still \"to be added\"",
    });
  } else if (!truthScopeBlank && workspaceScopeBlank) {
    differences.push({
      code: "scope",
      message: "workspace risk_settings.scope is empty and the truth file has a scope statement",
    });
  } else if (
    !truthScopeBlank &&
    !workspaceScopeBlank &&
    norm(truth.scope.statement) !== norm(snapshot.scope ?? "")
  ) {
    differences.push({
      code: "scope",
      message: "workspace risk_settings.scope does not match the truth file scope statement",
    });
  }
  for (const gapScope of snapshot.gapScopes) {
    if (isPlaceholder(gapScope)) continue;
    if (truthScopeBlank || norm(gapScope) !== norm(truth.scope.statement)) {
      differences.push({
        code: "scope",
        message: "a gap assessment scope does not match the truth file scope statement",
      });
    }
  }

  const truthControls = truthControlIds(truth);
  const workspaceControls = new Set(unique(snapshot.gapControlIds));
  for (const id of workspaceControls) {
    if (!truthControls.has(id)) {
      differences.push({
        code: "gap_control",
        message: `gap control "${id}" is in the workspace and is not listed in the truth file`,
      });
    }
  }
  for (const id of truthControls) {
    if (!workspaceControls.has(id)) {
      differences.push({
        code: "gap_control",
        message: `truth file control "${id}" is not in the workspace gap assessment`,
      });
    }
  }

  const roadmapTitle = truth.roadmap.title.trim();
  const roadmapTitles = unique(snapshot.roadmapTitles);
  if (isPlaceholder(roadmapTitle)) {
    for (const title of roadmapTitles) {
      differences.push({
        code: "roadmap",
        message: `roadmap "${title}" is in the workspace and is not the truth-file roadmap title`,
      });
    }
  } else if (roadmapTitles.length === 0) {
    differences.push({
      code: "roadmap",
      message: `truth file roadmap title "${roadmapTitle}" is not in the workspace`,
    });
  } else {
    for (const title of roadmapTitles) {
      if (title !== roadmapTitle) {
        differences.push({
          code: "roadmap",
          message: `roadmap "${title}" is in the workspace and is not the truth-file roadmap title`,
        });
      }
    }
  }

  const truthProcesses = new Set(
    truth.business_continuity.processes
      .map((process) => process.name.trim().toLowerCase())
      .filter((name) => name && !isPlaceholder(name)),
  );
  for (const name of unique(snapshot.businessProcessNames)) {
    if (!truthProcesses.has(name.toLowerCase())) {
      differences.push({
        code: "business_process",
        message: `business process "${name}" is in the workspace and is not listed in the truth file`,
      });
    }
  }
  for (const process of truth.business_continuity.processes) {
    if (isPlaceholder(process.name)) continue;
    const found = snapshot.businessProcessNames.some(
      (name) => name.trim().toLowerCase() === process.name.trim().toLowerCase(),
    );
    if (!found) {
      differences.push({
        code: "business_process",
        message: `truth file business process "${process.name}" is not in the workspace`,
      });
    }
  }

  const risksById = new Map(snapshot.risks.map((risk) => [risk.assessmentId, risk]));
  for (const risk of truth.risk_register.risks) {
    const stored = risksById.get(risk.id);
    if (!stored) {
      differences.push({
        code: "risk_id",
        message: `risk ${risk.id} is in the truth file and not in the workspace`,
      });
      continue;
    }
    const inherent = risk.inherent_likelihood * risk.inherent_impact;
    const residual = risk.residual_likelihood * risk.residual_impact;
    if (stored.inherentScore != null && stored.inherentScore !== inherent) {
      differences.push({
        code: "risk_score",
        message: `risk ${risk.id} inherent score is ${stored.inherentScore} in the workspace and ${inherent} in the truth file`,
      });
    }
    if (stored.residualScore != null && stored.residualScore !== residual) {
      differences.push({
        code: "risk_score",
        message: `risk ${risk.id} residual score is ${stored.residualScore} in the workspace and ${residual} in the truth file`,
      });
    }
  }
  const truthRiskIds = new Set(truth.risk_register.risks.map((risk) => risk.id));
  for (const risk of snapshot.risks) {
    if (!truthRiskIds.has(risk.assessmentId)) {
      differences.push({
        code: "risk_id",
        message: `risk ${risk.assessmentId} is in the workspace and not in the truth file`,
      });
    }
    if (risk.inherentScore != null) {
      const expected = bandForScore(risk.inherentScore, truth.risk_register.bands);
      if (expected && norm(risk.inherentRisk ?? "") !== norm(expected)) {
        differences.push({
          code: "risk_label",
          message: `risk ${risk.assessmentId} inherent score ${risk.inherentScore} is stored as "${risk.inherentRisk ?? ""}"; truth-file band is "${expected}"`,
        });
      }
    }
    if (risk.residualScore != null) {
      const expected = bandForScore(risk.residualScore, truth.risk_register.bands);
      if (expected && norm(risk.residualRisk ?? "") !== norm(expected)) {
        differences.push({
          code: "risk_label",
          message: `risk ${risk.assessmentId} residual score ${risk.residualScore} is stored as "${risk.residualRisk ?? ""}"; truth-file band is "${expected}"`,
        });
      }
    }
  }

  return differences;
}

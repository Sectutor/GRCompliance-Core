import { eq } from "drizzle-orm";
import { getDb } from "../../db";
import {
  businessProcesses,
  clientControls,
  clients,
  controls,
  gapAssessments,
  gapResponses,
  remediationPlans,
  riskAssessments,
  riskSettings,
} from "../../schema";
import type { WorkspaceSnapshot } from "./types";

export interface WorkspaceSelector {
  clientId?: number;
  clientName?: string;
}

/**
 * Read the workspace fields a truth file can be checked against.
 * Does not insert, update, or delete anything.
 */
export async function loadWorkspaceSnapshot(selector: WorkspaceSelector): Promise<WorkspaceSnapshot> {
  if (!selector.clientId && !selector.clientName) {
    throw new Error("Pass a workspace id or a workspace name");
  }

  const db = await getDb();
  const rows = selector.clientId
    ? await db
        .select({
          id: clients.id,
          name: clients.name,
          legalName: clients.legalEntityName,
          industry: clients.industry,
        })
        .from(clients)
        .where(eq(clients.id, selector.clientId))
        .limit(2)
    : await db
        .select({
          id: clients.id,
          name: clients.name,
          legalName: clients.legalEntityName,
          industry: clients.industry,
        })
        .from(clients)
        .where(eq(clients.name, selector.clientName!))
        .limit(2);

  if (rows.length !== 1) {
    const label = selector.clientId ? `id ${selector.clientId}` : `name "${selector.clientName}"`;
    throw new Error(`Expected one workspace with ${label}, found ${rows.length}`);
  }
  const client = rows[0];

  const frameworkRows = await db
    .select({ framework: controls.framework })
    .from(clientControls)
    .innerJoin(controls, eq(clientControls.controlId, controls.id))
    .where(eq(clientControls.clientId, client.id));

  const [settings] = await db
    .select({ scope: riskSettings.scope })
    .from(riskSettings)
    .where(eq(riskSettings.clientId, client.id))
    .limit(1);

  const gapRows = await db
    .select({ scope: gapAssessments.scope, controlId: gapResponses.controlId })
    .from(gapAssessments)
    .leftJoin(gapResponses, eq(gapResponses.assessmentId, gapAssessments.id))
    .where(eq(gapAssessments.clientId, client.id));

  const roadmapRows = await db
    .select({ title: remediationPlans.title })
    .from(remediationPlans)
    .where(eq(remediationPlans.clientId, client.id));

  const processRows = await db
    .select({ name: businessProcesses.name })
    .from(businessProcesses)
    .where(eq(businessProcesses.clientId, client.id));

  const riskRows = await db
    .select({
      assessmentId: riskAssessments.assessmentId,
      inherentScore: riskAssessments.inherentScore,
      residualScore: riskAssessments.residualScore,
      inherentRisk: riskAssessments.inherentRisk,
      residualRisk: riskAssessments.residualRisk,
    })
    .from(riskAssessments)
    .where(eq(riskAssessments.clientId, client.id));

  const gapScopes = new Set<string>();
  const gapControlIds: string[] = [];
  for (const row of gapRows) {
    if (row.scope && row.scope.trim()) gapScopes.add(row.scope.trim());
    if (row.controlId) gapControlIds.push(row.controlId);
  }

  return {
    clientId: client.id,
    name: client.name,
    legalName: client.legalName,
    industry: client.industry,
    frameworks: frameworkRows.map((row) => row.framework).filter((framework): framework is string => !!framework),
    scope: settings?.scope ?? null,
    gapScopes: [...gapScopes],
    gapControlIds,
    roadmapTitles: roadmapRows.map((row) => row.title),
    businessProcessNames: processRows.map((row) => row.name),
    risks: riskRows.map((row) => ({
      assessmentId: row.assessmentId,
      inherentScore: row.inherentScore,
      residualScore: row.residualScore,
      inherentRisk: row.inherentRisk,
      residualRisk: row.residualRisk,
    })),
  };
}

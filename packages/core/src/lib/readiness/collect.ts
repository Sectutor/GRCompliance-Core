import { and, desc, eq, lt } from "drizzle-orm";
import { getDb } from "../../db";
import {
  assets,
  bcPlans,
  businessProcesses,
  certificationAudits,
  clientControls,
  clientPolicies,
  clients,
  cloudAssets,
  controls,
  evidence,
  evidenceRequests,
  gapAssessments,
  gapResponses,
  kris,
  monthlyReadinessReports,
  projectTasks,
  remediationPlans,
  riskAssessments,
  riskSettings,
  roadmapItems,
  vulnerabilities,
  vendorAssessments,
  vendors,
} from "../../schema";
import { reportingPeriod } from "./period";
import type { ReadinessSummary, ReadinessWorkspace } from "./types";

function day(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

export async function collectReadinessWorkspace(clientId: number, asOf = new Date()): Promise<ReadinessWorkspace> {
  const db = await getDb();
  const [client] = await db.select({
    id: clients.id,
    name: clients.name,
    industry: clients.industry,
  }).from(clients).where(eq(clients.id, clientId)).limit(1);
  if (!client) throw new Error(`Workspace ${clientId} was not found`);

  const period = reportingPeriod(asOf);
  const [settings] = await db.select({ scope: riskSettings.scope })
    .from(riskSettings)
    .where(eq(riskSettings.clientId, clientId))
    .limit(1);

  const controlRows = await db.select({ status: clientControls.status, framework: controls.framework })
    .from(clientControls)
    .leftJoin(controls, eq(clientControls.controlId, controls.id))
    .where(eq(clientControls.clientId, clientId)) as { status: string | null; framework: string | null }[];

  const evidenceRows = await db.select({
    evidenceId: evidence.evidenceId,
    status: evidence.status,
    owner: evidence.owner,
    dueDate: evidence.dueDate,
    description: evidence.description,
  }).from(evidence).where(eq(evidence.clientId, clientId)) as {
    evidenceId: string;
    status: string | null;
    owner: string | null;
    dueDate: Date | string | null;
    description: string | null;
  }[];

  const requestRows = await db.select({
    description: evidenceRequests.description,
    status: evidenceRequests.status,
    dueDate: evidenceRequests.dueDate,
  }).from(evidenceRequests).where(eq(evidenceRequests.clientId, clientId)) as {
    description: string | null;
    status: string | null;
    dueDate: Date | string | null;
  }[];

  const riskRows = await db.select({
    assessmentId: riskAssessments.assessmentId,
    title: riskAssessments.title,
    inherentScore: riskAssessments.inherentScore,
    residualScore: riskAssessments.residualScore,
    inherentRisk: riskAssessments.inherentRisk,
    residualRisk: riskAssessments.residualRisk,
    owner: riskAssessments.riskOwner,
    treatment: riskAssessments.treatmentOption,
    status: riskAssessments.status,
  }).from(riskAssessments).where(eq(riskAssessments.clientId, clientId)) as {
    assessmentId: string;
    title: string | null;
    inherentScore: number | null;
    residualScore: number | null;
    inherentRisk: string | null;
    residualRisk: string | null;
    owner: string | null;
    treatment: string | null;
    status: string | null;
  }[];

  const gapRows = await db.select({
    controlId: gapResponses.controlId,
    status: gapResponses.currentStatus,
    severity: gapResponses.gapSeverity,
    notes: gapResponses.notes,
  }).from(gapResponses)
    .innerJoin(gapAssessments, eq(gapResponses.assessmentId, gapAssessments.id))
    .where(eq(gapAssessments.clientId, clientId)) as {
    controlId: string;
    status: string | null;
    severity: string | null;
    notes: string | null;
  }[];

  const kriRows = await db.select({
    name: kris.name,
    value: kris.currentValue,
    status: kris.currentStatus,
    green: kris.thresholdGreen,
  }).from(kris).where(eq(kris.clientId, clientId)) as {
    name: string;
    value: string | null;
    status: string | null;
    green: string | null;
  }[];

  const auditRows = await db.select({
    firm: certificationAudits.auditFirm,
    auditor: certificationAudits.auditorName,
    status: certificationAudits.status,
    stage: certificationAudits.stage,
  }).from(certificationAudits).where(eq(certificationAudits.clientId, clientId)) as {
    firm: string | null;
    auditor: string | null;
    status: string | null;
    stage: string | null;
  }[];

  const vendorRows = await db.select({
    name: vendors.name,
    criticality: vendors.criticality,
    service: vendors.description,
    assessmentType: vendorAssessments.type,
    assessmentStatus: vendorAssessments.status,
    assessmentScore: vendorAssessments.score,
  }).from(vendors)
    .leftJoin(vendorAssessments, eq(vendorAssessments.vendorId, vendors.id))
    .where(eq(vendors.clientId, clientId)) as {
    name: string;
    criticality: string | null;
    service: string | null;
    assessmentType: string | null;
    assessmentStatus: string | null;
    assessmentScore: number | null;
  }[];

  const assetRows = await db.select({
    name: assets.name,
    type: assets.type,
    c: assets.valuationC,
    i: assets.valuationI,
    a: assets.valuationA,
  }).from(assets).where(eq(assets.clientId, clientId)) as {
    name: string;
    type: string | null;
    c: number | null;
    i: number | null;
    a: number | null;
  }[];

  const cloudRows = await db.select({
    name: cloudAssets.name,
    type: cloudAssets.assetType,
    complianceStatus: cloudAssets.complianceStatus,
  }).from(cloudAssets).where(eq(cloudAssets.clientId, clientId)) as {
    name: string | null;
    type: string | null;
    complianceStatus: string | null;
  }[];

  const taskRows = await db.select({
    title: projectTasks.title,
    status: projectTasks.status,
    priority: projectTasks.priority,
    dueDate: projectTasks.dueDate,
  }).from(projectTasks).where(eq(projectTasks.clientId, clientId)) as {
    title: string;
    status: string | null;
    priority: string | null;
    dueDate: Date | string | null;
  }[];

  const roadmapRows = await db.select({
    roadmapTitle: remediationPlans.title,
    title: roadmapItems.title,
    status: roadmapItems.status,
  }).from(roadmapItems)
    .innerJoin(remediationPlans, eq(roadmapItems.planId, remediationPlans.id))
    .where(eq(remediationPlans.clientId, clientId)) as {
    roadmapTitle: string;
    title: string;
    status: string | null;
  }[];

  const policyRows = await db.select({ name: clientPolicies.name })
    .from(clientPolicies)
    .where(eq(clientPolicies.clientId, clientId)) as { name: string }[];

  const vulnRows = await db.select({
    id: vulnerabilities.vulnerabilityId,
    name: vulnerabilities.name,
    status: vulnerabilities.status,
  }).from(vulnerabilities).where(eq(vulnerabilities.clientId, clientId)) as {
    id: string | null;
    name: string;
    status: string | null;
  }[];

  const planRows = await db.select({
    title: bcPlans.title,
    version: bcPlans.version,
    status: bcPlans.status,
  }).from(bcPlans).where(eq(bcPlans.clientId, clientId)) as {
    title: string;
    version: string | null;
    status: string | null;
  }[];

  const processRows = await db.select({
    name: businessProcesses.name,
    description: businessProcesses.description,
    rto: businessProcesses.rto,
    rpo: businessProcesses.rpo,
    tier: businessProcesses.criticalityTier,
  }).from(businessProcesses).where(eq(businessProcesses.clientId, clientId)) as {
    name: string;
    description: string | null;
    rto: string | null;
    rpo: string | null;
    tier: string | null;
  }[];

  const [previous] = await db.select({
    periodEnd: monthlyReadinessReports.periodEnd,
    summary: monthlyReadinessReports.summary,
  }).from(monthlyReadinessReports)
    .where(and(
      eq(monthlyReadinessReports.clientId, clientId),
      lt(monthlyReadinessReports.periodEnd, period.start),
    ))
    .orderBy(desc(monthlyReadinessReports.periodEnd))
    .limit(1);

  const frameworks = [...new Set(controlRows.map((row) => row.framework).filter((framework): framework is string => !!framework))];

  return {
    clientId: client.id,
    name: client.name,
    industry: client.industry,
    asOf: period.asOf,
    frameworks,
    scope: settings?.scope ?? null,
    controls: controlRows.map((row) => ({ status: row.status })),
    evidence: evidenceRows.map((row) => ({
      evidenceId: row.evidenceId,
      status: row.status,
      owner: row.owner,
      dueDate: day(row.dueDate),
      description: row.description,
    })),
    evidenceRequests: requestRows.map((row) => ({
      description: row.description,
      status: row.status,
      dueDate: day(row.dueDate),
    })),
    risks: riskRows.map((row) => ({
      assessmentId: row.assessmentId,
      title: row.title,
      inherentScore: row.inherentScore,
      residualScore: row.residualScore,
      inherentRisk: row.inherentRisk,
      residualRisk: row.residualRisk,
      owner: row.owner,
      treatment: row.treatment,
      status: row.status,
    })),
    gaps: gapRows.map((row) => ({
      controlId: row.controlId,
      status: row.status,
      severity: row.severity,
      notes: row.notes,
    })),
    kris: kriRows,
    audits: auditRows,
    vendors: vendorRows.map((row) => ({
      name: row.name,
      criticality: row.criticality,
      service: row.service,
      assessment: row.assessmentType
        ? `${row.assessmentType}, ${row.assessmentStatus ?? "status not on record"}${row.assessmentScore == null ? "" : `, score ${row.assessmentScore}`}`
        : null,
    })),
    assets: assetRows.map((row) => ({
      name: row.name,
      type: row.type,
      cia: row.c == null && row.i == null && row.a == null ? null : `${row.c ?? "?"}/${row.i ?? "?"}/${row.a ?? "?"}`,
    })),
    cloudAssets: cloudRows.map((row) => ({
      name: row.name ?? "unnamed cloud asset",
      type: row.type,
      complianceStatus: row.complianceStatus,
    })),
    tasks: taskRows.map((row) => ({
      title: row.title,
      status: row.status,
      priority: row.priority,
      dueDate: day(row.dueDate),
    })),
    roadmapItems: roadmapRows.map((row) => ({
      roadmapTitle: row.roadmapTitle,
      title: row.title,
      status: row.status,
    })),
    policies: policyRows,
    vulnerabilities: vulnRows.map((row) => ({
      id: row.id,
      name: row.name,
      status: row.status,
    })),
    bcPlans: planRows,
    processes: processRows,
    previous: previous?.summary
      ? { periodEnd: previous.periodEnd, summary: previous.summary as ReadinessSummary }
      : null,
  };
}

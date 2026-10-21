import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { compareTruthFileWithWorkspace } from "./compareWorkspace";
import { parseTruthFileDocument } from "./parse";
import type { TruthFile, WorkspaceSnapshot } from "./types";
import { validateTruthFile } from "./validate";

const examplePath = pathToExample(import.meta.url);

function pathToExample(metaUrl: string): string {
  if (metaUrl.startsWith("file:")) {
    return fileURLToPath(new URL("../../../../../truth-files/latore-ltd.yaml", metaUrl));
  }
  throw new Error(`unexpected import.meta.url ${metaUrl}`);
}
const today = "2026-10-21";

/**
 * Assignment plus a provider-key token, joined at runtime.
 * The checker still sees one string; the source file does not contain that token.
 */
function secretShapedAddress(): string {
  const token = ["sk", "live", "abcdefghij"].join("_");
  const field = ["api", "key"].join("_");
  return `${field}=${token}`;
}

function loadExample(): TruthFile {
  const text = fs.readFileSync(examplePath, "utf8");
  const result = validateTruthFile(parseTruthFileDocument(text, examplePath), { today });
  expect(result.errors).toEqual([]);
  if (!result.document) throw new Error("expected a valid Latore truth file");
  return result.document;
}

/** Stored labels from seedRiskModule's level(), which calls every score at or above 8 "High". */
function seedStoredLabel(score: number): string {
  if (score >= 8) return "High";
  if (score >= 4) return "Medium";
  return "Low";
}

function latoreSeedSnapshot(truth: TruthFile): WorkspaceSnapshot {
  return {
    clientId: 1,
    name: "Latore LTD",
    legalName: null,
    industry: "Professional services",
    frameworks: ["ISO 27001", "SOC 2", "NIS2"],
    scope: null,
    gapScopes: [],
    gapControlIds: ["A.5.1", "A.9.1"],
    roadmapTitles: ["ISO 27001 Roadmap 2024"],
    businessProcessNames: ["Online Order Fulfillment"],
    risks: truth.risk_register.risks.map((risk) => {
      const inherentScore = risk.inherent_likelihood * risk.inherent_impact;
      const residualScore = risk.residual_likelihood * risk.residual_impact;
      return {
        assessmentId: risk.id,
        inherentScore,
        residualScore,
        inherentRisk: seedStoredLabel(inherentScore),
        residualRisk: seedStoredLabel(residualScore),
      };
    }),
  };
}

describe("Latore truth file", () => {
  it("matches the schema and the consistency rules", () => {
    const document = loadExample();
    expect(document.client_legal_name).toBe("Latore LTD");
    expect(document.nis2_class).toBe("pending");
    expect(document.findings.map((finding) => finding.control)).toEqual(["A.5.1", "A.5.15"]);
    expect(document.roadmap.title).toBe("to be added");
    expect(document.business_continuity.processes).toEqual([]);
    expect(document.identity.company_id).toBe("to be added");
    expect(document.identity.registered_address).toBe("to be added");
    expect(document.monthly_fee).toBe("PRICE TBD (owner)");
  });

  it("does not approve the demo seed quirks", () => {
    const text = fs.readFileSync(examplePath, "utf8");
    expect(text).not.toContain("A.9.1");
    expect(text).not.toContain("ISO 27001 Roadmap 2024");
    expect(text).not.toContain("Online Order Fulfillment");
    expect(text.toLowerCase()).not.toContain("e-commerce");
  });

  it("also accepts the same document as JSON", () => {
    const document = loadExample();
    const result = validateTruthFile(JSON.parse(JSON.stringify(document)), { today });
    expect(result.ok).toBe(true);
  });
});

describe("truth file consistency checks", () => {
  it("rejects a missing header field, a bad date, a bad class, and a bad sector", () => {
    const missing = loadExample() as TruthFile & { client_id?: string };
    delete missing.client_id;
    expect(validateTruthFile(missing, { today }).ok).toBe(false);

    const badDate = loadExample();
    badDate.last_reviewed = "2026-02-31";
    expect(validateTruthFile(badDate, { today }).errors.some((error) => error.path === "$.last_reviewed")).toBe(true);

    const badClass = loadExample();
    badClass.nis2_class = "critical";
    expect(validateTruthFile(badClass, { today }).errors.some((error) => error.message.includes("not an allowed value"))).toBe(true);

    const badSector = loadExample();
    badSector.nis2_sector = "retail";
    expect(validateTruthFile(badSector, { today }).ok).toBe(false);
  });

  it("rejects dates out of order, a future review, and a 2013 control id", () => {
    const outOfOrder = loadExample();
    outOfOrder.evidence.push({
      id: "EV-001",
      controls: ["A.5.15"],
      description: "Restore test record",
      location: "GRCompliance workspace evidence register",
      collected: "2026-11-01",
      valid_until: "2026-10-01",
      status: "collected",
      verified_by: "Alex Morgan",
    });
    const order = validateTruthFile(outOfOrder, { today });
    expect(order.errors.some((error) => error.message.includes("collected 2026-11-01 is after"))).toBe(true);

    const future = loadExample();
    future.last_reviewed = "2026-10-22";
    expect(validateTruthFile(future, { today }).errors.some((error) => error.path === "$.last_reviewed")).toBe(true);

    const annex2013 = loadExample();
    annex2013.findings[1].control = "A.9.1";
    expect(validateTruthFile(annex2013, { today }).errors.some((error) => error.message.includes("2022"))).toBe(true);
  });

  it("rejects a framework in scope but missing from frameworks, and an unknown entity", () => {
    const scope = loadExample();
    scope.scope.in_scope_frameworks.push("GDPR");
    expect(validateTruthFile(scope, { today }).errors.some((error) => error.message.includes("in scope but missing"))).toBe(true);

    const applies = loadExample();
    const gdpr = applies.framework_obligations.find((item) => item.id === "GDPR");
    if (!gdpr) throw new Error("expected GDPR row");
    gdpr.applies = true;
    expect(validateTruthFile(applies, { today }).errors.some((error) => error.message.includes("missing from frameworks"))).toBe(true);

    const entity = loadExample();
    entity.assets[0].entity_id = "ENT-MISSING";
    expect(validateTruthFile(entity, { today }).errors.some((error) => error.message.includes("not defined"))).toBe(true);
  });

  it("rejects an approved fact without an owner, a secret-like value, and an unapproved price", () => {
    const owner = loadExample();
    owner.approved_facts[0].approved_by = "to be added";
    expect(validateTruthFile(owner, { today }).errors.some((error) => error.path.includes("approved_by"))).toBe(true);

    const secret = loadExample();
    secret.identity.registered_address = secretShapedAddress();
    expect(secret.identity.registered_address).toMatch(/\bsk_(?:live|test)_[A-Za-z0-9]{8,}\b/);
    expect(validateTruthFile(secret, { today }).errors.some((error) => error.message.includes("secret"))).toBe(true);

    const price = loadExample();
    price.monthly_fee = "500 EUR";
    expect(validateTruthFile(price, { today }).errors.some((error) => error.path === "$.monthly_fee")).toBe(true);
  });

  it("rejects a NIS2 class with no rationale and no decision-log entry", () => {
    const rationale = loadExample();
    rationale.nis2.rationale = "to be added";
    expect(validateTruthFile(rationale, { today }).errors.some((error) => error.path === "$.nis2.rationale")).toBe(true);

    const decision = loadExample();
    decision.decisions[0].decision = "File created.";
    expect(validateTruthFile(decision, { today }).errors.some((error) => error.path === "$.decisions")).toBe(true);
  });
});

describe("truth file workspace comparison", () => {
  it("flags Latore seed quirks without treating them as approved facts", () => {
    const truth = loadExample();
    const differences = compareTruthFileWithWorkspace(truth, latoreSeedSnapshot(truth));
    const text = differences.map((difference) => difference.message).join("\n");

    expect(text).toContain('gap control "A.9.1" is in the workspace and is not listed in the truth file');
    expect(text).toContain('truth file control "A.5.15" is not in the workspace gap assessment');
    expect(text).toContain('roadmap "ISO 27001 Roadmap 2024" is in the workspace and is not the truth-file roadmap title');
    expect(text).toContain('business process "Online Order Fulfillment" is in the workspace and is not listed in the truth file');
    expect(text).toContain('risk RA-2026-001 inherent score 20 is stored as "High"; truth-file band is "Critical"');
    expect(text).toContain('risk RA-2026-002 inherent score 15 is stored as "High"; truth-file band is "Very High"');
    expect(text).toContain('risk RA-2026-006 inherent score 16 is stored as "High"; truth-file band is "Very High"');
    expect(text).not.toContain("residual score 8");
    expect(differences.some((difference) => difference.code === "framework")).toBe(false);
    expect(differences.some((difference) => difference.code === "scope")).toBe(true);
  });

  it("reports no differences when the workspace matches the truth file", () => {
    const truth = loadExample();
    const aligned: WorkspaceSnapshot = {
      clientId: 1,
      name: "Latore LTD",
      legalName: "Latore LTD",
      industry: "Professional services",
      frameworks: ["ISO/IEC 27001:2022", "SOC 2", "NIS2"],
      scope: truth.scope.statement,
      gapScopes: [],
      gapControlIds: ["A.5.1", "A.5.15"],
      roadmapTitles: [],
      businessProcessNames: [],
      risks: truth.risk_register.risks.map((risk) => {
        const inherentScore = risk.inherent_likelihood * risk.inherent_impact;
        const residualScore = risk.residual_likelihood * risk.residual_impact;
        const band = (score: number) => truth.risk_register.bands.find((item) => score >= item.min && score <= item.max)?.label ?? "";
        return {
          assessmentId: risk.id,
          inherentScore,
          residualScore,
          inherentRisk: band(inherentScore),
          residualRisk: band(residualScore),
        };
      }),
    };
    expect(compareTruthFileWithWorkspace(truth, aligned)).toEqual([]);
  });
});

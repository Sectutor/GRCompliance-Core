import fs from "node:fs";
import path from "node:path";
import { latoreDemoWorkspace } from "../../packages/core/src/lib/readiness/demoLatore";
import { buildReadinessReport } from "../../packages/core/src/lib/readiness/model";
import { renderReadinessPdf } from "../../packages/core/src/lib/readiness/pdf";
import { validateTruthFileAtPath } from "../../packages/core/src/lib/truthFile/validate";

const asOf = process.env.READINESS_AS_OF ?? "2026-10-21";
const outDir = path.resolve(process.argv[2] ?? "tmp");
const truthPath = path.resolve("truth-files/latore-ltd.yaml");
const validated = validateTruthFileAtPath(truthPath, { today: asOf });

if (!validated.ok || !validated.document) {
  for (const error of validated.errors) console.error(`${error.path}: ${error.message}`);
  process.exit(1);
}

const report = buildReadinessReport(latoreDemoWorkspace(asOf), validated.document);
const pdf = await renderReadinessPdf(report);
fs.mkdirSync(outDir, { recursive: true });
const dest = path.join(outDir, report.filename);
fs.writeFileSync(dest, pdf);
console.log(`Wrote ${dest} (${pdf.length} bytes). Differences: ${report.differences.length}. Not emailed.`);

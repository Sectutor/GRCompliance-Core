/**
 * Validate truth files in the repo, and optionally compare one file with a workspace.
 *
 *   npx tsx scripts/truth-file/validate.ts --all
 *   npx tsx scripts/truth-file/validate.ts truth-files/latore-ltd.yaml
 *   npx tsx scripts/truth-file/validate.ts truth-files/latore-ltd.yaml --client-name "Latore LTD"
 *
 * The database comparison reads existing rows. It does not migrate or write.
 * Exit 0 when every file is valid and there is no database difference.
 * Exit 1 when a file fails validation or cannot be parsed.
 * Exit 2 when files are valid and the database comparison reports differences.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateTruthFileAtPath } from "../../packages/core/src/lib/truthFile/validate";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function isTruthDataFile(full: string, name: string): boolean {
  if (!/\.(ya?ml|json)$/i.test(name) || name.endsWith(".schema.json")) return false;
  const relative = path.relative(repoRoot, full).split(path.sep).join("/");
  if (relative.startsWith("truth-files/")) return true;
  return /(^|\/)truth\.(ya?ml|json)$/i.test(relative) || /(^|\/)truth-file\.(ya?ml|json)$/i.test(relative);
}

function walk(dir: string, found: string[]) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist" || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, found);
      continue;
    }
    if (!isTruthDataFile(full, entry.name)) continue;
    found.push(full);
  }
}

function truthFiles(args: string[]): string[] {
  if (args.includes("--all") || args.length === 0) {
    const found: string[] = [];
    walk(repoRoot, found);
    return found.sort();
  }
  return args.filter((arg) => !arg.startsWith("--")).map((arg) => path.resolve(repoRoot, arg));
}

function flag(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  return args[index + 1];
}

async function main() {
  const args = process.argv.slice(2);
  const files = truthFiles(args);
  if (files.length === 0) {
    console.error("No truth files found.");
    process.exit(1);
  }

  let failed = false;
  const valid: { file: string; document: NonNullable<ReturnType<typeof validateTruthFileAtPath>["document"]> }[] = [];
  for (const file of files) {
    const result = validateTruthFileAtPath(file);
    const relative = path.relative(repoRoot, file);
    if (!result.ok || !result.document) {
      failed = true;
      console.error(`${relative}: invalid`);
      for (const error of result.errors) {
        console.error(`  - ${error.path}: ${error.message}`);
      }
      continue;
    }
    console.log(`${relative}: ok`);
    valid.push({ file: relative, document: result.document });
  }

  if (failed) process.exit(1);

  const clientIdRaw = flag(args, "--client-id");
  const clientName = flag(args, "--client-name");
  if (!clientIdRaw && !clientName) return;

  if (valid.length !== 1) {
    console.error("Pass one truth file when comparing with the database.");
    process.exit(1);
  }

  const clientId = clientIdRaw ? Number(clientIdRaw) : undefined;
  if (clientIdRaw && !Number.isInteger(clientId)) {
    console.error("--client-id must be an integer");
    process.exit(1);
  }

  const { loadWorkspaceSnapshot } = await import("../../packages/core/src/lib/truthFile/loadWorkspace");
  const { compareTruthFileWithWorkspace } = await import("../../packages/core/src/lib/truthFile/compareWorkspace");
  const snapshot = await loadWorkspaceSnapshot({ clientId, clientName });
  const differences = compareTruthFileWithWorkspace(valid[0].document, snapshot);
  if (differences.length === 0) {
    console.log(`database: no differences for workspace ${snapshot.clientId}`);
    return;
  }
  console.error(`database: ${differences.length} difference(s) for workspace ${snapshot.clientId}`);
  for (const difference of differences) {
    console.error(`  - [${difference.code}] ${difference.message}`);
  }
  process.exit(2);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Truth-file check failed");
  process.exit(1);
});

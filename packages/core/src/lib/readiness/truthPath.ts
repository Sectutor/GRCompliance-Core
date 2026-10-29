import fs from "node:fs";
import path from "node:path";

/** Resolve a truth-file path that must stay inside truth-files/. Absolute paths and .. are rejected. */
export function resolveTruthFilePath(configured: string, cwd = process.cwd()): string | null {
  if (!configured || configured.includes("\0")) return null;
  const root = path.resolve(cwd, "truth-files");
  const resolved = path.resolve(root, configured);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) return null;
  return resolved;
}

export function defaultTruthFileForClient(clientName: string, cwd = process.cwd()): string | null {
  const slug = clientName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  if (!slug) return null;
  const candidate = path.resolve(cwd, "truth-files", `${slug}.yaml`);
  return fs.existsSync(candidate) ? candidate : null;
}

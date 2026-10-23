import fs from "node:fs";
import { parse } from "yaml";

/** Parse a truth file. JSON documents start with "{". Everything else is YAML 1.2. */
export function parseTruthFileDocument(text: string, filename = "truth file"): unknown {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error(`${filename} is empty`);
  }
  if (trimmed.startsWith("{")) {
    return JSON.parse(trimmed) as unknown;
  }
  return parse(trimmed, { schema: "core", uniqueKeys: true, strict: true });
}

export function readTruthFile(filePath: string): unknown {
  const text = fs.readFileSync(filePath, "utf8");
  return parseTruthFileDocument(text, filePath);
}

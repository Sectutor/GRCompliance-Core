import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface JsonSchema {
  $ref?: string;
  $defs?: Record<string, JsonSchema>;
  type?: string | string[];
  required?: string[];
  properties?: Record<string, JsonSchema>;
  additionalProperties?: boolean | JsonSchema;
  items?: JsonSchema;
  enum?: unknown[];
  const?: unknown;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  minItems?: number;
  maxItems?: number;
  pattern?: string;
  format?: string;
  anyOf?: JsonSchema[];
  description?: string;
}

let cached: JsonSchema | null = null;

export function truthFileSchemaPath(): string {
  const meta = import.meta.url;
  if (meta.startsWith("file:")) {
    return fileURLToPath(new URL("./truth-file.schema.json", meta));
  }
  const candidates = [
    path.resolve(process.cwd(), "src/lib/truthFile/truth-file.schema.json"),
    path.resolve(process.cwd(), "packages/core/src/lib/truthFile/truth-file.schema.json"),
  ];
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) {
    throw new Error(`Cannot locate truth-file.schema.json from ${meta}`);
  }
  return found;
}

export function loadTruthFileSchema(): JsonSchema {
  if (!cached) {
    cached = JSON.parse(fs.readFileSync(truthFileSchemaPath(), "utf8")) as JsonSchema;
  }
  return cached;
}

export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function resolveRef(schema: JsonSchema, root: JsonSchema): JsonSchema {
  if (!schema.$ref) return schema;
  if (!schema.$ref.startsWith("#/$defs/")) {
    throw new Error(`Unsupported $ref ${schema.$ref}`);
  }
  const name = schema.$ref.slice("#/$defs/".length);
  const target = root.$defs?.[name];
  if (!target) throw new Error(`Missing $ref ${schema.$ref}`);
  return target;
}

function typeOf(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (value instanceof Date) return "date";
  return typeof value;
}

function matchesType(value: unknown, type: string): boolean {
  if (type === "integer") return typeof value === "number" && Number.isInteger(value);
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  if (type === "object") return typeOf(value) === "object";
  if (type === "array") return Array.isArray(value);
  return typeOf(value) === type;
}

function anyOfHint(options: JsonSchema[]): string {
  const hasDate = options.some((option) => option.format === "date");
  const pending = options.find((option) => option.const === "to be added");
  if (hasDate && pending) return 'must be a real YYYY-MM-DD date or "to be added"';
  return "does not match any allowed form";
}

/**
 * Validates a document against the subset of JSON Schema used by truth-file.schema.json.
 * Keywords: type, required, properties, additionalProperties, items, enum, const,
 * min/max, pattern, format date, anyOf, and local #/$defs refs.
 */
export function validateAgainstSchema(value: unknown, schema: JsonSchema, root = schema): string[] {
  const errors: string[] = [];
  walk(value, schema, root, "", errors, 0);
  return errors;
}

function walk(
  value: unknown,
  rawSchema: JsonSchema,
  root: JsonSchema,
  path: string,
  errors: string[],
  depth: number,
): void {
  if (depth > 40) {
    errors.push(`${path || "$"}: schema nesting is too deep`);
    return;
  }
  const schema = resolveRef(rawSchema, root);
  const here = path || "$";

  if (schema.anyOf) {
    const matched = schema.anyOf.some((option) => {
      const branch: string[] = [];
      walk(value, option, root, path, branch, depth + 1);
      return branch.length === 0;
    });
    if (!matched) errors.push(`${here}: ${anyOfHint(schema.anyOf)}`);
    return;
  }

  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((type) => matchesType(value, type))) {
      errors.push(`${here}: expected ${types.join(" or ")}`);
      return;
    }
  }

  if (schema.enum && !schema.enum.some((allowed) => allowed === value)) {
    errors.push(`${here}: "${String(value)}" is not an allowed value`);
  }
  if ("const" in schema && schema.const !== value) {
    errors.push(`${here}: must be ${JSON.stringify(schema.const)}`);
  }

  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      errors.push(`${here}: must not be empty`);
    }
    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      errors.push(`${here}: is longer than ${schema.maxLength} characters`);
    }
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
      errors.push(`${here}: has the wrong format`);
    }
    if (schema.format === "date" && !isIsoDate(value)) {
      errors.push(`${here}: must be a real YYYY-MM-DD date`);
    }
  }

  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) {
      errors.push(`${here}: must be at least ${schema.minimum}`);
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      errors.push(`${here}: must be at most ${schema.maximum}`);
    }
  }

  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      errors.push(`${here}: needs at least ${schema.minItems} item(s)`);
    }
    if (schema.maxItems !== undefined && value.length > schema.maxItems) {
      errors.push(`${here}: has too many items`);
    }
    if (schema.items) {
      value.forEach((item, index) => {
        walk(item, schema.items as JsonSchema, root, `${here}[${index}]`, errors, depth + 1);
      });
    }
    return;
  }

  if (typeOf(value) === "object" && schema.properties) {
    const record = value as Record<string, unknown>;
    for (const key of schema.required ?? []) {
      if (record[key] === undefined) errors.push(`${here}.${key}: required`);
    }
    for (const [key, child] of Object.entries(record)) {
      const childSchema = schema.properties[key];
      if (childSchema) {
        walk(child, childSchema, root, `${here}.${key}`, errors, depth + 1);
        continue;
      }
      if (schema.additionalProperties === false) {
        errors.push(`${here}.${key}: is not a truth-file field`);
      } else if (schema.additionalProperties && typeof schema.additionalProperties === "object") {
        walk(child, schema.additionalProperties, root, `${here}.${key}`, errors, depth + 1);
      }
    }
  }
}

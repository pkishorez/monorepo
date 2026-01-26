import type { AttributeValue, MarshalledOutput } from "../types/index.js";

export function marshall(value: unknown): MarshalledOutput {
  if (value === null || value === undefined) {
    return {};
  }

  if (typeof value !== "object") {
    return {};
  }

  const result: MarshalledOutput = {};
  for (const [key, val] of Object.entries(value)) {
    result[key] = convertToAttr(val);
  }
  return result;
}

export function convertToAttr(value: unknown): AttributeValue {
  if (value === null || value === undefined) {
    return { NULL: true };
  }

  if (typeof value === "string") {
    return { S: value };
  }

  if (typeof value === "number") {
    return { N: String(value) };
  }

  if (typeof value === "boolean") {
    return { BOOL: value };
  }

  if (Array.isArray(value)) {
    return { L: value.map(convertToAttr) };
  }

  if (typeof value === "object") {
    const m: Record<string, AttributeValue> = {};
    for (const [k, v] of Object.entries(value)) {
      m[k] = convertToAttr(v);
    }
    return { M: m };
  }

  return { NULL: true };
}

export function unmarshall(value: MarshalledOutput): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, attr] of Object.entries(value)) {
    result[key] = convertFromAttr(attr);
  }
  return result;
}

function convertFromAttr(attr: AttributeValue): unknown {
  if ("S" in attr) return attr.S;
  if ("N" in attr) return Number(attr.N);
  if ("BOOL" in attr) return attr.BOOL;
  if ("NULL" in attr) return null;
  if ("L" in attr) return attr.L.map(convertFromAttr);
  if ("M" in attr) {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(attr.M)) {
      result[k] = convertFromAttr(v);
    }
    return result;
  }
  if ("SS" in attr) return attr.SS;
  if ("NS" in attr) return attr.NS.map(Number);
  if ("BS" in attr) return attr.BS;
  return null;
}

/**
 * Derives an index key value from deps and a value object.
 *
 * Rules:
 * - PK (isPrimaryKey=true): always includes prefix
 *   - deps empty: returns prefix
 *   - deps present: returns prefix#val1#val2...
 * - SK (isPrimaryKey=false):
 *   - deps empty: returns prefix (fallback to entity/index name)
 *   - deps present: returns val1#val2... (no prefix)
 */
export const deriveIndexKeyValue = (
  prefix: string,
  deps: string[],
  value: Record<string, unknown>,
  isPrimaryKey: boolean,
): string => {
  if (deps.length === 0) {
    return prefix;
  }

  const values = deps.map((dep) => String(value[dep] ?? ""));

  if (isPrimaryKey) {
    return `${prefix}#${values.join("#")}`;
  }

  return values.join("#");
};

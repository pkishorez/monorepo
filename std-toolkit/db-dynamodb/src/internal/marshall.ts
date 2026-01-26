import type { AttributeValue, MarshalledOutput } from "../types/index.js";

/**
 * Converts a JavaScript object to DynamoDB marshalled format.
 *
 * @param value - The JavaScript object to marshal
 * @returns A record of attribute names to DynamoDB AttributeValue objects
 */
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

/**
 * Converts a JavaScript value to a DynamoDB AttributeValue.
 *
 * @param value - The JavaScript value to convert
 * @returns The corresponding DynamoDB AttributeValue
 */
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

/**
 * Converts a DynamoDB marshalled record back to a JavaScript object.
 *
 * @param value - The marshalled DynamoDB record
 * @returns A plain JavaScript object
 */
export function unmarshall(value: MarshalledOutput): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, attr] of Object.entries(value)) {
    result[key] = convertFromAttr(attr);
  }
  return result;
}

/**
 * Converts a DynamoDB AttributeValue back to a JavaScript value.
 *
 * @param attr - The DynamoDB AttributeValue to convert
 * @returns The corresponding JavaScript value
 */
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
 * Derives an index key value from field dependencies and a value object.
 *
 * For partition keys (isPrimaryKey=true): always includes prefix.
 * If deps is empty, returns just the prefix. Otherwise returns prefix#val1#val2...
 *
 * For sort keys (isPrimaryKey=false): if deps is empty, returns prefix as fallback.
 * Otherwise returns val1#val2... without prefix.
 *
 * @param prefix - The key prefix (entity name or index name)
 * @param deps - Array of field names to extract values from
 * @param value - Object containing the field values
 * @param isPrimaryKey - Whether this is for a partition key (true) or sort key (false)
 * @returns The derived key string
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

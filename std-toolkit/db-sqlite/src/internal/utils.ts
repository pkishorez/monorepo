import { EntityType, MetaSchema, type IndexPatternDescriptor } from "@std-toolkit/core";
import { Schema } from "effect";

export const SqliteBool = Schema.transform(Schema.Number, Schema.Boolean, {
  decode: (n) => n !== 0,
  encode: (b) => (b ? 1 : 0),
});

export const sqlMetaSchema = MetaSchema.omit("_d").pipe(
  Schema.extend(Schema.Struct({ _d: SqliteBool })),
);

export type RowMeta = typeof sqlMetaSchema.Type;
export type RowMetaEncoded = typeof sqlMetaSchema.Encoded;

export interface RawRow extends Record<string, unknown> {
  pk: string;
  sk: string;
  _data: string;
  _e: string;
  _v: string;
  _u: string;
  _d: number;
}

export interface QueryResult<T> {
  items: EntityType<T>[];
}

export type Operator = "<" | "<=" | ">" | ">=";

export type KeyOp<T> =
  | { "<": T | null }
  | { "<=": T | null }
  | { ">": T | null }
  | { ">=": T | null };

export type SkParam<T> =
  | { "<": T | null }
  | { "<=": T | null }
  | { ">": T | null }
  | { ">=": T | null };

export interface SimpleQueryOptions {
  limit?: number;
}

export interface SubscribeOptions<K, V> {
  key: K;
  value?: V | null;
  limit?: number;
}

/**
 * Derives an index key value from field dependencies and a value object.
 *
 * For partition keys (isPk=true): always includes prefix.
 * If deps is empty, returns just the prefix. Otherwise returns prefix#val1#val2...
 *
 * For sort keys (isPk=false): if deps is empty, returns prefix as fallback.
 * Otherwise returns val1#val2... without prefix.
 *
 * @param prefix - The key prefix (entity name or index name)
 * @param deps - Array of field names to extract values from
 * @param value - Object containing the field values
 * @param isPk - Whether this is for a partition key (true) or sort key (false)
 * @returns The derived key string
 */
export const deriveIndexKeyValue = (
  prefix: string,
  deps: string[],
  value: Record<string, unknown>,
  isPk: boolean,
): string => {
  if (deps.length === 0) {
    return prefix;
  }

  const values = deps.map((dep) => String(value[dep] ?? ""));

  if (isPk) {
    return `${prefix}#${values.join("#")}`;
  }

  return values.join("#");
};

/**
 * Computes a simple key by joining field values with #.
 * Used for backward compatibility with simpler key computation.
 */
export const computeKey = <T>(
  fields: readonly (keyof T)[],
  entity: T,
): string => fields.map((f) => String(entity[f])).join("#");

export const extractKeyOp = <T>(
  op: KeyOp<T> | SkParam<T>,
): { operator: Operator; value: T | null } => {
  if ("<" in op) return { operator: "<", value: op["<"] };
  if ("<=" in op) return { operator: "<=", value: op["<="] };
  if (">" in op) return { operator: ">", value: op[">"] };
  if (">=" in op) return { operator: ">=", value: op[">="] };
  throw new Error("Invalid KeyOp: no valid operator found");
};

export const getKeyOpOrderDirection = (op: Operator): "ASC" | "DESC" =>
  op === "<" || op === "<=" ? "DESC" : "ASC";

export const getKeyOpScanDirection = (operator: Operator): boolean =>
  operator === ">" || operator === ">=";

export const fieldsToPattern = (
  fields: readonly string[],
): IndexPatternDescriptor => ({
  deps: [...fields],
  pattern: fields.map((f) => `{${f}}`).join("#"),
});

/**
 * Stored derivation info for a secondary index.
 */
export interface StoredIndexDerivation {
  /** The actual index name on the table (e.g., "IDX1") */
  indexName: string;
  /** The semantic name for this entity's use of the index (e.g., "byEmail") */
  entityIndexName: string;
  /** Field names used to derive the partition key */
  pkDeps: string[];
  /** Field names used to derive the sort key */
  skDeps: string[];
}

/**
 * Internal derivation info for the primary index.
 */
export interface StoredPrimaryDerivation {
  /** Field names used to derive the partition key */
  pkDeps: string[];
  /** Field names used to derive the sort key */
  skDeps: string[];
}

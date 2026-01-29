import { MetaSchema } from "@std-toolkit/core";
import { Schema } from "effect";

export const SqliteBool = Schema.transform(Schema.Number, Schema.Boolean, {
  decode: (n) => n !== 0,
  encode: (b) => (b ? 1 : 0),
});

export const sqlMetaSchema = MetaSchema.omit("_d").pipe(
  Schema.extend(Schema.Struct({ _d: SqliteBool })),
);

export type RowMeta = typeof sqlMetaSchema.Type;

export interface RawRow extends Record<string, unknown> {
  pk: string;
  sk: string;
  _data: string;
  _e: string;
  _v: string;
  _uid: string;
  _d: number;
}

type Operator = "<" | "<=" | ">" | ">=";

export type SkParam =
  | { "<": string | null }
  | { "<=": string | null }
  | { ">": string | null }
  | { ">=": string | null };

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

export const extractKeyOp = (
  op: SkParam,
): { operator: Operator; value: string | null } => {
  if ("<" in op) return { operator: "<", value: op["<"] };
  if ("<=" in op) return { operator: "<=", value: op["<="] };
  if (">" in op) return { operator: ">", value: op[">"] };
  if (">=" in op) return { operator: ">=", value: op[">="] };
  throw new Error("Invalid KeyOp: no valid operator found");
};

export const getKeyOpScanDirection = (operator: Operator): boolean =>
  operator === ">" || operator === ">=";

/**
 * Stored derivation info for a secondary index.
 */
export interface StoredIndexDerivation {
  indexName: string;
  entityIndexName: string;
  pkDeps: string[];
  skDeps: string[];
}

/**
 * Internal derivation info for the primary index.
 */
export interface StoredPrimaryDerivation {
  pkDeps: string[];
  skDeps: string[];
}

/**
 * Stored derivation info for a timeline index.
 * Uses the same PK as primary but SK is always _uid for time-ordering.
 */
export interface StoredTimelineDerivation {
  /** The index name on the table (e.g., "IDX1") */
  indexName: string;
  /** Always "timeline" */
  entityIndexName: "timeline";
  /** Field names used to derive the partition key (same as primary) */
  pkDeps: string[];
  /** Always ["_uid"] for time-ordered results */
  skDeps: readonly ["_uid"];
}

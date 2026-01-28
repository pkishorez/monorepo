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
  _u: string;
  _d: number;
}

type Operator = "<" | "<=" | ">" | ">=";

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

export const extractKeyOp = <T>(
  op: SkParam<T>,
): { operator: Operator; value: T | null } => {
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

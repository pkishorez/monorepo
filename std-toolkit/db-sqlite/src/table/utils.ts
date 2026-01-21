import { EntityType, metaSchema } from "@std-toolkit/tanstack";
import { Schema } from "effect";

export const idxKeyCol = (indexName: string): string => `_idx_${indexName}_key`;

export const SqliteBool = Schema.transform(Schema.Number, Schema.Boolean, {
  decode: (n) => n !== 0,
  encode: (b) => (b ? 1 : 0),
});

export const sqlMetaSchema = metaSchema.omit("_d").pipe(
  Schema.extend(
    Schema.Struct({
      _d: SqliteBool,
    }),
  ),
);

export type RowMeta = typeof sqlMetaSchema.Type;
export type RowMetaEncoded = typeof sqlMetaSchema.Encoded;

export interface RawRow extends Record<string, unknown>, RowMetaEncoded {
  key: string;
  _data: string;
}

export interface QueryResult<T> {
  items: EntityType<T>[];
}

// Query operator with typed key value
export type KeyOp<T> = { "<": T } | { "<=": T } | { ">": T } | { ">=": T };

// Compute key from fields
export const computeKey = <T>(
  fields: readonly (keyof T)[],
  entity: T,
): string => fields.map((f) => String(entity[f])).join("#");

// Extract operator and key value from KeyOp
export const extractKeyOp = <T>(
  op: KeyOp<T>,
): { operator: string; value: T } => {
  const [operator, value] = Object.entries(op)[0]!;
  return { operator, value: value as T };
};

// Get order direction from KeyOp
export const getKeyOpOrderDirection = <T>(op: KeyOp<T>): "ASC" | "DESC" => {
  const { operator } = extractKeyOp(op);
  return operator === "<" || operator === "<=" ? "DESC" : "ASC";
};

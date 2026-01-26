import { EntityType, MetaSchema, type IndexPatternDescriptor } from "@std-toolkit/core";
import { Schema } from "effect";

export const indexKeyColumn = (name: string): string => `_idx_${name}_key`;

export const SqliteBool = Schema.transform(Schema.Number, Schema.Boolean, {
  decode: (n) => n !== 0,
  encode: (b) => (b ? 1 : 0),
});

export const sqlMetaSchema = MetaSchema.omit("_d").pipe(
  Schema.extend(Schema.Struct({ _d: SqliteBool })),
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

type Operator = "<" | "<=" | ">" | ">=";

export type KeyOp<T> = { "<": T } | { "<=": T } | { ">": T } | { ">=": T };

export const computeKey = <T>(
  fields: readonly (keyof T)[],
  entity: T,
): string => fields.map((f) => String(entity[f])).join("#");

export const extractKeyOp = <T>(
  op: KeyOp<T>,
): { operator: Operator; value: T } => {
  const [operator, value] = Object.entries(op)[0]!;
  return { operator: operator as Operator, value: value as T };
};

export const getKeyOpOrderDirection = (op: Operator): "ASC" | "DESC" =>
  op === "<" || op === "<=" ? "DESC" : "ASC";

export const fieldsToPattern = (
  fields: readonly string[],
): IndexPatternDescriptor => ({
  deps: [...fields],
  pattern: fields.map((f) => `{${f}}`).join("#"),
});

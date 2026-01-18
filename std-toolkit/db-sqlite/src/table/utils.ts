import { Schema } from "effect";

export const isoNow = (): string => new Date().toISOString();

export const idxPkCol = (indexName: string): string => `_idx_${indexName}_pk`;
export const idxSkCol = (indexName: string): string => `_idx_${indexName}_sk`;

export const SqliteBool = Schema.transform(Schema.Number, Schema.Boolean, {
  decode: (n) => n !== 0,
  encode: (b) => (b ? 1 : 0),
});

export const RowMetaSchema = Schema.Struct({
  _v: Schema.String,
  _i: Schema.Number,
  _u: Schema.String,
  _c: Schema.String,
  _d: SqliteBool,
});

export type RowMeta = typeof RowMetaSchema.Type;
export type RowMetaEncoded = typeof RowMetaSchema.Encoded;

export interface RawRow extends Record<string, unknown>, RowMetaEncoded {
  pk: string;
  sk: string;
  _data: string;
}

export interface EntityResult<T> {
  data: T;
  meta: RowMeta;
}

export interface QueryResult<T> {
  items: EntityResult<T>[];
}

export interface KeyDef<T> {
  pk: (entity: T) => string;
  sk: (entity: T) => string;
}

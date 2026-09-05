import { Effect, Schema, SchemaIssue, SchemaTransformation } from 'effect';
import {
  EncodedItemSchema,
  type EncodedItem,
  type JsonObject,
} from '../../std-table/contract/index.js';
import type { TableDefinition } from '../../std-table/definition/index.js';

export type SQLiteValue = string | number | bigint | Uint8Array | null;
export type SQLiteRow = Readonly<Record<string, SQLiteValue>>;
export type NativeItem = SQLiteRow;

type TableIndexes = Pick<
  TableDefinition,
  'primary' | 'localSecondaryIndexes' | 'globalSecondaryIndexes'
>;

const indexColumns = (table: TableIndexes) => {
  const primary = new Set([table.primary.pk, table.primary.sk]);
  return [
    ...new Set(
      [
        ...Object.values(table.localSecondaryIndexes),
        ...Object.values(table.globalSecondaryIndexes),
      ].flatMap(({ pk, sk }) => [pk, sk]),
    ),
  ].filter((name) => !primary.has(name));
};

const isSQLiteValue = (value: unknown): value is SQLiteValue =>
  value === null ||
  typeof value === 'string' ||
  typeof value === 'number' ||
  typeof value === 'bigint' ||
  value instanceof Uint8Array;

const isRow = (value: unknown): value is NativeItem =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  Object.values(value).every(isSQLiteValue);

const NativeItemSchema = Schema.declare<NativeItem>(isRow);

const toDecoded = (table: TableIndexes, item: EncodedItem): NativeItem => {
  const values = new Map<string, SQLiteValue>([
    [table.primary.pk, item.pk],
    [table.primary.sk, item.sk],
    ['_e', item.meta._e],
    ['_v', String(item.data._v)],
    ['_u', item.meta._u],
    ['_d', item.meta._d ? 1 : 0],
    ['data', JSON.stringify(item.data)],
  ]);
  for (const column of indexColumns(table))
    values.set(column, item.keys[column] ?? null);
  return Object.fromEntries(values);
};

const toEncoded = (table: TableIndexes, row: NativeItem): EncodedItem => {
  if (typeof row.data !== 'string' || (row._d !== 0 && row._d !== 1))
    throw new Error('SQLite row does not match the storage schema');
  const data = JSON.parse(row.data) as JsonObject;
  if (row._v !== data._v) {
    throw new Error('Physical _v does not match encoded data._v');
  }
  const keys: Record<string, string> = {};
  for (const column of indexColumns(table)) {
    const value = row[column];
    if (typeof value === 'string') keys[column] = value;
  }
  return {
    pk: row[table.primary.pk],
    sk: row[table.primary.sk],
    meta: {
      _e: row._e,
      _u: row._u,
      _d: row._d !== 0,
    },
    data,
    keys,
  } as EncodedItem;
};

const invalid = (input: unknown, cause: unknown) =>
  new SchemaIssue.InvalidValue(
    {
      message: cause instanceof Error ? cause.message : String(cause),
    },
    input,
  );

export type ItemSchema = Schema.Codec<NativeItem, EncodedItem>;

export const itemSchema = (table: TableIndexes): ItemSchema =>
  EncodedItemSchema.pipe(
    Schema.decodeTo(
      NativeItemSchema,
      SchemaTransformation.transformOrFail({
        decode: (item: EncodedItem) =>
          Effect.try({
            try: () => toDecoded(table, item),
            catch: (cause) => invalid(item, cause),
          }),
        encode: (row: NativeItem) =>
          Effect.try({
            try: () => toEncoded(table, row),
            catch: (cause) => invalid(row, cause),
          }),
      }),
    ),
  );

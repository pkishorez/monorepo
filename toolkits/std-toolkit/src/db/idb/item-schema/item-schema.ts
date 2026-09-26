import { Effect, Schema, SchemaIssue, SchemaTransformation } from 'effect';
import {
  StoredItemSchema,
  type StoredItem,
  type StoredKey,
  type JsonObject,
} from '../../std-table/contract/index.js';
import type { TableDefinition } from '../../std-table/definition/index.js';

export type NativeItem = Record<string, unknown>;

type TableIndexes = Pick<
  TableDefinition,
  'localSecondaryIndexes' | 'globalSecondaryIndexes'
>;

const indexAttributes = (table: TableIndexes) => [
  ...Object.values(table.localSecondaryIndexes).map((index) => index.sk),
  ...Object.values(table.globalSecondaryIndexes).flatMap((index) => [
    index.pk,
    index.sk,
  ]),
];

export const toNativeKey = ({ pk, sk }: StoredKey): [string, string] => [
  pk,
  sk,
];

const isRecord = (value: unknown): value is NativeItem =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const NativeItemSchema = Schema.declare<NativeItem>(isRecord);

const toNative = (item: StoredItem): NativeItem => ({
  pk: item.pk,
  sk: item.sk,
  _e: item.meta._e,
  _v: item.data._v,
  _u: item.meta._u,
  _d: item.meta._d,
  data: item.data,
  ...item.keys,
});

const fromNative = (table: TableIndexes, record: NativeItem): StoredItem => {
  const data = record.data as JsonObject;
  if (record._v !== data._v) {
    throw new Error('Physical _v does not match encoded data._v');
  }
  const keys: Record<string, string> = {};
  for (const attribute of indexAttributes(table)) {
    const value = record[attribute];
    if (typeof value === 'string') keys[attribute] = value;
  }
  return {
    pk: record.pk,
    sk: record.sk,
    meta: {
      _e: record._e,
      _u: record._u,
      _d: record._d,
    },
    data,
    keys,
  } as StoredItem;
};

const invalid = (input: unknown, cause: unknown) =>
  new SchemaIssue.InvalidValue(
    {
      message: cause instanceof Error ? cause.message : String(cause),
    },
    input,
  );

export type ItemSchema = Schema.Codec<NativeItem, StoredItem>;

export const itemSchema = (table: TableIndexes): ItemSchema =>
  StoredItemSchema.pipe(
    Schema.decodeTo(
      NativeItemSchema,
      SchemaTransformation.transformOrFail({
        decode: (item: StoredItem) =>
          Effect.try({
            try: () => toNative(item),
            catch: (cause) => invalid(item, cause),
          }),
        encode: (record: NativeItem) =>
          Effect.try({
            try: () => fromNative(table, record),
            catch: (cause) => invalid(record, cause),
          }),
      }),
    ),
  );

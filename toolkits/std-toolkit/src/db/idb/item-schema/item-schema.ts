import { Effect, Schema, SchemaIssue, SchemaTransformation } from 'effect';
import {
  EncodedItemSchema,
  type EncodedItem,
  type EncodedKey,
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

export const decodeKey = ({ pk, sk }: EncodedKey): [string, string] => [pk, sk];

const isRecord = (value: unknown): value is NativeItem =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const NativeItemSchema = Schema.declare<NativeItem>(isRecord);

const toDecoded = (item: EncodedItem): NativeItem => ({
  pk: item.pk,
  sk: item.sk,
  _e: item.meta._e,
  _v: item.data._v,
  _u: item.meta._u,
  _d: item.meta._d,
  data: item.data,
  ...item.keys,
});

const toEncoded = (table: TableIndexes, record: NativeItem): EncodedItem => {
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
            try: () => toDecoded(item),
            catch: (cause) => invalid(item, cause),
          }),
        encode: (record: NativeItem) =>
          Effect.try({
            try: () => toEncoded(table, record),
            catch: (cause) => invalid(record, cause),
          }),
      }),
    ),
  );

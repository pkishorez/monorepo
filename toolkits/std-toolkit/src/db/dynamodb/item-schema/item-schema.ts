import { Effect, Schema, SchemaIssue, SchemaTransformation } from 'effect';
import {
  EncodedItemSchema,
  type EncodedItem,
  type EncodedKey,
  type JsonObject,
} from '../../std-table/contract/index.js';
import type { TableDefinition } from '../../std-table/definition/index.js';
import {
  isAttributeValueRecord,
  marshall,
  unmarshall,
  type MarshalledOutput,
} from '../attribute-value/index.js';

export type NativeItem = MarshalledOutput;

type TableIndexes = Pick<
  TableDefinition,
  'primary' | 'localSecondaryIndexes' | 'globalSecondaryIndexes'
>;

const indexAttributeNames = (table: TableIndexes) => [
  ...Object.values(table.localSecondaryIndexes).map((index) => index.sk),
  ...Object.values(table.globalSecondaryIndexes).flatMap((index) => [
    index.pk,
    index.sk,
  ]),
];

export const decodeKey = (table: TableIndexes, key: EncodedKey): NativeItem =>
  marshall({ [table.primary.pk]: key.pk, [table.primary.sk]: key.sk });

export const itemKey = (table: TableIndexes, item: NativeItem): NativeItem => {
  const pk = item[table.primary.pk];
  const sk = item[table.primary.sk];
  if (pk === undefined || sk === undefined)
    throw new Error('DynamoDB item does not contain its primary key');
  return { [table.primary.pk]: pk, [table.primary.sk]: sk };
};

const NativeItemSchema = Schema.declare<NativeItem>(isAttributeValueRecord);

const toDecoded = (table: TableIndexes, item: EncodedItem): NativeItem =>
  marshall({
    [table.primary.pk]: item.pk,
    [table.primary.sk]: item.sk,
    _e: item.meta._e,
    _v: item.data._v,
    _u: item.meta._u,
    _d: item.meta._d,
    data: item.data,
    ...item.keys,
  });

const toEncoded = (table: TableIndexes, decoded: NativeItem): EncodedItem => {
  const value = unmarshall(decoded);
  const data = value.data as JsonObject;
  if (value._v !== data._v) {
    throw new Error('Physical _v does not match encoded data._v');
  }
  const keys: Record<string, string> = {};
  for (const name of indexAttributeNames(table)) {
    const attribute = value[name];
    if (typeof attribute === 'string') keys[name] = attribute;
  }
  return {
    pk: value[table.primary.pk],
    sk: value[table.primary.sk],
    meta: { _e: value._e, _u: value._u, _d: value._d },
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
        encode: (decoded: NativeItem) =>
          Effect.try({
            try: () => toEncoded(table, decoded),
            catch: (cause) => invalid(decoded, cause),
          }),
      }),
    ),
  );

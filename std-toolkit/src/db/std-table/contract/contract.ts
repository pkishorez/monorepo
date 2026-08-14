import { Context, Data, Effect, Layer, Schema } from 'effect';

export interface EncodedKey {
  readonly pk: string;
  readonly sk: string;
}

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonObject
  | readonly JsonValue[];
export interface JsonObject {
  readonly [key: string]: JsonValue;
}

export interface EncodedItemMeta {
  readonly _e: string;
  readonly _v: string;
  readonly _u: string;
  readonly _d: boolean;
}

export interface EncodedItem extends EncodedKey {
  readonly meta: EncodedItemMeta;
  readonly data: JsonObject;
  readonly keys: Readonly<Record<string, string>>;
}

export const EncodedKeySchema: Schema.Codec<EncodedKey> = Schema.Struct({
  pk: Schema.String,
  sk: Schema.String,
});

const JsonObjectSchema = Schema.declare<JsonObject>(
  (input): input is JsonObject =>
    typeof input === 'object' && input !== null && !Array.isArray(input),
);

export const EncodedItemSchema: Schema.Codec<EncodedItem> = Schema.Struct({
  pk: Schema.String,
  sk: Schema.String,
  meta: Schema.Struct({
    _e: Schema.String,
    _v: Schema.String,
    _u: Schema.String,
    _d: Schema.Boolean,
  }),
  data: JsonObjectSchema,
  keys: Schema.Record(Schema.String, Schema.String),
});

export type PutCondition =
  | { readonly kind: 'not-exists' }
  | { readonly kind: 'updated'; readonly value: string };

export interface ConditionalPut {
  readonly item: EncodedItem;
  readonly condition?: PutCondition;
}

export interface QueryPosition {
  readonly pk: string;
  readonly sk: string;
  readonly indexSk?: string;
}

export interface QueryRequest {
  readonly index?: string;
  readonly pk: string;
  readonly sort?:
    | {
        readonly operator: '=' | '<' | '<=' | '>' | '>=';
        readonly value: string;
      }
    | {
        readonly operator: 'between';
        readonly value: readonly [string, string];
      }
    | { readonly operator: 'beginsWith'; readonly value: string };
  readonly descending: boolean;
  readonly limit: number;
  readonly startAfter?: QueryPosition;
}

export interface QueryResult {
  readonly items: readonly EncodedItem[];
  readonly hasMore: boolean;
}

export class ConditionFailure extends Data.TaggedError(
  'ConditionFailure',
)<{}> {}
export class OperationFailure extends Data.TaggedError('OperationFailure')<{
  readonly cause: unknown;
}> {}

export type ContractFailure = ConditionFailure | OperationFailure;

export interface StdTableContract {
  readonly getItem: (
    key: EncodedKey,
  ) => Effect.Effect<EncodedItem | null, ContractFailure>;
  readonly queryItems: (
    request: QueryRequest,
  ) => Effect.Effect<QueryResult, ContractFailure>;
  readonly writeItem: (
    put: ConditionalPut,
  ) => Effect.Effect<void, ContractFailure>;
  readonly transactWriteItems: (
    puts: readonly ConditionalPut[],
  ) => Effect.Effect<void, ContractFailure>;
  readonly hardDeleteItem: (
    key: EncodedKey,
  ) => Effect.Effect<void, ContractFailure>;
  readonly hardDeleteEntityItems: (
    entity: string,
  ) => Effect.Effect<number, ContractFailure>;
  readonly hardDeleteAllItems: () => Effect.Effect<number, ContractFailure>;
}

declare const stdTableServiceType: unique symbol;
export interface StdTableService<Name extends string> {
  readonly contract: StdTableContract;
  readonly [stdTableServiceType]: Name;
}

const tags = new Map<
  string,
  Context.Service<StdTableService<string>, StdTableService<string>>
>();

export const StdTableService = <Name extends string>(logicalName: Name) => {
  let tag = tags.get(logicalName);
  if (tag === undefined) {
    tag = Context.Service<StdTableService<string>>(
      `std-toolkit/db/StdTable/${logicalName}`,
    );
    tags.set(logicalName, tag);
  }
  return tag as unknown as Context.Service<
    StdTableService<Name>,
    StdTableService<Name>
  >;
};

export const contractLayer = <Name extends string>(
  logicalName: Name,
  contract: StdTableContract,
): Layer.Layer<StdTableService<Name>> =>
  Layer.succeed(StdTableService(logicalName), {
    contract,
  } as StdTableService<Name>);

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
export type EncodedData = JsonObject & { readonly _v: string };

export interface EncodedItemMeta {
  readonly _e: string;
  readonly _u: string;
  readonly _d: boolean;
}

export interface EncodedItem extends EncodedKey {
  readonly meta: EncodedItemMeta;
  readonly data: EncodedData;
  readonly keys: Readonly<Record<string, string>>;
}

export const EncodedKeySchema: Schema.Codec<EncodedKey> = Schema.Struct({
  pk: Schema.String,
  sk: Schema.String,
});

export const EncodedDataSchema = Schema.declare<EncodedData>(
  (input): input is EncodedData =>
    typeof input === 'object' &&
    input !== null &&
    !Array.isArray(input) &&
    '_v' in input &&
    typeof input._v === 'string',
);

export const EncodedItemSchema: Schema.Codec<EncodedItem> = Schema.Struct({
  pk: Schema.String,
  sk: Schema.String,
  meta: Schema.Struct({
    _e: Schema.String,
    _u: Schema.String,
    _d: Schema.Boolean,
  }),
  data: EncodedDataSchema,
  keys: Schema.Record(Schema.String, Schema.String),
});

export type ItemCondition =
  | { readonly kind: 'not-exists' }
  | { readonly kind: 'exists' }
  | { readonly kind: 'updated'; readonly value: string };

export interface ConditionalPut {
  readonly item: EncodedItem;
  readonly condition?: ItemCondition;
}

export interface TransactPut extends ConditionalPut {
  readonly kind: 'put';
}

export interface TransactCheck {
  readonly kind: 'check';
  readonly key: EncodedKey;
  readonly condition: ItemCondition;
}

export type TransactItem = TransactPut | TransactCheck;

export const transactItemKey = (item: TransactItem): EncodedKey =>
  item.kind === 'put' ? item.item : item.key;

export type ItemOutcomeStatus = 'passed' | 'failed' | 'not-evaluated';

export interface ItemOutcome {
  readonly status: ItemOutcomeStatus;
  readonly detail?: string;
}

export const conditionHolds = (
  condition: ItemCondition | undefined,
  current: { readonly _u: string } | undefined,
): boolean => {
  if (condition === undefined) return true;
  if (condition.kind === 'not-exists') return current === undefined;
  if (condition.kind === 'exists') return current !== undefined;
  return current?._u === condition.value;
};

export const itemOutcomes = (
  total: number,
  failedIndex: number,
  detail?: string,
): readonly ItemOutcome[] =>
  Array.from({ length: total }, (_, index) =>
    index < failedIndex
      ? { status: 'passed' as const }
      : index === failedIndex
        ? {
            status: 'failed' as const,
            ...(detail === undefined ? {} : { detail }),
          }
        : { status: 'not-evaluated' as const },
  );

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

export interface ScanRequest {
  readonly limit: number;
  readonly startAfter?: EncodedKey;
  readonly segment?: number;
  readonly totalSegments?: number;
}

export interface ScanResult {
  readonly items: readonly EncodedItem[];
  readonly hasMore: boolean;
}

export class ConditionFailure extends Data.TaggedError('ConditionFailure')<{
  readonly outcomes?: readonly ItemOutcome[];
}> {}

/** A single-item write failing its condition: one condition needs no report. */
export const conditionFailed = () => new ConditionFailure({});

/** A transacted item failing its condition at `index`, with every op's status. */
export const checkFailed = (
  total: number,
  index: number,
  condition: ItemCondition | undefined,
) =>
  new ConditionFailure({
    outcomes: itemOutcomes(total, index, condition?.kind),
  });
export class OperationFailure extends Data.TaggedError('OperationFailure')<{
  readonly cause: unknown;
}> {}

export type ContractFailure = ConditionFailure | OperationFailure;

export interface ReadOptions {
  readonly consistent?: boolean;
}

export interface StdTableContract {
  readonly getItem: (
    key: EncodedKey,
    options?: ReadOptions,
  ) => Effect.Effect<EncodedItem | null, ContractFailure>;
  readonly queryItems: (
    request: QueryRequest,
  ) => Effect.Effect<QueryResult, ContractFailure>;
  readonly scanItems: (
    request: ScanRequest,
  ) => Effect.Effect<ScanResult, ContractFailure>;
  readonly writeItem: (
    put: ConditionalPut,
  ) => Effect.Effect<void, ContractFailure>;
  readonly transactWriteItems: (
    items: readonly TransactItem[],
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

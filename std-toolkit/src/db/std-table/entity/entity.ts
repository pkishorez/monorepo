import type { Effect, Stream } from 'effect';
import type {
  ChangeNotice,
  DecodedEntity,
  DecodedSingleEntity,
} from '../../../core/index.js';
import type {
  AnyEntityESchema,
  AnyUnkeyedESchema,
} from '../../../eschema/index.js';
import type { DatabaseError } from '../error/index.js';
import type {
  EncodedItem,
  EncodedKey,
  StdTableService,
  TransactCheck,
  TransactPut,
} from '../contract/index.js';
import type {
  AccessPatternDefinition,
  AccessPatternMap,
  GlobalSecondaryIndexMap,
  IndexComponent,
  KeyedEntityDefinition,
  LocalSecondaryIndexMap,
  PatternFor,
  SingleEntityDefinition,
} from '../definition/index.js';

export type TableEffect<A, Name extends string> = Effect.Effect<
  A,
  DatabaseError,
  StdTableService<Name>
>;
export type EntityValue<S extends AnyEntityESchema> = S['Type'];
export type EntityKey<
  S extends AnyEntityESchema,
  Pk extends readonly string[],
> = Pick<
  EntityValue<S>,
  Extract<Pk[number] | S['idField'], keyof EntityValue<S>>
>;
export type InsertValue<S extends AnyEntityESchema> = EntityValue<S>;
export type SingleUpdateInput<S extends AnyUnkeyedESchema> =
  | Partial<S['Type']>
  | ((current: S['Type']) => Partial<S['Type']>);
export type UpdateValue<S extends AnyEntityESchema> = Partial<EntityValue<S>>;
export type EntityInvariant<T> = (current: T) => boolean;
export type UpdateFn<S extends AnyEntityESchema> = (
  current: EntityValue<S>,
) => UpdateValue<S>;
export type UpdateInput<S extends AnyEntityESchema> =
  | UpdateValue<S>
  | UpdateFn<S>;
/**
 * `check` and `lastWriteWins` are mutually exclusive: an invariant is only
 * meaningful while the `_u` condition still holds the value it judged.
 */
export type WriteOptions<T> =
  | { readonly check?: undefined; readonly lastWriteWins?: boolean }
  | { readonly check: EntityInvariant<T>; readonly lastWriteWins?: false };

interface TransactTarget<Name extends string> {
  readonly tableName: Name;
  readonly entityName: string;
  readonly key: EncodedKey;
  readonly target: string;
  readonly readsCurrent: boolean;
}

export interface TransactOp<
  Name extends string = string,
  T extends object = object,
> extends TransactTarget<Name> {
  readonly operationKind:
    | 'insertOp'
    | 'updateOp'
    | 'deleteOp'
    | 'restoreOp'
    | 'singleUpdateOp';
  readonly apply: (
    current: EncodedItem | null,
    version: string,
  ) => Effect.Effect<
    {
      readonly write: TransactPut;
      readonly entity: DecodedEntity<T> | DecodedSingleEntity<T>;
    },
    DatabaseError
  >;
}

export interface CheckOp<
  Name extends string = string,
> extends TransactTarget<Name> {
  readonly operationKind: 'checkOp';
  readonly apply: (
    current: EncodedItem | null,
    version: string,
  ) => Effect.Effect<
    { readonly write: TransactCheck; readonly entity: null },
    DatabaseError
  >;
}

export type AnyTransactOp<
  Name extends string = string,
  T extends object = object,
> = TransactOp<Name, T> | CheckOp<Name>;

export type SortCondition<Sk> =
  | { readonly '=': Sk }
  | { readonly '<': Sk | null }
  | { readonly '<=': Sk | null }
  | { readonly '>': Sk | null }
  | { readonly '>=': Sk | null }
  | { readonly between: readonly [Sk, Sk] }
  | { readonly beginsWith: Sk };

export interface QueryOptions<T = unknown> {
  readonly limit?: number;
  readonly excludeDeleted?: boolean;
  readonly after?: DecodedEntity<T>;
}

export interface QueryPage<T> {
  readonly items: readonly T[];
  readonly hasMore: boolean;
}

export interface KeyedEntity<
  Name extends string,
  S extends AnyEntityESchema,
  Pk extends readonly string[],
  Patterns extends AccessPatternMap,
> extends KeyedEntityDefinition<
  Name,
  S,
  Pk,
  readonly [S['idField']],
  Patterns
> {
  get(
    key: EntityKey<S, Pk>,
    options?: { readonly excludeDeleted?: boolean },
  ): TableEffect<DecodedEntity<EntityValue<S>> | null, Name>;
  insert(
    value: InsertValue<S>,
  ): TableEffect<DecodedEntity<EntityValue<S>>, Name>;
  insertOp(
    value: InsertValue<S>,
  ): TableEffect<TransactOp<Name, EntityValue<S>>, Name>;
  getAndUpdate(
    key: EntityKey<S, Pk>,
    update: UpdateInput<S>,
    options?: WriteOptions<EntityValue<S>> & { readonly retries?: number },
  ): TableEffect<DecodedEntity<EntityValue<S>>, Name>;
  getAndUpdateOp(
    key: EntityKey<S, Pk>,
    update: UpdateInput<S>,
    options?: WriteOptions<EntityValue<S>>,
  ): TableEffect<TransactOp<Name, EntityValue<S>>, Name>;
  getAndCheckOp(
    key: EntityKey<S, Pk>,
    check: EntityInvariant<EntityValue<S>>,
  ): TableEffect<CheckOp<Name>, Name>;
  delete(
    key: EntityKey<S, Pk>,
    options?: WriteOptions<EntityValue<S>>,
  ): TableEffect<DecodedEntity<EntityValue<S>>, Name>;
  deleteOp(
    key: EntityKey<S, Pk>,
    options?: WriteOptions<EntityValue<S>>,
  ): TableEffect<TransactOp<Name, EntityValue<S>>, Name>;
  restore(
    key: EntityKey<S, Pk>,
    options?: WriteOptions<EntityValue<S>>,
  ): TableEffect<DecodedEntity<EntityValue<S>>, Name>;
  restoreOp(
    key: EntityKey<S, Pk>,
    options?: WriteOptions<EntityValue<S>>,
  ): TableEffect<TransactOp<Name, EntityValue<S>>, Name>;
  unchangedOp(
    entity: DecodedEntity<EntityValue<S>>,
  ): TableEffect<CheckOp<Name>, Name>;
  existsOp(key: EntityKey<S, Pk>): TableEffect<CheckOp<Name>, Name>;
  notExistsOp(key: EntityKey<S, Pk>): TableEffect<CheckOp<Name>, Name>;
  hardDelete(
    key: EntityKey<S, Pk>,
    confirmation: 'I KNOW WHAT I AM DOING',
  ): TableEffect<DecodedEntity<EntityValue<S>>, Name>;
  dangerouslyRemoveAllItems(
    confirmation: 'I KNOW WHAT I AM DOING',
  ): TableEffect<{ readonly itemsDeleted: number }, Name>;
  query<Pattern extends keyof Patterns & string>(
    pattern: Pattern,
    input: {
      readonly pk: Record<Patterns[Pattern]['pk'][number], string>;
    } & SortCondition<Record<Patterns[Pattern]['sk'][number], string>>,
    options?: QueryOptions<EntityValue<S>>,
  ): TableEffect<QueryPage<DecodedEntity<EntityValue<S>>>, Name>;
  subscribe(
    filter?: Partial<EntityValue<S>>,
  ): Stream.Stream<ChangeNotice<EntityValue<S>>>;
}

export interface SingleEntity<
  Name extends string,
  S extends AnyUnkeyedESchema,
> extends SingleEntityDefinition<Name, S> {
  get(): TableEffect<DecodedSingleEntity<S['Type']>, Name>;
  put(value: S['Type']): TableEffect<DecodedSingleEntity<S['Type']>, Name>;
  getAndUpdate(
    update: SingleUpdateInput<S>,
    options?: WriteOptions<S['Type']> & { readonly retries?: number },
  ): TableEffect<DecodedSingleEntity<S['Type']>, Name>;
  getAndUpdateOp(
    update: SingleUpdateInput<S>,
    options?: WriteOptions<S['Type']>,
  ): TableEffect<TransactOp<Name, S['Type']>, Name>;
  unchangedOp(
    entity: DecodedSingleEntity<S['Type']>,
  ): TableEffect<CheckOp<Name>, Name>;
  reset(): TableEffect<DecodedSingleEntity<S['Type']>, Name>;
  subscribe(
    filter?: Partial<S['Type']>,
  ): Stream.Stream<ChangeNotice<S['Type']>>;
}

export interface KeyedBuilderStart<
  Name extends string,
  S extends AnyEntityESchema,
  Lsis extends LocalSecondaryIndexMap = LocalSecondaryIndexMap,
  Gsis extends GlobalSecondaryIndexMap = GlobalSecondaryIndexMap,
> {
  primary<
    const Pk extends readonly Exclude<IndexComponent<S>, '_u'>[] = [],
  >(derivation?: {
    readonly pk: Pk;
  }): KeyedBuilder<
    Name,
    S,
    Lsis,
    Gsis,
    Pk,
    Record<
      'primary',
      AccessPatternDefinition<undefined, 'primary', Pk, readonly [S['idField']]>
    >
  >;
}

export interface KeyedBuilder<
  Name extends string,
  S extends AnyEntityESchema,
  Lsis extends LocalSecondaryIndexMap,
  Gsis extends GlobalSecondaryIndexMap,
  Pk extends readonly string[],
  Patterns extends AccessPatternMap,
> {
  index<
    const Slot extends keyof (Lsis & Gsis) & string,
    const Pattern extends string,
    const D extends (Slot extends keyof Lsis
      ? { readonly sk: readonly IndexComponent<S>[]; readonly pk?: never }
      : {
          readonly pk: readonly IndexComponent<S>[];
          readonly sk?: readonly IndexComponent<S>[];
        }),
  >(
    slot: Slot,
    pattern: Pattern,
    derivation: D,
  ): KeyedBuilder<
    Name,
    S,
    Lsis,
    Gsis,
    Pk,
    Patterns & Record<Pattern, PatternFor<Slot, S, Lsis, Pk, D>>
  >;
  build(): KeyedEntity<Name, S, Pk, Patterns>;
}

export interface SingleBuilder<
  Name extends string,
  S extends AnyUnkeyedESchema,
> {
  default(value: S['Type']): SingleEntity<Name, S>;
}

export { makeKeyedEntity } from './keyed.js';
export { makeSingleEntity } from './single.js';
export {
  broadcast,
  changesOrEmpty,
  dbError,
  failReason,
  subscribe,
} from './effects.js';

import type { Effect } from 'effect';
import type { EntityType, SingleEntityType } from '../../../core/index.js';
import type {
  AnyEntityESchema,
  AnyUnkeyedESchema,
  ESchemaType,
} from '../../../eschema/index.js';
import type { DatabaseError } from '../error/index.js';
import type {
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
export type EntityValue<S extends AnyEntityESchema> = ESchemaType<S>;
export type EntityKey<
  S extends AnyEntityESchema,
  Pk extends readonly string[],
> = Pick<
  EntityValue<S>,
  Extract<Pk[number] | S['idField'], keyof EntityValue<S>>
>;
export type InsertValue<S extends AnyEntityESchema> = Omit<
  EntityValue<S>,
  '_v'
>;
export type UpdateValue<S extends AnyEntityESchema> = Partial<
  Omit<EntityValue<S>, '_v'>
>;
export type UpdateInput<S extends AnyEntityESchema> =
  | UpdateValue<S>
  | ((current: EntityValue<S>) => UpdateValue<S> | null);

interface TransactTarget<Name extends string> {
  readonly tableName: Name;
  readonly entityName: string;
  readonly key: EncodedKey;
  readonly target: string;
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
  readonly apply: (version: string) => {
    readonly write: TransactPut;
    readonly entity: EntityType<T> | SingleEntityType<T>;
  };
}

export interface CheckOp<
  Name extends string = string,
> extends TransactTarget<Name> {
  readonly operationKind: 'checkOp';
  readonly apply: () => {
    readonly write: TransactCheck;
    readonly entity: null;
  };
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
  readonly after?: EntityType<T>;
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
  ): TableEffect<EntityType<EntityValue<S>> | null, Name>;
  insert(value: InsertValue<S>): TableEffect<EntityType<EntityValue<S>>, Name>;
  insertOp(
    value: InsertValue<S>,
  ): TableEffect<TransactOp<Name, EntityValue<S>>, Name>;
  getAndUpdate(
    key: EntityKey<S, Pk>,
    update: UpdateInput<S>,
    options?: { readonly retries?: number; readonly lastWriteWins?: boolean },
  ): TableEffect<EntityType<EntityValue<S>>, Name>;
  getAndUpdateOp(
    key: EntityKey<S, Pk>,
    update: Exclude<UpdateInput<S>, (current: EntityValue<S>) => null>,
    options?: { readonly lastWriteWins?: boolean },
  ): TableEffect<TransactOp<Name, EntityValue<S>>, Name>;
  delete(key: EntityKey<S, Pk>): TableEffect<EntityType<EntityValue<S>>, Name>;
  deleteOp(
    key: EntityKey<S, Pk>,
    options?: { readonly lastWriteWins?: boolean },
  ): TableEffect<TransactOp<Name, EntityValue<S>>, Name>;
  restore(key: EntityKey<S, Pk>): TableEffect<EntityType<EntityValue<S>>, Name>;
  restoreOp(
    key: EntityKey<S, Pk>,
    options?: { readonly lastWriteWins?: boolean },
  ): TableEffect<TransactOp<Name, EntityValue<S>>, Name>;
  unchangedOp(
    entity: EntityType<EntityValue<S>>,
  ): TableEffect<CheckOp<Name>, Name>;
  existsOp(key: EntityKey<S, Pk>): TableEffect<CheckOp<Name>, Name>;
  notExistsOp(key: EntityKey<S, Pk>): TableEffect<CheckOp<Name>, Name>;
  hardDelete(
    key: EntityKey<S, Pk>,
    confirmation: 'I KNOW WHAT I AM DOING',
  ): TableEffect<EntityType<EntityValue<S>>, Name>;
  dangerouslyRemoveAllItems(
    confirmation: 'I KNOW WHAT I AM DOING',
  ): TableEffect<{ readonly itemsDeleted: number }, Name>;
  query<Pattern extends keyof Patterns & string>(
    pattern: Pattern,
    input: {
      readonly pk: Record<Patterns[Pattern]['pk'][number], string>;
    } & SortCondition<Record<Patterns[Pattern]['sk'][number], string>>,
    options?: QueryOptions<EntityValue<S>>,
  ): TableEffect<QueryPage<EntityType<EntityValue<S>>>, Name>;
}

export interface SingleEntity<
  Name extends string,
  S extends AnyUnkeyedESchema,
> extends SingleEntityDefinition<Name, S> {
  get(): TableEffect<SingleEntityType<ESchemaType<S>>, Name>;
  put(
    value: ESchemaType<S>,
  ): TableEffect<SingleEntityType<ESchemaType<S>>, Name>;
  getAndUpdate(
    update:
      | Partial<ESchemaType<S>>
      | ((current: ESchemaType<S>) => Partial<ESchemaType<S>> | null),
    options?: { readonly retries?: number; readonly lastWriteWins?: boolean },
  ): TableEffect<SingleEntityType<ESchemaType<S>>, Name>;
  getAndUpdateOp(
    update:
      | Partial<ESchemaType<S>>
      | ((current: ESchemaType<S>) => Partial<ESchemaType<S>>),
    options?: { readonly lastWriteWins?: boolean },
  ): TableEffect<TransactOp<Name, ESchemaType<S>>, Name>;
  unchangedOp(
    entity: SingleEntityType<ESchemaType<S>>,
  ): TableEffect<CheckOp<Name>, Name>;
  reset(): TableEffect<SingleEntityType<ESchemaType<S>>, Name>;
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
  default(value: ESchemaType<S>): SingleEntity<Name, S>;
}

export { makeKeyedEntity } from './keyed.js';
export { makeSingleEntity } from './single.js';
export { broadcast, dbError, failReason } from './effects.js';

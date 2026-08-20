import type {
  Collection,
  GetResult,
  QueryBuilder,
  Transaction,
} from '@tanstack/react-db';
import { Duration, Effect, Stream } from 'effect';
import type { StoryContext } from 'laymos/story';
import type { DecodedEntity } from 'std-toolkit/core';
import type { KeyedEntityDefinition, StdTable } from 'std-toolkit/db';
import type { AnyEntityESchema } from 'std-toolkit/eschema';
import type { SyncConfig } from 'std-toolkit/sync';

import type { makeBackend } from './backend.js';
import type { makeBrowser } from './browser.js';

export type AnyEntity = KeyedEntityDefinition<
  string,
  AnyEntityESchema,
  readonly string[],
  readonly string[],
  any
> & {
  insert(value: any): Effect.Effect<DecodedEntity<any>, unknown, any>;
  getAndUpdate(
    key: any,
    changes: any,
  ): Effect.Effect<DecodedEntity<any>, unknown, any>;
  delete(key: any): Effect.Effect<DecodedEntity<any>, unknown, any>;
  query(...args: any[]): Effect.Effect<
    {
      readonly items: readonly DecodedEntity<any>[];
      readonly hasMore: boolean;
    },
    unknown,
    any
  >;
  insertOp(value: any): Effect.Effect<any, unknown, any>;
  getAndUpdateOp(key: any, changes: any): Effect.Effect<any, unknown, any>;
  deleteOp(key: any): Effect.Effect<any, unknown, any>;
};

export type ItemOf<E extends AnyEntity> = E['schema']['Type'];
export type NameOf<E extends AnyEntity> = E['name'];
export type KeyOf<E extends AnyEntity> = Parameters<E['delete']>[0];
export type InsertOf<E extends AnyEntity> = Parameters<E['insert']>[0];
export type DefinitionName<D extends AnyDefinition> = NameOf<D['entity']>;
export type Names<D extends readonly AnyDefinition[]> = DefinitionName<
  D[number]
>;
export type DefinitionAt<
  D extends readonly AnyDefinition[],
  N extends Names<D>,
> = Extract<D[number], { readonly entity: { readonly name: N } }>;
export type EntityAt<
  D extends readonly AnyDefinition[],
  N extends Names<D>,
> = DefinitionAt<D, N>['entity'];

export type EffectValue<T> =
  T extends Effect.Effect<infer A, any, any> ? A : never;
export type EffectError<T> =
  T extends Effect.Effect<any, infer E, any> ? E : never;
export type CollectionSubscription = ReturnType<
  Collection<any, any, any>['subscribeChanges']
>;

export type BackendEntity<E extends AnyEntity> = {
  readonly name: NameOf<E>;
  insert(value: InsertOf<E>): Effect.Effect<DecodedEntity<ItemOf<E>>, unknown>;
  update(
    key: KeyOf<E>,
    changes: Partial<ItemOf<E>>,
  ): Effect.Effect<DecodedEntity<ItemOf<E>>, unknown>;
  remove(key: KeyOf<E>): Effect.Effect<DecodedEntity<ItemOf<E>>, unknown>;
  query(
    ...args: Parameters<E['query']>
  ): Effect.Effect<
    EffectValue<ReturnType<E['query']>>,
    EffectError<ReturnType<E['query']>>
  >;
  changes(options: {
    readonly cursor: DecodedEntity<ItemOf<E>> | null;
    readonly catchUp: (
      cursor: DecodedEntity<ItemOf<E>> | null,
    ) => Effect.Effect<readonly DecodedEntity<ItemOf<E>>[], unknown>;
    readonly includes?: (entity: DecodedEntity<ItemOf<E>>) => boolean;
  }): Stream.Stream<DecodedEntity<ItemOf<E>>[], unknown>;
};

export type CollectionDefinition<E extends AnyEntity> = {
  readonly entity: E;
  readonly configure: (context: { readonly backend: BackendEntity<E> }) => Omit<
    SyncConfig<E['schema']>,
    'schema' | 'onInsert' | 'onUpdate' | 'onDelete'
  > & {
    readonly onUpdate?: SyncConfig<E['schema']>['onUpdate'];
  };
};

export type AnyDefinition = {
  readonly entity: AnyEntity;
  readonly configure: (context: any) => any;
};

export type BrowserCollection<E extends AnyEntity> = Collection<
  ItemOf<E> & Record<string, unknown>,
  string,
  any
>;

export type ExpectedRow<T extends object> = Omit<
  T,
  '$synced' | '$origin' | '$key' | '$collectionId'
>;

export type StoryLiveQuery<T extends object> = Collection<
  T,
  string | number,
  any
> & {
  shows(
    expected: readonly ExpectedRow<T>[],
  ): Effect.Effect<void, unknown, StoryContext>;
  eventuallyShows(
    expected: readonly ExpectedRow<T>[],
  ): Effect.Effect<void, unknown, StoryContext>;
};

export type QueryResult<Q extends QueryBuilder<any>> = Extract<
  GetResult<Q extends QueryBuilder<infer Context> ? Context : never>,
  object
>;

export type WriteGate = {
  readonly succeed: Effect.Effect<void>;
  fail(error: unknown): Effect.Effect<void>;
};

export type TransactionHandle = {
  readonly transaction: Transaction;
  readonly persisted: Effect.Effect<void, unknown>;
  readonly failed: Effect.Effect<void, unknown>;
};

export type SimulationConfig<D extends readonly AnyDefinition[]> = {
  readonly table: StdTable;
  readonly collections: D;
  readonly leadership?: SimulationLeadershipConfig;
};

export type SimulationLeadershipConfig =
  | { readonly _tag: 'InMemory' }
  | {
      readonly _tag: 'WebLocks';
      readonly releaseWhen: 'hidden' | 'frozen';
    };

export type Tab<D extends readonly AnyDefinition[]> = ReturnType<
  typeof makeBrowser<D>
>;

export type BrowserWithTabs<D extends readonly AnyDefinition[]> = Tab<D> & {
  tab(name: string): Tab<D>;
};

export type Device<D extends readonly AnyDefinition[]> = {
  readonly connection: Connection;
  readonly tabs: Map<string, Tab<D>>;
};

export const MAIN_TAB = 'main';

export type SimulationWorld<D extends readonly AnyDefinition[]> = {
  readonly backend: ReturnType<typeof makeBackend<D>>;
  browser(name: string): BrowserWithTabs<D>;
  concurrent<const Effects extends readonly Effect.Effect<any, any, any>[]>(
    ...effects: Effects
  ): Effect.Effect<
    { -readonly [K in keyof Effects]: EffectValue<Effects[K]> },
    EffectError<Effects[number]>,
    any
  >;
};

export type SimulationScript<D extends readonly AnyDefinition[], A, E> = (
  world: SimulationWorld<D>,
) => Effect.Effect<A, E, StoryContext>;

// Small shared helpers

export class BrowserDisconnected extends Error {
  readonly _tag = 'BrowserDisconnected';

  constructor(readonly browser: string) {
    super(`Browser "${browser}" is disconnected from the Backend`);
  }
}

export const effectFromPromise = <A>(promise: Promise<A>) =>
  Effect.tryPromise({ try: () => promise, catch: (error) => error });

export const canonical = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value
      .map(canonical)
      .sort((left, right) =>
        JSON.stringify(left).localeCompare(JSON.stringify(right)),
      );
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== '_meta' && !key.startsWith('$'))
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonical(child)]),
    );
  }
  return value;
};

export const same = (left: unknown, right: unknown) =>
  JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));

export const withoutRuntimeFields = <A extends object>(value: A): A =>
  canonical(value) as A;

export const eventually = <A extends object>(
  collection: Collection<A, any, any>,
  expected: readonly unknown[],
  timeout = Duration.seconds(5),
) =>
  effectFromPromise(
    new Promise<boolean>((resolve) => {
      const matches = () => same(collection.toArray, expected);
      if (matches()) {
        resolve(true);
        return;
      }
      let settled = false;
      const finish = (result: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        subscription.unsubscribe();
        resolve(result);
      };
      const subscription = collection.subscribeChanges(() => {
        if (matches()) finish(true);
      });
      const timer = setTimeout(() => finish(false), Duration.toMillis(timeout));
    }),
  );

export const keyFrom = <E extends AnyEntity>(
  entity: E,
  value: ItemOf<E>,
): KeyOf<E> =>
  Object.fromEntries(
    [...entity.primary.pk, entity.schema.idField].map((field) => [
      field,
      value[field as keyof ItemOf<E>],
    ]),
  ) as KeyOf<E>;

export const assertKeyFieldsUnchanged = <E extends AnyEntity>(
  entity: E,
  original: ItemOf<E>,
  modified: ItemOf<E>,
) => {
  for (const field of entity.primary.pk) {
    if (
      original[field as keyof ItemOf<E>] !== modified[field as keyof ItemOf<E>]
    ) {
      throw new Error(
        `Cannot change Entity key field "${field}" on ${entity.name}; delete and insert instead`,
      );
    }
  }
};

// Backend

export type Connection = {
  readonly browser: string;
  online: boolean;
  readonly disconnectListeners: Set<() => void>;
};

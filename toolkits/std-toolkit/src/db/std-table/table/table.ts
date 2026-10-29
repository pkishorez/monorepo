import type { Effect, Stream } from 'effect';
import type {
  AnyEntityESchema,
  AnyUnkeyedESchema,
  ESchemaType,
  ESchemaVersions,
  GapVersions,
  PreviousVersion,
} from '../../../eschema/index.js';
import type {
  ChangeNotice,
  Entity,
  SingletonEntity,
} from '../../../core/index.js';
import type { DatabaseError } from '../error/index.js';
import type { StoredItem, StdTableService } from '../contract/index.js';
import {
  addBackfill,
  addIndex,
  assertGapsFilled,
  copyTopology,
  declareSingleEntity,
  makeTopology,
  startKeyedEntity,
  type AccessPatternMap,
  type BackfillDeclaration,
  type BackfillOptions,
  type EntityDeclaration,
  type GlobalSecondaryIndex,
  type GlobalSecondaryIndexMap,
  type KeyedEntityBuilder,
  type KeyedEntityBuilderStart,
  type LocalSecondaryIndex,
  type LocalSecondaryIndexMap,
  type MutableTopology,
  type PrimaryIndex,
  type TableDefinition,
} from '../definition/index.js';
import type {
  AnyTransactOp,
  KeyedEntity,
  SingleEntity,
  TableEffect,
  TransactOp,
} from '../entity/index.js';
import { decorateTable, TABLE_MEMBERS } from './decoration.js';

export interface ScanOptions {
  readonly parallelism?: number;
}

export interface DriftResult {
  readonly drifted: boolean;
  readonly currentForm: StoredItem;
}

type TableStream<A, Name extends string> = Stream.Stream<
  A,
  DatabaseError,
  StdTableService<Name>
>;

/**
 * The table-wide surface. A built table also carries each of its entities
 * under its ESchema name (see {@link BackfillsBuilder.build}).
 */
export interface StdTable<
  Name extends string = string,
  Primary extends PrimaryIndex = PrimaryIndex,
  Lsis extends LocalSecondaryIndexMap = LocalSecondaryIndexMap,
  Gsis extends GlobalSecondaryIndexMap = GlobalSecondaryIndexMap,
> extends TableDefinition<Name, Primary, Lsis, Gsis> {
  transact<const Ops extends readonly AnyTransactOp<Name>[]>(
    ops: Ops,
  ): TableEffect<
    {
      readonly [K in keyof Ops]: Ops[K] extends {
        readonly operationKind: 'checkOp';
      }
        ? null
        : Ops[K] extends TransactOp<Name, infer T>
          ? Entity<T> | SingletonEntity<T>
          : never;
    },
    Name
  >;
  dangerouslyRemoveAllItems(
    confirmation: 'I KNOW WHAT I AM DOING',
  ): TableEffect<{ readonly itemsDeleted: number }, Name>;
  subscribe(): Stream.Stream<ChangeNotice>;
  scan(options?: ScanOptions): TableStream<StoredItem, Name>;
  drift(item: StoredItem): TableEffect<DriftResult, Name>;
  reindex(currentForm: StoredItem): TableEffect<void, Name>;
}

/** Entity surfaces by ESchema name, as a built table carries them. */
export type EntityMap = { readonly [Name in string]?: unknown };

/**
 * A schema whose name is still free on this table. A name already declared,
 * or one the table itself uses (`scan`, `transact`, ...), fails to type-check.
 */
type FreeName<S extends { readonly name: string }, Taken> = S &
  (S['name'] extends Taken
    ? {
        readonly '~std-toolkit/error': `Entity name "${S['name']}" is already taken on this table`;
      }
    : unknown);

type Taken<Entities> = keyof Entities | keyof StdTable;

type SchemaOf<E> = E extends { readonly schema: infer S } ? S : never;

/** An ESchema's value at version `V`; never for a version it does not have. */
type ValueAt<X, V> = V extends keyof ESchemaVersions<X>
  ? ESchemaVersions<X>[V]
  : never;

/** Known gap versions; none for a schema whose type has lost its versions. */
type GapsOf<X> = string extends GapVersions<X> ? never : GapVersions<X>;

/** The gap versions of entity `E` that no Backfill fills yet. */
type Unfilled<Entities, E, Filled> = E extends keyof Entities & string
  ? Exclude<
      GapsOf<SchemaOf<Entities[E]>>,
      Filled extends `${E}@${infer V}` ? V : never
    >
  : never;

/** Declared entities with a gap version no Backfill fills yet. */
type GapEntity<Entities, Filled> = {
  [K in keyof Entities & string]: [Unfilled<Entities, K, Filled>] extends [
    never,
  ]
    ? never
    : K;
}[keyof Entities & string];

type KeyedEntityName<Entities> = {
  [K in keyof Entities & string]: Entities[K] extends {
    readonly kind: 'keyed';
  }
    ? K
    : never;
}[keyof Entities & string];

/** Each unfilled gap version, as `Entity vN`. */
type MissingBackfill<Entities, Filled> = {
  [K in keyof Entities & string]: `${K} ${Unfilled<Entities, K, Filled>}`;
}[keyof Entities & string];

/** `build` type-checks only once every gap version has its Backfill. */
type GapsFilled<Entities, Filled> = [
  MissingBackfill<Entities, Filled>,
] extends [never]
  ? unknown
  : {
      readonly '~std-toolkit/error': `Every gap version needs a Backfill; none fills ${MissingBackfill<Entities, Filled>}`;
    };

type FreeBackfillId<Id extends string, Ids> = Id extends ''
  ? { readonly '~std-toolkit/error': 'A Backfill id must not be empty' }
  : Id extends Ids
    ? {
        readonly '~std-toolkit/error': `Backfill "${Id}" is already declared on this table`;
      }
    : unknown;

type EntityReads<E> =
  E extends KeyedEntity<infer _N, infer _S, infer _Pk, infer _P>
    ? Pick<E, 'get' | 'query'>
    : E extends SingleEntity<infer _N, infer _S>
      ? Pick<E, 'get'>
      : never;

/**
 * What a Backfill's `run` may do with the table: read any declared entity,
 * and nothing else. A Backfill writes only the row it returns.
 */
export type BackfillReads<Entities> = {
  readonly [K in keyof Entities]: EntityReads<Entities[K]>;
};

/** The options of a Backfill that fills gap version `V` of entity `K`. */
interface GapBackfillOptions<
  Name extends string,
  Entities,
  K extends keyof Entities,
  V,
  Ids,
> {
  readonly entity: K;
  readonly to: V;
  readonly after?: readonly Ids[];
  readonly run: (
    value: ValueAt<SchemaOf<Entities[K]>, PreviousVersion<V & string>>,
    db: BackfillReads<Entities>,
  ) => Effect.Effect<
    ValueAt<SchemaOf<Entities[K]>, V>,
    unknown,
    StdTableService<Name>
  >;
}

/** The options of a Backfill that reindexes keyed entity `K`. */
interface ReindexBackfillOptions<K, Ids> {
  readonly reindex: K;
  readonly after?: readonly Ids[];
}

/**
 * Every Backfill the table may still declare: one per unfilled gap version,
 * told apart by `entity` and `to`, and a reindex of any keyed entity.
 */
type BackfillChoice<Name extends string, Entities, Filled, Ids> =
  | {
      [K in GapEntity<Entities, Filled>]: {
        [V in Unfilled<Entities, K, Filled>]: GapBackfillOptions<
          Name,
          Entities,
          K,
          V,
          Ids
        >;
      }[Unfilled<Entities, K, Filled>];
    }[GapEntity<Entities, Filled>]
  | ReindexBackfillOptions<KeyedEntityName<Entities>, Ids>;

type FilledBy<Options> = Options extends {
  readonly entity: infer K extends string;
  readonly to: infer V extends string;
}
  ? `${K}@${V}`
  : never;

/**
 * The Backfills step of a table declaration (ADR 0020): entities are fixed,
 * and every gap version of every entity gets exactly one Backfill before the
 * table builds.
 */
export interface BackfillsBuilder<
  Name extends string,
  Primary extends PrimaryIndex,
  Lsis extends LocalSecondaryIndexMap,
  Gsis extends GlobalSecondaryIndexMap,
  Entities extends EntityMap,
  Filled extends string,
  Ids extends string,
> {
  /**
   * Declares a Backfill under `id`, which never changes once shipped.
   *
   * - `{ entity, to, run }` fills gap version `to` of `entity`: `run` reads a
   *   row at the version before and returns its value at `to`, and may read
   *   any entity through `db`.
   * - `{ reindex }` rewrites every row of a keyed entity so its index keys
   *   are current.
   *
   * `after` names Backfills declared earlier that must finish first.
   */
  backfill<
    const Id extends string,
    const Options extends BackfillChoice<Name, Entities, Filled, Ids>,
  >(
    id: Id & FreeBackfillId<Id, Ids>,
    options: Options,
  ): BackfillsBuilder<
    Name,
    Primary,
    Lsis,
    Gsis,
    Entities,
    Filled | FilledBy<Options>,
    Ids | Id
  >;
  build(
    this: GapsFilled<Entities, Filled>,
  ): StdTable<Name, Primary, Lsis, Gsis> & Entities;
}

/**
 * The entities step of a table declaration: topology is fixed, and each
 * entity is declared once, under its ESchema name. Backfills (ADR 0020) come
 * after the entities; once one is declared, no more entities are.
 */
export interface EntitiesBuilder<
  Name extends string,
  Primary extends PrimaryIndex,
  Lsis extends LocalSecondaryIndexMap,
  Gsis extends GlobalSecondaryIndexMap,
  Entities extends EntityMap,
> extends BackfillsBuilder<Name, Primary, Lsis, Gsis, Entities, never, never> {
  entity<
    S extends AnyEntityESchema,
    Pk extends readonly string[],
    Patterns extends AccessPatternMap,
  >(
    schema: FreeName<S, Taken<Entities>>,
    configure: (
      entity: KeyedEntityBuilderStart<S, Lsis, Gsis>,
    ) => KeyedEntityBuilder<S, Lsis, Gsis, Pk, Patterns>,
  ): EntitiesBuilder<
    Name,
    Primary,
    Lsis,
    Gsis,
    Entities & {
      readonly [K in S['name']]: KeyedEntity<Name, S, Pk, Patterns>;
    }
  >;
  singleEntity<S extends AnyUnkeyedESchema>(
    schema: FreeName<S, Taken<Entities>>,
    options: { readonly default: ESchemaType<S> },
  ): EntitiesBuilder<
    Name,
    Primary,
    Lsis,
    Gsis,
    Entities & { readonly [K in S['name']]: SingleEntity<Name, S> }
  >;
}

/** The topology step: indexes first, then entities. */
export interface TopologyBuilder<
  Name extends string,
  Primary extends PrimaryIndex,
  Lsis extends LocalSecondaryIndexMap,
  Gsis extends GlobalSecondaryIndexMap,
> extends EntitiesBuilder<Name, Primary, Lsis, Gsis, {}> {
  lsi<const Slot extends string, const Sk extends string>(
    name: Slot,
    sk: Sk,
  ): TopologyBuilder<
    Name,
    Primary,
    Lsis & Record<Slot, LocalSecondaryIndex<Slot, Primary['pk'], Sk>>,
    Gsis
  >;
  gsi<
    const Slot extends string,
    const Pk extends string,
    const Sk extends string,
  >(
    name: Slot,
    pk: Pk,
    sk: Sk,
  ): TopologyBuilder<
    Name,
    Primary,
    Lsis,
    Gsis & Record<Slot, GlobalSecondaryIndex<Slot, Pk, Sk>>
  >;
}

export interface TableBuilder<Name extends string> {
  readonly logicalName: Name;
  primary<const Pk extends string, const Sk extends string>(
    pk: Pk,
    sk: Sk,
  ): TopologyBuilder<Name, PrimaryIndex<Pk, Sk>, {}, {}>;
}

/** What a declaration holds so far; each step returns a new one. */
export interface TableDeclaration {
  readonly logicalName: string;
  readonly topology: MutableTopology;
  readonly entities: readonly EntityDeclaration[];
  readonly backfills: readonly BackfillDeclaration[];
}

const withEntity = (
  declaration: TableDeclaration,
  entity: EntityDeclaration,
): TableDeclaration => {
  const name = entity.schema.name;
  if (declaration.entities.some(({ schema }) => schema.name === name))
    throw new Error(`Entity "${name}" is already defined`);
  if (TABLE_MEMBERS.has(name))
    throw new Error(
      `Entity name "${name}" is taken by the table's own "${name}"`,
    );
  return { ...declaration, entities: [...declaration.entities, entity] };
};

const backfillsBuilder = (
  declaration: TableDeclaration,
): BackfillsBuilder<string, PrimaryIndex, {}, {}, {}, never, never> => ({
  backfill(id: string, options: BackfillOptions) {
    return backfillsBuilder({
      ...declaration,
      backfills: addBackfill(
        declaration.entities,
        declaration.backfills,
        id,
        options,
      ),
    }) as never;
  },
  build() {
    assertGapsFilled(declaration.entities, declaration.backfills);
    return decorateTable(declaration) as never;
  },
});

const entitiesBuilder = (
  declaration: TableDeclaration,
): EntitiesBuilder<string, PrimaryIndex, {}, {}, {}> => ({
  ...backfillsBuilder(declaration),
  entity(schema, configure) {
    const start = startKeyedEntity(declaration.topology, schema);
    return entitiesBuilder(
      withEntity(declaration, configure(start).declaration),
    ) as never;
  },
  singleEntity(schema, options) {
    return entitiesBuilder(
      withEntity(declaration, declareSingleEntity(schema, options.default)),
    ) as never;
  },
});

const topologyBuilder = (
  declaration: TableDeclaration,
): TopologyBuilder<string, PrimaryIndex, {}, {}> => ({
  ...entitiesBuilder(declaration),
  lsi(name, sk) {
    const topology = copyTopology(declaration.topology);
    addIndex(topology, {
      name,
      kind: 'lsi',
      pk: topology.primary.pk,
      sk,
    });
    return topologyBuilder({ ...declaration, topology }) as never;
  },
  gsi(name, pk, sk) {
    const topology = copyTopology(declaration.topology);
    addIndex(topology, { name, kind: 'gsi', pk, sk });
    return topologyBuilder({ ...declaration, topology }) as never;
  },
});

export const StdTable = {
  make<const Name extends string>(logicalName: Name): TableBuilder<Name> {
    if (logicalName === '')
      throw new Error('Logical Table name must not be empty');
    return Object.freeze({
      logicalName,
      primary(pk: string, sk: string) {
        return topologyBuilder({
          logicalName,
          topology: makeTopology(pk, sk),
          entities: [],
          backfills: [],
        }) as never;
      },
    });
  },
};

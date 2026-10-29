import type { Stream } from 'effect';
import type {
  AnyEntityESchema,
  AnyUnkeyedESchema,
  ESchemaType,
} from '../../../eschema/index.js';
import type {
  ChangeNotice,
  Entity,
  SingletonEntity,
} from '../../../core/index.js';
import type { DatabaseError } from '../error/index.js';
import type { StoredItem, StdTableService } from '../contract/index.js';
import {
  addIndex,
  copyTopology,
  declareSingleEntity,
  makeTopology,
  startKeyedEntity,
  type AccessPatternMap,
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
 * under its ESchema name (see {@link EntitiesBuilder.build}).
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

/**
 * The entities step of a table declaration: topology is fixed, and each
 * entity is declared once, under its ESchema name. Backfills (ADR 0020) are
 * declared after the entities, so a `backfill` step belongs here, leading to
 * a stage that takes no more entities.
 */
export interface EntitiesBuilder<
  Name extends string,
  Primary extends PrimaryIndex,
  Lsis extends LocalSecondaryIndexMap,
  Gsis extends GlobalSecondaryIndexMap,
  Entities extends EntityMap,
> {
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
  build(): StdTable<Name, Primary, Lsis, Gsis> & Entities;
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

const entitiesBuilder = (
  declaration: TableDeclaration,
): EntitiesBuilder<string, PrimaryIndex, {}, {}, {}> => ({
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
  build() {
    return decorateTable(declaration) as never;
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
        }) as never;
      },
    });
  },
};

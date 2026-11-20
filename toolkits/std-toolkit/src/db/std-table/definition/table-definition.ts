import { isInternalEntity } from '../contract/index.js';
import type {
  AnyEntityESchema,
  AnyUnkeyedESchema,
} from '../../../eschema/index.js';
import type {
  GlobalSecondaryIndexMap,
  LocalSecondaryIndexMap,
  PrimaryIndex,
  TableBuilder,
  TableDefinition,
  TableTopologyBuilder,
} from './definition.js';
import {
  makeKeyedEntityBuilder,
  makeSingleEntityBuilder,
  type RegisteredEntity,
} from './entity-definition.js';
import {
  SnapshotEntityRecord,
  SnapshotRecord,
  SnapshotVersionRecord,
  type SnapshotValue,
} from './snapshot-entities.js';
import {
  addIndex,
  copyTopology,
  makeTopology,
  type MutableTopology,
} from './topology.js';

const makeTopologyBuilder = <
  Name extends string,
  Primary extends PrimaryIndex,
  Lsis extends LocalSecondaryIndexMap,
  Gsis extends GlobalSecondaryIndexMap,
>(
  logicalName: Name,
  topology: MutableTopology,
): TableTopologyBuilder<Name, Primary, Lsis, Gsis> => ({
  lsi(name, sk) {
    const next = copyTopology(topology);
    addIndex(next, {
      name,
      kind: 'lsi',
      pk: topology.primary.pk,
      sk,
    });
    return makeTopologyBuilder(logicalName, next) as never;
  },
  gsi(name, pk, sk) {
    const next = copyTopology(topology);
    addIndex(next, { name, kind: 'gsi', pk, sk });
    return makeTopologyBuilder(logicalName, next) as never;
  },
  build() {
    return makeTableDefinition(logicalName, topology) as never;
  },
});

/** What `__snapshot` reads before setup first writes it. */
const snapshotDefault = (
  logicalName: string,
  topology: MutableTopology,
): SnapshotValue => {
  const indexes = (
    values: Record<string, { name: string; pk: string; sk: string }>,
  ) => Object.values(values).map(({ name, pk, sk }) => ({ name, pk, sk }));
  return {
    logicalName,
    mode: 'persistent',
    primary: { pk: topology.primary.pk, sk: topology.primary.sk },
    localSecondaryIndexes: indexes(topology.localSecondaryIndexes),
    globalSecondaryIndexes: indexes(topology.globalSecondaryIndexes),
    hash: null,
  };
};

const makeTableDefinition = <Name extends string>(
  logicalName: Name,
  topology: MutableTopology,
): TableDefinition<Name> => {
  const entities: RegisteredEntity[] = [];
  const add = (entity: RegisteredEntity): void => {
    if (entities.some(({ name }) => name === entity.name)) {
      throw new Error(`Entity "${entity.name}" is already defined`);
    }
    entities.push(entity);
  };
  const register = (entity: RegisteredEntity): void => {
    if (isInternalEntity(entity.name))
      throw new Error(
        `Entity name "${entity.name}" is reserved: names starting with "__" belong to std-toolkit`,
      );
    add(entity);
  };
  const table = {
    logicalName,
    primary: topology.primary,
    localSecondaryIndexes: Object.freeze({ ...topology.localSecondaryIndexes }),
    globalSecondaryIndexes: Object.freeze({
      ...topology.globalSecondaryIndexes,
    }),
    entity<TSchema extends AnyEntityESchema>(schema: TSchema) {
      return makeKeyedEntityBuilder(table, schema, register);
    },
    singleEntity<TSchema extends AnyUnkeyedESchema>(schema: TSchema) {
      return makeSingleEntityBuilder(table, schema, register);
    },
    registeredEntities: entities,
  } as TableDefinition<Name>;
  // The table's own snapshot (ADR 0020), before any entity of the app's.
  makeSingleEntityBuilder(table, SnapshotRecord, add).default(
    snapshotDefault(logicalName, topology),
  );
  makeKeyedEntityBuilder(table, SnapshotEntityRecord, add).primary().build();
  makeKeyedEntityBuilder(table, SnapshotVersionRecord, add).primary().build();
  return Object.freeze(table);
};

export const makeTableBuilder = <Name extends string>(
  logicalName: Name,
): TableBuilder<Name> => {
  if (logicalName === '')
    throw new Error('Logical Table name must not be empty');
  return Object.freeze({
    logicalName,
    primary<const Pk extends string, const Sk extends string>(pk: Pk, sk: Sk) {
      const topology = makeTopology(pk, sk);
      return makeTopologyBuilder(logicalName, topology) as never;
    },
  });
};

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
import { createLogicalTableSnapshot } from '../snapshot/index.js';
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

const makeTableDefinition = <Name extends string>(
  logicalName: Name,
  topology: MutableTopology,
): TableDefinition<Name> => {
  const entities: RegisteredEntity[] = [];
  const register = (entity: RegisteredEntity): void => {
    if (entities.some(({ name }) => name === entity.name)) {
      throw new Error(`Entity "${entity.name}" is already defined`);
    }
    entities.push(entity);
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
    snapshot() {
      return createLogicalTableSnapshot(table, entities);
    },
    registeredEntities: entities,
  } as TableDefinition<Name>;
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

import type {
  TableEntitySnapshot,
  TableEntitySnapshotSource,
  TableIndexSnapshot,
  TableSnapshot,
} from '../model.js';
import { buildESchemaDefinitions } from './eschema-snapshot.js';
import { compareStrings } from './stable-stringify.js';

export const tableSnapshotSource = Symbol('std-toolkit/table-snapshot-source');

export interface TableSnapshotEntity {
  readonly name: string;
  [tableSnapshotSource](): TableEntitySnapshotSource;
}

/** Tracks the entities registered on a table, rejecting duplicate names. */
export function createEntityRegistry() {
  const entities: TableSnapshotEntity[] = [];
  return {
    register: (entity: TableSnapshotEntity): void => {
      if (entities.some((existing) => existing.name === entity.name)) {
        throw new Error(
          `Entity "${entity.name}" is already defined on this table`,
        );
      }
      entities.push(entity);
    },
    snapshotSources: (): TableEntitySnapshotSource[] =>
      entities.map((entity) => entity[tableSnapshotSource]()),
  };
}

export function singletonSnapshotSource(eschema: {
  readonly name: string;
}): TableEntitySnapshotSource {
  return {
    name: eschema.name,
    kind: 'singleton',
    idField: null,
    schema: eschema.name,
    eschema,
    primaryDerivation: { pk: [], sk: [] },
    secondaryDerivations: [],
  };
}

export function keyedSnapshotSource<
  D extends {
    readonly entityIndexName: string;
    readonly pkDeps: readonly string[];
    readonly skDeps: readonly string[];
  },
>(
  eschema: { readonly name: string; readonly idField: string },
  primaryDerivation: {
    readonly pkDeps: readonly string[];
    readonly skDeps: readonly string[];
  },
  secondaryDerivations: Record<string, D>,
  physicalIndexOf: (derivation: D) => string,
): TableEntitySnapshotSource {
  return {
    name: eschema.name,
    kind: 'keyed',
    idField: eschema.idField,
    schema: eschema.name,
    eschema,
    primaryDerivation: {
      pk: [...primaryDerivation.pkDeps],
      sk: [...primaryDerivation.skDeps],
    },
    secondaryDerivations: Object.values(secondaryDerivations).map(
      (derivation) => ({
        name: derivation.entityIndexName,
        physicalIndex: physicalIndexOf(derivation),
        pk: [...derivation.pkDeps],
        sk: [...derivation.skDeps],
      }),
    ),
  };
}

export interface CreateTableSnapshotInput {
  readonly adapter: TableSnapshot['adapter'];
  readonly primaryIndex: TableSnapshot['primaryIndex'];
  readonly secondaryIndexes: readonly TableIndexSnapshot[];
  readonly entities: readonly TableEntitySnapshotSource[];
}

/** Creates a canonical table contract snapshot from adapter metadata. */
export function createTableSnapshot(
  input: CreateTableSnapshotInput,
): TableSnapshot {
  const entities: readonly TableEntitySnapshot[] = input.entities
    .map(({ eschema: _eschema, ...entity }) => ({
      ...entity,
      primaryDerivation: {
        pk: [...entity.primaryDerivation.pk],
        sk: [...entity.primaryDerivation.sk],
      },
      secondaryDerivations: entity.secondaryDerivations
        .map((derivation) => ({
          ...derivation,
          pk: [...derivation.pk],
          sk: [...derivation.sk],
        }))
        .sort((a, b) => compareStrings(a.name, b.name)),
    }))
    .sort((a, b) => compareStrings(a.name, b.name));

  return {
    _v: 'v1',
    kind: 'table',
    adapter: input.adapter,
    primaryIndex: { ...input.primaryIndex },
    secondaryIndexes: input.secondaryIndexes
      .map((index) => ({ ...index }))
      .sort((a, b) => compareStrings(a.name, b.name)),
    entities,
    schemas: buildESchemaDefinitions(
      input.entities.map(({ eschema, schema }) => ({
        eschema,
        identity: schema,
      })),
    ),
  };
}

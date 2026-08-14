import type {
  AnyEntityESchema,
  AnyUnkeyedESchema,
} from '../../../eschema/index.js';
import { buildESchemaDefinitions } from '../../../snapshot/capture/eschema-capture/index.js';
import type { ESchemaDefinition } from '../../../snapshot/domain/index.js';

interface SnapshotIndex {
  readonly name: string;
  readonly pk: string;
  readonly sk: string;
}

export interface LogicalTableSnapshot {
  readonly _v: 'v1';
  readonly kind: 'table';
  readonly logicalName: string;
  readonly topology: {
    readonly primary: { readonly pk: string; readonly sk: string };
    readonly localSecondaryIndexes: readonly SnapshotIndex[];
    readonly globalSecondaryIndexes: readonly SnapshotIndex[];
  };
  readonly entities: readonly LogicalEntitySnapshot[];
  readonly schemas: readonly ESchemaDefinition[];
}

export interface LogicalEntitySnapshot {
  readonly name: string;
  readonly kind: 'keyed' | 'single';
  readonly schema: string;
  readonly idField: string | null;
  readonly primary: {
    readonly pk: readonly string[];
    readonly sk: readonly string[];
  };
  readonly accessPatterns: readonly (SnapshotAccessPattern & {
    readonly name: string;
  })[];
}

export interface SnapshotAccessPattern {
  readonly index?: string | undefined;
  readonly kind: 'primary' | 'lsi' | 'gsi';
  readonly pk: readonly string[];
  readonly sk: readonly string[];
}

interface TableSource {
  readonly logicalName: string;
  readonly primary: { readonly pk: string; readonly sk: string };
  readonly localSecondaryIndexes: Readonly<Record<string, SnapshotIndex>>;
  readonly globalSecondaryIndexes: Readonly<Record<string, SnapshotIndex>>;
}

interface KeyedEntitySource {
  readonly kind: 'keyed';
  readonly name: string;
  readonly schema: AnyEntityESchema;
  readonly primary: {
    readonly pk: readonly string[];
    readonly sk: readonly string[];
  };
  readonly accessPatterns: Readonly<Record<string, SnapshotAccessPattern>>;
}

interface SingleEntitySource {
  readonly kind: 'single';
  readonly name: string;
  readonly schema: AnyUnkeyedESchema;
}

export type EntitySnapshotSource = KeyedEntitySource | SingleEntitySource;

const compare = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

export const createLogicalTableSnapshot = (
  table: TableSource,
  registeredEntities: readonly EntitySnapshotSource[],
): LogicalTableSnapshot => {
  const entities: LogicalEntitySnapshot[] = registeredEntities
    .map((entity): LogicalEntitySnapshot => {
      if (entity.kind === 'single') {
        return {
          name: entity.name,
          kind: 'single',
          schema: entity.schema.name,
          idField: null,
          primary: { pk: [], sk: [] },
          accessPatterns: [],
        };
      }
      return {
        name: entity.name,
        kind: 'keyed',
        schema: entity.schema.name,
        idField: entity.schema.idField,
        primary: {
          pk: [...entity.primary.pk],
          sk: [...entity.primary.sk],
        },
        accessPatterns: Object.entries(entity.accessPatterns)
          .map(([name, pattern]): SnapshotAccessPattern & { name: string } => ({
            name,
            index: pattern.index,
            kind: pattern.kind,
            pk: [...pattern.pk],
            sk: [...pattern.sk],
          }))
          .sort((left, right) => compare(left.name, right.name)),
      };
    })
    .sort((left, right) => compare(left.name, right.name));

  return {
    _v: 'v1',
    kind: 'table',
    logicalName: table.logicalName,
    topology: {
      primary: { pk: table.primary.pk, sk: table.primary.sk },
      localSecondaryIndexes: Object.values(table.localSecondaryIndexes)
        .map(({ name, pk, sk }) => ({ name, pk, sk }))
        .sort((left, right) => compare(left.name, right.name)),
      globalSecondaryIndexes: Object.values(table.globalSecondaryIndexes)
        .map(({ name, pk, sk }) => ({ name, pk, sk }))
        .sort((left, right) => compare(left.name, right.name)),
    },
    entities,
    schemas: buildESchemaDefinitions(
      registeredEntities.map((entity) => ({
        eschema: entity.schema,
        identity: entity.schema.name,
      })),
    ),
  };
};

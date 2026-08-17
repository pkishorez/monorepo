import type {
  AnyEntityESchema,
  AnyUnkeyedESchema,
} from '../../../eschema/index.js';
import { buildESchemaDefinitions } from '../../../snapshot/capture/eschema-capture/index.js';
import type {
  TableAccessPatternSnapshot,
  TableEntitySnapshot,
  TableIndexSnapshot,
  TableSnapshot,
} from '../../../snapshot/domain/index.js';

export type LogicalTableSnapshot = TableSnapshot;
export type LogicalEntitySnapshot = TableEntitySnapshot;
export type SnapshotAccessPattern = Omit<TableAccessPatternSnapshot, 'name'>;

interface TableSource {
  readonly logicalName: string;
  readonly primary: { readonly pk: string; readonly sk: string };
  readonly localSecondaryIndexes: Readonly<Record<string, TableIndexSnapshot>>;
  readonly globalSecondaryIndexes: Readonly<Record<string, TableIndexSnapshot>>;
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
          .map(
            ([name, pattern]): TableAccessPatternSnapshot => ({
              name,
              index: pattern.index,
              kind: pattern.kind,
              pk: [...pattern.pk],
              sk: [...pattern.sk],
            }),
          )
          .sort((left, right) => compare(left.name, right.name)),
      };
    })
    .sort((left, right) => compare(left.name, right.name));

  return {
    _v: 'v2',
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

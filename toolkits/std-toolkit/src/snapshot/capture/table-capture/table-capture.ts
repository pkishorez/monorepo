import type {
  AnyEntityESchema,
  AnyUnkeyedESchema,
} from '../../../eschema/index.js';
import type {
  TableAccessPatternSnapshot,
  TableEntitySnapshot,
  TableIndexSnapshot,
  TableSnapshot,
} from '../../domain/index.js';
import { compareStrings } from '../../domain/index.js';
import { buildESchemaDefinitions } from '../eschema-capture/index.js';

export interface TableSource {
  readonly logicalName: string;
  readonly primary: { readonly pk: string; readonly sk: string };
  readonly localSecondaryIndexes: Readonly<Record<string, TableIndexSnapshot>>;
  readonly globalSecondaryIndexes: Readonly<Record<string, TableIndexSnapshot>>;
  readonly registeredEntities: readonly EntitySource[];
}

interface KeyedEntitySource {
  readonly kind: 'keyed';
  readonly name: string;
  readonly schema: AnyEntityESchema;
  readonly primary: {
    readonly pk: readonly string[];
    readonly sk: readonly string[];
  };
  readonly accessPatterns: Readonly<
    Record<
      string,
      Omit<TableAccessPatternSnapshot, 'name' | 'index'> & {
        readonly index?: string | undefined;
      }
    >
  >;
}

interface SingleEntitySource {
  readonly kind: 'single';
  readonly name: string;
  readonly schema: AnyUnkeyedESchema;
}

type EntitySource = KeyedEntitySource | SingleEntitySource;

const entitySnapshot = (entity: EntitySource): TableEntitySnapshot =>
  entity.kind === 'single'
    ? {
        name: entity.name,
        kind: 'single',
        schema: entity.schema.name,
        idField: null,
        primary: { pk: [], sk: [] },
        accessPatterns: [],
      }
    : {
        name: entity.name,
        kind: 'keyed',
        schema: entity.schema.name,
        idField: entity.schema.idField,
        primary: { pk: [...entity.primary.pk], sk: [...entity.primary.sk] },
        accessPatterns: Object.entries(entity.accessPatterns)
          .map(([name, pattern]): TableAccessPatternSnapshot => ({
            name,
            ...(pattern.index === undefined ? {} : { index: pattern.index }),
            kind: pattern.kind,
            pk: [...pattern.pk],
            sk: [...pattern.sk],
          }))
          .sort((left, right) => compareStrings(left.name, right.name)),
      };

const indexes = (
  values: Readonly<Record<string, TableIndexSnapshot>>,
): TableIndexSnapshot[] =>
  Object.values(values)
    .map(({ name, pk, sk }) => ({ name, pk, sk }))
    .sort((left, right) => compareStrings(left.name, right.name));

export function captureTableSnapshot(table: TableSource): TableSnapshot {
  return {
    logicalName: table.logicalName,
    topology: {
      primary: { pk: table.primary.pk, sk: table.primary.sk },
      localSecondaryIndexes: indexes(table.localSecondaryIndexes),
      globalSecondaryIndexes: indexes(table.globalSecondaryIndexes),
    },
    entities: table.registeredEntities
      .map(entitySnapshot)
      .sort((left, right) => compareStrings(left.name, right.name)),
    schemas: buildESchemaDefinitions(
      table.registeredEntities.map((entity) => ({
        eschema: entity.schema,
        identity: entity.schema.name,
      })),
    ),
  };
}

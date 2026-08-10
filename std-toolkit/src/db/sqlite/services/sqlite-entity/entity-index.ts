import type { AnyEntityESchema } from '../../../../eschema/index.js';
import { EntityPersistence } from '../../domain/entity-persistence/index.js';
import type {
  StoredIndexDerivation,
  StoredPrimaryDerivation,
} from '../../domain/entity-persistence/index.js';
import type { SQLiteEntityTable } from './entity-table.js';

const { deriveIndexKeyValue } = EntityPersistence;

export class EntityIndex<
  TTable extends SQLiteEntityTable,
  TSecondaryDerivationMap extends Record<string, StoredIndexDerivation>,
> {
  readonly primary: StoredPrimaryDerivation;
  readonly secondary: TSecondaryDerivationMap;

  #table: TTable;
  #entityName: string;

  constructor(
    table: TTable,
    eschema: AnyEntityESchema,
    primary: StoredPrimaryDerivation,
    secondary: TSecondaryDerivationMap,
  ) {
    this.#table = table;
    this.#entityName = eschema.name;
    this.primary = primary;
    this.secondary = secondary;
  }

  derivePrimary(value: Record<string, unknown>) {
    return {
      pk: deriveIndexKeyValue(
        this.#entityName,
        this.primary.pkDeps,
        value,
        true,
      ),
      sk: deriveIndexKeyValue(
        this.#entityName,
        this.primary.skDeps,
        value,
        false,
      ),
    };
  }

  deriveSecondary(value: Record<string, unknown>): Record<string, string> {
    const indexMap: Record<string, string> = {};

    for (const derivation of Object.values(this.secondary)) {
      if (derivation.pkDeps.every((key) => value[key] !== undefined)) {
        const column = this.#table.secondaryIndexMap[derivation.indexName]?.pk;
        if (column) {
          indexMap[column] = deriveIndexKeyValue(
            `${this.#entityName}#${derivation.entityIndexName}`,
            derivation.pkDeps,
            value,
            true,
          );
        }
      }

      if (derivation.skDeps.every((key) => value[key] !== undefined)) {
        const column = this.#table.secondaryIndexMap[derivation.indexName]?.sk;
        if (column) {
          indexMap[column] = deriveIndexKeyValue(
            this.#entityName,
            derivation.skDeps,
            value,
            false,
          );
        }
      }
    }

    return indexMap;
  }

  resolveSortKey(
    value: unknown,
    derivation: StoredIndexDerivation,
  ): string | null {
    if (
      value !== null &&
      !derivation.isTimelineSk &&
      typeof value === 'object'
    ) {
      return deriveIndexKeyValue(
        this.#entityName,
        derivation.skDeps,
        value as Record<string, unknown>,
        false,
      );
    }
    return value as string | null;
  }
}

export type { StoredIndexDerivation, StoredPrimaryDerivation };

import type { AnyEntityESchema } from '../../../../eschema/index.js';
import { semanticItem } from '../../domain/entity-persistence/index.js';
import { deriveIndexKeyValue } from '../../internal/index.js';
import type { IndexDefinition } from '../../types/index.js';
import type { EntityTable as DynamoTable } from '../../domain/entity-persistence/index.js';

export interface StoredIndexDerivation {
  readonly gsiName: string;
  readonly entityIndexName: string;
  readonly pkDeps: string[];
  readonly skDeps: string[];
  readonly isTimelineSk: boolean;
}

export interface StoredPrimaryDerivation {
  readonly pkDeps: string[];
  readonly skDeps: string[];
}

export class EntityIndex<
  TSecondaryDerivationMap extends Record<string, StoredIndexDerivation>,
> {
  readonly primary: StoredPrimaryDerivation;
  readonly secondary: TSecondaryDerivationMap;
  readonly derivationDependencies: ReadonlySet<string>;
  readonly attributeNames: ReadonlySet<string>;
  readonly #entityName: string;

  constructor(
    table: DynamoTable<any, any>,
    eschema: AnyEntityESchema,
    primary: StoredPrimaryDerivation,
    secondary: TSecondaryDerivationMap,
  ) {
    this.#entityName = eschema.name;
    this.primary = primary;
    this.secondary = secondary;

    const dependencies = new Set<string>();
    for (const derivation of Object.values(secondary)) {
      for (const dependency of derivation.pkDeps) dependencies.add(dependency);
      for (const dependency of derivation.skDeps) {
        if (dependency !== '_u') dependencies.add(dependency);
      }
    }
    this.derivationDependencies = dependencies;

    const attributeNames = new Set<string>([
      table.primary.pk,
      table.primary.sk,
    ]);
    for (const index of Object.values(
      table.secondaryIndexMap,
    ) as IndexDefinition[]) {
      attributeNames.add(index.pk);
      attributeNames.add(index.sk);
    }
    this.attributeNames = attributeNames;
  }

  primaryKey(value: Record<string, unknown>): IndexDefinition {
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

  secondaryAttributes(value: Record<string, unknown>): Record<string, string> {
    const attributes: Record<string, string> = {};
    for (const derivation of Object.values(this.secondary)) {
      if (derivation.pkDeps.every((key) => value[key] !== undefined)) {
        attributes[`${derivation.gsiName}PK`] = deriveIndexKeyValue(
          `${this.#entityName}#${derivation.entityIndexName}`,
          derivation.pkDeps,
          value,
          true,
        );
      }
      if (derivation.skDeps.every((key) => value[key] !== undefined)) {
        attributes[`${derivation.gsiName}SK`] = deriveIndexKeyValue(
          this.#entityName,
          derivation.skDeps,
          value,
          false,
        );
      }
    }
    return attributes;
  }

  sortKey(value: unknown, derivation: StoredIndexDerivation): string | null {
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

  semanticItem(item: Record<string, unknown>): Record<string, unknown> {
    return semanticItem(item, this.attributeNames);
  }
}

import type {
  AnyEntityESchema,
  ESchemaType,
} from '../../../../eschema/index.js';
import { SQLiteEntity } from './sqlite-entity.js';
import type { SQLiteEntityTable } from './entity-table.js';
import type {
  StoredIndexDerivation,
  StoredPrimaryDerivation,
} from './entity-index.js';

type DerivableMetaFields = '_u';
type ExtractKeys<T, Keys extends readonly (keyof T)[]> = Keys[number];
type IsTimelineSk<T extends readonly unknown[]> = T extends readonly ['_u']
  ? true
  : false;

export const makeEntityBuilder = <TTable extends SQLiteEntityTable>(
  table: TTable,
  onBuild?: (entity: SQLiteEntity<any, any, any, any>) => void,
) => ({
  eschema<TSchema extends AnyEntityESchema>(eschema: TSchema) {
    return {
      primary<
        const TPkKeys extends readonly (keyof ESchemaType<TSchema>)[] = [],
      >(primaryDerivation?: { pk: TPkKeys }) {
        const pkKeys = primaryDerivation?.pk ?? ([] as unknown as TPkKeys);
        if ((pkKeys as readonly PropertyKey[]).includes('_u')) {
          throw new Error(
            'Primary partition key derivation cannot include "_u"',
          );
        }

        return new EntityBuilderIndexes<
          TTable,
          TSchema,
          ExtractKeys<ESchemaType<TSchema>, TPkKeys>,
          {}
        >(
          table,
          eschema,
          { pk: pkKeys, sk: [eschema.idField] } as any,
          {},
          onBuild,
        );
      },
    };
  },
});

export class EntityBuilderIndexes<
  TTable extends SQLiteEntityTable,
  TSchema extends AnyEntityESchema,
  TPrimaryPkKeys extends keyof ESchemaType<TSchema>,
  TSecondaryDerivationMap extends Record<string, StoredIndexDerivation>,
> {
  #table: TTable;
  #eschema: TSchema;
  #primary: {
    pk: readonly (keyof ESchemaType<TSchema>)[];
    sk: readonly (keyof ESchemaType<TSchema>)[];
  };
  #secondary: TSecondaryDerivationMap;
  #onBuild: ((entity: SQLiteEntity<any, any, any, any>) => void) | undefined;

  constructor(
    table: TTable,
    eschema: TSchema,
    primary: {
      pk: readonly (keyof ESchemaType<TSchema>)[];
      sk: readonly (keyof ESchemaType<TSchema>)[];
    },
    secondary: TSecondaryDerivationMap,
    onBuild?: (entity: SQLiteEntity<any, any, any, any>) => void,
  ) {
    this.#table = table;
    this.#eschema = eschema;
    this.#primary = primary;
    this.#secondary = secondary;
    this.#onBuild = onBuild;
  }

  index<
    TIndexName extends keyof TTable['secondaryIndexMap'] & string,
    TEntityIndexName extends string,
    const TPkKeys extends readonly (
      | keyof ESchemaType<TSchema>
      | DerivableMetaFields
    )[],
    const TSkKeys extends readonly (
      | keyof ESchemaType<TSchema>
      | DerivableMetaFields
    )[] = readonly ['_u'],
  >(
    indexName: TIndexName,
    entityIndexName: TEntityIndexName,
    derivation: { pk: TPkKeys; sk?: TSkKeys },
  ) {
    const skKeys = (derivation.sk ?? ['_u']) as TSkKeys;
    const stored: StoredIndexDerivation = {
      indexName,
      entityIndexName,
      pkDeps: derivation.pk.map(String),
      skDeps: (skKeys as readonly PropertyKey[]).map(String),
      isTimelineSk: skKeys.length === 1 && skKeys[0] === '_u',
    };

    return new EntityBuilderIndexes(
      this.#table,
      this.#eschema,
      this.#primary,
      { ...this.#secondary, [entityIndexName]: stored },
      this.#onBuild,
    ) as EntityBuilderIndexes<
      TTable,
      TSchema,
      TPrimaryPkKeys,
      TSecondaryDerivationMap &
        Record<
          TEntityIndexName,
          StoredIndexDerivation & {
            pkDeps: TPkKeys;
            skDeps: TSkKeys;
            isTimelineSk: IsTimelineSk<TSkKeys>;
          }
        >
    >;
  }

  build() {
    const primary: StoredPrimaryDerivation = {
      pkDeps: this.#primary.pk.map(String),
      skDeps: this.#primary.sk.map(String),
    };
    const entity = new SQLiteEntity<
      TTable,
      TSecondaryDerivationMap,
      TSchema,
      TPrimaryPkKeys
    >(this.#table, this.#eschema, primary, this.#secondary);
    this.#onBuild?.(entity);
    return entity;
  }
}

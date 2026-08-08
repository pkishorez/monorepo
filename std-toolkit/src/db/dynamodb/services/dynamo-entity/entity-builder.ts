import type {
  AnyEntityESchema,
  ESchemaType,
} from '../../../../eschema/index.js';
import type { EntityTable as DynamoTable } from '../../domain/entity-persistence/index.js';
import { DynamoEntity } from './dynamo-entity.js';
import type {
  StoredIndexDerivation,
  StoredPrimaryDerivation,
} from './entity-index.js';

type DerivableMetaFields = '_u';
type ExtractKeys<T, Keys extends readonly (keyof T)[]> = Keys[number];
type IsTimelineSk<T extends readonly unknown[]> = T extends readonly ['_u']
  ? true
  : false;

export const makeEntityBuilder = <TTable extends DynamoTable<any, any>>(
  table: TTable,
  onBuild?: (entity: DynamoEntity<any, any, any, any>) => void,
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
        >(table, eschema, { pk: pkKeys, sk: [eschema.idField] }, {}, onBuild);
      },
    };
  },
});

export class EntityBuilderIndexes<
  TTable extends DynamoTable<any, any>,
  TSchema extends AnyEntityESchema,
  TPrimaryPkKeys extends keyof ESchemaType<TSchema>,
  TSecondaryDerivationMap extends Record<string, StoredIndexDerivation>,
> {
  readonly #table: TTable;
  readonly #eschema: TSchema;
  readonly #primary: {
    pk: readonly (keyof ESchemaType<TSchema>)[];
    sk: readonly (keyof ESchemaType<TSchema>)[];
  };
  readonly #secondary: TSecondaryDerivationMap;
  readonly #onBuild:
    | ((entity: DynamoEntity<any, any, any, any>) => void)
    | undefined;

  constructor(
    table: TTable,
    eschema: TSchema,
    primary: {
      pk: readonly (keyof ESchemaType<TSchema>)[];
      sk: readonly (keyof ESchemaType<TSchema>)[];
    },
    secondary: TSecondaryDerivationMap,
    onBuild?: (entity: DynamoEntity<any, any, any, any>) => void,
  ) {
    this.#table = table;
    this.#eschema = eschema;
    this.#primary = primary;
    this.#secondary = secondary;
    this.#onBuild = onBuild;
  }

  index<
    GsiName extends keyof TTable['secondaryIndexMap'] & string,
    const TEntityIndexName extends string,
    const TPkKeys extends readonly (
      | keyof ESchemaType<TSchema>
      | DerivableMetaFields
    )[],
    const TSkKeys extends readonly (
      | keyof ESchemaType<TSchema>
      | DerivableMetaFields
    )[] = readonly ['_u'],
  >(
    gsiName: GsiName,
    entityIndexName: TEntityIndexName,
    derivation: { pk: TPkKeys; sk?: TSkKeys },
  ) {
    const skKeys = (derivation.sk ?? ['_u']) as TSkKeys;
    const secondary = {
      ...this.#secondary,
      [entityIndexName]: {
        gsiName,
        entityIndexName,
        pkDeps: derivation.pk.map(String),
        skDeps: (skKeys as readonly PropertyKey[]).map(String),
        isTimelineSk: skKeys.length === 1 && skKeys[0] === '_u',
      },
    };
    return new EntityBuilderIndexes(
      this.#table,
      this.#eschema,
      this.#primary,
      secondary,
      this.#onBuild,
    ) as unknown as EntityBuilderIndexes<
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
    const entity = new DynamoEntity<
      TTable,
      TSecondaryDerivationMap,
      TSchema,
      TPrimaryPkKeys
    >(this.#table, this.#eschema, primary, this.#secondary);
    this.#onBuild?.(entity);
    return Object.freeze(entity);
  }
}

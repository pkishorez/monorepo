import { EmptyESchema, ESchema } from '@monorepo/eschema';
import type { Schema } from 'effect';
import type { Except } from 'type-fest';
import type { DynamoTable, PutOptions, UpdateOptions } from '../table/table.js';
import type {
  CompoundIndexDefinition,
  IndexDefinition,
} from '../table/types.js';
import type {
  EmptyEntityIndexDefinition,
  EntityIndexDefinition,
  ExtractEntityIndexDefType,
  FirstLevelPrimitives,
  IndexDef,
} from './types.js';
import { Effect } from 'effect';
import { deriveIndex } from './util.js';

export class DynamoEntityUnit<
  TSchema extends EmptyESchema,
  TTable extends DynamoTable<
    IndexDefinition,
    Record<string, IndexDefinition>,
    TSchema['Type']
  >,
  TPrimary extends EmptyEntityIndexDefinition,
> {
  eschema: TSchema;
  table: TTable;
  primary: TPrimary;

  constructor({
    eschema,
    table,
    primary,
  }: {
    eschema: TSchema;
    table: TTable;
    primary: TPrimary;
  }) {
    this.eschema = eschema;
    this.table = table;
    this.primary = primary;
  }

  #getRealKeyFromItem(key: ExtractEntityIndexDefType<TPrimary>) {
    const pk = deriveIndex(this.primary.pk, key);
    const sk = deriveIndex(this.primary.sk, key);

    const result = {
      [this.table.primary.pk]: pk,
      [this.table.primary.sk]: sk,
    };

    return result;
  }

  update(
    key: ExtractEntityIndexDefType<TPrimary>,
    update: Omit<
      Partial<TSchema['Type']>,
      // One should not update the primary key itself!
      keyof ExtractEntityIndexDefType<TPrimary>
    >,
    options?: Except<UpdateOptions<TSchema['Type']>, 'update'> & {
      ignoreVersionMismatch?: boolean;
    },
  ) {
    return this.eschema.makePartialEffect(update).pipe(
      Effect.andThen((v) =>
        this.table.updateItem(this.#getRealKeyFromItem(key), {
          ...options,
          update: { set: v },
          condition: options?.ignoreVersionMismatch
            ? undefined
            : ({
                __v: this.eschema.latestVersion,
              } as any),
        }),
      ),
    );
  }

  put(item: TSchema['Type'], options?: PutOptions<TSchema['Type']>) {
    return this.eschema
      .makeEffect(item)
      .pipe(
        Effect.andThen(() =>
          this.table.putItem(
            this.#getRealKeyFromItem(item),
            this.eschema.make(item),
            options,
          ),
        ),
      );
  }

  static make<
    TESchema extends ESchema<any>,
    TTable extends DynamoTable<CompoundIndexDefinition, any, any>,
  >({ eschema, table }: { eschema: TESchema; table: TTable }) {
    type TItem = Schema.Schema.Type<TESchema['schema']>;

    return {
      primary<
        PkKeys extends (keyof FirstLevelPrimitives<TItem>)[],
        SkKeys extends (keyof FirstLevelPrimitives<TItem>)[],
      >({
        pk,
        sk,
      }: {
        pk: IndexDef<TItem, PkKeys>;
        sk: IndexDef<TItem, SkKeys>;
      }) {
        return new DynamoEntityUnit<
          TESchema,
          TTable,
          EntityIndexDefinition<TItem, PkKeys, SkKeys>
        >({
          eschema,
          table,
          primary: {
            pk,
            sk,
          },
        });
      },
    } as const;
  }
}

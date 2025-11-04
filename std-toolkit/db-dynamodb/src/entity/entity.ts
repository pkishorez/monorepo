import { EmptyESchema } from '@monorepo/eschema';
import { DynamoTable } from '../table/table.js';
import {
  IndexKeyDerivation,
  IndexDerivation,
  IndexDerivationValue,
  EmptyIndexDerivation,
  IndexKeyDerivationValue,
} from './types.js';
import { Effect, Schema } from 'effect';
import { deriveIndexKeyValue } from './utils.js';
import { metaSchema } from './schema.js';
import { Except, Simplify } from 'type-fest';
import { SortKeyparameter } from '../table/expr/key-condition.js';
import { TGetItemInput, TQueryInput } from '../table/types.js';
import {
  fromDiscriminatedGeneric,
  toDiscriminatedGeneric,
} from '../table/utils.js';
import { buildExpr } from '../table/expr/expr.js';
import {
  conditionExpr,
  compileConditionExpr,
  ConditionOperation,
} from '../table/expr/condition.js';
import { updateExpr, compileUpdateExpr } from '../table/expr/update.js';
import { ItemAlreadyExist, NoItemToUpdate } from './errors.js';

export class DynamoEntity<
  TSecondaryDerivationMap extends Record<
    string,
    EmptyIndexDerivation & { indexName: keyof TTable['secondaryIndexMap'] }
  >,
  TTable extends DynamoTable<any, any>,
  TSchema extends EmptyESchema,
  TPrimaryDerivation extends EmptyIndexDerivation,
> {
  static make<TT extends DynamoTable<any, any>>(table: TT) {
    return {
      eschema<TS extends EmptyESchema>(eschema: TS) {
        return {
          primary<
            TPkKeys extends keyof TS['Type'],
            TSkKeys extends keyof TS['Type'],
          >(
            primaryDerivation: IndexDerivation<
              IndexKeyDerivation<TS['Type'], TPkKeys>,
              IndexKeyDerivation<TS['Type'], TSkKeys>
            >,
          ) {
            return new EntityIndexDerivations(
              table,
              eschema,
              primaryDerivation,
            );
          },
        };
      },
    };
  }

  #table: TTable;
  #eschema: TSchema;
  #primaryDerivation: TPrimaryDerivation;
  #secondaryDerivations: TSecondaryDerivationMap;
  constructor(
    table: TTable,
    eschema: TSchema,
    primaryDerivation: TPrimaryDerivation,
    secondaryDerivations: TSecondaryDerivationMap,
  ) {
    this.#table = table;
    this.#eschema = eschema;
    this.#primaryDerivation = primaryDerivation;
    this.#secondaryDerivations = secondaryDerivations;
  }

  get(
    keyValue: IndexDerivationValue<TPrimaryDerivation>,
    options?: TGetItemInput,
  ) {
    const pk = deriveIndexKeyValue(this.#primaryDerivation['pk'], keyValue);
    const sk = deriveIndexKeyValue(this.#primaryDerivation['sk'], keyValue);

    return this.#table
      .getItem(
        { pk, sk },
        {
          ReturnConsumedCapacity: 'TOTAL',
          ...options,
        },
      )
      .pipe(
        Effect.flatMap(({ Item, ...rest }) => {
          type ItemType = {
            value: TSchema['Type'];
            meta: typeof metaSchema.Type;
          };
          return Item
            ? this.#eschema.parse(Item).pipe(
                Effect.map((item) => ({
                  item: {
                    value: item.value,
                    meta: Schema.decodeUnknownSync(metaSchema)(Item),
                  } as ItemType | null,
                  ...rest,
                })),
              )
            : Effect.succeed({ item: null as ItemType | null, ...rest });
        }),
      );
  }

  insert(
    value: TSchema['Type'],
    options?: {
      debug?: boolean;
      condition?: ConditionOperation<TSchema['Type']>;
    },
  ) {
    return Effect.gen(this, function* () {
      value = yield* Schema.decodeUnknown(Schema.partial(this.#eschema.schema))(
        value,
      );
      value = {
        ...value,
        ...metaSchema.make({
          __v: this.#eschema.latestVersion,
          __i: 0,
          __d: false,
        }),
      };
      const primaryIndex = this.#derivePrimaryIndex(value);
      const indexMap = this.#deriveSecondaryIndexes(value);
      const expr = buildExpr({
        condition: compileConditionExpr(
          conditionExpr(($) =>
            $.and(
              ...[
                // options?.condition,
                $.attributeNotExists(this.#table.primary.pk),
                $.attributeNotExists(this.#table.primary.sk),
              ].filter(Boolean),
            ),
          ),
        ),
      });
      return yield* this.#table
        .putItem(
          {
            ...value,
            [this.#table.primary.pk]: primaryIndex.pk,
            [this.#table.primary.sk]: primaryIndex.sk,
            ...indexMap,
          },
          {
            ...expr,
            debug: options?.debug ?? false,
            ReturnItemCollectionMetrics: 'SIZE',
            ReturnValues: 'ALL_OLD',
            ReturnConsumedCapacity: 'TOTAL',
            ReturnValuesOnConditionCheckFailure: 'ALL_OLD',
          },
        )
        .pipe(
          Effect.catchTag(
            'ConditionalCheckFailedException',
            () => new ItemAlreadyExist(),
          ),
        );
    });
  }

  update(
    keyValue: IndexDerivationValue<TPrimaryDerivation>,
    value: Partial<TSchema['Type']>,
    options?: {
      debug?: boolean;
      meta?: typeof metaSchema.Type;
      condition?: ConditionOperation<TSchema['Type']>;
    },
  ) {
    return Effect.gen(this, function* () {
      if (
        Object.keys(value).some(
          (key) =>
            this.#primaryDerivation.pk.deps.includes(key) ||
            this.#primaryDerivation.sk.deps.includes(key),
        )
      ) {
        return yield* Effect.dieMessage(
          'You cannot update key that is already part of primary key.',
        );
      }
      value = yield* Schema.decodeUnknown(Schema.partial(this.#eschema.schema))(
        value,
      );
      const pk = deriveIndexKeyValue(this.#primaryDerivation['pk'], keyValue);
      const sk = deriveIndexKeyValue(this.#primaryDerivation['sk'], keyValue);

      const indexMap = this.#deriveSecondaryIndexes(value);

      const condition = conditionExpr(($) =>
        $.and(
          ...[
            options?.condition,
            $.cond('__v', '=', this.#eschema.latestVersion),
            options?.meta && $.cond('__i', '=', options.meta.__i),
          ].filter((v) => !!v),
        ),
      );
      const update = updateExpr<any>(($) => [
        ...Object.entries({ ...value, ...indexMap }).map(([key, v]) =>
          $.set(key, v),
        ),
        $.set('__i', $.addOp('__i', 1)),
      ]);

      return yield* this.#table
        .updateItem(
          { pk, sk },
          {
            ...buildExpr({
              update: compileUpdateExpr(update),
              condition: compileConditionExpr(condition),
            }),
            debug: options?.debug ?? false,
            ReturnConsumedCapacity: 'TOTAL',
            ReturnItemCollectionMetrics: 'SIZE',
            ReturnValuesOnConditionCheckFailure: 'ALL_OLD',
          },
        )
        .pipe(
          Effect.mapError((err) => {
            if (err._tag === 'ConditionalCheckFailedException') {
              if (!err.Item) {
                return new NoItemToUpdate();
              }
            }
            return err;
          }),
        );
    });
  }

  query(
    {
      pk,
      sk,
    }: {
      pk: Simplify<IndexKeyDerivationValue<TPrimaryDerivation['pk']>>;
      sk: SortKeyparameter<IndexKeyDerivationValue<TPrimaryDerivation['sk']>>;
    },
    options: Except<TQueryInput, 'IndexName'> & {
      filter?: ConditionOperation<TSchema['Type']>;
    },
  ) {
    const testSk = this.#calculateSk(this.#primaryDerivation, sk as any);

    return this.#table
      .query(
        {
          pk: deriveIndexKeyValue(this.#primaryDerivation['pk'], pk),
          sk: testSk as any,
        },
        { ReturnConsumedCapacity: 'TOTAL', ...options },
      )
      .pipe(
        Effect.map(({ Items, ...rest }) => {
          return {
            ...rest,
            items: Items.map((item) => ({
              value: this.#eschema.parseSync(item, {
                onExcessProperty: 'preserve',
              }).value,
              meta: Schema.decodeUnknownSync(metaSchema)(item),
            })),
          };
        }),
      );
  }

  index<Alias extends keyof TSecondaryDerivationMap>(alias: Alias) {
    return {
      query: (
        {
          pk,
          sk,
        }: Record<
          'pk',
          Simplify<
            IndexKeyDerivationValue<TSecondaryDerivationMap[Alias]['pk']>
          >
        > &
          Record<
            'sk',
            SortKeyparameter<
              IndexKeyDerivationValue<TSecondaryDerivationMap[Alias]['sk']>
            >
          >,

        options?: Except<TQueryInput, 'IndexName'> & {
          filter?: ConditionOperation<TSchema['Type']>;
        },
      ) => {
        const indexDerivation = this.#secondaryDerivations[alias];
        const testSk = this.#calculateSk(indexDerivation, sk as any);

        return this.#table
          .index(indexDerivation.indexName)
          .query(
            {
              pk: deriveIndexKeyValue(indexDerivation.pk, pk),
              sk: testSk as any,
            },
            { ReturnConsumedCapacity: 'TOTAL', ...options },
          )
          .pipe(
            Effect.map(({ Items, ...rest }) => {
              return {
                ...rest,
                items: Items.map((item) => ({
                  value: this.#eschema.parseSync(item, {
                    onExcessProperty: 'preserve',
                  }).value as TSchema['Type'],
                  meta: Schema.decodeUnknownSync(metaSchema)(item),
                })),
              };
            }),
          );
      },
    };
  }

  #calculateSk(derivation: EmptyIndexDerivation, sk: SortKeyparameter) {
    const realSk = toDiscriminatedGeneric(sk);
    switch (realSk.type) {
      case '<':
      case '<=':
      case '>':
      case '>=':
        if (realSk.value == null) break;
        realSk.value = deriveIndexKeyValue(derivation['sk'], realSk.value);
        break;
      case 'between':
        (realSk.value as any)[0] = deriveIndexKeyValue(
          derivation['sk'],
          (realSk.value as any)[0],
        );
        (realSk.value as any)[1] = deriveIndexKeyValue(
          derivation['sk'],
          (realSk.value as any)[1],
        );
        break;
    }
    return fromDiscriminatedGeneric(realSk) as SortKeyparameter;
  }

  #derivePrimaryIndex(value: any) {
    return {
      pk: deriveIndexKeyValue(this.#primaryDerivation['pk'], value),
      sk: deriveIndexKeyValue(this.#primaryDerivation['sk'], value),
    };
  }

  #deriveSecondaryIndexes(value: any) {
    const indexMap: Record<string, string> = {};
    Object.entries(this.#secondaryDerivations).forEach(([, derivation]) => {
      const si = this.#table.secondaryIndexMap[derivation.indexName];
      if (
        derivation.pk.deps.every((key) => typeof value[key] !== 'undefined')
      ) {
        indexMap[si.pk] = derivation.pk.derive(value).join('#');
      }
      if (
        derivation.sk.deps.every((key) => typeof value[key] !== 'undefined')
      ) {
        indexMap[si.sk] = derivation.sk.derive(value).join('#');
      }
    });

    return indexMap;
  }
}

class EntityIndexDerivations<
  TTable extends DynamoTable<any, any>,
  TSchema extends EmptyESchema,
  TPrimaryDerivation extends IndexDerivation<any, any>,
  TSecondaryDerivationMap extends Record<
    string,
    EmptyIndexDerivation & { indexName: keyof TTable['secondaryIndexMap'] }
  > = {},
> {
  #table: TTable;
  #eschema: TSchema;
  #secondaryDerivations: TSecondaryDerivationMap;
  #primaryDerivation: TPrimaryDerivation;

  constructor(
    table: TTable,
    eschema: TSchema,
    primaryDerivation: TPrimaryDerivation,
    definitions?: TSecondaryDerivationMap,
  ) {
    this.#table = table;
    this.#eschema = eschema;
    this.#primaryDerivation = primaryDerivation;
    this.#secondaryDerivations = definitions ?? ({} as TSecondaryDerivationMap);
  }

  index<
    Alias extends string,
    IndexName extends keyof TTable['secondaryIndexMap'],
    TPkKeys extends keyof TSchema['Type'],
    TSkKeys extends keyof TSchema['Type'],
  >(
    indexName: IndexName,
    alias: Alias,
    indexDerivation: {
      pk: IndexKeyDerivation<TSchema['Type'], TPkKeys>;
      sk: IndexKeyDerivation<TSchema['Type'], TSkKeys>;
    },
  ) {
    return new EntityIndexDerivations(
      this.#table,
      this.#eschema,
      this.#primaryDerivation,
      {
        ...this.#secondaryDerivations,
        [alias as string]: {
          ...indexDerivation,
          indexName,
        },
      },
    ) as EntityIndexDerivations<
      TTable,
      TSchema,
      TPrimaryDerivation,
      TSecondaryDerivationMap &
        Record<
          Alias,
          IndexDerivation<
            IndexKeyDerivation<TSchema['Type'], TPkKeys>,
            IndexKeyDerivation<TSchema['Type'], TSkKeys>
          > & { indexName: keyof TTable['secondaryIndexMap'] }
        >
    >;
  }

  build() {
    return new DynamoEntity(
      this.#table,
      this.#eschema,
      this.#primaryDerivation,
      this.#secondaryDerivations,
    );
  }
}

import { EmptyESchema } from '@monorepo/eschema';
import { DynamoTableV2 } from './tablev2.js';
import {
  IndexKeyDerivation,
  IndexDerivation,
  IndexDerivationValue,
  EmptyIndexDerivation,
} from './entity/types.js';
import { TGetItemInput } from './types.js';
import { Effect, Schema } from 'effect';
import { deriveIndexKeyValue } from './entity/utils.js';
import { buildExpression } from '../table/expr/expression-builder.js';
import { metaSchema } from './entity/schema.js';

export class DynamoEntity<
  TTable extends DynamoTableV2<any, any>,
  TSchema extends EmptyESchema,
  TPrimaryDerivation extends EmptyIndexDerivation,
  TSecondaryDerivationMap extends Record<
    keyof TTable['secondaryIndexMap'],
    EmptyIndexDerivation
  >,
> {
  static make<TT extends DynamoTableV2<any, any>>(table: TT) {
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

    return this.#table.getItem({ pk, sk }, options).pipe(
      Effect.flatMap(({ Item, ...rest }) =>
        this.#eschema.parse(Item).pipe(
          Effect.map((item) => ({
            item: {
              value: item.value,
              meta: Schema.decodeUnknownSync(metaSchema)(Item),
            },
            ...rest,
          })),
        ),
      ),
    );
  }

  insert(value: TSchema['Type']) {
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
      const pk = deriveIndexKeyValue(this.#primaryDerivation['pk'], value);
      const sk = deriveIndexKeyValue(this.#primaryDerivation['sk'], value);

      return yield* this.#table
        .putItem(
          {
            ...value,
            [this.#table.primary['pk']]: pk,
            [this.#table.primary['sk']]: sk,
          },
          {
            ReturnItemCollectionMetrics: 'SIZE',
            ReturnValues: 'ALL_OLD',
            ReturnConsumedCapacity: 'TOTAL',
            ReturnValuesOnConditionCheckFailure: 'ALL_OLD',
          },
        )
        .pipe(
          Effect.catchTag('ConditionalCheckFailedException', (v) => {
            console.log('VALUE: ', v);
            return Effect.succeed(null);
          }),
        );
    });
  }

  update(
    keyValue: IndexDerivationValue<TPrimaryDerivation>,
    value: Partial<TSchema['Type']>,
    meta?: typeof metaSchema.Type,
  ) {
    return Effect.gen(this, function* () {
      value = yield* Schema.decodeUnknown(Schema.partial(this.#eschema.schema))(
        value,
      );
      const pk = deriveIndexKeyValue(this.#primaryDerivation['pk'], keyValue);
      const sk = deriveIndexKeyValue(this.#primaryDerivation['sk'], keyValue);

      const condition: any = {
        __v: this.#eschema.latestVersion,
      };
      if (meta) {
        condition.__i = meta.__i;
        condition.__d = meta.__d;
      }
      const update = buildExpression({
        condition,
        update: {
          set: value,
        },
      });

      return yield* this.#table
        .updateItem(
          { pk, sk },
          {
            // debug: true,
            ...update,
            ReturnConsumedCapacity: 'TOTAL',
            ReturnItemCollectionMetrics: 'SIZE',
            ReturnValuesOnConditionCheckFailure: 'ALL_OLD',
          },
        )
        .pipe(
          Effect.catchTag('ConditionalCheckFailedException', (v) => {
            console.log('VALUE: ', v);
            return Effect.succeed(null);
          }),
        );
    });
  }
}

class EntityIndexDerivations<
  TTable extends DynamoTableV2<any, any>,
  TSchema extends EmptyESchema,
  TPrimaryDerivation extends IndexDerivation<any, any>,
  TSecondaryDerivationMap extends Record<
    keyof TTable['secondaryIndexMap'],
    EmptyIndexDerivation
  >,
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
    IndexName extends keyof TTable['secondaryIndexMap'],
    TPkKeys extends keyof TSchema['Type'],
    TSkKeys extends keyof TSchema['Type'],
  >(
    indexName: IndexName,
    indexDerivation: Record<
      TTable['secondaryIndexMap'][IndexName]['pk'],
      IndexKeyDerivation<TSchema['Type'], TPkKeys>
    > &
      Record<
        TTable['secondaryIndexMap'][IndexName]['sk'],
        IndexKeyDerivation<TSchema['Type'], TSkKeys>
      >,
  ) {
    return new EntityIndexDerivations(
      this.#table,
      this.#eschema,
      this.#primaryDerivation,
      {
        ...this.#secondaryDerivations,
        [indexName as string]: indexDerivation,
      },
    ) as EntityIndexDerivations<
      TTable,
      TSchema,
      TPrimaryDerivation,
      TSecondaryDerivationMap &
        Record<
          IndexName,
          IndexDerivation<
            IndexKeyDerivation<TSchema['Type'], TPkKeys>,
            IndexKeyDerivation<TSchema['Type'], TSkKeys>
          >
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

import type { AnyESchema, ESchemaType } from "@std-toolkit/eschema";
import { Effect, Schema } from "effect";
import type { DynamoTableInstance } from "./DynamoTable.js";
import { DynamodbError } from "../errors.js";
import type {
  EmptyIndexDerivation,
  IndexDefinition,
  IndexDerivation,
  IndexKeyDerivation,
  IndexKeyDerivationValue,
  TransactItem,
} from "../types/index.js";
import type { EntityDescriptor, IndexPatternDescriptor } from "../types/descriptor.js";
import {
  deriveIndexKeyValue,
  toDiscriminatedGeneric,
  fromDiscriminatedGeneric,
} from "../internal/index.js";
import { buildExpr } from "../expr/build-expr.js";
import { exprCondition, type ConditionOperation } from "../expr/condition.js";
import { exprUpdate } from "../expr/update.js";
import type { SortKeyparameter } from "../expr/key-condition.js";

const metaSchema = Schema.Struct({
  _e: Schema.String,
  _v: Schema.String,
  _u: Schema.String,
  _i: Schema.Number,
  _d: Schema.Boolean,
});

type MetaType = typeof metaSchema.Type;

const isConditionalCheckFailed = (e: DynamodbError): boolean => {
  if (!("cause" in e.error)) return false;
  const cause = e.error.cause as DynamodbError | undefined;
  return (
    cause?.error._tag === "UnknownAwsError" &&
    cause.error.name === "ConditionalCheckFailedException"
  );
};

export interface EntityType<T> {
  value: T;
  meta: MetaType;
}

export class DynamoEntity<
  TTable extends DynamoTableInstance,
  TSecondaryDerivationMap extends Record<
    string,
    EmptyIndexDerivation & { gsiName: string }
  >,
  TSchema extends AnyESchema,
  TPrimaryDerivation extends EmptyIndexDerivation,
> {
  static make<TTable extends DynamoTableInstance>(table: TTable) {
    return {
      eschema<TS extends AnyESchema>(eschema: TS) {
        return {
          primary<
            TPkKeys extends keyof ESchemaType<TS>,
            TSkKeys extends keyof ESchemaType<TS>,
          >(
            primaryDerivation: IndexDerivation<
              IndexKeyDerivation<ESchemaType<TS>, TPkKeys>,
              IndexKeyDerivation<ESchemaType<TS>, TSkKeys>
            >,
          ) {
            return new EntityIndexDerivations<
              TTable,
              TS,
              typeof primaryDerivation
            >(table, eschema, primaryDerivation);
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

  get name(): TSchema["name"] {
    return this.#eschema.name;
  }

  getDescriptor(): EntityDescriptor {
    return {
      name: this.#eschema.name,
      version: this.#eschema.latestVersion,
      primaryIndex: {
        name: "primary",
        pk: this.#extractPattern(this.#primaryDerivation.pk),
        sk: this.#extractPattern(this.#primaryDerivation.sk),
      },
      secondaryIndexes: Object.entries(this.#secondaryDerivations).map(
        ([name, deriv]) => ({
          name,
          pk: this.#extractPattern(deriv.pk),
          sk: this.#extractPattern(deriv.sk),
        }),
      ),
    };
  }

  #extractPattern(
    keyDerivation: IndexKeyDerivation<any, any>,
  ): IndexPatternDescriptor {
    const deps = keyDerivation.deps.map(String);
    const placeholder = Object.fromEntries(
      deps.map((dep) => [dep, `{${dep}}`]),
    );
    const parts = keyDerivation.derive(placeholder);
    return {
      deps,
      pattern: parts.join("#"),
    };
  }

  get(
    keyValue: IndexKeyDerivationValue<TPrimaryDerivation["pk"]> &
      IndexKeyDerivationValue<TPrimaryDerivation["sk"]>,
    options?: { ConsistentRead?: boolean },
  ): Effect.Effect<EntityType<ESchemaType<TSchema>> | null, DynamodbError> {
    return Effect.gen(this, function* () {
      const pk = deriveIndexKeyValue(this.#primaryDerivation.pk, keyValue);
      const sk = deriveIndexKeyValue(this.#primaryDerivation.sk, keyValue);

      const { Item } = yield* this.#table.getItem({ pk, sk }, options);

      if (!Item) return null;

      const value = yield* this.#eschema
        .decode(Item)
        .pipe(Effect.mapError((e) => DynamodbError.getItemFailed(e)));

      const meta = Schema.decodeUnknownSync(metaSchema)(Item);

      return {
        value: value as ESchemaType<TSchema>,
        meta,
      };
    });
  }

  insert(
    value: Omit<ESchemaType<TSchema>, "_v">,
    options?: {
      ignoreIfAlreadyPresent?: boolean;
      condition?: ConditionOperation<ESchemaType<TSchema>>;
    },
  ): Effect.Effect<EntityType<ESchemaType<TSchema>>, DynamodbError> {
    const self = this;
    return Effect.gen(function* () {
      const fullValue = {
        ...value,
        _v: self.#eschema.latestVersion,
      } as ESchemaType<TSchema>;
      const encoded = yield* self.#eschema
        .encode(fullValue as any)
        .pipe(Effect.mapError((e) => DynamodbError.putItemFailed(e)));

      const meta: MetaType = {
        _e: self.#eschema.name,
        _v: self.#eschema.latestVersion,
        _u: new Date().toISOString(),
        _i: 0,
        _d: false,
      };

      const primaryIndex = self.#derivePrimaryIndex(fullValue);
      const indexMap = self.#deriveSecondaryIndexes(fullValue);

      const item = {
        ...encoded,
        ...meta,
        [self.#table.primary.pk]: primaryIndex.pk,
        [self.#table.primary.sk]: primaryIndex.sk,
        ...indexMap,
      };

      const exprResult = buildExpr({
        condition: exprCondition(($) =>
          $.and(
            ...([
              options?.condition,
              $.attributeNotExists(self.#table.primary.pk as any),
              $.attributeNotExists(self.#table.primary.sk as any),
            ].filter(Boolean) as ConditionOperation[]),
          ),
        ),
      });

      const putResult = yield* self.#table
        .putItem(item, { ReturnValues: "ALL_OLD", ...exprResult })
        .pipe(
          Effect.map(() => ({ alreadyExisted: false })),
          Effect.catchIf(
            (e): e is DynamodbError =>
              e.error._tag === "PutItemFailed" && isConditionalCheckFailed(e),
            () =>
              options?.ignoreIfAlreadyPresent
                ? Effect.succeed({ alreadyExisted: true })
                : Effect.fail(DynamodbError.itemAlreadyExists()),
          ),
        );

      if (putResult.alreadyExisted) {
        const existing = yield* self.get(
          value as unknown as IndexKeyDerivationValue<
            TPrimaryDerivation["pk"]
          > &
            IndexKeyDerivationValue<TPrimaryDerivation["sk"]>,
        );
        if (!existing) {
          return yield* Effect.fail(
            DynamodbError.getItemFailed("Item not found after insert conflict"),
          );
        }
        return existing;
      }

      return { value: fullValue, meta };
    });
  }

  update(
    keyValue: IndexKeyDerivationValue<TPrimaryDerivation["pk"]> &
      IndexKeyDerivationValue<TPrimaryDerivation["sk"]>,
    updates: Partial<ESchemaType<TSchema>>,
    options?: {
      meta?: Partial<MetaType>;
      condition?: ConditionOperation<ESchemaType<TSchema>>;
    },
  ): Effect.Effect<EntityType<ESchemaType<TSchema>>, DynamodbError> {
    const self = this;
    return Effect.gen(function* () {
      const pk = deriveIndexKeyValue(self.#primaryDerivation.pk, keyValue);
      const sk = deriveIndexKeyValue(self.#primaryDerivation.sk, keyValue);

      const indexMap = self.#deriveSecondaryIndexes(updates);

      const conditionOps: ConditionOperation[] = [
        exprCondition(($) =>
          $.cond("_v" as any, "=", self.#eschema.latestVersion),
        ),
      ];
      if (options?.condition) conditionOps.push(options.condition);
      if (options?.meta?._i !== undefined) {
        conditionOps.push(
          exprCondition(($) => $.cond("_i" as any, "=", options.meta!._i)),
        );
      }

      const condition = exprCondition(($) => $.and(...conditionOps));

      const update = exprUpdate<any>(($) => [
        ...Object.entries({ ...updates, ...indexMap }).map(([key, v]) =>
          $.set(key, v),
        ),
        $.set("_i", $.opAdd("_i", 1)),
        $.set("_u", new Date().toISOString()),
      ]);

      const exprResult = buildExpr({
        update,
        condition,
      });

      const result = yield* self.#table
        .updateItem({ pk, sk }, { ReturnValues: "ALL_NEW", ...exprResult })
        .pipe(
          Effect.mapError((e): DynamodbError =>
            e.error._tag === "UpdateItemFailed" && isConditionalCheckFailed(e)
              ? DynamodbError.noItemToUpdate()
              : e,
          ),
        );

      if (!result.Attributes) {
        return yield* Effect.fail(DynamodbError.noItemToUpdate());
      }

      const decodedValue = yield* self.#eschema
        .decode(result.Attributes)
        .pipe(Effect.mapError((e) => DynamodbError.updateItemFailed(e)));

      const updatedMeta = Schema.decodeUnknownSync(metaSchema)(
        result.Attributes,
      );

      return {
        value: decodedValue as ESchemaType<TSchema>,
        meta: updatedMeta,
      };
    });
  }

  insertOp(
    value: Omit<ESchemaType<TSchema>, "_v">,
    options?: {
      condition?: ConditionOperation<ESchemaType<TSchema>>;
    },
  ): Effect.Effect<TransactItem<TSchema["name"]>, DynamodbError> {
    return Effect.gen(this, function* () {
      const fullValue = {
        ...value,
        _v: this.#eschema.latestVersion,
      } as ESchemaType<TSchema>;
      const encoded = yield* this.#eschema
        .encode(fullValue as any)
        .pipe(Effect.mapError((e) => DynamodbError.putItemFailed(e)));

      const meta: MetaType = {
        _e: this.#eschema.name,
        _v: this.#eschema.latestVersion,
        _u: new Date().toISOString(),
        _i: 0,
        _d: false,
      };

      const primaryIndex = this.#derivePrimaryIndex(fullValue);
      const indexMap = this.#deriveSecondaryIndexes(fullValue);

      const item = {
        ...encoded,
        ...meta,
        [this.#table.primary.pk]: primaryIndex.pk,
        [this.#table.primary.sk]: primaryIndex.sk,
        ...indexMap,
      };

      const exprResult = buildExpr({
        condition: exprCondition(($) =>
          $.and(
            ...([
              options?.condition,
              $.attributeNotExists(this.#table.primary.pk as any),
              $.attributeNotExists(this.#table.primary.sk as any),
            ].filter(Boolean) as ConditionOperation[]),
          ),
        ),
      });

      const tableOp = this.#table.opPutItem(item, exprResult);
      return {
        ...tableOp,
        entityName: this.#eschema.name,
      };
    });
  }

  updateOp(
    keyValue: IndexKeyDerivationValue<TPrimaryDerivation["pk"]> &
      IndexKeyDerivationValue<TPrimaryDerivation["sk"]>,
    updates: Partial<ESchemaType<TSchema>>,
    options?: {
      meta?: Partial<MetaType>;
      condition?: ConditionOperation<ESchemaType<TSchema>>;
    },
  ): Effect.Effect<TransactItem<TSchema["name"]>, DynamodbError> {
    return Effect.gen(this, function* () {
      const pk = deriveIndexKeyValue(this.#primaryDerivation.pk, keyValue);
      const sk = deriveIndexKeyValue(this.#primaryDerivation.sk, keyValue);

      const indexMap = this.#deriveSecondaryIndexes(updates);

      const conditionOps: ConditionOperation[] = [
        exprCondition(($) =>
          $.cond("_v" as any, "=", this.#eschema.latestVersion),
        ),
      ];
      if (options?.condition) conditionOps.push(options.condition);
      if (options?.meta?._i !== undefined) {
        conditionOps.push(
          exprCondition(($) => $.cond("_i" as any, "=", options.meta!._i)),
        );
      }

      const condition = exprCondition(($) => $.and(...conditionOps));

      const update = exprUpdate<any>(($) => [
        ...Object.entries({ ...updates, ...indexMap }).map(([key, v]) =>
          $.set(key, v),
        ),
        $.set("_i", $.opAdd("_i", 1)),
        $.set("_u", new Date().toISOString()),
      ]);

      const exprResult = buildExpr({
        update,
        condition,
      });

      const tableOp = this.#table.opUpdateItem({ pk, sk }, exprResult);
      return {
        ...tableOp,
        entityName: this.#eschema.name,
      };
    });
  }

  query(
    params: {
      pk: IndexKeyDerivationValue<TPrimaryDerivation["pk"]>;
      sk?: SortKeyparameter<IndexKeyDerivationValue<TPrimaryDerivation["sk"]>>;
    },
    options?: {
      Limit?: number;
      ScanIndexForward?: boolean;
      filter?: ConditionOperation<ESchemaType<TSchema>>;
    },
  ): Effect.Effect<
    { items: EntityType<ESchemaType<TSchema>>[] },
    DynamodbError
  > {
    return Effect.gen(this, function* () {
      const derivedPk = deriveIndexKeyValue(
        this.#primaryDerivation.pk,
        params.pk,
      );
      const derivedSk = params.sk
        ? this.#calculateSk(this.#primaryDerivation, params.sk as any)
        : undefined;

      const { Items } = yield* this.#table.query(
        { pk: derivedPk, sk: derivedSk as any },
        options,
      );

      const items = yield* Effect.all(
        Items.map((item) =>
          this.#eschema.decode(item).pipe(
            Effect.map((value) => ({
              value: value as ESchemaType<TSchema>,
              meta: Schema.decodeUnknownSync(metaSchema)(item),
            })),
            Effect.mapError((e) => DynamodbError.queryFailed(e)),
          ),
        ),
      );

      return { items };
    });
  }

  index<GsiName extends keyof TSecondaryDerivationMap>(gsiName: GsiName) {
    return {
      query: (
        params: {
          pk: IndexKeyDerivationValue<TSecondaryDerivationMap[GsiName]["pk"]>;
          sk?: SortKeyparameter<
            IndexKeyDerivationValue<TSecondaryDerivationMap[GsiName]["sk"]>
          >;
        },
        options?: {
          Limit?: number;
          ScanIndexForward?: boolean;
          filter?: ConditionOperation<ESchemaType<TSchema>>;
        },
      ): Effect.Effect<
        { items: EntityType<ESchemaType<TSchema>>[] },
        DynamodbError
      > => {
        return Effect.gen(this, function* () {
          const indexDerivation = this.#secondaryDerivations[gsiName];

          if (!indexDerivation) {
            throw new Error(`Index ${String(gsiName)} not found`);
          }

          const derivedPk = deriveIndexKeyValue(indexDerivation.pk, params.pk);
          const derivedSk = params.sk
            ? this.#calculateSk(indexDerivation, params.sk as any)
            : undefined;

          const { Items } = yield* this.#table
            .index(indexDerivation.gsiName as any)
            .query({ pk: derivedPk, sk: derivedSk as any }, options);

          const items = yield* Effect.all(
            Items.map((item) =>
              this.#eschema.decode(item).pipe(
                Effect.map((value) => ({
                  value: value as ESchemaType<TSchema>,
                  meta: Schema.decodeUnknownSync(metaSchema)(item),
                })),
                Effect.mapError((e) => DynamodbError.queryFailed(e)),
              ),
            ),
          );

          return { items };
        });
      },
    };
  }

  #calculateSk(
    derivation: EmptyIndexDerivation,
    sk: SortKeyparameter,
  ): SortKeyparameter | string {
    const realSk = toDiscriminatedGeneric(sk as Record<string, any>);

    switch (realSk.type) {
      case "<":
      case "<=":
      case ">":
      case ">=":
        if (realSk.value == null) break;
        realSk.value = deriveIndexKeyValue(derivation.sk, realSk.value);
        break;
      case "between":
        if (realSk.value) {
          (realSk.value as any)[0] = deriveIndexKeyValue(
            derivation.sk,
            (realSk.value as any)[0],
          );
          (realSk.value as any)[1] = deriveIndexKeyValue(
            derivation.sk,
            (realSk.value as any)[1],
          );
        }
        break;
      case "beginsWith":
        if (realSk.value != null) {
          realSk.value = deriveIndexKeyValue(derivation.sk, realSk.value);
        }
        break;
    }

    return fromDiscriminatedGeneric(realSk) as SortKeyparameter;
  }

  #derivePrimaryIndex(value: any): IndexDefinition {
    return {
      pk: deriveIndexKeyValue(this.#primaryDerivation.pk, value),
      sk: deriveIndexKeyValue(this.#primaryDerivation.sk, value),
    };
  }

  #deriveSecondaryIndexes(value: any): Record<string, string> {
    const indexMap: Record<string, string> = {};

    for (const [, derivation] of Object.entries(this.#secondaryDerivations)) {
      const deriv = derivation as EmptyIndexDerivation & { gsiName: string };

      if (
        deriv.pk.deps.every((key: string) => typeof value[key] !== "undefined")
      ) {
        const pkKey = `${deriv.gsiName}PK`;
        indexMap[pkKey] = deriv.pk.derive(value).join("#");
      }

      if (
        deriv.sk.deps.every((key: string) => typeof value[key] !== "undefined")
      ) {
        const skKey = `${deriv.gsiName}SK`;
        indexMap[skKey] = deriv.sk.derive(value).join("#");
      }
    }

    return indexMap;
  }
}

class EntityIndexDerivations<
  TTable extends DynamoTableInstance,
  TSchema extends AnyESchema,
  TPrimaryDerivation extends IndexDerivation<any, any>,
  TSecondaryDerivationMap extends Record<
    string,
    EmptyIndexDerivation & { gsiName: string }
  > = {},
> {
  #table: TTable;
  #eschema: TSchema;
  #primaryDerivation: TPrimaryDerivation;
  #secondaryDerivations: TSecondaryDerivationMap;

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
    GsiName extends keyof TTable["secondaryIndexMap"] & string,
    TPkKeys extends keyof ESchemaType<TSchema>,
    TSkKeys extends keyof ESchemaType<TSchema>,
  >(
    gsiName: GsiName,
    indexDerivation: {
      pk: IndexKeyDerivation<ESchemaType<TSchema>, TPkKeys>;
      sk: IndexKeyDerivation<ESchemaType<TSchema>, TSkKeys>;
    },
  ) {
    return new EntityIndexDerivations(
      this.#table,
      this.#eschema,
      this.#primaryDerivation,
      {
        ...this.#secondaryDerivations,
        [gsiName]: {
          ...indexDerivation,
          gsiName,
        },
      },
    ) as EntityIndexDerivations<
      TTable,
      TSchema,
      TPrimaryDerivation,
      TSecondaryDerivationMap &
        Record<
          GsiName,
          IndexDerivation<
            IndexKeyDerivation<ESchemaType<TSchema>, TPkKeys>,
            IndexKeyDerivation<ESchemaType<TSchema>, TSkKeys>
          > & { gsiName: GsiName }
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

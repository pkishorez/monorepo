import type {
  AnyUnkeyedESchema,
  ESchemaType,
} from '../../../../eschema/index.js';
import { Effect, Option, Schema } from 'effect';
import { Broadcaster, type EntityType } from '../../../../core/index.js';
import { deriveIndexKeyValue } from '../../internal/index.js';
import type { EntityTable as DynamoTable } from '../../domain/entity-persistence/index.js';

export const singleMetaSchema = Schema.Struct({
  _e: Schema.String,
  _v: Schema.String,
  _u: Schema.String,
});

export type SingleMeta = typeof singleMetaSchema.Type;

export interface SingleEntityType<T> {
  readonly value: T;
  readonly meta: SingleMeta;
}

export interface SingleEntityContext<
  TTable extends DynamoTable<any, any>,
  TSchema extends AnyUnkeyedESchema,
> {
  readonly table: TTable;
  readonly eschema: TSchema;
  readonly defaultValue: ESchemaType<TSchema>;
  readonly key: string;
}

export const makeSingleEntityContext = <
  TTable extends DynamoTable<any, any>,
  TSchema extends AnyUnkeyedESchema,
>(
  table: TTable,
  eschema: TSchema,
  defaultValue: ESchemaType<TSchema>,
): SingleEntityContext<TTable, TSchema> => ({
  table,
  eschema,
  defaultValue,
  key: deriveIndexKeyValue(eschema.name, [], {}, true),
});

export const broadcastSingleEntity = <TSchema extends AnyUnkeyedESchema>(
  entities: ReadonlyArray<EntityType<ESchemaType<TSchema>>>,
) =>
  Effect.gen(function* () {
    const service = yield* Effect.serviceOption(Broadcaster).pipe(
      Effect.map(Option.getOrNull),
    );
    service?.broadcast([...entities]);
  });

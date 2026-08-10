import type {
  AnyUnkeyedESchema,
  ESchemaType,
} from '../../../../eschema/index.js';
import { Effect, Option, Schema } from 'effect';
import { Broadcaster, type EntityType } from '../../../../core/index.js';
import { EntityPersistence } from '../../domain/entity-persistence/index.js';
import type { SQLiteEntityTable } from '../sqlite-entity/index.js';

export const singleMetaSchema = Schema.Struct({
  _e: Schema.String,
  _v: Schema.String,
  _u: Schema.String,
});

export type SingleMetaType = typeof singleMetaSchema.Type;

export interface SingleEntityType<T> {
  readonly value: T;
  readonly meta: SingleMetaType;
}

export interface SQLiteSingleEntityContext<
  TTable extends SQLiteEntityTable,
  TSchema extends AnyUnkeyedESchema,
> {
  readonly table: TTable;
  readonly eschema: TSchema;
  readonly defaultValue: ESchemaType<TSchema>;
  readonly key: { readonly pk: string; readonly sk: string };
}

export const makeSQLiteSingleEntityContext = <
  TTable extends SQLiteEntityTable,
  TSchema extends AnyUnkeyedESchema,
>(
  table: TTable,
  eschema: TSchema,
  defaultValue: ESchemaType<TSchema>,
): SQLiteSingleEntityContext<TTable, TSchema> => {
  const key = EntityPersistence.deriveIndexKeyValue(eschema.name, [], {}, true);
  return { table, eschema, defaultValue, key: { pk: key, sk: key } };
};

export const broadcastSQLiteSingleEntity = <TSchema extends AnyUnkeyedESchema>(
  entities: ReadonlyArray<EntityType<ESchemaType<TSchema>>>,
) =>
  Effect.gen(function* () {
    const service = yield* Effect.serviceOption(Broadcaster).pipe(
      Effect.map(Option.getOrNull),
    );
    service?.broadcast([...entities]);
  });

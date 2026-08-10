import type {
  AnyUnkeyedESchema,
  ESchemaType,
} from '../../../../eschema/index.js';
import { Effect, Option } from 'effect';
import {
  Broadcaster,
  type EntityType,
  type SingleEntityType,
} from '../../../../core/index.js';
import { EntityPersistence } from '../../domain/entity-persistence/index.js';
import type { IdbEntityTable } from '../idb-entity/index.js';

export interface IdbSingleEntityContext<
  TTable extends IdbEntityTable,
  TSchema extends AnyUnkeyedESchema,
> {
  readonly table: TTable;
  readonly eschema: TSchema;
  readonly defaultValue: ESchemaType<TSchema>;
  readonly key: { readonly pk: string; readonly sk: string };
}

export const makeIdbSingleEntityContext = <
  TTable extends IdbEntityTable,
  TSchema extends AnyUnkeyedESchema,
>(
  table: TTable,
  eschema: TSchema,
  defaultValue: ESchemaType<TSchema>,
): IdbSingleEntityContext<TTable, TSchema> => {
  const key = EntityPersistence.deriveIndexKeyValue(eschema.name, [], {}, true);
  return { table, eschema, defaultValue, key: { pk: key, sk: key } };
};

export const broadcastIdbSingleEntity = <TSchema extends AnyUnkeyedESchema>(
  entities: ReadonlyArray<EntityType<ESchemaType<TSchema>>>,
) =>
  Effect.gen(function* () {
    const service = yield* Effect.serviceOption(Broadcaster).pipe(
      Effect.map(Option.getOrNull),
    );
    service?.broadcast([...entities]);
  });

export type { SingleEntityType };

import { Effect } from 'effect';
import { StdToolkitError } from '@std-toolkit/core/rpc';
import type {
  AnyEntityESchema,
  ESchemaEncoded,
  ESchemaType,
} from '@std-toolkit/eschema';
import type { EntityRow, EntityType } from '@std-toolkit/core';
import { DynamodbError } from '../errors.js';
import { type AnyDynamoEntity, mapError, stripDecoded } from './types.js';

export const makeUpdateHandler = <
  TSchema extends AnyEntityESchema,
  TEntity extends AnyDynamoEntity<TSchema>,
  P extends string = '',
>(
  entity: TEntity,
  eschema: TSchema,
  prefix?: P,
) => {
  type Entity = ESchemaType<TSchema>;
  type IdField = TSchema['idField'];
  type InsertPayload = Omit<Entity, IdField>;
  type PartialWithUndefined<T> = { [K in keyof T]?: T[K] | undefined };
  type UpdatePayload = {
    readonly updates: PartialWithUndefined<InsertPayload>;
  } & Record<IdField, string>;
  type Result = EntityType<ESchemaEncoded<TSchema>>;

  const idField = eschema.idField as IdField;

  const handler = (
    payload: UpdatePayload,
  ): Effect.Effect<Result, StdToolkitError> => {
    const typedPayload = payload as unknown as {
      updates: Record<string, unknown>;
    } & Record<string, unknown>;
    const id = typedPayload[idField as string] as string;
    const keyValue = { [idField]: id } as any;
    return (
      entity.update(keyValue, {
        update: typedPayload.updates as any,
      }) as Effect.Effect<EntityRow<TSchema>, DynamodbError>
    ).pipe(Effect.map(stripDecoded), Effect.mapError(mapError));
  };

  const p = (prefix ?? '') as P;
  const handlerName = `${p}update${eschema.name}` as const;

  return { [handlerName]: handler } as {
    [K in `${P}update${TSchema['name']}`]: typeof handler;
  };
};

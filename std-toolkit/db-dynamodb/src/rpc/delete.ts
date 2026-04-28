import { Effect } from 'effect';
import { StdToolkitError } from '@std-toolkit/core/rpc';
import type { AnyEntityESchema, ESchemaEncoded } from '@std-toolkit/eschema';
import type { EntityRow, EntityType } from '@std-toolkit/core';
import { DynamodbError } from '../errors.js';
import { type AnyDynamoEntity, mapError, stripDecoded } from './types.js';

export const makeDeleteHandler = <
  TSchema extends AnyEntityESchema,
  TEntity extends AnyDynamoEntity<TSchema>,
  P extends string = '',
>(
  entity: TEntity,
  eschema: TSchema,
  prefix?: P,
) => {
  type IdField = TSchema['idField'];
  type DeletePayload = Record<IdField, string>;
  type Result = EntityType<ESchemaEncoded<TSchema>>;

  const idField = eschema.idField as IdField;

  const handler = (
    payload: DeletePayload,
  ): Effect.Effect<Result, StdToolkitError> => {
    const id = (payload as Record<string, unknown>)[
      idField as string
    ] as string;
    const keyValue = { [idField]: id } as any;
    return (
      entity.delete(keyValue) as Effect.Effect<
        EntityRow<TSchema>,
        DynamodbError
      >
    ).pipe(Effect.map(stripDecoded), Effect.mapError(mapError));
  };

  const p = (prefix ?? '') as P;
  const handlerName = `${p}delete${eschema.name}` as const;

  return { [handlerName]: handler } as {
    [K in `${P}delete${TSchema['name']}`]: typeof handler;
  };
};

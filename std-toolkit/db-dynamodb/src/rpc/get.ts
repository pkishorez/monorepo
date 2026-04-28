import { Effect } from 'effect';
import { StdToolkitError } from '@std-toolkit/core/rpc';
import type { AnyEntityESchema, ESchemaEncoded } from '@std-toolkit/eschema';
import type { EntityRow, EntityType } from '@std-toolkit/core';
import { DynamodbError } from '../errors.js';
import { type AnyDynamoEntity, mapError, stripDecoded } from './types.js';

export const makeGetHandler = <
  TSchema extends AnyEntityESchema,
  TEntity extends AnyDynamoEntity<TSchema>,
  P extends string = '',
>(
  entity: TEntity,
  eschema: TSchema,
  prefix?: P,
) => {
  type IdField = TSchema['idField'];
  type GetPayload = Record<IdField, string>;
  type Result = EntityType<ESchemaEncoded<TSchema>> | null;

  const idField = eschema.idField as IdField;

  const handler = (
    payload: GetPayload,
  ): Effect.Effect<Result, StdToolkitError> => {
    const id = (payload as Record<string, unknown>)[
      idField as string
    ] as string;
    const keyValue = { [idField]: id } as any;
    return (
      entity.get(keyValue) as Effect.Effect<
        EntityRow<TSchema> | null,
        DynamodbError
      >
    ).pipe(
      Effect.map((row) => (row ? stripDecoded(row) : null)),
      Effect.mapError(mapError),
    );
  };

  const p = (prefix ?? '') as P;
  const handlerName = `${p}get${eschema.name}` as const;

  return { [handlerName]: handler } as {
    [K in `${P}get${TSchema['name']}`]: typeof handler;
  };
};

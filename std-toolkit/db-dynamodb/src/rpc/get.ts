import { Effect } from "effect";
import { StdToolkitError } from "@std-toolkit/core/rpc";
import type { AnyESchema, ESchemaType } from "@std-toolkit/eschema";
import type { EntityType } from "../services/dynamo-entity.js";
import { DynamodbError } from "../errors.js";
import { type AnyDynamoEntity, mapError } from "./types.js";

export const makeGetHandler = <
  TSchema extends AnyESchema,
  TEntity extends AnyDynamoEntity<TSchema>,
  P extends string = "",
>(
  entity: TEntity,
  eschema: TSchema,
  prefix?: P,
) => {
  type Entity = ESchemaType<TSchema>;
  type IdField = TSchema["idField"];
  type GetPayload = Record<IdField, string>;
  type Result = EntityType<Entity> | null;

  const idField = eschema.idField as IdField;

  const handler = (
    payload: GetPayload,
  ): Effect.Effect<Result, StdToolkitError> => {
    const id = (payload as Record<string, unknown>)[idField as string] as string;
    const keyValue = { [idField]: id } as any;
    return (entity.get(keyValue) as Effect.Effect<Result, DynamodbError>).pipe(
      Effect.mapError(mapError),
    );
  };

  const p = (prefix ?? "") as P;
  const handlerName = `${p}get${eschema.name}` as const;

  return { [handlerName]: handler } as {
    [K in `${P}get${TSchema["name"]}`]: typeof handler;
  };
};

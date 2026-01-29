import { Effect } from "effect";
import { StdToolkitError } from "@std-toolkit/core/rpc";
import type { AnyESchema, ESchemaType } from "@std-toolkit/eschema";
import type { EntityType } from "../services/dynamo-entity.js";
import { DynamodbError } from "../errors.js";
import { type AnyDynamoEntity, mapError } from "./types.js";

export const makeInsertHandler = <
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
  type InsertPayload = Omit<Entity, IdField>;
  type Result = EntityType<Entity>;

  const handler = (
    payload: InsertPayload,
  ): Effect.Effect<Result, StdToolkitError> =>
    (entity.insert(payload as any) as Effect.Effect<Result, DynamodbError>).pipe(
      Effect.mapError(mapError),
    );

  const p = (prefix ?? "") as P;
  const handlerName = `${p}insert${eschema.name}` as const;

  return { [handlerName]: handler } as {
    [K in `${P}insert${TSchema["name"]}`]: typeof handler;
  };
};

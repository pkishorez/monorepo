import { Effect } from "effect";
import { StdToolkitError } from "@std-toolkit/core/rpc";
import type { AnyESchema, ESchemaType } from "@std-toolkit/eschema";
import type { EntityType } from "../services/sqlite-entity.js";
import { SqliteDB, SqliteDBError } from "../sql/db.js";
import { type AnySQLiteEntity, mapError } from "./types.js";

export const makeUpdateHandler = <
  TSchema extends AnyESchema,
  TEntity extends AnySQLiteEntity<TSchema>,
  P extends string = "",
>(
  entity: TEntity,
  eschema: TSchema,
  prefix?: P,
) => {
  type Entity = ESchemaType<TSchema>;
  type IdField = TSchema["idField"];
  type InsertPayload = Omit<Entity, IdField>;
  type PartialWithUndefined<T> = { [K in keyof T]?: T[K] | undefined };
  type UpdatePayload = { readonly updates: PartialWithUndefined<InsertPayload> } & Record<IdField, string>;
  type Result = EntityType<Entity>;

  const idField = eschema.idField as IdField;

  const handler = (
    payload: UpdatePayload,
  ): Effect.Effect<Result, StdToolkitError, SqliteDB> => {
    const typedPayload = payload as unknown as { updates: Record<string, unknown> } & Record<string, unknown>;
    const id = typedPayload[idField as string] as string;
    const keyValue = { [idField]: id } as any;
    return (entity.update(keyValue, typedPayload.updates as any) as Effect.Effect<Result, SqliteDBError, SqliteDB>).pipe(
      Effect.mapError(mapError),
    );
  };

  const p = (prefix ?? "") as P;
  const handlerName = `${p}update${eschema.name}` as const;

  return { [handlerName]: handler } as {
    [K in `${P}update${TSchema["name"]}`]: typeof handler;
  };
};

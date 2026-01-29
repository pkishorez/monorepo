import { Effect } from "effect";
import { StdToolkitError } from "@std-toolkit/core/rpc";
import type { AnyESchema, ESchemaType } from "@std-toolkit/eschema";
import type { EntityType } from "../services/sqlite-entity.js";
import { SqliteDB, SqliteDBError } from "../sql/db.js";
import { type AnySQLiteEntity, mapError } from "./types.js";

export const makeDeleteHandler = <
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
  type DeletePayload = Record<IdField, string>;
  type Result = EntityType<Entity>;

  const idField = eschema.idField as IdField;

  const handler = (
    payload: DeletePayload,
  ): Effect.Effect<Result, StdToolkitError, SqliteDB> => {
    const id = (payload as Record<string, unknown>)[idField as string] as string;
    const keyValue = { [idField]: id } as any;
    return (entity.delete(keyValue) as Effect.Effect<Result, SqliteDBError, SqliteDB>).pipe(
      Effect.mapError(mapError),
    );
  };

  const p = (prefix ?? "") as P;
  const handlerName = `${p}delete${eschema.name}` as const;

  return { [handlerName]: handler } as {
    [K in `${P}delete${TSchema["name"]}`]: typeof handler;
  };
};

import type { AnyESchema } from "@std-toolkit/eschema";
import { type AnyDynamoEntity } from "./types.js";
import { makeGetHandler } from "./get.js";
import { makeInsertHandler } from "./insert.js";
import { makeUpdateHandler } from "./update.js";
import { makeDeleteHandler } from "./delete.js";

export const makeEntityRpcHandlers = <
  TSchema extends AnyESchema,
  TEntity extends AnyDynamoEntity<TSchema>,
  P extends string = "",
>(
  entity: TEntity,
  eschema: TSchema,
  prefix?: P,
) => {
  return {
    ...makeGetHandler(entity, eschema, prefix),
    ...makeInsertHandler(entity, eschema, prefix),
    ...makeUpdateHandler(entity, eschema, prefix),
    ...makeDeleteHandler(entity, eschema, prefix),
  };
};

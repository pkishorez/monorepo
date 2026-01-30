import { Effect } from "effect";
import { type SqliteDBError } from "@std-toolkit/sqlite";
import { makeEntityRpcHandlers } from "@std-toolkit/sqlite/rpc";
import { AppRpcs, UserError, UserEntity, UserSchema } from "../domain";

const mapDbError = (error: SqliteDBError, op: string) =>
  UserError.database(op, error.error._tag);

const userHandlers = makeEntityRpcHandlers(UserEntity, UserSchema);

export const HandlersLive = AppRpcs.toLayer({
  ...userHandlers,

  subscribeUsers: Effect.fn(function* ({ uid }) {
    yield* UserEntity.subscribe({ key: "timeline", pk: {}, cursor: uid }).pipe(
      Effect.mapError((e) =>
        "_tag" in e && e._tag === "SqliteDBError"
          ? mapDbError(e as SqliteDBError, "ListUsers")
          : UserError.database("subscribeUsers", "SubscriptionFailed"),
      ),
    );
    return [];
  }),
});

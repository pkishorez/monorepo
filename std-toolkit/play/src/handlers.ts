import { Effect, Schedule, Stream } from "effect";
import { type SqliteDBError } from "@std-toolkit/sqlite";
import { AppRpcs, NotFoundError, UserError, UsersTable } from "../domain";
import { ulid } from "ulid";

const mapDbError = (error: SqliteDBError, op: string) =>
  UserError.database(op, error.error._tag);

const generateId = () => ulid();

export const HandlersLive = AppRpcs.toLayer({
  Ping: () => Effect.succeed("pong"),

  Counter: ({ count }) =>
    Stream.range(0, count - 1).pipe(
      Stream.schedule(Schedule.spaced(100)),
      Stream.tap((n) => Effect.log(`Emitting ${n}`)),
    ),

  GetUser: ({ id }) =>
    Effect.gen(function* () {
      const result = yield* Effect.mapError(
        UsersTable.get({ id }),
        () => new NotFoundError({ message: `User ${id} not found` }),
      );
      if (result.meta._d) {
        return yield* new NotFoundError({ message: `User ${id} not found` });
      }
      return result;
    }),

  CreateUser: ({ name, email, status }) =>
    Effect.gen(function* () {
      return yield* Effect.mapError(
        UsersTable.insert({
          evolution: "v2 test!",
          id: generateId(),
          name,
          email,
          status: status ?? "pending",
        }),
        (e) => mapDbError(e, "CreateUser"),
      );
    }),

  UpdateUser: ({ id, updates }) =>
    Effect.gen(function* () {
      const filtered = Object.fromEntries(
        Object.entries(updates).filter(([, v]) => v !== undefined),
      );
      return yield* Effect.mapError(UsersTable.update({ id }, filtered), (e) =>
        e.error._tag === "GetFailed"
          ? UserError.userNotFound(id)
          : mapDbError(e, "UpdateUser"),
      );
    }),

  DeleteUser: ({ id }) =>
    Effect.gen(function* () {
      return yield* Effect.mapError(UsersTable.delete({ id }), (e) =>
        e.error._tag === "GetFailed"
          ? UserError.userNotFound(id)
          : mapDbError(e, "DeleteUser"),
      );
    }),

  subscribeUsers: Effect.fn(function* () {
    yield* UsersTable.subscribe({ key: "byUpdates" }).pipe(
      Effect.mapError((e) =>
        "_tag" in e && e._tag === "SqliteDBError"
          ? mapDbError(e as SqliteDBError, "ListUsers")
          : UserError.database("subscribeUsers", "SubscriptionFailed"),
      ),
    );
    return [];
  }),

  ListUsers: ({ limit }) =>
    Effect.gen(function* () {
      const pageLimit = Math.min(limit ?? 20, 100);
      const startCursor = "";

      const result = yield* Effect.mapError(
        UsersTable.query("byUpdates", { ">": { _u: startCursor } }, { limit: pageLimit + 1 }),
        (e) => mapDbError(e, "ListUsers"),
      );

      const activeItems = result.items.filter((item) => !item.meta._d);
      const hasMore = activeItems.length > pageLimit;
      const items = hasMore ? activeItems.slice(0, pageLimit) : activeItems;

      return { items };
    }),
});

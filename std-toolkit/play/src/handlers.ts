import { Effect, Schedule, Stream } from "effect";
import { type SqliteDBError } from "@std-toolkit/sqlite";
import {
  AppRpcs,
  NotFoundError,
  UserNotFoundError,
  UserDatabaseError,
  UsersTable,
} from "../domain";
import { ulid } from "ulid";

const mapDbError = (error: SqliteDBError, op: string) =>
  new UserDatabaseError({ operation: op, cause: error.error._tag });

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
      const result = yield* UsersTable.get({ id }).pipe(
        Effect.mapError(
          () => new NotFoundError({ message: `User ${id} not found` }),
        ),
      );
      if (result.meta._d) {
        return yield* Effect.fail(
          new NotFoundError({ message: `User ${id} not found` }),
        );
      }
      return result;
    }),

  CreateUser: ({ name, email, status }) =>
    Effect.gen(function* () {
      return yield* UsersTable.insert({
        evolution: "v2 test!",
        id: generateId(),
        name,
        email,
        status: status ?? "pending",
      }).pipe(Effect.mapError((e) => mapDbError(e, "CreateUser")));
    }),

  UpdateUser: ({ id, updates }) =>
    Effect.gen(function* () {
      return yield* UsersTable.update({ id }, updates).pipe(
        Effect.mapError((e) =>
          e.error._tag === "GetFailed"
            ? new UserNotFoundError({ id })
            : mapDbError(e, "UpdateUser"),
        ),
      );
    }),

  DeleteUser: ({ id }) =>
    UsersTable.delete({ id }).pipe(
      Effect.mapError((e) =>
        e.error._tag === "GetFailed"
          ? new UserNotFoundError({ id })
          : mapDbError(e, "DeleteUser"),
      ),
    ),

  subscribeUsers: Effect.fn(function* () {
    yield* UsersTable.subscribe({ key: "byUpdates" }).pipe(
      Effect.mapError((e) => mapDbError(e, "ListUsers")),
    );

    return [];
  }),

  ListUsers: ({ limit }) =>
    Effect.gen(function* () {
      const pageLimit = Math.min(limit ?? 20, 100);
      const startCursor = "";

      const result = yield* UsersTable.query(
        "byUpdates",
        { ">": { _u: startCursor } },
        { limit: pageLimit + 1 },
      ).pipe(Effect.mapError((e) => mapDbError(e, "ListUsers")));

      const activeItems = result.items.filter((item) => !item.meta._d);
      const hasMore = activeItems.length > pageLimit;
      const items = hasMore ? activeItems.slice(0, pageLimit) : activeItems;

      return { items };
    }),
});

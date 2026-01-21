import type { Rpc } from "@effect/rpc";
import { Effect, Layer, Schedule, Stream } from "effect";
import { AppRpcs, NotFoundError, User } from "./rpc";

// Mock user database
const users = new Map<string, User>([
  ["1", new User({ id: "1", name: "Alice" })],
  ["2", new User({ id: "2", name: "Bob" })],
]);

export const HandlersLive: Layer.Layer<
  Rpc.Handler<"Ping"> | Rpc.Handler<"Counter"> | Rpc.Handler<"GetUser">
> = AppRpcs.toLayer({
  // 1. Simple request/response
  Ping: () => Effect.succeed("pong"),

  // 2. Stream - emits numbers from 0 to count-1
  Counter: ({ count }) =>
    Stream.range(0, count - 1).pipe(
      Stream.schedule(Schedule.spaced(100)), // Emit every 100ms
      Stream.tap((n) => Effect.log(`Emitting ${n}`)),
    ),

  // 3. Proper payload, success, and error
  GetUser: ({ id }) => {
    const user = users.get(id);
    if (user) {
      return Effect.succeed(user);
    }
    return Effect.fail(new NotFoundError({ message: `User ${id} not found` }));
  },
});

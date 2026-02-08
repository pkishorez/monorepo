import { describe, it, expect } from "@effect/vitest";
import { Effect, Option, Schema } from "effect";
import { ESchema } from "@std-toolkit/eschema";
import type { EntityType } from "@std-toolkit/core";
import { MemoryCacheEntity } from "../memory/memory-cache-entity.js";

const UserSchema = ESchema.make("User", "id", {
  name: Schema.String,
  email: Schema.String,
}).build();

function makeUserEntity(
  id: string,
  name: string,
  email: string,
): EntityType<typeof UserSchema.Type> {
  return {
    value: { id, name, email },
    meta: {
      _e: UserSchema.name,
      _v: UserSchema.latestVersion,
      _uid: `uid-${id}`,
      _d: false,
    },
  };
}

describe("MemoryCacheEntity", () => {
  it.effect("should create via make factory", () =>
    Effect.gen(function* () {
      const users = yield* MemoryCacheEntity.make({ eschema: UserSchema });
      expect(users).toBeInstanceOf(MemoryCacheEntity);

      const user = makeUserEntity("user-1", "John", "john@example.com");
      yield* users.put(user);

      const retrieved = yield* users.get("user-1");
      expect(Option.isSome(retrieved)).toBe(true);
    }),
  );

  it.effect("should put and get a single entity", () =>
    Effect.gen(function* () {
      const users = yield* MemoryCacheEntity.make({ eschema: UserSchema });

      const user = makeUserEntity("user-1", "John", "john@example.com");
      yield* users.put(user);

      const retrieved = yield* users.get("user-1");
      expect(Option.isSome(retrieved)).toBe(true);
      if (Option.isSome(retrieved)) {
        expect(retrieved.value.value.id).toBe("user-1");
        expect(retrieved.value.value.name).toBe("John");
        expect(retrieved.value.meta._e).toBe("User");
      }
    }),
  );

  it.effect("should return none for non-existent entity", () =>
    Effect.gen(function* () {
      const users = yield* MemoryCacheEntity.make({ eschema: UserSchema });

      const retrieved = yield* users.get("non-existent");
      expect(Option.isNone(retrieved)).toBe(true);
    }),
  );

  it.effect("should get all entities of a type", () =>
    Effect.gen(function* () {
      const users = yield* MemoryCacheEntity.make({ eschema: UserSchema });

      yield* users.put(makeUserEntity("user-1", "John", "john@example.com"));
      yield* users.put(makeUserEntity("user-2", "Jane", "jane@example.com"));
      yield* users.put(makeUserEntity("user-3", "Bob", "bob@example.com"));

      const allUsers = yield* users.getAll();
      expect(allUsers).toHaveLength(3);
      expect(allUsers.map((u) => u.value.id).sort()).toEqual([
        "user-1",
        "user-2",
        "user-3",
      ]);
    }),
  );

  it.effect("should delete a single entity", () =>
    Effect.gen(function* () {
      const users = yield* MemoryCacheEntity.make({ eschema: UserSchema });

      yield* users.put(makeUserEntity("user-1", "John", "john@example.com"));
      yield* users.put(makeUserEntity("user-2", "Jane", "jane@example.com"));

      yield* users.delete("user-1");

      const user1 = yield* users.get("user-1");
      const user2 = yield* users.get("user-2");

      expect(Option.isNone(user1)).toBe(true);
      expect(Option.isSome(user2)).toBe(true);
    }),
  );

  it.effect("should delete all entities of a type", () =>
    Effect.gen(function* () {
      const users = yield* MemoryCacheEntity.make({ eschema: UserSchema });

      yield* users.put(makeUserEntity("user-1", "John", "john@example.com"));
      yield* users.put(makeUserEntity("user-2", "Jane", "jane@example.com"));

      yield* users.deleteAll();

      const allUsers = yield* users.getAll();
      expect(allUsers).toHaveLength(0);
    }),
  );

  it.effect("should update existing entity on put", () =>
    Effect.gen(function* () {
      const users = yield* MemoryCacheEntity.make({ eschema: UserSchema });

      yield* users.put(makeUserEntity("user-1", "John", "john@example.com"));
      yield* users.put(
        makeUserEntity("user-1", "John Updated", "john.updated@example.com"),
      );

      const allUsers = yield* users.getAll();
      expect(allUsers).toHaveLength(1);

      const user = yield* users.get("user-1");
      expect(Option.isSome(user)).toBe(true);
      if (Option.isSome(user)) {
        expect(user.value.value.name).toBe("John Updated");
      }
    }),
  );

  it.effect("should get latest entity by _uid", () =>
    Effect.gen(function* () {
      const users = yield* MemoryCacheEntity.make({ eschema: UserSchema });

      yield* users.put({
        value: { id: "user-1", name: "Alice", email: "alice@example.com" },
        meta: { _e: "User", _v: "v1", _uid: "uid-001", _d: false },
      });
      yield* users.put({
        value: { id: "user-2", name: "Bob", email: "bob@example.com" },
        meta: { _e: "User", _v: "v1", _uid: "uid-003", _d: false },
      });
      yield* users.put({
        value: { id: "user-3", name: "Charlie", email: "charlie@example.com" },
        meta: { _e: "User", _v: "v1", _uid: "uid-002", _d: false },
      });

      const latest = yield* users.getLatest();
      expect(Option.isSome(latest)).toBe(true);
      if (Option.isSome(latest)) {
        expect(latest.value.value.id).toBe("user-2");
        expect(latest.value.meta._uid).toBe("uid-003");
      }
    }),
  );

  it.effect("should get oldest entity by _uid", () =>
    Effect.gen(function* () {
      const users = yield* MemoryCacheEntity.make({ eschema: UserSchema });

      yield* users.put({
        value: { id: "user-1", name: "Alice", email: "alice@example.com" },
        meta: { _e: "User", _v: "v1", _uid: "uid-002", _d: false },
      });
      yield* users.put({
        value: { id: "user-2", name: "Bob", email: "bob@example.com" },
        meta: { _e: "User", _v: "v1", _uid: "uid-001", _d: false },
      });
      yield* users.put({
        value: { id: "user-3", name: "Charlie", email: "charlie@example.com" },
        meta: { _e: "User", _v: "v1", _uid: "uid-003", _d: false },
      });

      const oldest = yield* users.getOldest();
      expect(Option.isSome(oldest)).toBe(true);
      if (Option.isSome(oldest)) {
        expect(oldest.value.value.id).toBe("user-2");
        expect(oldest.value.meta._uid).toBe("uid-001");
      }
    }),
  );

  it.effect("should return none for getLatest on empty store", () =>
    Effect.gen(function* () {
      const users = yield* MemoryCacheEntity.make({ eschema: UserSchema });

      const latest = yield* users.getLatest();
      expect(Option.isNone(latest)).toBe(true);
    }),
  );

  it.effect("should return none for getOldest on empty store", () =>
    Effect.gen(function* () {
      const users = yield* MemoryCacheEntity.make({ eschema: UserSchema });

      const oldest = yield* users.getOldest();
      expect(Option.isNone(oldest)).toBe(true);
    }),
  );

  it.effect("should recalculate bounds when deleting latest item", () =>
    Effect.gen(function* () {
      const users = yield* MemoryCacheEntity.make({ eschema: UserSchema });

      yield* users.put({
        value: { id: "user-1", name: "Alice", email: "alice@example.com" },
        meta: { _e: "User", _v: "v1", _uid: "uid-001", _d: false },
      });
      yield* users.put({
        value: { id: "user-2", name: "Bob", email: "bob@example.com" },
        meta: { _e: "User", _v: "v1", _uid: "uid-003", _d: false },
      });
      yield* users.put({
        value: { id: "user-3", name: "Charlie", email: "charlie@example.com" },
        meta: { _e: "User", _v: "v1", _uid: "uid-002", _d: false },
      });

      yield* users.delete("user-2");

      const latest = yield* users.getLatest();
      expect(Option.isSome(latest)).toBe(true);
      if (Option.isSome(latest)) {
        expect(latest.value.value.id).toBe("user-3");
        expect(latest.value.meta._uid).toBe("uid-002");
      }
    }),
  );

  it.effect("should recalculate bounds when updating latest item", () =>
    Effect.gen(function* () {
      const users = yield* MemoryCacheEntity.make({ eschema: UserSchema });

      yield* users.put({
        value: { id: "user-1", name: "Alice", email: "alice@example.com" },
        meta: { _e: "User", _v: "v1", _uid: "uid-003", _d: false },
      });
      yield* users.put({
        value: { id: "user-2", name: "Bob", email: "bob@example.com" },
        meta: { _e: "User", _v: "v1", _uid: "uid-002", _d: false },
      });

      yield* users.put({
        value: {
          id: "user-1",
          name: "Alice Updated",
          email: "alice@example.com",
        },
        meta: { _e: "User", _v: "v1", _uid: "uid-001", _d: false },
      });

      const latest = yield* users.getLatest();
      expect(Option.isSome(latest)).toBe(true);
      if (Option.isSome(latest)) {
        expect(latest.value.value.id).toBe("user-2");
        expect(latest.value.meta._uid).toBe("uid-002");
      }
    }),
  );
});

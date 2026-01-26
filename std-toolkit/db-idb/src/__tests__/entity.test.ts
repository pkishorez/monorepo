import "./setup";
import { describe, it, expect } from "@effect/vitest";
import { Effect, Option, Schema } from "effect";
import { ESchema } from "@std-toolkit/eschema";
import { IDBEntity } from "../index";

describe("IDBEntity", () => {
  let dbCounter = 0;

  const UserSchema = ESchema.make("User", {
    id: Schema.String,
    name: Schema.String,
    email: Schema.String,
  }).build();

  const PostSchema = ESchema.make("Post", {
    id: Schema.String,
    title: Schema.String,
  }).build();

  const getDbName = () => `test-db-${++dbCounter}`;

  it.effect("opens an entity successfully", () =>
    Effect.gen(function* () {
      const users = yield* IDBEntity.make("User")
        .eschema(UserSchema)
        .key((v) => v.id)
        .open(getDbName());

      expect(users).toBeInstanceOf(IDBEntity);
    }),
  );

  it.effect("puts and queries entities", () =>
    Effect.gen(function* () {
      const db = getDbName();
      const users = yield* IDBEntity.make("User")
        .eschema(UserSchema)
        .key((v) => v.id)
        .open(db);

      yield* users.put({
        id: "user-1",
        name: "Alice",
        email: "alice@test.com",
      });
      yield* users.put({ id: "user-2", name: "Bob", email: "bob@test.com" });

      const all = yield* users.query();
      expect(all).toHaveLength(2);
      expect(all[0]?.name).toBe("Alice");
      expect(all[1]?.name).toBe("Bob");
    }),
  );

  it.effect("gets a single entity by id", () =>
    Effect.gen(function* () {
      const users = yield* IDBEntity.make("User")
        .eschema(UserSchema)
        .key((v) => v.id)
        .open(getDbName());

      yield* users.put({
        id: "user-1",
        name: "Alice",
        email: "alice@test.com",
      });

      const user = yield* users.get("user-1");
      expect(Option.getOrThrow(user).name).toBe("Alice");
      expect(Option.getOrThrow(user).email).toBe("alice@test.com");
    }),
  );

  it.effect("returns None for non-existent entity", () =>
    Effect.gen(function* () {
      const users = yield* IDBEntity.make("User")
        .eschema(UserSchema)
        .key((v) => v.id)
        .open(getDbName());

      const user = yield* users.get("non-existent");
      expect(Option.isNone(user)).toBe(true);
    }),
  );

  it.effect("deletes an entity", () =>
    Effect.gen(function* () {
      const users = yield* IDBEntity.make("User")
        .eschema(UserSchema)
        .key((v) => v.id)
        .open(getDbName());

      yield* users.put({
        id: "user-1",
        name: "Alice",
        email: "alice@test.com",
      });
      yield* users.delete("user-1");

      const user = yield* users.get("user-1");
      expect(Option.isNone(user)).toBe(true);
    }),
  );

  it.effect("queries only entities of the same type", () =>
    Effect.gen(function* () {
      const db = getDbName();

      const users = yield* IDBEntity.make("User")
        .eschema(UserSchema)
        .key((v) => v.id)
        .open(db);

      const posts = yield* IDBEntity.make("Post")
        .eschema(PostSchema)
        .key((v) => v.id)
        .open(db);

      yield* users.put({
        id: "user-1",
        name: "Alice",
        email: "alice@test.com",
      });
      yield* posts.put({ id: "post-1", title: "Hello World" });

      const userList = yield* users.query();
      const postList = yield* posts.query();

      expect(userList).toHaveLength(1);
      expect(postList).toHaveLength(1);
      expect(userList[0]?.name).toBe("Alice");
      expect(postList[0]?.title).toBe("Hello World");
    }),
  );

  it.effect("putMany inserts multiple entities in one transaction", () =>
    Effect.gen(function* () {
      const users = yield* IDBEntity.make("User")
        .eschema(UserSchema)
        .key((v) => v.id)
        .open(getDbName());

      yield* users.putMany([
        { id: "user-1", name: "Alice", email: "alice@test.com" },
        { id: "user-2", name: "Bob", email: "bob@test.com" },
        { id: "user-3", name: "Charlie", email: "charlie@test.com" },
      ]);

      const all = yield* users.query();
      expect(all).toHaveLength(3);
      expect(all.map((u) => u.name)).toEqual(["Alice", "Bob", "Charlie"]);
    }),
  );

  it.effect("deleteAll removes all entities of a type", () =>
    Effect.gen(function* () {
      const db = getDbName();

      const users = yield* IDBEntity.make("User")
        .eschema(UserSchema)
        .key((v) => v.id)
        .open(db);

      const posts = yield* IDBEntity.make("Post")
        .eschema(PostSchema)
        .key((v) => v.id)
        .open(db);

      yield* users.putMany([
        { id: "user-1", name: "Alice", email: "alice@test.com" },
        { id: "user-2", name: "Bob", email: "bob@test.com" },
      ]);
      yield* posts.put({ id: "post-1", title: "Hello World" });

      yield* users.deleteAll();

      const userList = yield* users.query();
      const postList = yield* posts.query();

      expect(userList).toHaveLength(0);
      expect(postList).toHaveLength(1);
    }),
  );

  it.effect("replaceAll clears and inserts new entities", () =>
    Effect.gen(function* () {
      const users = yield* IDBEntity.make("User")
        .eschema(UserSchema)
        .key((v) => v.id)
        .open(getDbName());

      yield* users.putMany([
        { id: "user-1", name: "Alice", email: "alice@test.com" },
        { id: "user-2", name: "Bob", email: "bob@test.com" },
      ]);

      yield* users.replaceAll([
        { id: "user-3", name: "Charlie", email: "charlie@test.com" },
        { id: "user-4", name: "Diana", email: "diana@test.com" },
      ]);

      const all = yield* users.query();
      expect(all).toHaveLength(2);
      expect(all.map((u) => u.name)).toEqual(["Charlie", "Diana"]);
    }),
  );

  it.effect("multiple entities share the same database connection", () =>
    Effect.gen(function* () {
      const db = getDbName();

      // Open two different entity types on the same database
      const users = yield* IDBEntity.make("User")
        .eschema(UserSchema)
        .key((v) => v.id)
        .open(db);

      const posts = yield* IDBEntity.make("Post")
        .eschema(PostSchema)
        .key((v) => v.id)
        .open(db);

      // Both should work independently
      yield* users.put({ id: "u1", name: "Alice", email: "a@test.com" });
      yield* posts.put({ id: "p1", title: "First Post" });

      const userList = yield* users.query();
      const postList = yield* posts.query();

      expect(userList).toHaveLength(1);
      expect(postList).toHaveLength(1);
    }),
  );

  it.effect("put updates existing entity with same id", () =>
    Effect.gen(function* () {
      const users = yield* IDBEntity.make("User")
        .eschema(UserSchema)
        .key((v) => v.id)
        .open(getDbName());

      yield* users.put({ id: "user-1", name: "Alice", email: "alice@test.com" });
      yield* users.put({
        id: "user-1",
        name: "Alice Updated",
        email: "alice.new@test.com",
      });

      const all = yield* users.query();
      expect(all).toHaveLength(1);
      expect(all[0]?.name).toBe("Alice Updated");
      expect(all[0]?.email).toBe("alice.new@test.com");
    }),
  );

  it.effect("query returns empty array when no entities exist", () =>
    Effect.gen(function* () {
      const users = yield* IDBEntity.make("User")
        .eschema(UserSchema)
        .key((v) => v.id)
        .open(getDbName());

      const all = yield* users.query();
      expect(all).toHaveLength(0);
      expect(all).toEqual([]);
    }),
  );

  it.effect("putMany with empty array does nothing", () =>
    Effect.gen(function* () {
      const users = yield* IDBEntity.make("User")
        .eschema(UserSchema)
        .key((v) => v.id)
        .open(getDbName());

      yield* users.put({ id: "user-1", name: "Alice", email: "alice@test.com" });
      yield* users.putMany([]);

      const all = yield* users.query();
      expect(all).toHaveLength(1);
    }),
  );

  it.effect("delete on non-existent entity does not throw", () =>
    Effect.gen(function* () {
      const users = yield* IDBEntity.make("User")
        .eschema(UserSchema)
        .key((v) => v.id)
        .open(getDbName());

      // Should not throw
      yield* users.delete("non-existent-id");

      const all = yield* users.query();
      expect(all).toHaveLength(0);
    }),
  );

  it.effect("deleteAll on empty entity does not throw", () =>
    Effect.gen(function* () {
      const users = yield* IDBEntity.make("User")
        .eschema(UserSchema)
        .key((v) => v.id)
        .open(getDbName());

      // Should not throw
      yield* users.deleteAll();

      const all = yield* users.query();
      expect(all).toHaveLength(0);
    }),
  );

  it.effect("replaceAll with empty array clears all entities", () =>
    Effect.gen(function* () {
      const users = yield* IDBEntity.make("User")
        .eschema(UserSchema)
        .key((v) => v.id)
        .open(getDbName());

      yield* users.putMany([
        { id: "user-1", name: "Alice", email: "alice@test.com" },
        { id: "user-2", name: "Bob", email: "bob@test.com" },
      ]);

      yield* users.replaceAll([]);

      const all = yield* users.query();
      expect(all).toHaveLength(0);
    }),
  );

  it.effect("different databases have isolated data", () =>
    Effect.gen(function* () {
      const usersDb1 = yield* IDBEntity.make("User")
        .eschema(UserSchema)
        .key((v) => v.id)
        .open(getDbName());

      const usersDb2 = yield* IDBEntity.make("User")
        .eschema(UserSchema)
        .key((v) => v.id)
        .open(getDbName());

      yield* usersDb1.put({ id: "user-1", name: "Alice", email: "a@test.com" });
      yield* usersDb2.put({ id: "user-2", name: "Bob", email: "b@test.com" });

      const db1Users = yield* usersDb1.query();
      const db2Users = yield* usersDb2.query();

      expect(db1Users).toHaveLength(1);
      expect(db1Users[0]?.name).toBe("Alice");
      expect(db2Users).toHaveLength(1);
      expect(db2Users[0]?.name).toBe("Bob");
    }),
  );

  it("isAvailable returns boolean", () => {
    expect(typeof IDBEntity.isAvailable).toBe("boolean");
  });
});

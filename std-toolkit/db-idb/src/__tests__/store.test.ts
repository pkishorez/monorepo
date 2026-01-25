import "./setup";
import { describe, it, expect, beforeEach } from "@effect/vitest";
import { Effect, Option, Schema } from "effect";
import { ESchema } from "@std-toolkit/eschema";
import { IDBStore, IDBEntity, IDBEntityUnit } from "../index";

describe("IDBStore", () => {
  let store: IDBStore;
  let dbCounter = 0;

  beforeEach(async () => {
    dbCounter++;
    store = await Effect.runPromise(IDBStore.make(`test-db-${dbCounter}`));
  });

  it.effect("creates a store successfully", () =>
    Effect.gen(function* () {
      const newStore = yield* IDBStore.make(`test-create-${dbCounter}`);
      expect(newStore).toBeInstanceOf(IDBStore);
      expect(newStore.db).toBeDefined();
    }),
  );

  it.effect("puts and gets an item", () =>
    Effect.gen(function* () {
      yield* store.put({
        entity: "User",
        id: "user-1",
        value: { name: "Alice" },
      });

      const item = yield* store.getItem({ entity: "User", id: "user-1" });
      expect(Option.getOrThrow(item)).toEqual({
        entity: "User",
        id: "user-1",
        value: { name: "Alice" },
      });
    }),
  );

  it.effect("returns None for non-existent item", () =>
    Effect.gen(function* () {
      const item = yield* store.getItem({ entity: "User", id: "non-existent" });
      expect(Option.isNone(item)).toBe(true);
    }),
  );

  it.effect("updates an existing item", () =>
    Effect.gen(function* () {
      yield* store.put({
        entity: "User",
        id: "user-1",
        value: { name: "Alice", age: 25 },
      });

      const updated = yield* store.update({
        entity: "User",
        id: "user-1",
        value: { name: "Alice Updated", age: 26 },
      });

      expect(updated.value).toEqual({ name: "Alice Updated", age: 26 });

      const fetched = yield* store.getItem({ entity: "User", id: "user-1" });
      expect(Option.getOrThrow(fetched).value).toEqual({ name: "Alice Updated", age: 26 });
    }),
  );

  it.effect("deletes an item", () =>
    Effect.gen(function* () {
      yield* store.put({
        entity: "User",
        id: "user-1",
        value: { name: "Alice" },
      });

      yield* store.delete({ entity: "User", id: "user-1" });

      const item = yield* store.getItem({ entity: "User", id: "user-1" });
      expect(Option.isNone(item)).toBe(true);
    }),
  );

  it.effect("gets all items", () =>
    Effect.gen(function* () {
      yield* store.put({ entity: "User", id: "user-1", value: { name: "Alice" } });
      yield* store.put({ entity: "User", id: "user-2", value: { name: "Bob" } });
      yield* store.put({ entity: "Post", id: "post-1", value: { title: "Hello" } });

      const all = yield* store.getAll();
      expect(all).toHaveLength(3);
    }),
  );

  it.effect("purges all items", () =>
    Effect.gen(function* () {
      yield* store.put({ entity: "User", id: "user-1", value: { name: "Alice" } });
      yield* store.put({ entity: "User", id: "user-2", value: { name: "Bob" } });

      yield* store.purge();

      const all = yield* store.getAll();
      expect(all).toHaveLength(0);
    }),
  );
});

describe("IDBEntity", () => {
  let store: IDBStore;
  let dbCounter = 100;

  const UserSchema = ESchema.make("User", {
    id: Schema.String,
    name: Schema.String,
    email: Schema.String,
  }).build();

  beforeEach(async () => {
    dbCounter++;
    store = await Effect.runPromise(IDBStore.make(`test-entity-db-${dbCounter}`));
  });

  it.effect("creates an entity with builder pattern", () =>
    Effect.gen(function* () {
      const users = IDBEntity.make("User").eschema(UserSchema).id("id").build(store);
      expect(users).toBeInstanceOf(IDBEntity);
    }),
  );

  it.effect("puts and queries entities", () =>
    Effect.gen(function* () {
      const users = IDBEntity.make("User").eschema(UserSchema).id("id").build(store);

      yield* users.put({ id: "user-1", name: "Alice", email: "alice@test.com" });
      yield* users.put({ id: "user-2", name: "Bob", email: "bob@test.com" });

      const all = yield* users.query();
      expect(all).toHaveLength(2);
      expect(all[0]?.name).toBe("Alice");
      expect(all[1]?.name).toBe("Bob");
    }),
  );

  it.effect("gets a single entity by id", () =>
    Effect.gen(function* () {
      const users = IDBEntity.make("User").eschema(UserSchema).id("id").build(store);

      yield* users.put({ id: "user-1", name: "Alice", email: "alice@test.com" });

      const user = yield* users.get("user-1");
      expect(Option.getOrThrow(user).name).toBe("Alice");
      expect(Option.getOrThrow(user).email).toBe("alice@test.com");
    }),
  );

  it.effect("returns None for non-existent entity", () =>
    Effect.gen(function* () {
      const users = IDBEntity.make("User").eschema(UserSchema).id("id").build(store);

      const user = yield* users.get("non-existent");
      expect(Option.isNone(user)).toBe(true);
    }),
  );

  it.effect("deletes an entity", () =>
    Effect.gen(function* () {
      const users = IDBEntity.make("User").eschema(UserSchema).id("id").build(store);

      yield* users.put({ id: "user-1", name: "Alice", email: "alice@test.com" });
      yield* users.delete("user-1");

      const user = yield* users.get("user-1");
      expect(Option.isNone(user)).toBe(true);
    }),
  );

  it.effect("queries only entities of the same type", () =>
    Effect.gen(function* () {
      const users = IDBEntity.make("User").eschema(UserSchema).id("id").build(store);

      const PostSchema = ESchema.make("Post", {
        id: Schema.String,
        title: Schema.String,
      }).build();

      const posts = IDBEntity.make("Post").eschema(PostSchema).id("id").build(store);

      yield* users.put({ id: "user-1", name: "Alice", email: "alice@test.com" });
      yield* posts.put({ id: "post-1", title: "Hello World" });

      const userList = yield* users.query();
      const postList = yield* posts.query();

      expect(userList).toHaveLength(1);
      expect(postList).toHaveLength(1);
      expect(userList[0]?.name).toBe("Alice");
      expect(postList[0]?.title).toBe("Hello World");
    }),
  );
});

describe("IDBEntityUnit", () => {
  let store: IDBStore;
  let dbCounter = 200;

  const SettingsSchema = ESchema.make("Settings", {
    theme: Schema.String,
    language: Schema.String,
  }).build();

  beforeEach(async () => {
    dbCounter++;
    store = await Effect.runPromise(IDBStore.make(`test-unit-db-${dbCounter}`));
  });

  it.effect("creates a unit entity with builder pattern", () =>
    Effect.gen(function* () {
      const settings = IDBEntityUnit.make("Settings").eschema(SettingsSchema).build(store);
      expect(settings).toBeInstanceOf(IDBEntityUnit);
    }),
  );

  it.effect("puts and gets a unit entity", () =>
    Effect.gen(function* () {
      const settings = IDBEntityUnit.make("Settings").eschema(SettingsSchema).build(store);

      yield* settings.put({ theme: "dark", language: "en" });

      const result = yield* settings.get();
      expect(Option.getOrThrow(result).theme).toBe("dark");
      expect(Option.getOrThrow(result).language).toBe("en");
    }),
  );

  it.effect("returns None when unit not set", () =>
    Effect.gen(function* () {
      const settings = IDBEntityUnit.make("Settings").eschema(SettingsSchema).build(store);

      const result = yield* settings.get();
      expect(Option.isNone(result)).toBe(true);
    }),
  );

  it.effect("overwrites unit entity on subsequent put", () =>
    Effect.gen(function* () {
      const settings = IDBEntityUnit.make("Settings").eschema(SettingsSchema).build(store);

      yield* settings.put({ theme: "dark", language: "en" });
      yield* settings.put({ theme: "light", language: "fr" });

      const result = yield* settings.get();
      expect(Option.getOrThrow(result).theme).toBe("light");
      expect(Option.getOrThrow(result).language).toBe("fr");
    }),
  );

  it.effect("has correct unit id format", () =>
    Effect.gen(function* () {
      const settings = IDBEntityUnit.make("Settings").eschema(SettingsSchema).build(store);
      expect(settings.unitId).toBe("UNIT_Settings");
    }),
  );
});

import { describe, it, expect } from "@effect/vitest";
import { Effect, Option, Schema } from "effect";
import { ESchema } from "@std-toolkit/eschema";
import type { EntityType } from "@std-toolkit/core";
import { MemoryCacheEntity } from "../memory/memory-cache-entity.js";
import { serializePartition } from "../cache-entity.js";

const UserSchema = ESchema.make("User", "id", {
  name: Schema.String,
  email: Schema.String,
}).build();

const PostSchema = ESchema.make("Post", "id", {
  title: Schema.String,
  content: Schema.String,
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

function makePostEntity(
  id: string,
  title: string,
  content: string,
): EntityType<typeof PostSchema.Type> {
  return {
    value: { id, title, content },
    meta: {
      _e: PostSchema.name,
      _v: PostSchema.latestVersion,
      _uid: `uid-${id}`,
      _d: false,
    },
  };
}

describe("MemoryCacheEntity", () => {
  it.effect("should put and get a single entity", () =>
    Effect.gen(function* () {
      const users = new MemoryCacheEntity(UserSchema);

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
      const users = new MemoryCacheEntity(UserSchema);

      const retrieved = yield* users.get("non-existent");
      expect(Option.isNone(retrieved)).toBe(true);
    }),
  );

  it.effect("should get all entities of a type", () =>
    Effect.gen(function* () {
      const users = new MemoryCacheEntity(UserSchema);

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
      const users = new MemoryCacheEntity(UserSchema);

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
      const users = new MemoryCacheEntity(UserSchema);

      yield* users.put(makeUserEntity("user-1", "John", "john@example.com"));
      yield* users.put(makeUserEntity("user-2", "Jane", "jane@example.com"));

      yield* users.deleteAll();

      const allUsers = yield* users.getAll();
      expect(allUsers).toHaveLength(0);
    }),
  );

  it.effect("should isolate entities by schema type when sharing store", () =>
    Effect.gen(function* () {
      const sharedStore = new Map<string, unknown>();
      const users = new MemoryCacheEntity(
        UserSchema,
        sharedStore as Map<string, never>,
      );
      const posts = new MemoryCacheEntity(
        PostSchema,
        sharedStore as Map<string, never>,
      );

      yield* users.put(makeUserEntity("user-1", "John", "john@example.com"));
      yield* posts.put(makePostEntity("post-1", "Hello", "World"));

      const allUsers = yield* users.getAll();
      const allPosts = yield* posts.getAll();

      expect(allUsers).toHaveLength(1);
      expect(allPosts).toHaveLength(1);
      expect(allUsers[0]?.value.name).toBe("John");
      expect(allPosts[0]?.value.title).toBe("Hello");
    }),
  );

  it.effect("should update existing entity on put", () =>
    Effect.gen(function* () {
      const users = new MemoryCacheEntity(UserSchema);

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

  it.effect(
    "should only delete entities for specific schema in deleteAll when sharing store",
    () =>
      Effect.gen(function* () {
        const sharedStore = new Map<string, unknown>();
        const users = new MemoryCacheEntity(
          UserSchema,
          sharedStore as Map<string, never>,
        );
        const posts = new MemoryCacheEntity(
          PostSchema,
          sharedStore as Map<string, never>,
        );

        yield* users.put(makeUserEntity("user-1", "John", "john@example.com"));
        yield* posts.put(makePostEntity("post-1", "Hello", "World"));

        yield* users.deleteAll();

        const allUsers = yield* users.getAll();
        const allPosts = yield* posts.getAll();

        expect(allUsers).toHaveLength(0);
        expect(allPosts).toHaveLength(1);
      }),
  );

  it.effect("should get latest entity by _uid", () =>
    Effect.gen(function* () {
      const users = new MemoryCacheEntity(UserSchema);

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
      const users = new MemoryCacheEntity(UserSchema);

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
      const users = new MemoryCacheEntity(UserSchema);

      const latest = yield* users.getLatest();
      expect(Option.isNone(latest)).toBe(true);
    }),
  );

  it.effect("should return none for getOldest on empty store", () =>
    Effect.gen(function* () {
      const users = new MemoryCacheEntity(UserSchema);

      const oldest = yield* users.getOldest();
      expect(Option.isNone(oldest)).toBe(true);
    }),
  );

  it.effect(
    "should isolate getLatest/getOldest by schema type when sharing store",
    () =>
      Effect.gen(function* () {
        const sharedStore = new Map<string, unknown>();
        const users = new MemoryCacheEntity(
          UserSchema,
          sharedStore as Map<string, never>,
        );
        const posts = new MemoryCacheEntity(
          PostSchema,
          sharedStore as Map<string, never>,
        );

        yield* users.put({
          value: { id: "user-1", name: "Alice", email: "alice@example.com" },
          meta: { _e: "User", _v: "v1", _uid: "uid-100", _d: false },
        });
        yield* posts.put({
          value: { id: "post-1", title: "Hello", content: "World" },
          meta: { _e: "Post", _v: "v1", _uid: "uid-200", _d: false },
        });

        const latestUser = yield* users.getLatest();
        const latestPost = yield* posts.getLatest();

        expect(Option.isSome(latestUser)).toBe(true);
        expect(Option.isSome(latestPost)).toBe(true);

        if (Option.isSome(latestUser)) {
          expect(latestUser.value.value.id).toBe("user-1");
        }
        if (Option.isSome(latestPost)) {
          expect(latestPost.value.value.id).toBe("post-1");
        }
      }),
  );

  it.effect("should recalculate bounds when deleting latest item", () =>
    Effect.gen(function* () {
      const users = new MemoryCacheEntity(UserSchema);

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
      const users = new MemoryCacheEntity(UserSchema);

      yield* users.put({
        value: { id: "user-1", name: "Alice", email: "alice@example.com" },
        meta: { _e: "User", _v: "v1", _uid: "uid-003", _d: false },
      });
      yield* users.put({
        value: { id: "user-2", name: "Bob", email: "bob@example.com" },
        meta: { _e: "User", _v: "v1", _uid: "uid-002", _d: false },
      });

      yield* users.put({
        value: { id: "user-1", name: "Alice Updated", email: "alice@example.com" },
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

  it.effect("should isolate data by partition", () =>
    Effect.gen(function* () {
      const sharedStore = new Map<string, unknown>();
      const allUsers = new MemoryCacheEntity(
        UserSchema,
        sharedStore as Map<string, never>,
        "",
      );
      const tenantAUsers = new MemoryCacheEntity(
        UserSchema,
        sharedStore as Map<string, never>,
        serializePartition({ tenantId: "tenant-a" }),
      );
      const tenantBUsers = new MemoryCacheEntity(
        UserSchema,
        sharedStore as Map<string, never>,
        serializePartition({ tenantId: "tenant-b" }),
      );

      yield* allUsers.put(makeUserEntity("user-1", "Global User", "global@example.com"));
      yield* tenantAUsers.put(makeUserEntity("user-2", "Tenant A User", "a@example.com"));
      yield* tenantBUsers.put(makeUserEntity("user-3", "Tenant B User", "b@example.com"));

      const globalResults = yield* allUsers.getAll();
      const tenantAResults = yield* tenantAUsers.getAll();
      const tenantBResults = yield* tenantBUsers.getAll();

      expect(globalResults).toHaveLength(1);
      expect(tenantAResults).toHaveLength(1);
      expect(tenantBResults).toHaveLength(1);

      expect(globalResults[0]?.value.id).toBe("user-1");
      expect(tenantAResults[0]?.value.id).toBe("user-2");
      expect(tenantBResults[0]?.value.id).toBe("user-3");
    }),
  );

  it.effect("should get entity by id within partition", () =>
    Effect.gen(function* () {
      const sharedStore = new Map<string, unknown>();
      const tenantAUsers = new MemoryCacheEntity(
        UserSchema,
        sharedStore as Map<string, never>,
        serializePartition({ tenantId: "tenant-a" }),
      );
      const tenantBUsers = new MemoryCacheEntity(
        UserSchema,
        sharedStore as Map<string, never>,
        serializePartition({ tenantId: "tenant-b" }),
      );

      yield* tenantAUsers.put(makeUserEntity("user-1", "Tenant A User", "a@example.com"));
      yield* tenantBUsers.put(makeUserEntity("user-1", "Tenant B User", "b@example.com"));

      const fromA = yield* tenantAUsers.get("user-1");
      const fromB = yield* tenantBUsers.get("user-1");

      expect(Option.isSome(fromA)).toBe(true);
      expect(Option.isSome(fromB)).toBe(true);

      if (Option.isSome(fromA)) {
        expect(fromA.value.value.name).toBe("Tenant A User");
      }
      if (Option.isSome(fromB)) {
        expect(fromB.value.value.name).toBe("Tenant B User");
      }
    }),
  );

  it.effect("should delete only within partition", () =>
    Effect.gen(function* () {
      const sharedStore = new Map<string, unknown>();
      const tenantAUsers = new MemoryCacheEntity(
        UserSchema,
        sharedStore as Map<string, never>,
        serializePartition({ tenantId: "tenant-a" }),
      );
      const tenantBUsers = new MemoryCacheEntity(
        UserSchema,
        sharedStore as Map<string, never>,
        serializePartition({ tenantId: "tenant-b" }),
      );

      yield* tenantAUsers.put(makeUserEntity("user-1", "Tenant A User", "a@example.com"));
      yield* tenantBUsers.put(makeUserEntity("user-1", "Tenant B User", "b@example.com"));

      yield* tenantAUsers.delete("user-1");

      const fromA = yield* tenantAUsers.get("user-1");
      const fromB = yield* tenantBUsers.get("user-1");

      expect(Option.isNone(fromA)).toBe(true);
      expect(Option.isSome(fromB)).toBe(true);
    }),
  );

  it.effect("should deleteAll only within partition", () =>
    Effect.gen(function* () {
      const sharedStore = new Map<string, unknown>();
      const tenantAUsers = new MemoryCacheEntity(
        UserSchema,
        sharedStore as Map<string, never>,
        serializePartition({ tenantId: "tenant-a" }),
      );
      const tenantBUsers = new MemoryCacheEntity(
        UserSchema,
        sharedStore as Map<string, never>,
        serializePartition({ tenantId: "tenant-b" }),
      );

      yield* tenantAUsers.put(makeUserEntity("user-1", "User 1", "1@a.com"));
      yield* tenantAUsers.put(makeUserEntity("user-2", "User 2", "2@a.com"));
      yield* tenantBUsers.put(makeUserEntity("user-3", "User 3", "3@b.com"));

      yield* tenantAUsers.deleteAll();

      const tenantAResults = yield* tenantAUsers.getAll();
      const tenantBResults = yield* tenantBUsers.getAll();

      expect(tenantAResults).toHaveLength(0);
      expect(tenantBResults).toHaveLength(1);
    }),
  );

  it.effect("should getLatest/getOldest within partition boundary", () =>
    Effect.gen(function* () {
      const sharedStore = new Map<string, unknown>();
      const tenantAUsers = new MemoryCacheEntity(
        UserSchema,
        sharedStore as Map<string, never>,
        serializePartition({ tenantId: "tenant-a" }),
      );
      const tenantBUsers = new MemoryCacheEntity(
        UserSchema,
        sharedStore as Map<string, never>,
        serializePartition({ tenantId: "tenant-b" }),
      );

      yield* tenantAUsers.put({
        value: { id: "user-1", name: "Alice", email: "alice@a.com" },
        meta: { _e: "User", _v: "v1", _uid: "uid-001", _d: false },
      });
      yield* tenantAUsers.put({
        value: { id: "user-2", name: "Bob", email: "bob@a.com" },
        meta: { _e: "User", _v: "v1", _uid: "uid-003", _d: false },
      });
      yield* tenantBUsers.put({
        value: { id: "user-3", name: "Charlie", email: "charlie@b.com" },
        meta: { _e: "User", _v: "v1", _uid: "uid-002", _d: false },
      });

      const latestA = yield* tenantAUsers.getLatest();
      const oldestA = yield* tenantAUsers.getOldest();
      const latestB = yield* tenantBUsers.getLatest();

      expect(Option.isSome(latestA)).toBe(true);
      expect(Option.isSome(oldestA)).toBe(true);
      expect(Option.isSome(latestB)).toBe(true);

      if (Option.isSome(latestA)) {
        expect(latestA.value.value.id).toBe("user-2");
        expect(latestA.value.meta._uid).toBe("uid-003");
      }
      if (Option.isSome(oldestA)) {
        expect(oldestA.value.value.id).toBe("user-1");
        expect(oldestA.value.meta._uid).toBe("uid-001");
      }
      if (Option.isSome(latestB)) {
        expect(latestB.value.value.id).toBe("user-3");
        expect(latestB.value.meta._uid).toBe("uid-002");
      }
    }),
  );
});

describe("serializePartition", () => {
  it("should return empty string for undefined partition", () => {
    expect(serializePartition(undefined)).toBe("");
  });

  it("should return empty string for empty object partition", () => {
    expect(serializePartition({})).toBe("");
  });

  it("should serialize single-field partition", () => {
    expect(serializePartition({ tenantId: "acme" })).toBe("tenantId:acme");
  });

  it("should serialize multi-field partition alphabetically", () => {
    expect(serializePartition({ tenantId: "acme", region: "us-east" })).toBe(
      "region:us-east#tenantId:acme",
    );
  });

  it("should produce same result regardless of input key order", () => {
    const partition1 = serializePartition({ tenantId: "acme", region: "us-east" });
    const partition2 = serializePartition({ region: "us-east", tenantId: "acme" });
    expect(partition1).toBe(partition2);
  });
});

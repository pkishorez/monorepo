import { describe, it, expect } from "vitest";
import { Effect, Schema, SubscriptionRef } from "effect";
import { EntityESchema, SingleEntityESchema } from "@std-toolkit/eschema";
import { EntityType } from "@std-toolkit/core";
import { MemoryCacheEntity } from "@std-toolkit/cache/memory";
import {
  stdCollectionOptions,
  stdSingleItemOptions,
  broadcastCollections,
} from "../index.js";

const TestSchema = EntityESchema.make("TestEntity", "id", {
  name: Schema.String,
  updatedAt: Schema.String,
}).build();

type TestItem = typeof TestSchema.Type;

const createEntity = (
  value: TestItem,
  meta: Partial<EntityType<TestItem>["meta"]> = {},
): EntityType<TestItem> => ({
  value,
  meta: {
    _v: "v1",
    _e: "TestEntity",
    _d: false,
    _u: new Date().toISOString(),
    ...meta,
  },
});

describe("stdCollectionOptions", () => {
  const createConfig = () =>
    stdCollectionOptions({
      syncMode: "eager",
      schema: TestSchema,
      cache: MemoryCacheEntity.make({ eschema: TestSchema }),
      getMore: () => Effect.succeed([]),
      onInsert: (item) =>
        Effect.succeed(createEntity({ ...item, id: "generated-id" })),
    });

  it("returns config with required properties", () => {
    const config = createConfig();

    expect(config.schema).toBe(TestSchema);
    expect(typeof config.getKey).toBe("function");
    expect(typeof config.sync.sync).toBe("function");
    expect(typeof config.compare).toBe("function");
    expect(typeof config.onInsert).toBe("function");
    expect(typeof config.onUpdate).toBe("function");
  });

  it("returns config with all utils", () => {
    const config = createConfig();

    const utils = config.utils!;
    expect(typeof utils.upsert).toBe("function");
    expect(typeof utils.schema).toBe("function");
    expect(typeof utils.fetch).toBe("function");
    expect(typeof utils.fetchAll).toBe("function");
    expect(typeof utils.isSyncing).toBe("function");
    expect(SubscriptionRef.SubscriptionRefTypeId in utils.isSyncing()).toBe(true);
  });

  it("utils.schema() returns the provided schema", () => {
    const utils = createConfig().utils!;
    const schema = utils.schema();

    expect(schema).toBe(TestSchema);
    expect(schema.name).toBe("TestEntity");
    expect(schema.latestVersion).toBe("v1");
  });

  it("getKey extracts key from item using schema idField", () => {
    const config = createConfig();
    const item: TestItem = {
      id: "test-123",
      name: "Test",
      updatedAt: "2024-01-01",
    };

    expect(config.getKey(item)).toBe("test-123");
  });

  it("compare sorts by _u timestamp ascending", () => {
    const compare = createConfig().compare!;

    const older = {
      id: "1",
      name: "A",
      updatedAt: "",
      _meta: {
        _v: "v1",
        _e: "TestEntity",
        _d: false,
        _u: "2024-01-01T00:00:00Z",
      },
    };
    const newer = {
      id: "2",
      name: "B",
      updatedAt: "",
      _meta: {
        _v: "v1",
        _e: "TestEntity",
        _d: false,
        _u: "2024-01-02T00:00:00Z",
      },
    };

    expect(compare(older, newer)).toBe(-1);
    expect(compare(newer, older)).toBe(1);
  });

  it("compare handles equal timestamps", () => {
    const compare = createConfig().compare!;

    const a = {
      id: "1",
      name: "A",
      updatedAt: "",
      _meta: {
        _v: "v1",
        _e: "TestEntity",
        _d: false,
        _u: "2024-01-01T00:00:00Z",
      },
    };
    const b = {
      id: "2",
      name: "B",
      updatedAt: "",
      _meta: {
        _v: "v1",
        _e: "TestEntity",
        _d: false,
        _u: "2024-01-01T00:00:00Z",
      },
    };

    expect(compare(a, b)).toBe(0);
  });

  it("isSyncing is false initially", () => {
    const config = createConfig();
    const value = Effect.runSync(SubscriptionRef.get(config.utils!.isSyncing()));
    expect(value).toBe(false);
  });

  it("defaults to eager syncMode (no syncMode in config)", () => {
    const config = createConfig();
    expect(config).not.toHaveProperty("syncMode");
  });

  it("passes syncMode through to returned config for on-demand", () => {
    const config = stdCollectionOptions({
      schema: TestSchema,
      syncMode: "on-demand",
      cache: MemoryCacheEntity.make({ eschema: TestSchema }),
      onInsert: (item) =>
        Effect.succeed(createEntity({ ...item, id: "generated-id" })),
      onLoadSubset: () => Effect.succeed([]),
    });

    expect(config.syncMode).toBe("on-demand");
  });

  it("passes syncMode through to returned config for progressive", () => {
    const config = stdCollectionOptions({
      schema: TestSchema,
      syncMode: "progressive",
      cache: MemoryCacheEntity.make({ eschema: TestSchema }),
      getMore: () => Effect.succeed([]),
      onInsert: (item) =>
        Effect.succeed(createEntity({ ...item, id: "generated-id" })),
      onLoadSubset: () => Effect.succeed([]),
    });

    expect(config.syncMode).toBe("on-demand");
  });

  it("passes id through to returned config", () => {
    const config = stdCollectionOptions({
      syncMode: "eager",
      id: "custom-collection-id",
      schema: TestSchema,
      cache: MemoryCacheEntity.make({ eschema: TestSchema }),
      getMore: () => Effect.succeed([]),
      onInsert: (item) =>
        Effect.succeed(createEntity({ ...item, id: "generated-id" })),
    });

    expect(config.id).toBe("custom-collection-id");
  });
});

const SingleTestSchema = SingleEntityESchema.make("AppSettings", {
  theme: Schema.String,
  language: Schema.String,
}).build();

type SingleTestItem = typeof SingleTestSchema.Type;

const createSingleEntity = (
  value: SingleTestItem,
  meta: Partial<EntityType<SingleTestItem>["meta"]> = {},
): EntityType<SingleTestItem> => ({
  value,
  meta: {
    _v: "v1",
    _e: "AppSettings",
    _d: false,
    _u: new Date().toISOString(),
    ...meta,
  },
});

describe("stdSingleItemOptions", () => {
  const createConfig = () =>
    stdSingleItemOptions({
      schema: SingleTestSchema,
      get: () =>
        Effect.succeed(
          createSingleEntity({ theme: "dark", language: "en" }),
        ),
    });

  it("returns config with singleResult: true", () => {
    const config = createConfig();
    expect(config.singleResult).toBe(true);
  });

  it("has sync, onUpdate, schema, and utils", () => {
    const config = createConfig();

    expect(typeof config.sync.sync).toBe("function");
    expect(typeof config.onUpdate).toBe("function");
    expect(config.schema).toBe(SingleTestSchema);
    expect(config.utils).toBeDefined();
  });

  it("does NOT have onInsert or compare", () => {
    const config = createConfig();
    expect(config).not.toHaveProperty("onInsert");
    expect(config).not.toHaveProperty("compare");
  });

  it("getKey returns schema name as constant key", () => {
    const config = createConfig();
    expect(config.getKey({} as any)).toBe("AppSettings");
  });

  it("utils has schema, refetch, isSyncing but NOT upsert, fetch, fetchAll", () => {
    const utils = createConfig().utils!;

    expect(typeof utils.schema).toBe("function");
    expect(typeof utils.refetch).toBe("function");
    expect(typeof utils.isSyncing).toBe("function");
    expect(SubscriptionRef.SubscriptionRefTypeId in utils.isSyncing()).toBe(true);

    expect(utils).not.toHaveProperty("upsert");
    expect(utils).not.toHaveProperty("fetch");
    expect(utils).not.toHaveProperty("fetchAll");
  });

  it("works without onUpdate (read-only)", () => {
    const config = stdSingleItemOptions({
      schema: SingleTestSchema,
      get: () =>
        Effect.succeed(
          createSingleEntity({ theme: "light", language: "en" }),
        ),
    });

    expect(config.singleResult).toBe(true);
    expect(typeof config.onUpdate).toBe("function");
  });

  it("isSyncing starts as false", () => {
    const config = createConfig();
    const value = Effect.runSync(SubscriptionRef.get(config.utils!.isSyncing()));
    expect(value).toBe(false);
  });

  it("utils.schema() returns the provided schema", () => {
    const utils = createConfig().utils!;
    const schema = utils.schema();

    expect(schema).toBe(SingleTestSchema);
    expect(schema.name).toBe("AppSettings");
  });

  it("passes id through to returned config", () => {
    const config = stdSingleItemOptions({
      id: "custom-single-id",
      schema: SingleTestSchema,
      get: () =>
        Effect.succeed(
          createSingleEntity({ theme: "dark", language: "en" }),
        ),
    });

    expect(config.id).toBe("custom-single-id");
  });
});

describe("broadcastCollections", () => {
  it("returns manager with add, remove, and process methods", () => {
    const broadcast = broadcastCollections();

    expect(typeof broadcast.add).toBe("function");
    expect(typeof broadcast.remove).toBe("function");
    expect(typeof broadcast.process).toBe("function");
  });

  it("process ignores null and undefined", () => {
    const broadcast = broadcastCollections();

    expect(() => broadcast.process(null)).not.toThrow();
    expect(() => broadcast.process(undefined)).not.toThrow();
  });

  it("process ignores invalid message shapes", () => {
    const broadcast = broadcastCollections();

    expect(() => broadcast.process({})).not.toThrow();
    expect(() => broadcast.process({ _tag: "wrong" })).not.toThrow();
    expect(() => broadcast.process({ values: [] })).not.toThrow();
    expect(() => broadcast.process("string")).not.toThrow();
    expect(() => broadcast.process(123)).not.toThrow();
  });

  it("process ignores valid message when no collections registered", () => {
    const broadcast = broadcastCollections();

    const message = {
      _tag: "@std-toolkit/broadcast" as const,
      values: [
        createEntity({ id: "1", name: "Test", updatedAt: "2024-01-01" }),
      ],
    };

    expect(() => broadcast.process(message)).not.toThrow();
  });
});

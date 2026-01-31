import { describe, it, expect } from "vitest";
import { Effect, Schema } from "effect";
import { ESchema } from "@std-toolkit/eschema";
import { EntityType } from "@std-toolkit/core";
import { stdCollectionOptions, broadcastCollections } from "../index";

const TestSchema = ESchema.make("TestEntity", "id", {
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
    _uid: new Date().toISOString(),
    ...meta,
  },
});

describe("stdCollectionOptions", () => {
  const createConfig = () =>
    stdCollectionOptions({
      schema: TestSchema,
      sync: () => ({ effect: () => Effect.void }),
      onInsert: (item) => Effect.succeed(createEntity({ ...item, id: "generated-id" })),
    });

  it("returns config with required properties", () => {
    const config = createConfig();

    expect(config.schema).toBe(TestSchema);
    expect(typeof config.getKey).toBe("function");
    expect(typeof config.sync.sync).toBe("function");

    const utils = config.utils!;
    expect(typeof utils.upsert).toBe("function");
    expect(typeof utils.schema).toBe("function");
    expect(typeof config.compare).toBe("function");
    expect(typeof config.onInsert).toBe("function");
    expect(typeof config.onUpdate).toBe("function");
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
    const item: TestItem = { id: ("test-123"), name: "Test", updatedAt: "2024-01-01" };

    expect(config.getKey(item)).toBe("test-123");
  });

  it("compare sorts by _uid timestamp ascending", () => {
    const compare = createConfig().compare!;

    type ItemWithTimestamp = TestItem & { _uid: string };
    const older: ItemWithTimestamp = { id: ("1"), name: "A", updatedAt: "", _uid: "2024-01-01T00:00:00Z" };
    const newer: ItemWithTimestamp = { id: ("2"), name: "B", updatedAt: "", _uid: "2024-01-02T00:00:00Z" };

    expect(compare(older, newer)).toBe(-1);
    expect(compare(newer, older)).toBe(1);
  });

  it("compare handles equal timestamps", () => {
    const compare = createConfig().compare!;

    type ItemWithTimestamp = TestItem & { _uid: string };
    const a: ItemWithTimestamp = { id: ("1"), name: "A", updatedAt: "", _uid: "2024-01-01T00:00:00Z" };
    const b: ItemWithTimestamp = { id: ("2"), name: "B", updatedAt: "", _uid: "2024-01-01T00:00:00Z" };

    expect(compare(a, b)).toBe(1);
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
        createEntity({ id: ("1"), name: "Test", updatedAt: "2024-01-01" }),
      ],
    };

    expect(() => broadcast.process(message)).not.toThrow();
  });
});

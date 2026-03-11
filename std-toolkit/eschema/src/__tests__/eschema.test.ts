import { describe, it, expect } from "@effect/vitest";
import { Effect, Schema } from "effect";
import { ESchema } from "../index.js";
import { ESchemaError } from "../utils.js";
import { StringToNumber } from "./fixtures.js";

describe("ESchema.make", () => {
  it.effect("creates a v1 schema and encodes with version", () =>
    Effect.gen(function* () {
      const schema = ESchema.make({ name: Schema.String }).build();

      const encoded = yield* schema.encode({ name: "Alice" });
      expect(encoded).toEqual({ _v: "v1", name: "Alice" });
    }),
  );

  it.effect("decodes v1 data", () =>
    Effect.gen(function* () {
      const schema = ESchema.make({
        name: Schema.String,
        count: StringToNumber,
      }).build();

      const decoded = yield* schema.decode({
        _v: "v1",
        name: "foo",
        count: "10",
      });
      expect(decoded).toEqual({ name: "foo", count: 10 });
    }),
  );

  it.effect("defaults to latest version when _v is missing", () =>
    Effect.gen(function* () {
      const schema = ESchema.make({ a: Schema.String }).build();

      const decoded = yield* schema.decode({ a: "hello" });
      expect(decoded).toEqual({ a: "hello" });
    }),
  );

  it.effect("fails on unknown version", () =>
    Effect.gen(function* () {
      const schema = ESchema.make({ a: Schema.String }).build();

      const error = yield* Effect.flip(
        schema.decode({ _v: "v99", a: "hello" }),
      );
      expect(error).toBeInstanceOf(ESchemaError);
      expect(error.message).toBe("Unknown schema version: v99");
    }),
  );
});

describe("ESchema.evolve", () => {
  it.effect("migrates v1 → v2", () =>
    Effect.gen(function* () {
      const schema = ESchema.make({ a: Schema.String })
        .evolve("v2", { b: Schema.Number }, (v) => ({ ...v, b: 42 }))
        .build();

      const decoded = yield* schema.decode({ _v: "v1", a: "hello" });
      expect(decoded).toEqual({ a: "hello", b: 42 });
    }),
  );

  it.effect("chains v1 → v2 → v3", () =>
    Effect.gen(function* () {
      const schema = ESchema.make({ a: Schema.String })
        .evolve("v2", { b: Schema.String }, (v) => ({ ...v, b: "added" }))
        .evolve("v3", { c: Schema.Number }, (v) => ({ ...v, c: 0 }))
        .build();

      const fromV1 = yield* schema.decode({ _v: "v1", a: "x" });
      expect(fromV1).toEqual({ a: "x", b: "added", c: 0 });

      const fromV2 = yield* schema.decode({ _v: "v2", a: "x", b: "y" });
      expect(fromV2).toEqual({ a: "x", b: "y", c: 0 });

      const fromV3 = yield* schema.decode({ _v: "v3", a: "x", b: "y", c: 9 });
      expect(fromV3).toEqual({ a: "x", b: "y", c: 9 });
    }),
  );

  it.effect("handles field removal", () =>
    Effect.gen(function* () {
      const schema = ESchema.make({
        a: Schema.String,
        b: Schema.String,
      })
        .evolve("v2", { b: null }, (v) => ({ a: v.a }))
        .build();

      const decoded = yield* schema.decode({ _v: "v1", a: "keep", b: "drop" });
      expect(decoded).toEqual({ a: "keep" });
    }),
  );
});

describe("ESchema fields/schema/makePartial", () => {
  it("fields returns the latest schema fields", () => {
    const schema = ESchema.make({ a: Schema.String, b: Schema.Number }).build();
    expect(Object.keys(schema.fields).sort()).toEqual(["a", "b"]);
  });

  it("schema returns an Effect Schema.Struct", () => {
    const schema = ESchema.make({ a: Schema.String }).build();
    expect(Object.keys(schema.schema.fields)).toEqual(["a"]);
  });

  it("makePartial attaches version", () => {
    const schema = ESchema.make({ a: Schema.String, b: Schema.Number }).build();
    expect(schema.makePartial({ a: "hi" })).toEqual({ a: "hi", _v: "v1" });
    expect(schema.makePartial({})).toEqual({ _v: "v1" });
  });
});

describe("ESchema roundtrip", () => {
  it.effect("encode → decode preserves data", () =>
    Effect.gen(function* () {
      const schema = ESchema.make({
        name: Schema.String,
        count: StringToNumber,
      }).build();

      const encoded = yield* schema.encode({ name: "test", count: 42 });
      const decoded = yield* schema.decode(encoded);
      expect(decoded).toEqual({ name: "test", count: 42 });
    }),
  );
});

describe("ESchema.getDescriptor", () => {
  it("returns JSON Schema with version literal", () => {
    const schema = ESchema.make({ a: Schema.String }).build();
    const descriptor = schema.getDescriptor();

    expect(descriptor.type).toBe("object");
    expect(descriptor.properties).toHaveProperty("a");
    expect(descriptor.properties).toHaveProperty("_v");
    const vSchema = descriptor.properties._v as { enum?: string[] };
    expect(vSchema.enum).toEqual(["v1"]);
  });
});

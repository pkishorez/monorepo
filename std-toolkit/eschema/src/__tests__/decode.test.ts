import { describe, it, expect } from "@effect/vitest";
import { Effect, Schema } from "effect";
import { EntityESchema } from "../index.js";
import { ESchemaError } from "../utils.js";
import { StringToNumber } from "./fixtures.js";

describe("ESchema.decode", () => {
  it.effect("decodes v1 data without migration", () =>
    Effect.gen(function* () {
      const schema = EntityESchema.make("Test", "id", {
        name: Schema.String,
        count: StringToNumber,
      }).build();

      const decoded = yield* schema.decode({
        _v: "v1",
        id: "t1",
        name: "foo",
        count: "10",
      });
      expect(decoded).toEqual({ id: "t1", name: "foo", count: 10 });
    }),
  );

  it.effect("decodes and migrates v1 to v2", () =>
    Effect.gen(function* () {
      const schema = EntityESchema.make("Test", "id", {
        a: StringToNumber,
      })
        .evolve("v2", { b: Schema.String }, (v) => ({ ...v, b: "added" }))
        .build();

      const decoded = yield* schema.decode({ _v: "v1", id: "t1", a: "42" });
      expect(decoded).toEqual({ id: "t1", a: 42, b: "added" });
    }),
  );

  it.effect("decodes latest version without running migrations", () =>
    Effect.gen(function* () {
      const schema = EntityESchema.make("Test", "id", {
        a: Schema.String,
      })
        .evolve("v2", { b: Schema.String }, (v) => ({
          ...v,
          b: "should not appear",
        }))
        .build();

      const decoded = yield* schema.decode({
        _v: "v2",
        id: "t1",
        a: "hello",
        b: "world",
      });
      expect(decoded).toEqual({ id: "t1", a: "hello", b: "world" });
    }),
  );

  it.effect("fails with ESchemaError on unknown version", () =>
    Effect.gen(function* () {
      const schema = EntityESchema.make("Test", "id", {
        a: Schema.String,
      }).build();

      const error = yield* Effect.flip(
        schema.decode({ _v: "v99", id: "t1", a: "hello" }),
      );
      expect(error).toBeInstanceOf(ESchemaError);
      expect(error.message).toBe("Unknown schema version: v99");
    }),
  );

  it.effect("defaults to latest version when _v is missing", () =>
    Effect.gen(function* () {
      const schema = EntityESchema.make("Test", "id", {
        a: Schema.String,
      }).build();

      const decoded = yield* schema.decode({ id: "t1", a: "hello" });
      expect(decoded).toEqual({ id: "t1", a: "hello" });
    }),
  );
});

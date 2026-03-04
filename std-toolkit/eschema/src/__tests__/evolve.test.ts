import { describe, it, expect } from "@effect/vitest";
import { Effect, Schema } from "effect";
import { EntityESchema } from "../index";
import { StringToNumber } from "./fixtures";

describe("ESchema.evolve (multiple evolutions)", () => {
  it.effect("chains v1 → v2 → v3 migrations", () =>
    Effect.gen(function* () {
      const schema = EntityESchema.make("Test", "id", {
        a: Schema.String,
      })
        .evolve("v2", { b: Schema.String }, (v) => ({ ...v, b: "from-v1" }))
        .evolve("v3", { c: Schema.Number }, (v) => ({ ...v, c: 100 }))
        .build();

      const fromV1 = yield* schema.decode({ _v: "v1", id: "t1", a: "hello" });
      expect(fromV1).toEqual({ id: "t1", a: "hello", b: "from-v1", c: 100 });

      const fromV2 = yield* schema.decode({
        _v: "v2",
        id: "t1",
        a: "hello",
        b: "existing",
      });
      expect(fromV2).toEqual({ id: "t1", a: "hello", b: "existing", c: 100 });

      const fromV3 = yield* schema.decode({
        _v: "v3",
        id: "t1",
        a: "hello",
        b: "existing",
        c: 999,
      });
      expect(fromV3).toEqual({ id: "t1", a: "hello", b: "existing", c: 999 });
    }),
  );

  it.effect("handles field removal in migrations", () =>
    Effect.gen(function* () {
      const schema = EntityESchema.make("Test", "id", {
        a: Schema.String,
        b: Schema.String,
      })
        .evolve("v2", { b: null }, (v) => ({ id: v.id, a: v.a }))
        .build();

      const decoded = yield* schema.decode({
        _v: "v1",
        id: "t1",
        a: "keep",
        b: "drop",
      });
      expect(decoded).toEqual({ id: "t1", a: "keep" });
    }),
  );

  it.effect("handles field transformation in migrations", () =>
    Effect.gen(function* () {
      const schema = EntityESchema.make("Test", "id", {
        firstName: Schema.String,
        lastName: Schema.String,
      })
        .evolve(
          "v2",
          { firstName: null, lastName: null, fullName: Schema.String },
          (v) => ({ id: v.id, fullName: `${v.firstName} ${v.lastName}` }),
        )
        .build();

      const decoded = yield* schema.decode({
        _v: "v1",
        id: "t1",
        firstName: "John",
        lastName: "Doe",
      });
      expect(decoded).toEqual({ id: "t1", fullName: "John Doe" });
    }),
  );
});

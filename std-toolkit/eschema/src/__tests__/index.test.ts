import { describe, it, expect } from "@effect/vitest";
import { Effect, Schema } from "effect";
import { ESchema } from "../eschema";
import { ESchemaError } from "../utils";
import type { StandardSchemaV1 } from "@standard-schema/spec";

const StringToNumber = Schema.transform(Schema.String, Schema.Number, {
  decode: (val) => parseInt(val),
  encode: (val) => String(val),
});

describe("ESchema.make", () => {
  it.effect("creates a v1 schema with name", () =>
    Effect.gen(function* () {
      const schema = ESchema.make("User", {
        name: Schema.String,
      }).build();

      const encoded = yield* schema.encode({ name: "Alice" });
      expect(encoded.data).toEqual({ name: "Alice" });
      expect(encoded.meta).toEqual({ _v: "v1", _e: "User" });
    }),
  );

  it.effect("supports complex field types", () =>
    Effect.gen(function* () {
      const schema = ESchema.make("Complex", {
        count: StringToNumber,
        optional: Schema.optionalWith(Schema.String, { default: () => "default" }),
        nullable: Schema.NullOr(Schema.String),
      }).build();

      const decoded = yield* schema.decode({
        _v: "v1",
        _e: "Complex",
        count: "42",
        nullable: null,
      });

      expect(decoded.data).toEqual({
        count: 42,
        optional: "default",
        nullable: null,
      });
      expect(decoded.meta).toEqual({ _v: "v1", _e: "Complex" });
    }),
  );
});

describe("ESchema.schema getter", () => {
  it("returns the latest schema fields", () => {
    const schema = ESchema.make("Test", {
      a: Schema.String,
    }).build();

    expect(schema.schema).toEqual({ a: Schema.String });
  });

  it("returns evolved schema fields after evolution", () => {
    const schema = ESchema.make("Test", {
      a: Schema.String,
    })
      .evolve("v2", { a: Schema.String, b: Schema.Number }, (v) => ({
        ...v,
        b: 0,
      }))
      .build();

    expect(Object.keys(schema.schema)).toEqual(["a", "b"]);
  });
});

describe("ESchema.makePartial", () => {
  it("returns partial value unchanged", () => {
    const schema = ESchema.make("Test", {
      a: Schema.String,
      b: Schema.Number,
    }).build();

    const partial = schema.makePartial({ a: "hello" });
    expect(partial).toEqual({ a: "hello" });
  });

  it("allows empty partial", () => {
    const schema = ESchema.make("Test", {
      a: Schema.String,
    }).build();

    const partial = schema.makePartial({});
    expect(partial).toEqual({});
  });
});

describe("ESchema.decode", () => {
  it.effect("decodes v1 data without migration", () =>
    Effect.gen(function* () {
      const schema = ESchema.make("Test", {
        name: Schema.String,
        count: StringToNumber,
      }).build();

      const decoded = yield* schema.decode({ _v: "v1", _e: "Test", name: "foo", count: "10" });
      expect(decoded.data).toEqual({ name: "foo", count: 10 });
      expect(decoded.meta).toEqual({ _v: "v1", _e: "Test" });
    }),
  );

  it.effect("decodes and migrates v1 to v2", () =>
    Effect.gen(function* () {
      const schema = ESchema.make("Test", {
        a: StringToNumber,
      })
        .evolve("v2", { a: StringToNumber, b: Schema.String }, (v) => ({
          ...v,
          b: "added",
        }))
        .build();

      const decoded = yield* schema.decode({ _v: "v1", _e: "Test", a: "42" });
      expect(decoded.data).toEqual({ a: 42, b: "added" });
      expect(decoded.meta).toEqual({ _v: "v2", _e: "Test" });
    }),
  );

  it.effect("decodes latest version without running migrations", () =>
    Effect.gen(function* () {
      const schema = ESchema.make("Test", {
        a: Schema.String,
      })
        .evolve("v2", { a: Schema.String, b: Schema.String }, (v) => ({
          ...v,
          b: "should not appear",
        }))
        .build();

      const decoded = yield* schema.decode({ _v: "v2", _e: "Test", a: "hello", b: "world" });
      expect(decoded.data).toEqual({ a: "hello", b: "world" });
      expect(decoded.meta).toEqual({ _v: "v2", _e: "Test" });
    }),
  );

  it.effect("fails with ESchemaError on unknown version", () =>
    Effect.gen(function* () {
      const schema = ESchema.make("Test", {
        a: Schema.String,
      }).build();

      const error = yield* Effect.flip(schema.decode({ _v: "v99", _e: "Test", a: "hello" }));
      expect(error).toBeInstanceOf(ESchemaError);
      expect(error.message).toBe("Unknown schema version: v99");
    }),
  );

  it.effect("fails with ESchemaError on missing version", () =>
    Effect.gen(function* () {
      const schema = ESchema.make("Test", {
        a: Schema.String,
      }).build();

      const error = yield* Effect.flip(schema.decode({ _e: "Test", a: "hello" }));
      expect(error).toBeInstanceOf(ESchemaError);
      expect(error.message).toBe("Decode failed");
      expect(error.cause).toBeDefined();
    }),
  );
});

describe("ESchema.encode", () => {
  it.effect("encodes value with version and entity metadata", () =>
    Effect.gen(function* () {
      const schema = ESchema.make("User", {
        name: Schema.String,
      }).build();

      const encoded = yield* schema.encode({ name: "Alice" });
      expect(encoded.data).toEqual({ name: "Alice" });
      expect(encoded.meta).toEqual({ _v: "v1", _e: "User" });
    }),
  );

  it.effect("applies field transformations on encode", () =>
    Effect.gen(function* () {
      const schema = ESchema.make("Test", {
        count: StringToNumber,
      }).build();

      const encoded = yield* schema.encode({ count: 42 });
      expect(encoded.data).toEqual({ count: "42" });
      expect(encoded.meta).toEqual({ _v: "v1", _e: "Test" });
    }),
  );

  it.effect("encodes with latest version after evolution", () =>
    Effect.gen(function* () {
      const schema = ESchema.make("Test", {
        a: Schema.String,
      })
        .evolve("v2", { a: Schema.String, b: Schema.Number }, (v) => ({ ...v, b: 0 }))
        .build();

      const encoded = yield* schema.encode({ a: "hello", b: 123 });
      expect(encoded.data).toEqual({ a: "hello", b: 123 });
      expect(encoded.meta).toEqual({ _v: "v2", _e: "Test" });
    }),
  );

  it.effect("strips _v and _e from input before encoding", () =>
    Effect.gen(function* () {
      const schema = ESchema.make("Test", {
        name: Schema.String,
      }).build();

      const encoded = yield* schema.encode({ _v: "old", _e: "wrong", name: "test" } as any);
      expect(encoded.data).toEqual({ name: "test" });
      expect(encoded.meta).toEqual({ _v: "v1", _e: "Test" });
    }),
  );
});

describe("ESchema.evolve (multiple evolutions)", () => {
  it.effect("chains v1 → v2 → v3 migrations", () =>
    Effect.gen(function* () {
      const schema = ESchema.make("Test", {
        a: Schema.String,
      })
        .evolve("v2", { a: Schema.String, b: Schema.String }, (v) => ({
          ...v,
          b: "from-v1",
        }))
        .evolve("v3", { a: Schema.String, b: Schema.String, c: Schema.Number }, (v) => ({
          ...v,
          c: 100,
        }))
        .build();

      const fromV1 = yield* schema.decode({ _v: "v1", _e: "Test", a: "hello" });
      expect(fromV1.data).toEqual({ a: "hello", b: "from-v1", c: 100 });
      expect(fromV1.meta).toEqual({ _v: "v3", _e: "Test" });

      const fromV2 = yield* schema.decode({ _v: "v2", _e: "Test", a: "hello", b: "existing" });
      expect(fromV2.data).toEqual({ a: "hello", b: "existing", c: 100 });
      expect(fromV2.meta).toEqual({ _v: "v3", _e: "Test" });

      const fromV3 = yield* schema.decode({ _v: "v3", _e: "Test", a: "hello", b: "existing", c: 999 });
      expect(fromV3.data).toEqual({ a: "hello", b: "existing", c: 999 });
      expect(fromV3.meta).toEqual({ _v: "v3", _e: "Test" });
    }),
  );

  it.effect("handles field removal in migrations", () =>
    Effect.gen(function* () {
      const schema = ESchema.make("Test", {
        a: Schema.String,
        b: Schema.String,
      })
        .evolve("v2", { a: Schema.String }, (v) => ({
          a: v.a,
        }))
        .build();

      const decoded = yield* schema.decode({ _v: "v1", _e: "Test", a: "keep", b: "drop" });
      expect(decoded.data).toEqual({ a: "keep" });
      expect(decoded.meta).toEqual({ _v: "v2", _e: "Test" });
    }),
  );

  it.effect("handles field transformation in migrations", () =>
    Effect.gen(function* () {
      const schema = ESchema.make("Test", {
        firstName: Schema.String,
        lastName: Schema.String,
      })
        .evolve("v2", { fullName: Schema.String }, (v) => ({
          fullName: `${v.firstName} ${v.lastName}`,
        }))
        .build();

      const decoded = yield* schema.decode({
        _v: "v1",
        _e: "Test",
        firstName: "John",
        lastName: "Doe",
      });
      expect(decoded.data).toEqual({ fullName: "John Doe" });
      expect(decoded.meta).toEqual({ _v: "v2", _e: "Test" });
    }),
  );
});

describe("roundtrip encode/decode", () => {
  it.effect("preserves data through encode → decode cycle", () =>
    Effect.gen(function* () {
      const schema = ESchema.make("Test", {
        name: Schema.String,
        count: StringToNumber,
      }).build();

      const original = { name: "test", count: 42 };
      const encoded = yield* schema.encode(original);
      const raw = { ...encoded.data, ...encoded.meta };
      const decoded = yield* schema.decode(raw);

      expect(decoded.data).toEqual(original);
      expect(decoded.meta).toEqual({ _v: "v1", _e: "Test" });
    }),
  );

  it.effect("preserves data through decode → encode cycle", () =>
    Effect.gen(function* () {
      const schema = ESchema.make("Test", {
        count: StringToNumber,
      }).build();

      const raw = { _v: "v1", _e: "Test", count: "123" };
      const decoded = yield* schema.decode(raw);
      const encoded = yield* schema.encode(decoded.data);

      expect(encoded.data).toEqual({ count: "123" });
      expect(encoded.meta).toEqual({ _v: "v1", _e: "Test" });
    }),
  );
});

describe("Standard Schema v1 compatibility", () => {
  it("has ~standard property with correct structure", () => {
    const schema = ESchema.make("User", {
      name: Schema.String,
    }).build();

    const standard = schema["~standard"];
    expect(standard.version).toBe(1);
    expect(standard.vendor).toBe("@std-toolkit/eschema");
    expect(typeof standard.validate).toBe("function");
  });

  it("validate() returns success result for valid input", () => {
    const schema = ESchema.make("User", {
      name: Schema.String,
      age: Schema.Number,
    }).build();

    const result = schema["~standard"].validate({
      _v: "v1",
      _e: "User",
      name: "Alice",
      age: 30,
    });

    expect(result).toEqual({
      value: { _v: "v1", _e: "User", name: "Alice", age: 30 },
    });
  });

  it("validate() returns failure result with issues for invalid input", () => {
    const schema = ESchema.make("User", {
      name: Schema.String,
    }).build();

    const result = schema["~standard"].validate({
      _v: "v99",
      _e: "User",
      name: "Alice",
    });

    expect("issues" in result).toBe(true);
    if ("issues" in result && result.issues) {
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues[0]?.message).toContain("Unknown schema version");
    }
  });

  it("validate() returns failure for missing version metadata", () => {
    const schema = ESchema.make("User", {
      name: Schema.String,
    }).build();

    const result = schema["~standard"].validate({
      name: "Alice",
    });

    expect("issues" in result).toBe(true);
  });

  it("implements StandardSchemaV1 interface correctly", () => {
    const schema = ESchema.make("User", {
      name: Schema.String,
    }).build();

    const _standard: StandardSchemaV1 = schema;
    expect(_standard["~standard"].version).toBe(1);
  });

  it("works with evolved schemas", () => {
    const schema = ESchema.make("User", {
      name: Schema.String,
    })
      .evolve("v2", { name: Schema.String, email: Schema.String }, (v) => ({
        ...v,
        email: "default@example.com",
      }))
      .build();

    const v1Result = schema["~standard"].validate({
      _v: "v1",
      _e: "User",
      name: "Alice",
    });

    expect(v1Result).toEqual({
      value: {
        _v: "v2",
        _e: "User",
        name: "Alice",
        email: "default@example.com",
      },
    });

    const v2Result = schema["~standard"].validate({
      _v: "v2",
      _e: "User",
      name: "Bob",
      email: "bob@example.com",
    });

    expect(v2Result).toEqual({
      value: {
        _v: "v2",
        _e: "User",
        name: "Bob",
        email: "bob@example.com",
      },
    });
  });
});

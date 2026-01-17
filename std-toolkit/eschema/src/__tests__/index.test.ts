import { describe, it, expect } from "@effect/vitest";
import { Schema } from "effect";
import { ESchema } from "../eschema";

const StringToNumber = Schema.transform(Schema.String, Schema.Number, {
  decode: (val) => parseInt(val),
  encode: (val) => String(val),
});

describe("ESchema.make", () => {
  it("creates a v1 schema with name", () => {
    const schema = ESchema.make("User", {
      name: Schema.String,
    }).build();

    const encoded = schema.encode({ name: "Alice" });
    expect(encoded).toEqual({ _v: "v1", _e: "User", name: "Alice" });
  });

  it("supports complex field types", () => {
    const schema = ESchema.make("Complex", {
      count: StringToNumber,
      optional: Schema.optionalWith(Schema.String, { default: () => "default" }),
      nullable: Schema.NullOr(Schema.String),
    }).build();

    const decoded = schema.decode({
      _v: "v1",
      _e: "Complex",
      count: "42",
      nullable: null,
    });

    expect(decoded).toEqual({
      _v: "v1",
      _e: "Complex",
      count: 42,
      optional: "default",
      nullable: null,
    });
  });
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
  it("decodes v1 data without migration", () => {
    const schema = ESchema.make("Test", {
      name: Schema.String,
      count: StringToNumber,
    }).build();

    const decoded = schema.decode({ _v: "v1", _e: "Test", name: "foo", count: "10" });
    expect(decoded).toEqual({ _v: "v1", _e: "Test", name: "foo", count: 10 });
  });

  it("decodes and migrates v1 to v2", () => {
    const schema = ESchema.make("Test", {
      a: StringToNumber,
    })
      .evolve("v2", { a: StringToNumber, b: Schema.String }, (v) => ({
        ...v,
        b: "added",
      }))
      .build();

    const decoded = schema.decode({ _v: "v1", _e: "Test", a: "42" });
    expect(decoded).toEqual({ _v: "v2", _e: "Test", a: 42, b: "added" });
  });

  it("decodes latest version without running migrations", () => {
    const schema = ESchema.make("Test", {
      a: Schema.String,
    })
      .evolve("v2", { a: Schema.String, b: Schema.String }, (v) => ({
        ...v,
        b: "should not appear",
      }))
      .build();

    const decoded = schema.decode({ _v: "v2", _e: "Test", a: "hello", b: "world" });
    expect(decoded).toEqual({ _v: "v2", _e: "Test", a: "hello", b: "world" });
  });

  it("throws on unknown version", () => {
    const schema = ESchema.make("Test", {
      a: Schema.String,
    }).build();

    expect(() => schema.decode({ _v: "v99", _e: "Test", a: "hello" })).toThrow(
      "Unknown schema version: v99"
    );
  });

  it("throws on missing version", () => {
    const schema = ESchema.make("Test", {
      a: Schema.String,
    }).build();

    expect(() => schema.decode({ _e: "Test", a: "hello" })).toThrow();
  });
});

describe("ESchema.encode", () => {
  it("encodes value with version and entity metadata", () => {
    const schema = ESchema.make("User", {
      name: Schema.String,
    }).build();

    const encoded = schema.encode({ name: "Alice" });
    expect(encoded).toEqual({ _v: "v1", _e: "User", name: "Alice" });
  });

  it("applies field transformations on encode", () => {
    const schema = ESchema.make("Test", {
      count: StringToNumber,
    }).build();

    const encoded = schema.encode({ count: 42 });
    expect(encoded).toEqual({ _v: "v1", _e: "Test", count: "42" });
  });

  it("encodes with latest version after evolution", () => {
    const schema = ESchema.make("Test", {
      a: Schema.String,
    })
      .evolve("v2", { a: Schema.String, b: Schema.Number }, (v) => ({ ...v, b: 0 }))
      .build();

    const encoded = schema.encode({ a: "hello", b: 123 });
    expect(encoded).toEqual({ _v: "v2", _e: "Test", a: "hello", b: 123 });
  });

  it("strips _v and _e from input before encoding", () => {
    const schema = ESchema.make("Test", {
      name: Schema.String,
    }).build();

    // Even if input has _v/_e, encode should use current version
    const encoded = schema.encode({ _v: "old", _e: "wrong", name: "test" } as any);
    expect(encoded).toEqual({ _v: "v1", _e: "Test", name: "test" });
  });
});

describe("ESchema.evolve (multiple evolutions)", () => {
  it("chains v1 → v2 → v3 migrations", () => {
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

    // Decode from v1 should run both migrations
    const fromV1 = schema.decode({ _v: "v1", _e: "Test", a: "hello" });
    expect(fromV1).toEqual({
      _v: "v3",
      _e: "Test",
      a: "hello",
      b: "from-v1",
      c: 100,
    });

    // Decode from v2 should only run v2→v3 migration
    const fromV2 = schema.decode({ _v: "v2", _e: "Test", a: "hello", b: "existing" });
    expect(fromV2).toEqual({
      _v: "v3",
      _e: "Test",
      a: "hello",
      b: "existing",
      c: 100,
    });

    // Decode from v3 should run no migrations
    const fromV3 = schema.decode({ _v: "v3", _e: "Test", a: "hello", b: "existing", c: 999 });
    expect(fromV3).toEqual({
      _v: "v3",
      _e: "Test",
      a: "hello",
      b: "existing",
      c: 999,
    });
  });

  it("handles field removal in migrations", () => {
    const schema = ESchema.make("Test", {
      a: Schema.String,
      b: Schema.String,
    })
      .evolve("v2", { a: Schema.String }, (v) => ({
        a: v.a, // drop b
      }))
      .build();

    const decoded = schema.decode({ _v: "v1", _e: "Test", a: "keep", b: "drop" });
    expect(decoded).toEqual({ _v: "v2", _e: "Test", a: "keep" });
  });

  it("handles field transformation in migrations", () => {
    const schema = ESchema.make("Test", {
      firstName: Schema.String,
      lastName: Schema.String,
    })
      .evolve("v2", { fullName: Schema.String }, (v) => ({
        fullName: `${v.firstName} ${v.lastName}`,
      }))
      .build();

    const decoded = schema.decode({
      _v: "v1",
      _e: "Test",
      firstName: "John",
      lastName: "Doe",
    });
    expect(decoded).toEqual({ _v: "v2", _e: "Test", fullName: "John Doe" });
  });
});

describe("roundtrip encode/decode", () => {
  it("preserves data through encode → decode cycle", () => {
    const schema = ESchema.make("Test", {
      name: Schema.String,
      count: StringToNumber,
    }).build();

    const original = { name: "test", count: 42 };
    const encoded = schema.encode(original);
    const decoded = schema.decode(encoded);

    expect(decoded).toEqual({ _v: "v1", _e: "Test", ...original });
  });

  it("preserves data through decode → encode cycle", () => {
    const schema = ESchema.make("Test", {
      count: StringToNumber,
    }).build();

    const raw = { _v: "v1", _e: "Test", count: "123" };
    const decoded = schema.decode(raw);
    const encoded = schema.encode(decoded);

    expect(encoded).toEqual(raw);
  });
});

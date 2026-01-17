import { describe, it, expect } from "@effect/vitest";
import { Schema } from "effect";
import { ESchema } from "../eschema";

const StringToNumber = Schema.transform(Schema.String, Schema.Number, {
  decode: (val) => parseInt(val),
  encode: (val) => String(val),
});

describe("eschema tests", () => {
  it("decode: migrates v1 to v2", () => {
    const schema = ESchema.make("test", {
      a: StringToNumber,
      b: Schema.optionalWith(Schema.String, { default: () => "default" }),
    })
      .evolve(
        "v2",
        {
          a: StringToNumber,
          b: Schema.optionalWith(Schema.String, { default: () => "default" }),
          c: Schema.String,
        },
        (v) => ({ ...v, c: "migrated" }),
      )
      .build();

    const value = schema.decode({ _v: "v1", _e: "test", a: "42" });
    expect(value).toEqual({
      _v: "v2",
      _e: "test",
      a: 42,
      b: "default",
      c: "migrated",
    });
  });

  it("encode: roundtrip preserves data", () => {
    const schema = ESchema.make("test", {
      a: StringToNumber,
    }).build();

    const decoded = schema.decode({ _v: "v1", _e: "test", a: "123" });
    expect(decoded).toEqual({ _v: "v1", _e: "test", a: 123 });

    const encoded = schema.encode(decoded);
    expect(encoded).toEqual({ _v: "v1", _e: "test", a: "123" });
  });

  it("make: creates value with _v and _e", () => {
    const schema = ESchema.make("test", {
      name: Schema.String,
    }).build();

    const value = schema.encode({ name: "foo" });
    expect(value).toEqual({ _v: "v1", _e: "test", name: "foo" });
  });
});

import { describe, it, expect } from "vitest";
import { Schema } from "effect";
import { EntityESchema } from "../index.js";
import { StringToNumber } from "./fixtures.js";

describe("ESchema.getDescriptor", () => {
  it("returns JSON Schema for encoded type including id field", () => {
    const schema = EntityESchema.make("User", "id", {
      name: Schema.String,
      age: Schema.Number,
    }).build();

    const descriptor = schema.getDescriptor();
    expect(descriptor.type).toBe("object");
    expect(descriptor.properties).toHaveProperty("id");
    expect(descriptor.properties).toHaveProperty("name");
    expect(descriptor.properties).toHaveProperty("age");
    expect(descriptor.properties).toHaveProperty("_v");
  });

  it("includes _v as literal with latest version", () => {
    const schema = EntityESchema.make("Test", "id", {
      a: Schema.String,
    }).build();

    const descriptor = schema.getDescriptor();
    const versionSchema = descriptor.properties._v as { enum?: string[] };
    expect(versionSchema.enum).toEqual(["v1"]);
  });

  it("reflects evolved schema with correct version", () => {
    const schema = EntityESchema.make("Test", "id", {
      a: Schema.String,
    })
      .evolve("v2", { b: Schema.Number }, (v) => ({ ...v, b: 0 }))
      .build();

    const descriptor = schema.getDescriptor();
    const versionSchema = descriptor.properties._v as { enum?: string[] };

    expect(descriptor.properties).toHaveProperty("id");
    expect(descriptor.properties).toHaveProperty("a");
    expect(descriptor.properties).toHaveProperty("b");
    expect(versionSchema.enum).toEqual(["v2"]);
  });

  it("represents encoded types correctly for transforms", () => {
    const schema = EntityESchema.make("Test", "id", {
      count: StringToNumber,
    }).build();

    const descriptor = schema.getDescriptor();
    const countSchema = descriptor.properties.count as { type?: string };
    expect(countSchema.type).toBe("string");
  });

  it("includes id in properties", () => {
    const schema = EntityESchema.make("User", "id", {
      name: Schema.String,
    }).build();

    const descriptor = schema.getDescriptor();
    expect(descriptor.properties).toHaveProperty("id");
  });
});

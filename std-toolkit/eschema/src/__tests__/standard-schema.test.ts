import { describe, it, expect } from "vitest";
import { Schema } from "effect";
import { EntityESchema } from "../index.js";
import type { StandardSchemaV1 } from "@standard-schema/spec";

describe("Standard Schema v1 compatibility", () => {
  it("has ~standard property with correct structure", () => {
    const schema = EntityESchema.make("User", "id", {
      name: Schema.String,
    }).build();

    const standard = schema["~standard"];
    expect(standard.version).toBe(1);
    expect(standard.vendor).toBe("@std-toolkit/eschema");
    expect(typeof standard.validate).toBe("function");
  });

  it("validate() returns success result for valid input", () => {
    const schema = EntityESchema.make("User", "id", {
      name: Schema.String,
      age: Schema.Number,
    }).build();

    const result = schema["~standard"].validate({
      _v: "v1",
      id: "u1",
      name: "Alice",
      age: 30,
    });
    expect(result).toEqual({ value: { id: "u1", name: "Alice", age: 30 } });
  });

  it("validate() returns failure result with issues for invalid input", () => {
    const schema = EntityESchema.make("User", "id", {
      name: Schema.String,
    }).build();

    const result = schema["~standard"].validate({
      _v: "v99",
      id: "u1",
      name: "Alice",
    });

    expect("issues" in result).toBe(true);
    if ("issues" in result && result.issues) {
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues[0]?.message).toContain("Unknown schema version");
    }
  });

  it("validate() defaults to latest version when _v is missing", () => {
    const schema = EntityESchema.make("User", "id", {
      name: Schema.String,
    }).build();

    const result = schema["~standard"].validate({ id: "u1", name: "Alice" });
    expect(result).toEqual({ value: { id: "u1", name: "Alice" } });
  });

  it("implements StandardSchemaV1 interface correctly", () => {
    const schema = EntityESchema.make("User", "id", {
      name: Schema.String,
    }).build();

    const _standard: StandardSchemaV1 = schema;
    expect(_standard["~standard"].version).toBe(1);
  });

  it("works with evolved schemas", () => {
    const schema = EntityESchema.make("User", "id", {
      name: Schema.String,
    })
      .evolve("v2", { email: Schema.String }, (v: { id: string; name: string }) => ({
        ...v,
        email: "default@example.com",
      }))
      .build();

    const v1Result = schema["~standard"].validate({
      _v: "v1",
      id: "u1",
      name: "Alice",
    });
    expect(v1Result).toEqual({
      value: { id: "u1", name: "Alice", email: "default@example.com" },
    });

    const v2Result = schema["~standard"].validate({
      _v: "v2",
      id: "u2",
      name: "Bob",
      email: "bob@example.com",
    });
    expect(v2Result).toEqual({
      value: { id: "u2", name: "Bob", email: "bob@example.com" },
    });
  });
});

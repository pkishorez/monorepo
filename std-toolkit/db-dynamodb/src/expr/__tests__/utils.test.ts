import { describe, it, expect } from "@effect/vitest";
import { AttributeMapBuilder } from "../utils.js";

describe("AttributeMapBuilder", () => {
  describe("attr()", () => {
    it("simple key returns #prefix_attr_N", () => {
      const builder = new AttributeMapBuilder("cf_");
      const result = builder.attr("age");
      expect(result).toBe("#cf_attr_1");

      const maps = builder.build();
      expect(maps.ExpressionAttributeNames).toEqual({ "#cf_attr_1": "age" });
    });

    it("dot-notation nested path splits into multiple placeholders", () => {
      const builder = new AttributeMapBuilder("cf_");
      const result = builder.attr("user.name");
      expect(result).toBe("#cf_attr_1.#cf_attr_2");

      const maps = builder.build();
      expect(maps.ExpressionAttributeNames).toEqual({
        "#cf_attr_1": "user",
        "#cf_attr_2": "name",
      });
    });

    it("bracket notation preserves brackets", () => {
      const builder = new AttributeMapBuilder("cf_");
      const result = builder.attr("items[0]");
      expect(result).toBe("#cf_attr_1[0]");

      const maps = builder.build();
      expect(maps.ExpressionAttributeNames).toEqual({ "#cf_attr_1": "items" });
    });

    it("mixed dot + bracket notation", () => {
      const builder = new AttributeMapBuilder("cf_");
      const result = builder.attr("items[0].name");
      expect(result).toBe("#cf_attr_1[0].#cf_attr_2");

      const maps = builder.build();
      expect(maps.ExpressionAttributeNames).toEqual({
        "#cf_attr_1": "items",
        "#cf_attr_2": "name",
      });
    });
  });

  describe("value()", () => {
    it("returns :prefix_value_N and marshalls the value", () => {
      const builder = new AttributeMapBuilder("u_");
      const ref = builder.value("hello");
      expect(ref).toBe(":u_value_1");

      const maps = builder.build();
      expect(maps.ExpressionAttributeValues[":u_value_1"]).toEqual({
        S: "hello",
      });
    });

    it("marshalls number values", () => {
      const builder = new AttributeMapBuilder("u_");
      builder.value(42);

      const maps = builder.build();
      expect(maps.ExpressionAttributeValues[":u_value_1"]).toEqual({
        N: "42",
      });
    });

    it("marshalls boolean values", () => {
      const builder = new AttributeMapBuilder("u_");
      builder.value(true);

      const maps = builder.build();
      expect(maps.ExpressionAttributeValues[":u_value_1"]).toEqual({
        BOOL: true,
      });
    });
  });

  describe("counter increments across mixed attr/value calls", () => {
    it("shares a single counter for both attr and value", () => {
      const builder = new AttributeMapBuilder("cf_");
      const a1 = builder.attr("foo");
      const v1 = builder.value("bar");
      const a2 = builder.attr("baz");

      expect(a1).toBe("#cf_attr_1");
      expect(v1).toBe(":cf_value_2");
      expect(a2).toBe("#cf_attr_3");
    });
  });

  describe("build()", () => {
    it("returns both name and value maps", () => {
      const builder = new AttributeMapBuilder("k_");
      builder.attr("pk");
      builder.value("USER#123");

      const maps = builder.build();
      expect(maps.ExpressionAttributeNames).toEqual({ "#k_attr_1": "pk" });
      expect(maps.ExpressionAttributeValues).toHaveProperty(":k_value_2");
    });

    it("returns empty maps when nothing registered", () => {
      const builder = new AttributeMapBuilder("u_");
      const maps = builder.build();
      expect(maps.ExpressionAttributeNames).toEqual({});
      expect(maps.ExpressionAttributeValues).toEqual({});
    });
  });

  describe("different prefixes", () => {
    it("u_ prefix", () => {
      const builder = new AttributeMapBuilder("u_");
      expect(builder.attr("x")).toBe("#u_attr_1");
      expect(builder.value(1)).toBe(":u_value_2");
    });

    it("cf_ prefix", () => {
      const builder = new AttributeMapBuilder("cf_");
      expect(builder.attr("x")).toBe("#cf_attr_1");
      expect(builder.value(1)).toBe(":cf_value_2");
    });

    it("k_ prefix", () => {
      const builder = new AttributeMapBuilder("k_");
      expect(builder.attr("x")).toBe("#k_attr_1");
      expect(builder.value(1)).toBe(":k_value_2");
    });
  });

  describe("mergeAttrResults()", () => {
    it("merges multiple results", () => {
      const r1 = {
        ExpressionAttributeNames: { "#a": "foo" },
        ExpressionAttributeValues: { ":a": { S: "bar" } },
      };
      const r2 = {
        ExpressionAttributeNames: { "#b": "baz" },
        ExpressionAttributeValues: { ":b": { N: "1" } },
      };

      const merged = AttributeMapBuilder.mergeAttrResults([r1, r2]);
      expect(merged.ExpressionAttributeNames).toEqual({
        "#a": "foo",
        "#b": "baz",
      });
      expect(merged.ExpressionAttributeValues).toEqual({
        ":a": { S: "bar" },
        ":b": { N: "1" },
      });
    });

    it("returns empty maps for empty array", () => {
      const merged = AttributeMapBuilder.mergeAttrResults([]);
      expect(merged.ExpressionAttributeNames).toEqual({});
      expect(merged.ExpressionAttributeValues).toEqual({});
    });
  });
});

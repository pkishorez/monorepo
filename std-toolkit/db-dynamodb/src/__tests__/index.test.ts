import { describe, it, expect } from "@effect/vitest";
import { Schema } from "effect";
import { ESchema } from "@std-toolkit/eschema";
import {
  DynamoTable,
  DynamoEntity,
  exprCondition,
  exprUpdate,
  buildExpr,
  marshall,
  unmarshall,
} from "../index.js";

describe("@std-toolkit/db-dynamodb", () => {
  describe("marshall/unmarshall", () => {
    it("marshalls primitive values", () => {
      const result = marshall({
        name: "test",
        age: 25,
        active: true,
        tags: ["a", "b"],
      });

      expect(result.name).toEqual({ S: "test" });
      expect(result.age).toEqual({ N: "25" });
      expect(result.active).toEqual({ BOOL: true });
      expect(result.tags).toEqual({ L: [{ S: "a" }, { S: "b" }] });
    });

    it("unmarshalls values back", () => {
      const marshalled = {
        name: { S: "test" },
        age: { N: "25" },
        active: { BOOL: true },
      };

      const result = unmarshall(marshalled);
      expect(result).toEqual({
        name: "test",
        age: 25,
        active: true,
      });
    });
  });

  describe("exprCondition", () => {
    it("creates simple condition", () => {
      const cond = exprCondition<{ age: number }>(($) =>
        $.cond("age", ">", 18),
      );
      expect(cond.type).toBe("condition_condition");
    });

    it("creates AND condition", () => {
      const cond = exprCondition<{ age: number; status: string }>(($) =>
        $.and($.cond("age", ">", 18), $.cond("status", "=", "active")),
      );
      expect(cond.type).toBe("condition_and");
    });

    it("compiles condition expression via expr", () => {
      const condition = exprCondition<{ age: number }>(($) =>
        $.cond("age", ">", 18),
      );
      const compiled = buildExpr({ condition });

      expect(compiled.ConditionExpression).toContain(">");
    });

    it("creates field-to-field condition with ref()", () => {
      const condition = exprCondition<{ fieldA: number; fieldB: number }>(($) =>
        $.cond("fieldA", "<", $.ref("fieldB")),
      );
      expect(condition.type).toBe("condition_condition");
      if (condition.type === "condition_condition") {
        expect(condition.value).toEqual({
          type: "field_ref",
          key: "fieldB",
        });
      }
    });

    it("compiles field-to-field condition to use attr names (not values)", () => {
      const condition = exprCondition<{ fieldA: number; fieldB: number }>(($) =>
        $.cond("fieldA", "<", $.ref("fieldB")),
      );
      const compiled = buildExpr({ condition });

      expect(compiled.ConditionExpression).toContain("<");
      expect(compiled.ConditionExpression).not.toContain(":");
      expect(compiled.ExpressionAttributeValues).toBeUndefined();
    });
  });

  describe("exprUpdate", () => {
    it("creates SET operation", () => {
      const update = exprUpdate<{ name: string }>(($) => [
        $.set("name", "test"),
      ]);
      expect(update.length).toBe(1);
      const firstOp = update[0];
      expect(firstOp).toBeDefined();
      if (firstOp && "type" in firstOp) {
        expect(firstOp.type).toBe("update_set_value");
      }
    });

    it("compiles update expression via expr", () => {
      const update = exprUpdate<{ name: string; count: number }>(($) => [
        $.set("name", "test"),
        $.set("count", $.opAdd("count", 1)),
      ]);
      const compiled = buildExpr({ update });

      expect(compiled.UpdateExpression).toContain("SET");
    });
  });

  describe("DynamoTable", () => {
    it("creates table instance with DynamoTable.make", () => {
      const table = DynamoTable.make({
        tableName: "test-table",
        region: "us-east-1",
        credentials: {
          accessKeyId: "test",
          secretAccessKey: "test",
        },
      })
        .primary("pk", "sk")
        .gsi("GSI1", "GSI1PK", "GSI1SK")
        .build();

      expect(table).toBeDefined();
      expect(table.tableName).toBe("test-table");
      expect(table.primary).toEqual({ pk: "pk", sk: "sk" });
      expect(table.secondaryIndexMap).toHaveProperty("GSI1");
    });
  });

  describe("DynamoEntity", () => {
    // Create a table instance for testing entities
    const table = DynamoTable.make({
      tableName: "test-table",
      region: "us-east-1",
      credentials: {
        accessKeyId: "test",
        secretAccessKey: "test",
      },
    })
      .primary("pk", "sk")
      .gsi("GSI1", "GSI1PK", "GSI1SK")
      .build();

    // New ESchema API: idField is second parameter
    const userSchema = ESchema.make("User", "userId", {
      name: Schema.String,
      email: Schema.String,
    }).build();

    it("creates entity builder", () => {
      // New API: SK is automatically the idField
      const entity = DynamoEntity.make(table)
        .eschema(userSchema)
        .primary({ pk: ["userId"] })
        .build();

      expect(entity).toBeDefined();
    });

    it("creates entity with secondary index", () => {
      // New API: SK is automatically _uid for secondary indexes
      const entity = DynamoEntity.make(table)
        .eschema(userSchema)
        .primary({ pk: ["userId"] })
        .index("GSI1", "byEmail", { pk: ["email"] })
        .build();

      expect(entity).toBeDefined();
    });
  });
});

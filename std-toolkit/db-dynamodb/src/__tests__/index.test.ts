import { describe, it, expect } from "@effect/vitest";
import { Schema } from "effect";
import { ESchema } from "@std-toolkit/eschema";
import {
  DynamoTable,
  DynamoEntity,
  makeDynamoTable,
  conditionExpr,
  compileConditionExpr,
  updateExpr,
  compileUpdateExpr,
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

  describe("conditionExpr", () => {
    it("creates simple condition", () => {
      const cond = conditionExpr<{ age: number }>(($) => $.cond("age", ">", 18));
      expect(cond.type).toBe("condition_condition");
    });

    it("creates AND condition", () => {
      const cond = conditionExpr<{ age: number; status: string }>(($) =>
        $.and($.cond("age", ">", 18), $.cond("status", "=", "active")),
      );
      expect(cond.type).toBe("condition_and");
    });

    it("compiles condition expression", () => {
      const cond = conditionExpr<{ age: number }>(($) => $.cond("age", ">", 18));
      const compiled = compileConditionExpr(cond);

      expect(compiled.type).toBe("condition_operation");
      expect(compiled.expr.expr).toContain(">");
    });
  });

  describe("updateExpr", () => {
    it("creates SET operation", () => {
      const update = updateExpr<{ name: string }>(($) => [$.set("name", "test")]);
      expect(update.length).toBe(1);
      const firstOp = update[0];
      expect(firstOp).toBeDefined();
      if (firstOp && "type" in firstOp) {
        expect(firstOp.type).toBe("update_set_value");
      }
    });

    it("compiles update expression", () => {
      const update = updateExpr<{ name: string; count: number }>(($) => [
        $.set("name", "test"),
        $.set("count", $.addOp("count", 1)),
      ]);
      const compiled = compileUpdateExpr(update);

      expect(compiled.type).toBe("update_operation");
      expect(compiled.exprResult.expr).toContain("SET");
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

    it("creates table instance with legacy makeDynamoTable", () => {
      const table = makeDynamoTable({
        tableName: "test-table",
        region: "us-east-1",
        credentials: {
          accessKeyId: "test",
          secretAccessKey: "test",
        },
      })
        .primary("pk", "sk")
        .build();

      expect(table).toBeDefined();
      expect(table.tableName).toBe("test-table");
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

    const userSchema = ESchema.make("User", {
      id: Schema.String,
      name: Schema.String,
      email: Schema.String,
    }).build();

    it("creates entity builder", () => {
      const entity = DynamoEntity.make(table)
        .eschema(userSchema)
        .primary({
          pk: {
            deps: ["id"],
            derive: (v) => [`user#${v.id}`],
          },
          sk: {
            deps: [],
            derive: () => ["user"],
          },
        })
        .build();

      expect(entity).toBeDefined();
    });

    it("creates entity with secondary index", () => {
      const entity = DynamoEntity.make(table)
        .eschema(userSchema)
        .primary({
          pk: {
            deps: ["id"],
            derive: (v) => [`user#${v.id}`],
          },
          sk: {
            deps: [],
            derive: () => ["user"],
          },
        })
        .index("GSI1", {
          pk: {
            deps: ["email"],
            derive: (v) => [`email#${v.email}`],
          },
          sk: {
            deps: ["id"],
            derive: (v) => [v.id],
          },
        })
        .build();

      expect(entity).toBeDefined();
    });
  });
});

import { describe, it, expect } from "@effect/vitest";
import { keyConditionExpr } from "../key-condition.js";
import type { IndexDefinition } from "../../types/index.js";

const pkSkIndex: IndexDefinition = { pk: "PK", sk: "SK" };
const pkOnlyIndex = { pk: "PK" } as IndexDefinition;

describe("keyConditionExpr", () => {
  it("PK only (no SK) → pk = :val", () => {
    const result = keyConditionExpr(pkSkIndex, { pk: "USER#123" });
    expect(result.type).toBe("key-condition-operation");
    expect(result.exprResult.expr).toBe("#k_attr_1 = :k_value_2");
    expect(result.exprResult.attrResult.ExpressionAttributeNames).toEqual({
      "#k_attr_1": "PK",
    });
    expect(
      result.exprResult.attrResult.ExpressionAttributeValues[":k_value_2"],
    ).toEqual({ S: "USER#123" });
  });

  it("PK + SK string equality → pk = :val AND sk = :val", () => {
    const result = keyConditionExpr(pkSkIndex, {
      pk: "USER#123",
      sk: "PROFILE",
    });
    expect(result.exprResult.expr).toBe(
      "#k_attr_1 = :k_value_2 AND #k_attr_3 = :k_value_4",
    );
    expect(result.exprResult.attrResult.ExpressionAttributeNames).toEqual({
      "#k_attr_1": "PK",
      "#k_attr_3": "SK",
    });
  });

  it("PK + SK beginsWith → begins_with(sk, :val)", () => {
    const result = keyConditionExpr(pkSkIndex, {
      pk: "USER#123",
      sk: { beginsWith: "ORDER#" },
    });
    expect(result.exprResult.expr).toBe(
      "#k_attr_1 = :k_value_2 AND begins_with(#k_attr_3, :k_value_4)",
    );
  });

  it("PK + SK between → sk BETWEEN :a AND :b", () => {
    const result = keyConditionExpr(pkSkIndex, {
      pk: "USER#123",
      sk: { between: ["2024-01", "2024-12"] },
    });
    expect(result.exprResult.expr).toBe(
      "#k_attr_1 = :k_value_2 AND #k_attr_3 BETWEEN :k_value_4 AND :k_value_5",
    );
  });

  it("PK + SK < operator", () => {
    const result = keyConditionExpr(pkSkIndex, {
      pk: "USER#123",
      sk: { "<": "Z" },
    });
    expect(result.exprResult.expr).toBe(
      "#k_attr_1 = :k_value_2 AND #k_attr_3 < :k_value_4",
    );
  });

  it("PK + SK <= operator", () => {
    const result = keyConditionExpr(pkSkIndex, {
      pk: "USER#123",
      sk: { "<=": "Z" },
    });
    expect(result.exprResult.expr).toBe(
      "#k_attr_1 = :k_value_2 AND #k_attr_3 <= :k_value_4",
    );
  });

  it("PK + SK > operator", () => {
    const result = keyConditionExpr(pkSkIndex, {
      pk: "USER#123",
      sk: { ">": "A" },
    });
    expect(result.exprResult.expr).toBe(
      "#k_attr_1 = :k_value_2 AND #k_attr_3 > :k_value_4",
    );
  });

  it("PK + SK >= operator", () => {
    const result = keyConditionExpr(pkSkIndex, {
      pk: "USER#123",
      sk: { ">=": "A" },
    });
    expect(result.exprResult.expr).toBe(
      "#k_attr_1 = :k_value_2 AND #k_attr_3 >= :k_value_4",
    );
  });

  describe("SK clause skipped when value is null", () => {
    it("beginsWith: null", () => {
      const result = keyConditionExpr(pkSkIndex, {
        pk: "USER#123",
        sk: { beginsWith: null },
      });
      expect(result.exprResult.expr).toBe("#k_attr_1 = :k_value_2");
    });

    it("between: null", () => {
      const result = keyConditionExpr(pkSkIndex, {
        pk: "USER#123",
        sk: { between: null },
      });
      expect(result.exprResult.expr).toBe("#k_attr_1 = :k_value_2");
    });

    it("< with null value", () => {
      const result = keyConditionExpr(pkSkIndex, {
        pk: "USER#123",
        sk: { "<": null },
      });
      expect(result.exprResult.expr).toBe("#k_attr_1 = :k_value_2");
    });

    it("> with null value", () => {
      const result = keyConditionExpr(pkSkIndex, {
        pk: "USER#123",
        sk: { ">": null },
      });
      expect(result.exprResult.expr).toBe("#k_attr_1 = :k_value_2");
    });

    it("<= with null value", () => {
      const result = keyConditionExpr(pkSkIndex, {
        pk: "USER#123",
        sk: { "<=": null },
      });
      expect(result.exprResult.expr).toBe("#k_attr_1 = :k_value_2");
    });

    it(">= with null value", () => {
      const result = keyConditionExpr(pkSkIndex, {
        pk: "USER#123",
        sk: { ">=": null },
      });
      expect(result.exprResult.expr).toBe("#k_attr_1 = :k_value_2");
    });
  });

  it("SK undefined → SK clause skipped", () => {
    const result = keyConditionExpr(pkSkIndex, {
      pk: "USER#123",
      sk: undefined,
    });
    expect(result.exprResult.expr).toBe("#k_attr_1 = :k_value_2");
  });

  it("index without SK field → SK clause skipped even if sk param given", () => {
    const result = keyConditionExpr(pkOnlyIndex, {
      pk: "USER#123",
      sk: "PROFILE",
    });
    expect(result.exprResult.expr).toBe("#k_attr_1 = :k_value_2");
  });

  it("attribute maps correct for PK + SK between", () => {
    const result = keyConditionExpr(pkSkIndex, {
      pk: "USER#123",
      sk: { between: ["A", "Z"] },
    });
    const names = result.exprResult.attrResult.ExpressionAttributeNames;
    const values = result.exprResult.attrResult.ExpressionAttributeValues;

    expect(names).toEqual({ "#k_attr_1": "PK", "#k_attr_3": "SK" });
    expect(values[":k_value_2"]).toEqual({ S: "USER#123" });
    expect(values[":k_value_4"]).toEqual({ S: "A" });
    expect(values[":k_value_5"]).toEqual({ S: "Z" });
  });
});

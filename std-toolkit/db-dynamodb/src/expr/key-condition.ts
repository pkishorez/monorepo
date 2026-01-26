import type { IndexDefinition } from "../types/index.js";
import type { ExprResult } from "./types.js";
import { AttributeMapBuilder } from "./utils.js";

/**
 * A compiled key condition operation for DynamoDB queries.
 */
export type KeyconditionOperation = {
  type: "key-condition-operation";
  exprResult: ExprResult;
};

/**
 * Parameters for building a key condition expression.
 *
 * @typeParam T - The type of sort key values (defaults to string)
 */
export interface KeyConditionExprParameters<T = string> {
  /** The partition key value */
  pk: string;
  /** Optional sort key condition */
  sk?: undefined | string | SortKeyparameter<T> | null;
}

/**
 * Sort key condition parameter options.
 * Supports equality (string), begins_with, between, and comparison operators.
 *
 * @typeParam Type - The type of sort key values
 */
export type SortKeyparameter<Type = string> =
  | { beginsWith: string | null }
  | { between: [Type, Type] | null }
  | { "<": Type | null }
  | { "<=": Type | null }
  | { ">": Type | null }
  | { ">=": Type | null };

/**
 * Builds a key condition expression for DynamoDB queries.
 *
 * @param index - The index definition with pk and sk attribute names
 * @param params - The key condition parameters with pk value and optional sk condition
 * @returns A compiled key condition operation
 *
 * @example
 * ```ts
 * // Exact match on both keys
 * keyConditionExpr(index, { pk: "USER#123", sk: "PROFILE" });
 *
 * // Begins with sort key
 * keyConditionExpr(index, { pk: "USER#123", sk: { beginsWith: "ORDER#" } });
 *
 * // Range query
 * keyConditionExpr(index, { pk: "USER#123", sk: { between: ["2024-01", "2024-12"] } });
 * ```
 */
export function keyConditionExpr(
  index: IndexDefinition,
  { pk, sk }: KeyConditionExprParameters,
): KeyconditionOperation {
  const attrBuilder = new AttributeMapBuilder("k_");
  const expr: string[] = [];

  expr.push(`${attrBuilder.attr(index.pk)} = ${attrBuilder.value(pk)}`);

  if (sk && "sk" in index) {
    if (typeof sk === "string") {
      expr.push(`${attrBuilder.attr(index.sk)} = ${attrBuilder.value(sk)}`);
    } else if ("beginsWith" in sk && sk.beginsWith !== null) {
      expr.push(
        `begins_with(${attrBuilder.attr(index.sk)}, ${attrBuilder.value(sk.beginsWith)})`,
      );
    } else if ("between" in sk && sk.between) {
      expr.push(
        `${attrBuilder.attr(index.sk)} BETWEEN ${attrBuilder.value(sk.between[0])} AND ${attrBuilder.value(sk.between[1])}`,
      );
    } else if ("<" in sk && sk["<"] !== null) {
      expr.push(
        `${attrBuilder.attr(index.sk)} < ${attrBuilder.value(sk["<"])}`,
      );
    } else if (">" in sk && sk[">"] !== null) {
      expr.push(
        `${attrBuilder.attr(index.sk)} > ${attrBuilder.value(sk[">"])}`,
      );
    } else if ("<=" in sk && sk["<="] !== null) {
      expr.push(
        `${attrBuilder.attr(index.sk)} <= ${attrBuilder.value(sk["<="])}`,
      );
    } else if (">=" in sk && sk[">="] !== null) {
      expr.push(
        `${attrBuilder.attr(index.sk)} >= ${attrBuilder.value(sk[">="])}`,
      );
    }
  }

  return {
    type: "key-condition-operation",
    exprResult: {
      expr: expr.join(" AND "),
      attrResult: attrBuilder.build(),
    },
  };
}

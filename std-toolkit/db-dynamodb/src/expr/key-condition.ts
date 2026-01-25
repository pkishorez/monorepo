import type { IndexDefinition } from "../types/index.js";
import type { ExprResult } from "./types.js";
import { AttributeMapBuilder } from "./utils.js";

export type KeyconditionOperation = {
  type: "key-condition-operation";
  exprResult: ExprResult;
};

export interface KeyConditionExprParameters<T = string> {
  pk: string;
  sk?: undefined | string | SortKeyparameter<T> | null;
}

export type SortKeyparameter<Type = string> =
  | { beginsWith: string | null }
  | { between: [Type, Type] | null }
  | { "<": Type | null }
  | { "<=": Type | null }
  | { ">": Type | null }
  | { ">=": Type | null };

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

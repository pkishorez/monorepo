import type { CompoundIndexDefinition, IndexDefinition } from "./types.js";
import { Match } from "effect";

export type KeyConditionExpr<T> =
  | { lt: T }
  | { lte: T }
  | { gt: T }
  | { gte: T }
  | { eq: T }
  | { beginsWith: T }
  | { between: [T, T] };
export type KeyConditionExprParameters<Index extends IndexDefinition> =
  Index extends CompoundIndexDefinition
    ? { pk: string; sk?: string | KeyConditionExpr<string> }
    : { pk: string };

export type ConditionExpr<T> =
  | KeyConditionExpr<T>
  | { exists: boolean }
  | { attrType: string }
  | { contains: string }
  | { size: ConditionExpr<number> };
export type ConditionExprParameters<Type> =
  | { and: ConditionExprParameters<Type>[] }
  | { or: ConditionExprParameters<Type>[] }
  | { [key in keyof Type]?: ConditionExpr<Type[key]> };

type ExprOutput = (
  | { keyCondition: string } // br
  | { condition: string }
) & {
  exprAttributes: Record<string, unknown>;
  exprValues: Record<string, unknown>;
};

export function keyCondition<Index extends IndexDefinition>(
  index: Index,
  value: KeyConditionExprParameters<Index>,
): ExprOutput {
  let keyCondition = `#pk=:pk`;
  const exprAttributes: Record<string, unknown> = {
    "#pk": index.pk,
  };
  const exprValues: Record<string, unknown> = {
    ":pk": value.pk,
  };

  if (!("sk" in value) || !("sk" in index)) {
    return {
      keyCondition,
      exprAttributes,
      exprValues,
    };
  }

  const { sk } = value;
  exprAttributes["#sk"] = index.sk;

  if (typeof sk === "string") {
    keyCondition += ` AND #sk=:sk`;
    exprValues[":sk"] = sk;
  } else {
    Match.value(sk).pipe(
      Match.when({ lt: Match.any }, ({ lt }) => {
        keyCondition += ` AND #sk < :sk`;
        exprValues[":sk"] = lt;
      }),
      Match.when({ lte: Match.any }, ({ lte }) => {
        keyCondition += ` AND #sk <= :sk`;
        exprValues[":sk"] = lte;
      }),
      Match.when({ gt: Match.any }, ({ gt }) => {
        keyCondition += ` AND #sk > :sk`;
        exprValues[":sk"] = gt;
      }),
      Match.when({ gte: Match.any }, ({ gte }) => {
        keyCondition += ` AND #sk >= :sk`;
        exprValues[":sk"] = gte;
      }),
      Match.when({ eq: Match.any }, ({ eq }) => {
        keyCondition += ` AND #sk = :sk`;
        exprValues[":sk"] = eq;
      }),
      Match.when({ beginsWith: Match.any }, ({ beginsWith }) => {
        keyCondition += ` AND begins_with(#sk, :sk)`;
        exprValues[":sk"] = beginsWith;
      }),
      Match.when({ between: Match.any }, ({ between }) => {
        keyCondition += ` AND #sk BETWEEN :sk_start AND :sk_end`;
        exprValues[":sk_start"] = between[0];
        exprValues[":sk_end"] = between[1];
      }),
      Match.exhaustive,
    );
  }

  return {
    keyCondition,
    exprAttributes,
    exprValues,
  };
}

export function conditionExpr<Type>(value: ConditionExprParameters<Type>) {}

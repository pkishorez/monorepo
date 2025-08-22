import type { IndexDefinition, Simplify } from '../types.js';
import type { MarshalledOutput } from '../utils.js';
import type { ExprResult } from './expr-utils/types.js';
import type {
  ExprInput,
  KeyConditionExprParameters,
  UpdateExprParameters,
} from './index.js';
import { marshall } from '../utils.js';
import { mergeExprResults } from './expr-utils/index.js';
import { expr, keyCondition, projectionExpr, updateExpr } from './index.js';

/**
 * Input parameters for building combined DynamoDB expressions
 */
export interface ExpressionInput<
  T extends Record<string, unknown> = Record<string, unknown>,
  Index extends IndexDefinition = IndexDefinition,
> {
  keyCondition?:
    | { index: Index; params: KeyConditionExprParameters<Index> }
    | undefined;
  condition?: ExprInput<T> | undefined;
  update?: UpdateExprParameters<T> | undefined;
  projection?: string[] | undefined;
  filter?: ExprInput<T> | undefined;
}

interface ExpressionMapper {
  keyCondition: 'KeyConditionExpression';
  condition: 'ConditionExpression';
  update: 'UpdateExpression';
  projection: 'ProjectionExpression';
  filter: 'FilterExpression';
}

type ExpressionOutput<T extends ExpressionInput<any>> = {
  [K in keyof T as K extends keyof ExpressionMapper
    ? ExpressionMapper[K]
    : never]: string;
} & {
  ExpressionAttributeNames?: Record<string, string>;
  ExpressionAttributeValues?: MarshalledOutput;
};

/**
 * Build DynamoDB expressions from various input types
 *
 * Takes any combination of expression inputs and returns their string representations
 * along with merged expression attributes and values.
 *
 * @example
 * ```typescript
 * const result = buildExpression({
 *   update: { SET: [{ attr: 'name', value: { op: 'direct', value: 'John' } }] },
 *   condition: { age: { '>': 18 } },
 *   projection: ['id', 'name', 'email']
 * });
 *
 * // result will have:
 * // {
 * //   update: "SET #attr1 = :val1",
 * //   condition: "#attr2 > :val2",
 * //   projection: "#proj_attr1, #proj_attr2, #proj_attr3",
 * //   exprAttributes: { ... all merged attributes ... },
 * //   exprValues: { ... all merged values ... }
 * // }
 * ```
 */
export function buildExpression<
  Input extends ExpressionInput<T, Index>,
  T extends Record<string, unknown>,
  Index extends IndexDefinition = IndexDefinition,
>(input: Input): Simplify<ExpressionOutput<Input>> {

  const results: ExprResult[] = [];
  const output = {} as ExpressionOutput<Input>;

  // Process key condition expression
  if (input.keyCondition) {
    const keyConditionResult = keyCondition(
      input.keyCondition.index,
      input.keyCondition.params,
    );
    output.KeyConditionExpression = keyConditionResult.expr;
    results.push(keyConditionResult);
  }

  // Process condition expression
  if (input.condition) {
    const conditionResult = expr(input.condition);
    output.ConditionExpression = conditionResult.expr;
    results.push(conditionResult);
  }

  // Process update expression
  if (input.update) {
    const updateResult = updateExpr(input.update);
    output.UpdateExpression = updateResult.updateExpression;
    results.push({
      expr: updateResult.updateExpression,
      exprAttributes: updateResult.exprAttributes,
      exprValues: updateResult.exprValues,
    });
  }

  // Process projection expression
  if (input.projection) {
    const projectionResult = projectionExpr(input.projection);
    output.ProjectionExpression = projectionResult.expr;
    results.push(projectionResult);
  }

  // Process filter expression
  if (input.filter) {
    const filterResult = expr(input.filter);
    output.FilterExpression = filterResult.expr;
    results.push(filterResult);
  }

  // Merge all expression attributes and values
  const merged = mergeExprResults(results);
  if (Object.keys(merged.exprAttributes).length > 0) {
    output.ExpressionAttributeNames = merged.exprAttributes;
  }

  if (Object.keys(merged.exprValues).length > 0) {
    output.ExpressionAttributeValues = marshall(merged.exprValues);
  }

  return output;
}

import { CompiledConditionOperation } from './condition.js';
import { CompiledUpdateOperation } from './update.js';
import { KeyconditionOperation } from './key-condition.js';
import { AttributeMapBuilder } from './utils.js';
import { MarshalledOutput } from '../utils.js';
import { DynamoAttrResult } from './types.js';

/**
 * Builds a complete DynamoDB expression object by combining update, condition, and key condition operations
 *
 * @example
 * // Update with condition
 * const result = buildExpr({
 *   update: updateExpr<User>(($) => [$.set('age', 30)]),
 *   condition: conditionExpr<User>(($) => $.cond('status', '=', 'active'))
 * });
 * // Returns:
 * // {
 * //   UpdateExpression: 'SET #u_attr_1 = :u_value_2',
 * //   ConditionExpression: '#c_attr_1 = :c_value_2',
 * //   ExpressionAttributeNames: { '#u_attr_1': 'age', '#c_attr_1': 'status' },
 * //   ExpressionAttributeValues: { ':u_value_2': { N: '30' }, ':c_value_2': { S: 'active' } }
 * // }
 *
 * @example
 * // Query with key condition
 * const result = buildExpr({
 *   keyCondition: keyConditionExpr(index, { pk: 'user#123', sk: { beginsWith: 'order#' } })
 * });
 * // Returns:
 * // {
 * //   KeyConditionExpression: '#k_attr_1 = :k_value_2 AND begins_with(#k_attr_3, :k_value_4)',
 * //   ExpressionAttributeNames: { '#k_attr_1': 'pk', '#k_attr_3': 'sk' },
 * //   ExpressionAttributeValues: { ':k_value_2': { S: 'user#123' }, ':k_value_4': { S: 'order#' } }
 * // }
 */
export const buildExpr = ({
  update,
  keyCondition,
  ...options
}: {
  update?: CompiledUpdateOperation | undefined;
  keyCondition?: KeyconditionOperation | undefined;
} & (
  | {
      filter?: CompiledConditionOperation | undefined;
    }
  | {
      condition?: CompiledConditionOperation | undefined;
    }
)): {
  UpdateExpression?: string;
  ConditionExpression?: string;
  FilterExpression?: string;
  KeyConditionExpression?: string;
  ExpressionAttributeNames?: Record<string, string>;
  ExpressionAttributeValues?: MarshalledOutput;
} => {
  // Start with empty result
  const result: {
    UpdateExpression?: string;
    ConditionExpression?: string;
    FilterExpression?: string;
    KeyConditionExpression?: string;
  } & Partial<DynamoAttrResult> = {};
  if (update) {
    result.UpdateExpression = update.exprResult.expr;
  }
  if ('condition' in options && options.condition) {
    result.ConditionExpression = options.condition.expr.expr;
  }
  if ('filter' in options && options.filter) {
    result.FilterExpression = options.filter.expr.expr;
  }
  if (keyCondition) {
    result.KeyConditionExpression = keyCondition.exprResult.expr;
  }

  const attrs = AttributeMapBuilder.mergeAttrResults(
    [
      update?.exprResult.attrResult,
      'condition' in options && options?.condition?.expr.attrResult,
      'filter' in options && options?.filter?.expr.attrResult,
      keyCondition?.exprResult.attrResult,
    ].filter(Boolean),
  );
  if (Object.keys(attrs.ExpressionAttributeNames).length > 0) {
    result.ExpressionAttributeNames = attrs.ExpressionAttributeNames;
  }
  if (Object.keys(attrs.ExpressionAttributeValues).length > 0) {
    result.ExpressionAttributeValues = attrs.ExpressionAttributeValues;
  }

  return result;
};

import { ConditionOperation } from './condition.js';
import { UpdateOperation } from './update.js';
import { DynamoAttrResult } from './types.js';

/**
 * Builds a complete DynamoDB expression object by combining update and condition operations
 *
 * @example
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
 */
export const buildExpr = ({
  update,
  condition,
}: {
  update?: UpdateOperation;
  condition?: ConditionOperation;
}): {
  UpdateExpression?: string;
  ConditionExpression?: string;
  ExpressionAttributeNames?: Record<string, string>;
  ExpressionAttributeValues?: DynamoAttrResult['ExpressionAttributeValues'];
} => {
  // Start with empty result
  const result: {
    UpdateExpression?: string;
    ConditionExpression?: string;
    ExpressionAttributeNames?: Record<string, string>;
    ExpressionAttributeValues?: DynamoAttrResult['ExpressionAttributeValues'];
  } = {};

  // Merge attribute names and values
  const mergedNames: Record<string, string> = {};
  const mergedValues: DynamoAttrResult['ExpressionAttributeValues'] = {};

  // Process update expression
  if (update) {
    result.UpdateExpression = update.exprResult.expr;

    // Merge update attribute names
    Object.assign(
      mergedNames,
      update.exprResult.attrResult.ExpressionAttributeNames,
    );

    // Merge update attribute values
    Object.assign(
      mergedValues,
      update.exprResult.attrResult.ExpressionAttributeValues,
    );
  }

  // Process condition expression
  if (condition) {
    result.ConditionExpression = condition.expr.expr;

    // Merge condition attribute names
    Object.assign(
      mergedNames,
      condition.expr.attrResult.ExpressionAttributeNames,
    );

    // Merge condition attribute values
    Object.assign(
      mergedValues,
      condition.expr.attrResult.ExpressionAttributeValues,
    );
  }

  // Only add attributes if they exist
  if (Object.keys(mergedNames).length > 0) {
    result.ExpressionAttributeNames = mergedNames;
  }

  if (Object.keys(mergedValues).length > 0) {
    result.ExpressionAttributeValues = mergedValues;
  }

  return result;
};

import type { IndexDefinition, Simplify } from '../types.js';
import type { MarshalledOutput } from '../utils.js';
import type { ConditionExprParameters } from './condition/types.js';
import type { KeyConditionExprParameters } from './key-condition/index.js';
import type { ProjectionKeys } from './projection.js';
import type { ExprAttributeMap } from './types.js';
import type { UpdateExprParameters } from './updates/index.js';
import { marshall } from '../utils.js';
import { conditionExpr } from './condition/condition.js';
import { keyConditionExpr } from './key-condition/index.js';
import { projectionExpr } from './projection.js';
import { updateExpr } from './updates/index.js';
import { mergeExprAttributeMap } from './utils.js';

export interface ExpressionInput<
  TItem extends Record<string, unknown> = Record<string, unknown>,
  Index extends IndexDefinition = IndexDefinition,
> {
  keyCondition?:
    | { index: Index; params: KeyConditionExprParameters }
    | undefined;
  condition?: ConditionExprParameters<TItem> | undefined;
  update?: UpdateExprParameters<TItem> | undefined;
  projection?: ProjectionKeys<TItem> | undefined;
  filter?: ConditionExprParameters<TItem> | undefined;
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

export function buildExpression<
  Input extends ExpressionInput<T, Index>,
  T extends Record<string, unknown>,
  Index extends IndexDefinition = IndexDefinition,
>(input: Input): Simplify<ExpressionOutput<Input>> {
  const attrMaps: ExprAttributeMap[] = [];
  const output = {} as ExpressionOutput<Input>;

  // Process key condition expression
  if (input.keyCondition) {
    const keyConditionResult = keyConditionExpr(
      input.keyCondition.index,
      input.keyCondition.params,
    );
    output.KeyConditionExpression = keyConditionResult.expr;
    attrMaps.push(keyConditionResult);
  }

  // Process condition expression
  if (input.condition) {
    const conditionResult = conditionExpr(input.condition);
    output.ConditionExpression = conditionResult.expr;
    attrMaps.push(conditionResult);
  }

  // Process update expression
  if (input.update) {
    const updateResult = updateExpr(input.update);
    output.UpdateExpression = updateResult.expr;
    attrMaps.push(updateResult);
  }

  // Process projection expression
  if (input.projection) {
    const projectionResult = projectionExpr(input.projection);
    output.ProjectionExpression = projectionResult.expr;
    attrMaps.push(projectionResult);
  }

  // Process filter expression
  if (input.filter && Object.keys(input.filter).length > 0) {
    const filterResult = conditionExpr(input.filter);
    output.FilterExpression = filterResult.expr;
    attrMaps.push(filterResult);
  }

  // Merge all expression attributes and values
  const merged = mergeExprAttributeMap(attrMaps);
  if (Object.keys(merged.attrNameMap).length > 0) {
    output.ExpressionAttributeNames = merged.attrNameMap;
  }

  if (Object.keys(merged.attrValueMap).length > 0) {
    output.ExpressionAttributeValues = marshall(merged.attrValueMap);
  }

  return output;
}

import { ConditionOperation } from './condition.js';
import { UpdateOperation } from './update.js';

export const buildExpr = ({
  update,
  condition,
}: {
  update?: UpdateOperation;
  condition?: ConditionOperation;
}): {
  UpdateExpression?: string;
  ConditionExpression?: string;
} => {};

// Core functions - these are the main API
export { and, expr, keyCondition, not, or } from './expr.js';

// Advanced/testing function
export { attrExpr } from './expr.js';

// Types that external code actually needs
export type {
  AttributeConditionExpr,
  ComparisonExpr,
  ConditionExpr,
  ConditionExprParameters,
  ExprInput,
  KeyConditionExpr,
  KeyConditionExprParameters,
  SimpleConditionExpr,
  StringExpr,
} from './types.js';


// Core functions - these are the main API
export { expr, keyCondition } from './expr.js';

// Advanced/testing function
export { attrExpr } from './expr.js';

// Types that external code actually needs
export type {
  AttributeConditionExpr,
  ConditionExprParameters,
  KeyConditionExpr,
  KeyConditionExprParameters,
} from './types.js';


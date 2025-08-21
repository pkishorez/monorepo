// Expression functions (if needed for advanced usage)
export {
  attrTypeExpr,
  comparisonExpr,
  existenceExpr,
  rangeExpr,
  sizeExpr,
  stringExpr,
} from './expressions.js';

// Public API exports
export { attrExpr, expr, keyCondition } from './expr.js';

// Type exports
export type {
  AttrExprResult,
  AttributeConditionExpr as AttributeCondition,
  AttrTypeExpr,
  ComparisonExpr,
  CompoundExprResult,
  ConditionExpr,
  ConditionExprParameters,
  ExistenceExpr,
  KeyConditionExpr,
  KeyConditionExprParameters,
  RangeExpr,
  SizeExpr,
  StringExpr,
} from './types.js';

// Utility functions (if needed for advanced usage)
export {
  generateUniqueId,
  mergeExprResults,
} from './utils.js';

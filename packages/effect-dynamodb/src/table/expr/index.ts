// Builder functions (if needed for advanced usage)
export {
  buildAttrTypeExpr,
  buildComparisonExpr,
  buildExistenceExpr,
  buildRangeExpr,
  buildSizeExpr,
  buildStringExpr,
} from './builders.js';

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
  generateAttributeNames,
  generateUniqueId,
  mergeExprResults,
} from './utils.js';

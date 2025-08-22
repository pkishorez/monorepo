// Essential functions for condition expressions
export { and, expr, keyCondition, not, or } from './conditions/index.js';

// Testing/advanced usage function
export { attrExpr } from './conditions/index.js';

// Types needed by external code (query-executor and tests only)
export type { KeyConditionExpr } from './conditions/index.js';

// Types needed by tests only (consider these internal)
export type {
  AttributeConditionExpr,
  ComparisonExpr,
  ConditionExpr,
  ConditionExprParameters,
  ExprInput,
  KeyConditionExprParameters,
  SimpleConditionExpr,
  StringExpr,
} from './conditions/index.js';

// Expression builder for combining multiple expression types
export { buildExpression } from './expression-builder.js';

export type { ExpressionInput } from './expression-builder.js';

// Essential function for projection
export { projectionExpr } from './projection.js';

// Essential functions for update expressions
export { updateExpr } from './updates/index.js';
export type { UpdateExprParameters } from './updates/index.js';

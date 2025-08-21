// Essential functions for condition expressions
export { expr, keyCondition } from './conditions/index.js';

// Testing/advanced usage function
export { attrExpr } from './conditions/index.js';

// Types needed by external code (query-executor and tests only)
export type { KeyConditionExpr } from './conditions/index.js';

// Types needed by tests only (consider these internal)
export type {
  AttributeConditionExpr,
  ConditionExprParameters,
  KeyConditionExprParameters,
} from './conditions/index.js';

// Essential functions for update expressions
export { updateExpr } from './updates/index.js';

export type { UpdateExprParameters } from './updates/index.js';

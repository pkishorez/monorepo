// Public expression builders
export { exprCondition, exprFilter } from "./condition.js";

export { exprUpdate, opAdd, opIfNotExists } from "./update.js";

export { buildExpr } from "./build-expr.js";

// Internal exports (for internal use only)
export {
  compileConditionExpr,
  type ConditionOperation,
  type CompiledConditionOperation,
} from "./condition.js";

export {
  compileUpdateExpr,
  type UpdateOperation,
  type CompiledUpdateOperation,
} from "./update.js";

export {
  keyConditionExpr,
  type KeyConditionExprParameters,
  type SortKeyparameter,
  type KeyconditionOperation,
} from "./key-condition.js";

export type {
  QueryExprResult,
  UpdateExprResult,
  ConditionExprResult,
  QueryExprInput,
  UpdateExprInput,
  ConditionExprInput,
} from "./build-expr.js";

export { AttributeMapBuilder } from "./utils.js";

export type {
  DynamoAttrResult,
  ExprResult,
  ValidPaths,
  ValidPathsWithCond,
} from "./types.js";

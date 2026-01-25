export {
  conditionExpr,
  filterExpr,
  compileConditionExpr,
  type ConditionOperation,
  type CompiledConditionOperation,
} from "./condition.js";

export {
  updateExpr,
  compileUpdateExpr,
  addOp,
  ifNotExists,
  type UpdateOperation,
  type CompiledUpdateOperation,
} from "./update.js";

export {
  keyConditionExpr,
  type KeyConditionExprParameters,
  type SortKeyparameter,
  type KeyconditionOperation,
} from "./key-condition.js";

export {
  buildExpr,
  type QueryExprResult,
  type UpdateExprResult,
  type ConditionExprResult,
  type QueryExprInput,
  type UpdateExprInput,
  type ConditionExprInput,
} from "./expr.js";

export { AttributeMapBuilder } from "./utils.js";

export type { DynamoAttrResult, ExprResult, ValidPaths, ValidPathsWithCond } from "./types.js";

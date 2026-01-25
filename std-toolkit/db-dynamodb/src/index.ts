// Services
export {
  DynamoTable,
  makeDynamoTable,
  type DynamoTableInstance,
  type QueryResult,
  DynamoEntity,
  type EntityType,
} from "./services/index.js";

// Errors
export {
  DynamodbError,
  type DynamodbErrorType,
  type AwsErrorMeta,
} from "./errors.js";

// Expression builders
export {
  conditionExpr,
  filterExpr,
  compileConditionExpr,
  updateExpr,
  compileUpdateExpr,
  addOp,
  ifNotExists,
  keyConditionExpr,
  buildExpr,
  type ConditionOperation,
  type UpdateOperation,
  type KeyConditionExprParameters,
  type SortKeyparameter,
} from "./expr/index.js";

// Types
export type {
  AwsCredentials,
  DynamoTableConfig,
  IndexDefinition,
  IndexDerivation,
  IndexKeyDerivation,
  IndexDerivationValue,
  IndexKeyDerivationValue,
  TransactItem,
  AttributeValue,
  MarshalledOutput,
} from "./types/index.js";

// Utilities (public)
export { marshall, unmarshall, deriveIndexKeyValue } from "./internal/marshall.js";

// Generated DynamoDB types from Smithy specs
export type { DynamoDBClientService } from "./generated/types.js";

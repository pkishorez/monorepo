// Services
export {
  DynamoTable,
  type DynamoTableInstance,
  type QueryResult,
  DynamoEntity,
  type EntityType,
} from "./services/index.js";

// Errors
export { DynamodbError } from "./errors.js";

// Expression builders
export {
  exprCondition,
  exprFilter,
  exprUpdate,
  buildExpr,
  opAdd,
  opIfNotExists,
} from "./expr/index.js";

// Types (only what's needed for configuration)
export type {
  AwsCredentials,
  IndexDerivation,
  IndexKeyDerivation,
  TransactItem,
} from "./types/index.js";

// Marshall utilities
export { marshall, unmarshall } from "./internal/marshall.js";

// Services
export {
  DynamoTable,
  DynamoEntity,
  DynamoSingleEntity,
  EntityRegistry,
  DynamoCommand,
  type EntityType,
  type SingleEntityType,
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

// Marshall utilities
export { marshall, unmarshall } from "./internal/marshall.js";

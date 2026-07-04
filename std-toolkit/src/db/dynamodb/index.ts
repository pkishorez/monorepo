// Services
export {
  DynamoTable,
  DynamoEntity,
  DynamoSingleEntity,
  EntityRegistry,
  type EntityType,
  type SingleEntityType,
  type TableDescription,
} from './services/index.js';

// Client
export {
  createDynamoDB,
  DynamoDB,
  dynamoDBLayer,
} from './services/dynamo-client.js';
export type { DynamoConnection } from './types/index.js';

// Errors
export { DynamodbError } from './errors.js';

// Expression builders
export {
  exprCondition,
  exprFilter,
  exprUpdate,
  buildExpr,
  opAdd,
  opIfNotExists,
} from './expr/index.js';

// Marshall utilities
export { marshall, unmarshall } from './internal/marshall.js';

// Services
export {
  DynamoTable,
  type EntityType,
  type SingleEntityType,
  type TableDescription,
} from './orchestrators/dynamo-table/index.js';

export {
  DynamoDB,
  type ResolvedTableBinding,
  type TableBindingInput,
} from './services/dynamodb/index.js';
export type {
  DynamoDBClient,
  DynamoDBClientConfig,
  DynamoDBCredentialProvider,
  DynamoDBCredentials,
  DynamoDBCredentialsInput,
} from './clients/dynamodb-client/index.js';
export { DynamoDBClientError } from './clients/dynamodb-client/index.js';

export {
  DynamoDBError,
  type DynamoDBError as DynamoDBErrorType,
  TableBindingNotFound,
  DuplicateTableBinding,
} from './services/dynamodb-error/index.js';

export {
  buildExpr,
  exprCondition,
  exprUpdate,
} from './domain/expression/index.js';

// Marshall utilities
export {
  fromAttributeValue,
  marshall,
  toAttributeValue,
  unmarshall,
  type AttributeValue,
  type MarshalledOutput,
} from './domain/attribute-value/index.js';

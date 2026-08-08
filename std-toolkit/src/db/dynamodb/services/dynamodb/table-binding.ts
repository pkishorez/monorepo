import type { DynamoDBClient } from '../../clients/dynamodb-client/index.js';
import type { TableIdentity } from '../../domain/table-identity/index.js';

export interface TableBindingInput {
  readonly table: TableIdentity;
  readonly client: DynamoDBClient;
  readonly tableName: string;
}

export interface ResolvedTableBinding {
  readonly client: DynamoDBClient;
  readonly tableName: string;
}

import type { TableIdentity } from '../domain/table-identity/index.js';
import { DynamoDB } from '../services/dynamodb/index.js';

interface TestConnection {
  readonly tableName: string;
  readonly region?: string;
  readonly credentials: {
    readonly accessKeyId: string;
    readonly secretAccessKey: string;
    readonly sessionToken?: string;
  };
  readonly endpoint?: string;
}

export { DynamoDB };

export const createDynamoDB = (connection: TestConnection) =>
  DynamoDB.client(connection);

export const dynamoDBLayer = (
  connection: TestConnection,
  ...tables: ReadonlyArray<TableIdentity>
) => {
  const client = DynamoDB.client(connection);
  return DynamoDB.layer(
    ...tables.map((table) => ({
      table,
      client,
      tableName: connection.tableName,
    })),
  );
};

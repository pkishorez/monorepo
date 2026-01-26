import { Effect, Console } from "effect";
import { DynamoTable } from "../index.js";
import { createDynamoDB } from "../services/DynamoClient.js";

// =============================================================================
// Configuration
// =============================================================================
export const PLAYGROUND_TABLE = `playground-${Date.now()}`;
export const LOCAL_ENDPOINT = "http://localhost:8090";

export const localConfig = {
  tableName: PLAYGROUND_TABLE,
  region: "us-east-1",
  credentials: {
    accessKeyId: "local",
    secretAccessKey: "local",
  },
  endpoint: LOCAL_ENDPOINT,
};

// =============================================================================
// DynamoDB Table Definition
// =============================================================================
export const table = DynamoTable.make(localConfig)
  .primary("pk", "sk")
  .gsi("GSI1", "GSI1PK", "GSI1SK")
  .gsi("GSI2", "GSI2PK", "GSI2SK")
  .build();

// =============================================================================
// Table Management
// =============================================================================
export async function createPlaygroundTable() {
  const client = createDynamoDB(localConfig);
  const tableSchema = table.getTableSchema();

  await Effect.runPromise(
    client.createTable({ TableName: PLAYGROUND_TABLE, ...tableSchema }).pipe(
      Effect.tap(() => Console.log(`Created table: ${PLAYGROUND_TABLE}`)),
      Effect.catchAll((e) => {
        const errorName = (e as any)?.error?.name;
        if (errorName === "ResourceInUseException") {
          return Console.log(`Table ${PLAYGROUND_TABLE} already exists`);
        }
        return Effect.fail(e);
      }),
    ),
  );

  // Wait for table to be active
  await new Promise((resolve) => setTimeout(resolve, 1000));
}

export async function deletePlaygroundTable() {
  try {
    const client = createDynamoDB(localConfig);
    await Effect.runPromise(
      client.deleteTable({ TableName: PLAYGROUND_TABLE }).pipe(
        Effect.tap(() => Console.log(`Deleted table: ${PLAYGROUND_TABLE}`)),
      ),
    );
  } catch (error) {
    console.error("Failed to delete table:", error);
  }
}

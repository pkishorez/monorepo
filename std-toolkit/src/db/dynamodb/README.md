# std-toolkit/dynamodb

The DynamoDB package has three distinct jobs:

1. `DynamoDB.client(config)` creates a complete, Smithy-typed DynamoDB client. It is table-independent and returns raw `AttributeValue` payloads.
2. `DynamoTable.make(logicalName)` describes table topology and creates typed keyed or singleton entities. It does not contain a physical table name, region, endpoint, or credentials.
3. `DynamoDB.layer(...bindings)` connects logical tables to physical table names and clients for an Effect runtime.

```ts
const accountOne = DynamoDB.client({
  region: 'us-east-1',
  credentials: credentialsForAccountOne,
});
const accountTwo = DynamoDB.client({
  region: 'eu-west-1',
  credentials: credentialsForAccountTwo,
});

const UserTable = DynamoTable.make('users').primary('pk', 'sk').build();
const AuditTable = DynamoTable.make('audit').primary('pk', 'sk').build();

const live = DynamoDB.layer(
  { table: UserTable, client: accountOne, tableName: 'users-production' },
  { table: AuditTable, client: accountTwo, tableName: 'audit-production' },
);
```

Static credentials and synchronous or asynchronous credential providers are accepted. A client can be shared by many table bindings, while different bindings can use clients for different accounts, regions, endpoints, or DynamoDB-compatible services.

`DynamoTable` exposes topology, entity construction, transactions, snapshots, and `createTableDefinition()`. Direct DynamoDB commands belong to the generated client, not the table abstraction.

## Errors

Client calls return their generated AWS error union plus `DynamoDBClientError` for credentials, transport, response, and decoding failures. Table and entity calls map failures to direct `DynamoDBError` variants:

```ts
Effect.catchTag(program, 'PutItemFailed', (error) =>
  Effect.logError(error.cause),
);
```

Mapped errors retain the complete original typed failure in `cause`; no AWS or transport information is discarded.

## Modules and layers

```text
index
  -> orchestrators/dynamo-table
      -> services
          -> clients/dynamodb-client
              -> generated
          -> domain
      -> domain

domain/
  attribute-value/
  client-error/
  entity-persistence/
  expression/
  table-identity/
```

`domain` is pure. Clients know AWS request execution but no tables. Services own runtime bindings and persistence behavior. The table orchestrator composes topology, entities, transactions, snapshots, and infrastructure definitions.

## Local DynamoDB

Run DynamoDB Local before integration tests:

```sh
pnpm dynamodb:local
```

The tests use `http://localhost:8090` by default.

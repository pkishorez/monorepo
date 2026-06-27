# std-toolkit/dynamodb

DynamoDB table and entity services, expression builders, and marshall utilities built on Effect.

## Subpaths

```ts
import { DynamoTable, DynamoEntity, createDynamoDB } from 'std-toolkit/dynamodb';
import { ... } from 'std-toolkit/dynamodb/rpc';   // RPC helpers
// wildcard — import internal paths directly (advanced use)
import '...' from 'std-toolkit/dynamodb/*';
```

## Key exports

**Services**

- `DynamoTable`, `DynamoEntity`, `DynamoSingleEntity` — Effect services for table operations
- `EntityRegistry` — registry of all entities in a table

**Client**

- `createDynamoDB`, `DynamoDB`, `dynamoDBLayer` — DynamoDB client construction and Effect layer

**Expression builders**

- `exprCondition`, `exprFilter`, `exprUpdate`, `buildExpr` — type-safe condition/filter/update expressions
- `opAdd`, `opIfNotExists` — update operation helpers

**Marshall**

- `marshall`, `unmarshall` — DynamoDB attribute value conversion

**Types / Errors**

- `DynamodbError`, `DynamoConnection`, `MigrationOptions`, `MigrationReport`

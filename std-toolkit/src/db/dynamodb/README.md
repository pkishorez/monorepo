# std-toolkit/dynamodb

DynamoDB table and entity services, expression builders, and marshall utilities built on Effect.

## Subpaths

```ts
import { DynamoTable, createDynamoDB } from 'std-toolkit/dynamodb';
// wildcard — import internal paths directly (advanced use)
import '...' from 'std-toolkit/dynamodb/*';
```

## Key exports

**Services**

- `DynamoTable` — the single-table topology; entities are defined from it via `table.entity(eschema)` / `table.singleEntity(eschema)` and it coordinates `transact()`

**Client**

- `createDynamoDB`, `DynamoDB`, `dynamoDBLayer` — DynamoDB client construction and Effect layer

**Expression builders**

- `exprCondition`, `exprFilter`, `exprUpdate`, `buildExpr` — type-safe condition/filter/update expressions
- `opAdd`, `opIfNotExists` — update operation helpers

**Marshall**

- `marshall`, `unmarshall` — DynamoDB attribute value conversion

**Types / Errors**

- `DynamodbError`, `DynamoConnection`

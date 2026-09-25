# std-toolkit/db/dynamodb

DynamoDB adapter with a typed expression builder, adapter-native item operations, and create and delete helpers for DynamoDB Local.

## Big picture

DynamoDB is the reference topology every other adapter mirrors. `DynamoDB.make` realizes a StdTable on one physical table through `aws4fetch`, so no AWS SDK is required. Its layer supplies both the StdTable operations and a typed native service for expression-builder updates and batch writes. `make` returns only the layer and never touches the physical table. Deployed tables come from `DynamoDB.table` in [`std-toolkit/alchemy`](../../../README.md#std-toolkitalchemy), which creates every index and guards the table snapshot. For DynamoDB Local and tests, `DynamoDB.createTable` creates the table if it is missing and `DynamoDB.deleteTable` removes it. Divergences and native semantics are in [CONTEXT.md](CONTEXT.md); shared vocabulary is in [db/CONTEXT.md](../CONTEXT.md).

## Install

See the [top README](../../../README.md).

## Exports

### `std-toolkit/db/dynamodb`

| Export                        | What it does                                                                                     |
| ----------------------------- | ------------------------------------------------------------------------------------------------ |
| `DynamoDB.make`               | Realizes a StdTable on a DynamoDB table; returns `tableName` and `layer`.                        |
| `DynamoDB.createTable`        | Creates the physical table and its indexes if missing, then waits until it is active.            |
| `DynamoDB.deleteTable`        | Deletes the physical table.                                                                      |
| `DynamoDB.getTableDefinition` | Projects a StdTable's topology into a `CreateTable`-shaped definition without credentials.       |
| `DynamoDB.getItem`            | Native `GetItem` by raw key through the table's native service.                                  |
| `DynamoDB.update`             | Native entity update built from `exprUpdate` operations with an optional condition.              |
| `DynamoDB.batchInsert`        | Native `BatchWriteItem` put of raw items.                                                        |
| `dynamoTableService`          | Returns the Effect Service tag for one table's native DynamoDB service by logical name.          |
| `buildExpr`                   | Compiles a query, update, condition, or filter input into expression strings and attribute maps. |
| `exprCondition`               | Builds a typed condition expression from field operations.                                       |
| `exprFilter`                  | Builds a typed filter expression from field operations.                                          |
| `exprUpdate`                  | Builds a typed list of update operations such as `set`, `opAdd`, `opIfNotExists`, and `append`.  |
| `marshall`                    | Converts a plain object into DynamoDB attribute values.                                          |
| `unmarshall`                  | Converts DynamoDB attribute values back into a plain object.                                     |
| `DynamoDBNativeError`         | Tagged error wrapping a failed native operation with its name and cause.                         |

## Usage

### Create the table, run the program, delete the table

Lifted from story 24, which runs against DynamoDB Local.

```ts
import { Effect } from 'effect';
import { StdTable } from 'std-toolkit/db';
import { DynamoDB } from 'std-toolkit/db/dynamodb';

const table = StdTable.make('board').primary('pk', 'sk').build();

const config = {
  tableName: 'board',
  region: 'local',
  endpoint: 'http://localhost:8090',
  credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
};
const dynamodb = DynamoDB.make(table, config);

const program = Effect.gen(function* () {
  yield* DynamoDB.createTable(table, config);
  return yield* saveAndRead.pipe(
    Effect.provide(dynamodb.layer),
    Effect.ensuring(Effect.orDie(DynamoDB.deleteTable(config))),
  );
});
```

- `endpoint` is optional; omit it for a real region.
- `credentials` accepts static keys or a provider; see `DynamoDBCredentialsInput`.
- `pnpm dynamodb:local` starts DynamoDB Local on port 8090 for the test suite.

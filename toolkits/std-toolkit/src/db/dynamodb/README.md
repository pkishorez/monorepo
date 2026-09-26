# std-toolkit/db/dynamodb

DynamoDB adapter for StdTable, with create and delete helpers for DynamoDB Local.

## Big picture

DynamoDB is the reference topology every other adapter mirrors. `DynamoDB.make` realizes a StdTable on one physical table through `aws4fetch`, so no AWS SDK is required. Its layer supplies the StdTable operations and nothing else: there are no native reads, expression updates, or batch writes, so every write goes through `insert`, `update`, or `getAndUpdate` and application code never handles DynamoDB attribute values ([ADR 0015](../../../docs/adr/0015-rich-values-encoded-storage-key-paths.md)). `make` returns only the layer and never touches the physical table. Deployed tables come from `DynamoDB.table` in [`std-toolkit/alchemy`](../../../README.md#std-toolkitalchemy), which creates every index and guards the table snapshot. For DynamoDB Local and tests, `DynamoDB.createTable` creates the table if it is missing and `DynamoDB.deleteTable` removes it. Divergences are in [CONTEXT.md](CONTEXT.md); shared vocabulary is in [db/CONTEXT.md](../CONTEXT.md).

## Install

See the [top README](../../../README.md).

## Exports

### `std-toolkit/db/dynamodb`

| Export                        | What it does                                                                                |
| ----------------------------- | ------------------------------------------------------------------------------------------- |
| `DynamoDB.make`               | Realizes a StdTable on a DynamoDB table; returns `tableName` and `layer`.                   |
| `DynamoDB.createTable`        | Creates the physical table and its indexes if missing, then waits until it is active.       |
| `DynamoDB.deleteTable`        | Deletes the physical table.                                                                 |
| `DynamoDB.getTableDefinition` | Projects a StdTable's topology into a `CreateTable`-shaped definition without credentials.  |
| `DynamoDBNativeError`         | Tagged error wrapping a failed `createTable` or `deleteTable` with its operation and cause. |

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

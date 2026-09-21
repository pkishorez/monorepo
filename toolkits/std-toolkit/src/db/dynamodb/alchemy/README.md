# std-toolkit/db/dynamodb/alchemy

Declares an Alchemy-managed DynamoDB table from the same topology the DynamoDB adapter uses, so infrastructure and code cannot drift.

## Big picture

`DynamoDB.getTableDefinition` already describes the physical table the adapter expects. This entrypoint turns that description into an `alchemy/AWS/DynamoDB` `Table` resource, mapping the key schema, attribute definitions, billing mode, and local and global secondary indexes. The ordinary DynamoDB entrypoint never imports Alchemy. Deployment lifecycle belongs to Alchemy. The decision is [ADR 0010](../../../../docs/adr/0010-dynamodb-owns-alchemy-resource-provisioning.md).

## Install

See the [top README](../../../../README.md). This subpath needs the optional peer `alchemy` at the version declared there.

## Exports

### `std-toolkit/db/dynamodb/alchemy`

| Export              | What it does                                                                                             |
| ------------------- | -------------------------------------------------------------------------------------------------------- |
| `makeDynamoDBTable` | Creates an Alchemy DynamoDB `Table` resource from a topology, a logical `resourceId`, and a `tableName`. |

## Usage

### Provision the adapter's table with Alchemy

```ts
import { Effect } from 'effect';
import { DynamoDB } from 'std-toolkit/db/dynamodb';
import { makeDynamoDBTable } from 'std-toolkit/db/dynamodb/alchemy';

const topology = DynamoDB.getTableDefinition(table);

const provision = Effect.gen(function* () {
  yield* makeDynamoDBTable(topology, {
    resourceId: 'BoardTable',
    tableName: 'board-production',
  });
});
```

- `resourceId` is the Alchemy logical id that tracks the resource across deploys.
- `tableName` is the real DynamoDB table name; pass the same value to `DynamoDB.make`.

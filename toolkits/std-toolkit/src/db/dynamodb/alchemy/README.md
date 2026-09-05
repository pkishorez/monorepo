# DynamoDB Alchemy integration

Declares an alchemy-managed DynamoDB table from the same shape your app's raw
SDK client already uses, so the two can never drift apart.

## Scenario

Your app talks to DynamoDB with `std-toolkit`'s `DynamoDB.getTableDefinition`
locally, and on deployed stages you also want alchemy to own creating,
tracking, and tearing down that same table.

## Usage

```ts
import { makeDynamoDBTable } from 'std-toolkit/db/dynamodb/alchemy';
import { DynamoDB as StdDynamoDB } from 'std-toolkit/db/dynamodb';

const topology = StdDynamoDB.getTableDefinition(myTable);

Effect.gen(function* () {
  yield* makeDynamoDBTable(topology, {
    resourceId: 'MyTable',
    tableName: 'my-table-name',
  });
});
```

`resourceId` is the alchemy logical id (how alchemy tracks the resource
across deploys); `tableName` is the real DynamoDB table name.

## Status

Alchemy is an optional peer dependency. Install the version declared by
STD Toolkit when using this entry point. The ordinary DynamoDB entry point
does not import Alchemy. Resource mapping tests cover both local and global
secondary indexes; deployment lifecycle behavior belongs to Alchemy.

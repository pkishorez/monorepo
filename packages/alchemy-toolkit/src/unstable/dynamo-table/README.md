# dynamo-table

Declares an alchemy-managed DynamoDB table from the same shape your app's raw
SDK client already uses, so the two can never drift apart.

## Scenario

Your app talks to DynamoDB with `std-toolkit`'s `DynamoDB.getTableDefinition`
locally, and on deployed stages you also want alchemy to own creating,
tracking, and tearing down that same table.

## Usage

```ts
import { makeDynamoDBTable } from '@monorepo/alchemy-toolkit/unstable/dynamo-table';
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

`unstable`. Wrapped, not yet proven — no production track record or tests of
its own as a wrapper. Do not promote to `stable` without both.

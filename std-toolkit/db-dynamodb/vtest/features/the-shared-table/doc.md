# The shared table

Everything in this package sits on one idea native to DynamoDB:
**single-table design**. Instead of a table per type, you create _one_
`DynamoTable` with a generic shape — a partition key `pk` and a sort key `sk` —
and let every entity share it. Items are told apart by what you put in `pk`/`sk`,
not by which table they live in.

## Defining a table

You hand `.make(...)` the connection config (table name, region, credentials,
endpoint) and declare the primary key columns. Global secondary index columns
can be reserved with `.gsi(...)`; we'll use those later. `.build()` hands back
the table instance.

```ts
const table = DynamoTable.make({
  tableName: 'std_data',
  region: 'us-east-1',
  credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
  endpoint: 'http://localhost:8090', // DynamoDB Local
})
  .primary('pk', 'sk')
  .build();
```

A table on its own does nothing — it's a description. To act on a real database
you need two things: a **client** to talk to DynamoDB, and the physical table
actually provisioned.

## Getting a runnable database

Operations in this package are `Effect<…, DynamodbError>`. You obtain a signed
client with `createDynamoDB(config)`, and you provision the physical table by
feeding `createTable` the schema the table already knows how to produce:

```ts
const client = createDynamoDB(config);
yield *
  client.createTable({
    TableName: config.tableName,
    ...table.getTableSchema(),
  });
```

`getTableSchema()` derives the full `CreateTable` input — key schema, attribute
definitions, every GSI — from the table description, so the physical table can
never drift from what your entities expect. Point `endpoint` at AWS instead of
DynamoDB Local and the exact same entity code runs against the cloud.

::test-group{id=setup-and-store}

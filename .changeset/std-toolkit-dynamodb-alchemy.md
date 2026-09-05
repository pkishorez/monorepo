---
'std-toolkit': patch
---

Add `std-toolkit/db/dynamodb/alchemy`: an Alchemy deployment helper that provisions the DynamoDB table your app already talks to, so runtime and infrastructure cannot drift apart.

- `makeDynamoDBTable(topology, { resourceId, tableName })` turns the topology returned by `DynamoDB.getTableDefinition` into an Alchemy `DynamoDB.Table` resource, mapping attribute definitions, partition and sort keys, billing mode, and both local and global secondary indexes.
- Alchemy is an optional peer dependency imported only by this entry point, so the ordinary `std-toolkit/db/dynamodb` entry point stays free of infrastructure dependencies.

Adopts the DynamoDB table resource previously housed in `alchemy-toolkit`; consumers must update their imports to the new entry point.

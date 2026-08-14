# DynamoDB

Realize a StdTable on DynamoDB with `DynamoDB.make`. The resulting adapter table's layer supplies the StdTable operations and the typed DynamoDB-native service.

```ts
import { StdTable } from 'std-toolkit/db';
import { DynamoDB } from 'std-toolkit/db/dynamodb';

const sessions = StdTable.make('sessions').primary('pk', 'sk').build();
const sessionsDynamo = DynamoDB.make(sessions, {
  tableName: 'production-sessions',
  region: 'ap-south-1',
  credentials,
});
```

`sessionsDynamo.setup` attempts `CreateTable`; providing the layer never runs setup. `DynamoDB.getTableDefinition` projects portable topology without credentials. `DynamoDB.update` keeps expression-builder updates adapter-native, and `DynamoDB.batchInsert` keeps batch writes adapter-native.

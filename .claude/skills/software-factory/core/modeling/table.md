# Entity and table design

Resolve record identity and the reads that need indexes.

## Define the table

```ts
// app-model/app-table/app-table.ts
import { StdTable } from 'std-toolkit/db';

export const appTable = StdTable.make('app')
  .primary('pk', 'sk')
  .gsi('GSI1', 'gsi1pk', 'gsi1sk')
  .gsi('GSI2', 'gsi2pk', 'gsi2sk')
  .gsi('GSI3', 'gsi3pk', 'gsi3sk')
  .gsi('GSI4', 'gsi4pk', 'gsi4sk')
  .build();
```

Define at least `GSI1` through `GSI4` on new tables by default, using the lowercase key attributes shown above.

Reuse existing tables and honor confirmed index choices.

## Define the entity

```ts
// app-model/order-item/order-item.ts
import { orderItemSchema } from './schema.js';
import { appTable } from '../app-table/index.js';

export const orderItemEntity = appTable
  .entity(orderItemSchema)
  .primary({ pk: ['orderId'] })
  .index('GSI1', 'byUpdated', { pk: [] })
  .build();
```

The entity binds its schema to the table and gives the index a camelCase alias.

Here identity includes the order and item ID; `byUpdated` supports reading changes across orders.

For indexes affected by schema migration, read [edge-cases.md](edge-cases.md).

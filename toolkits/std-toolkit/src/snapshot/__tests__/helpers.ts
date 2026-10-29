import { buildESchemaDefinitions } from '../capture/eschema-capture/index.js';
import type { TableSnapshot } from '../index.js';

/** A table snapshot holding only the given ESchemas, for tests about schema definitions. */
export const snapshotOf = (...eschemas: readonly object[]): TableSnapshot => ({
  logicalName: 'app',
  topology: {
    primary: { pk: 'pk', sk: 'sk' },
    localSecondaryIndexes: [],
    globalSecondaryIndexes: [],
  },
  entities: [],
  schemas: buildESchemaDefinitions(eschemas.map((eschema) => ({ eschema }))),
});

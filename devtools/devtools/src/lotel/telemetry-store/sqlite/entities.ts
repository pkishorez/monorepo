import { StdTable } from '@kestack/std-toolkit/db';
import { SQLite, type SQLiteDriver } from '@kestack/std-toolkit/db/sqlite';
import {
  LogEntitySchema,
  SpanEntitySchema,
} from '../../telemetry-schema/index.js';

const table = StdTable.make('lotel')
  .primary('pk', 'sk')
  .gsi('timeline', 'timelinePk', 'timelineSk')
  .gsi('span-trace', 'spanTracePk', 'spanTraceSk')
  .gsi('trace', 'tracePk', 'traceSk')
  .build();

const spans = table
  .entity(SpanEntitySchema)
  .primary({ pk: ['traceId'] })
  .index('timeline', 'timeline', { pk: [] })
  .index('span-trace', 'byTrace', { pk: ['traceId'] })
  .build();

const logs = table
  .entity(LogEntitySchema)
  .primary()
  .index('timeline', 'timeline', { pk: [] })
  .index('trace', 'byTrace', { pk: ['traceId'] })
  .build();

/** @internal */
export const makeSqliteEntities = (database: SQLiteDriver) => {
  const configured = SQLite.make(table, { database, tableName: 'lotel_data' });
  return {
    table,
    spans,
    logs,
    layer: configured.layer,
    // Local telemetry: a schema change may drop it.
    setup: SQLite.setup(table, {
      database,
      tableName: 'lotel_data',
      mode: 'disposable',
    }),
  };
};

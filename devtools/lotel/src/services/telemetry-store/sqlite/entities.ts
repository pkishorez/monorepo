import { StdTable } from 'std-toolkit/db';
import { SQLite, type SQLiteDriver } from 'std-toolkit/db/sqlite';
import { FlowEntitySchema } from '../../../domain/flow/index.js';
import {
  LogEntitySchema,
  SpanEntitySchema,
} from '../../../domain/telemetry-schema/index.js';

const table = StdTable.make('lotel')
  .primary('pk', 'sk')
  .gsi('timeline', 'timelinePk', 'timelineSk')
  .gsi('span-trace', 'spanTracePk', 'spanTraceSk')
  .gsi('trace', 'tracePk', 'traceSk')
  .gsi('flow', 'flowPk', 'flowSk')
  .build();

const spans = table
  .entity(SpanEntitySchema)
  .primary({ pk: ['traceId'] })
  .index('timeline', 'timeline', { pk: [] })
  .index('span-trace', 'byTrace', { pk: ['traceId'] })
  .index('flow', 'byFlow', { pk: ['flowId'] })
  .build();

const logs = table
  .entity(LogEntitySchema)
  .primary()
  .index('timeline', 'timeline', { pk: [] })
  .index('trace', 'byTrace', { pk: ['traceId'] })
  .index('flow', 'byFlow', { pk: ['flowId'] })
  .build();

const flows = table
  .entity(FlowEntitySchema)
  .primary()
  .index('timeline', 'timeline', { pk: [] })
  .build();

/** @internal */
export const makeSqliteEntities = (database: SQLiteDriver) => {
  const configured = SQLite.make(table, { database, tableName: 'lotel_data' });
  return {
    table,
    spans,
    logs,
    flows,
    layer: configured.layer,
    setup: configured.setup,
  };
};

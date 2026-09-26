import { Effect } from 'effect';
import { makeBetterSQLite3 } from '../drivers/better-sqlite3/index.js';
import { makeNodeSQLite } from '../drivers/node/index.js';
import { SQLite } from '../index.js';
import {
  conformanceTable,
  runConformanceSuite,
} from '../../std-table/__tests__/conformance.js';

const makeLayer = (database: ReturnType<typeof makeNodeSQLite>) => {
  Effect.runSync(SQLite.setup(conformanceTable, { database }));
  return SQLite.make(conformanceTable, { database }).layer;
};

runConformanceSuite({
  name: 'SQLite node',
  makeLayer: () => makeLayer(makeNodeSQLite({ path: ':memory:' })),
});

runConformanceSuite({
  name: 'SQLite better-sqlite3',
  makeLayer: () => makeLayer(makeBetterSQLite3({ path: ':memory:' })),
});

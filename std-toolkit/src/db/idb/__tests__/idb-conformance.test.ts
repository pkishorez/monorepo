import 'fake-indexeddb/auto';
import { Effect, Layer } from 'effect';
import { IDB } from '../index.js';
import {
  conformanceTable,
  runConformanceSuite,
} from '../../std-table/__tests__/conformance.js';

let databaseNumber = 0;

runConformanceSuite({
  name: 'IndexedDB',
  makeLayer: () => {
    const database = IDB.database({
      databaseName: `portable-conformance-${++databaseNumber}`,
    });
    const configured = IDB.make(conformanceTable, { database });
    return Layer.unwrap(configured.setup.pipe(Effect.as(configured.layer)));
  },
});

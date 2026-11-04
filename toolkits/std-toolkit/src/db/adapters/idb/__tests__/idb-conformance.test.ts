import 'fake-indexeddb/auto';

import { IDB } from '../index.js';
import {
  conformanceTable,
  runConformanceSuite,
} from '../../../table/__tests__/conformance.js';

let databaseNumber = 0;

runConformanceSuite({
  name: 'IndexedDB',
  makeLayer: () => {
    const database = IDB.database({
      databaseName: `portable-conformance-${++databaseNumber}`,
    });
    return IDB.make(conformanceTable, { mode: 'disposable', database }).layer;
  },
});

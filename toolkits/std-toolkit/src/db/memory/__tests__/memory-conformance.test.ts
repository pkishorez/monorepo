import {
  conformanceTable,
  runConformanceSuite,
} from '../../std-table/__tests__/conformance.js';
import { Memory } from '../index.js';

runConformanceSuite({
  name: 'Memory',
  makeLayer: () => Memory.make(conformanceTable).layer,
});

import { makeDeterministicContract } from './deterministic-contract.js';
import { conformanceTable, runConformanceSuite } from './conformance.js';

runConformanceSuite({
  name: 'deterministic',
  makeLayer: () =>
    makeDeterministicContract(conformanceTable.logicalName, conformanceTable)
      .layer,
});

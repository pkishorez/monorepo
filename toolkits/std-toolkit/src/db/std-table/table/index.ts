export {
  StdTable,
  type BackfillReads,
  type BackfillsBuilder,
  type EntitiesBuilder,
  type TableBuilder,
  type TableDeclaration,
  type TopologyBuilder,
} from './table.js';
// Internal, for the setup runner; not part of the package surface.
export { backfillReads, storedForm, tableDeclaration } from './decoration.js';

// The pure steps between gap versions, for the Backfill runner in db/setup
// alone: eschema's door does not export them, and no other Module has a Rule
// to this one, so app code never folds a value part way.
export {
  migrateToGap,
  readToGap,
  type VersionedValue,
} from '../eschema/domain/encoded/index.js';

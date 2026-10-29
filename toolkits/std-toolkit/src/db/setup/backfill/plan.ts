// The planner lives with the declaration, so a table whose Backfills cannot
// be ordered fails when it is built (ADR 0020); setup plans with the same one.
export {
  BackfillOrderRefused,
  planStages,
  type Stage,
} from '../../std-table/definition/index.js';

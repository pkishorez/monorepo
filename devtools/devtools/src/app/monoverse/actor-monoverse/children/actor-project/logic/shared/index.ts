// Project's pure logic its Children share: the Shape and the Schemas
// they take from it, what its view reads, git roll-up, folders and paths.
export { ProjectShape } from './shape.js';
export type { Check, Where } from './shape.js';
export {
  analysisAt,
  ancestorsOf,
  baseOf,
  branchOf,
  changesAt,
  changesBlocked,
  changesOf,
  changeTallies,
  foldersHolding,
  isIgnored,
  isRereading,
  nameOf,
  shownChangesOf,
  statusOf,
} from './selectors/index.js';
export type { Change, ChangeStatus } from './selectors/index.js';

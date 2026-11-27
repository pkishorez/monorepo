export type { Instance, Snapshot } from './instance.ts';
export {
  actorAt,
  actorFor,
  instanceAt,
  isMany,
  pathTo,
  replace,
  slotOf,
} from './walk.ts';
export type { Step } from './walk.ts';
export { wanted, workersOf } from './wanted.ts';
export type { WantedWorker } from './wanted.ts';
export { changesOf } from './compare.ts';
export type { BeforeAfter, Change, Whole } from './compare.ts';

export { InspectorShape } from './shape.ts';
export { jsonDiff } from './diff.ts';
export { foldOf } from './fold.ts';
export type { Folded, More } from './fold.ts';
export type {
  BeforeAfter,
  Board,
  Card,
  Change,
  Changed,
  Entry,
  Field,
  From,
  Job,
  Kind,
  Mark,
  Next,
  Node,
  Place,
  Played,
  Shape,
  Shown,
  Step,
  Tick,
  Timeline,
  Tone,
  Within,
} from './shape.ts';
export {
  awayFromHead,
  boardOf,
  instanceOf,
  nextOf,
  onBranch,
  openedOf,
  previewShown,
  stepAt,
  timelineOf,
  instanceLabel,
  traceOf,
} from './selectors/index.ts';
export type { Effect, Link, Trace } from './selectors/index.ts';

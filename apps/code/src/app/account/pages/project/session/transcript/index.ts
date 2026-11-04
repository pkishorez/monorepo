import {
  choiceOf,
  RunningChosen,
  RunningItem,
  RunningPicker,
  STOP_ALL,
  TranscriptLive,
} from './actor.ts';
import { Around, TranscriptView, useRead } from './view.tsx';

/** What a session says, read from this device, and the Running Picker over it. */
export const Transcript = {
  actor: TranscriptLive,
  /** Draws what `Around` hands it, inside what it reads (`useRead`). */
  view: TranscriptView,
  Around,
  useRead,
};
export { choiceOf, RunningChosen, RunningItem, RunningPicker, STOP_ALL };
export type { RunningChoice } from './actor.ts';
export { type Opening, useOpening } from './words/index.ts';
export { earlierOf, thread } from './turns/rows/index.ts';
export { Folder } from './tool/index.ts';
export { EarlierRows, Rows, useFacts, useRows } from './transcript.tsx';
export { type Forking, SessionOpener } from './turns/answer/footer.tsx';
export { SubagentDrawers } from './turns/answer/work/live/drawers/drawers.tsx';
export { CommandDrawer } from './turns/answer/work/live/drawers/command/command.tsx';
export { itemsOf, RunningButton } from './turns/answer/work/live/running.tsx';
export { LiveContext, subagentOf, type Live } from './turns/rows/index.ts';

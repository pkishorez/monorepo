import type { PathTrace, TraceEvent } from '../artifact/index.js';
import type { StoryMode } from './types.js';

// Serial execution per story file makes a plain stack sufficient — no
// AsyncLocalStorage. Recording is on only between beginPath/endPath.
interface TracerState {
  mode: StoryMode;
  activePath: string | undefined;
  events: TraceEvent[];
}

const state: TracerState = {
  mode: 'noop',
  activePath: undefined,
  events: [],
};

export function setMode(mode: StoryMode): void {
  state.mode = mode;
}

export function getMode(): StoryMode {
  return state.mode;
}

export function beginPath(pathName: string): void {
  void pathName;
  throw new Error('not implemented');
}

export function endPath(passed: boolean): PathTrace {
  void passed;
  throw new Error('not implemented');
}

export function record(event: TraceEvent): void {
  void event;
  throw new Error('not implemented');
}

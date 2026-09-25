import { ManagedRuntime } from 'effect';
import { StudioSession, studioLayer } from './studio-session.ts';

export type StudioRuntime = ManagedRuntime.ManagedRuntime<StudioSession, never>;

/** One runtime per page visit; it owns the worker and the microphone. */
export const makeStudioRuntime = (): StudioRuntime =>
  ManagedRuntime.make(studioLayer);

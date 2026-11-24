import type { State } from './shape.js';

/** What a read is keyed by: the branch, and the try. */
export const readAt = (branch: string | null, tries: number) =>
  JSON.stringify([branch, tries]);

/** Whether the Package is being read: nothing read yet at the branch and try now named. */
export const isReading = (
  state: State,
  branch: string | null,
  tries: number,
): boolean => state._tag === 'Reading' || state.at !== readAt(branch, tries);

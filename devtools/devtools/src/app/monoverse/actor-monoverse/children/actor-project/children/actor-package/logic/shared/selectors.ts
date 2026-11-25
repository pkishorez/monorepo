import type { State } from './shape.js';

export const readAt = (branch: string | null, tries: number) =>
  JSON.stringify([branch, tries]);

export const isReading = (
  state: State,
  branch: string | null,
  tries: number,
): boolean => state._tag === 'Reading' || state.at !== readAt(branch, tries);

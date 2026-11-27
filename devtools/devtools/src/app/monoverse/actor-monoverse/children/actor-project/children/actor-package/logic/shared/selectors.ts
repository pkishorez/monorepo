import type { State } from './shape.js';

export const readAt = (branch: string | null, tries: number, reloads: number) =>
  JSON.stringify([branch, tries, reloads]);

export const isReading = (
  state: State,
  branch: string | null,
  tries: number,
  reloads: number,
): boolean =>
  state._tag === 'Reading' || state.at !== readAt(branch, tries, reloads);

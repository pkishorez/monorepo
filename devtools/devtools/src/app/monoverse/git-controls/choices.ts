import type { Unchanged } from '../tree/index.js';

/** The three ways what the branch left unchanged is drawn, as offered. */
export const unchangedChoices: ReadonlyArray<{
  value: Unchanged;
  label: string;
}> = [
  { value: 'show', label: 'Show' },
  { value: 'dim', label: 'Dim' },
  { value: 'hide', label: 'Hide' },
];

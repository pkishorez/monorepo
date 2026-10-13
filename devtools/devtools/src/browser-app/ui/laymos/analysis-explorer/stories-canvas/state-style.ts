import type { PhaseStatus } from 'laymos/story/schema';

import type { ProofState } from './story-scope';

interface StateStyle {
  readonly label: string;
  /** The solid mark: dots, bars. */
  readonly mark: string;
  readonly text: string;
}

export const stateStyles: Readonly<Record<ProofState, StateStyle>> = {
  'not-run': {
    label: 'Not run',
    mark: 'bg-muted-foreground/35',
    text: 'text-muted-foreground',
  },
  pending: {
    label: 'Pending',
    mark: 'bg-muted-foreground/35',
    text: 'text-muted-foreground',
  },
  running: {
    label: 'Running',
    mark: 'bg-sky-500',
    text: 'text-sky-600 dark:text-sky-400',
  },
  passed: {
    label: 'Passed',
    mark: 'bg-positive',
    text: 'text-positive',
  },
  failed: {
    label: 'Failed',
    mark: 'bg-destructive',
    text: 'text-destructive',
  },
  errored: {
    label: 'Errored',
    mark: 'bg-orange-500',
    text: 'text-orange-600 dark:text-orange-400',
  },
  unprepared: {
    label: 'Unprepared',
    mark: 'bg-slate-400 dark:bg-slate-500',
    text: 'text-slate-600 dark:text-slate-400',
  },
};

export const phaseStatusStyles: Readonly<Record<PhaseStatus, StateStyle>> = {
  passed: stateStyles.passed,
  failed: stateStyles.failed,
  errored: stateStyles.errored,
  skipped: { ...stateStyles['not-run'], label: 'Skipped' },
};

export function formatDuration(milliseconds: number): string {
  if (milliseconds < 1000) return `${Math.round(milliseconds)} ms`;
  if (milliseconds < 60_000) return `${(milliseconds / 1000).toFixed(1)} s`;
  const minutes = Math.floor(milliseconds / 60_000);
  return `${minutes} m ${Math.round((milliseconds % 60_000) / 1000)} s`;
}

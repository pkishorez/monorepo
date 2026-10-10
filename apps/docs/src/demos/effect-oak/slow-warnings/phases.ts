import { Schema } from 'effect';

/** The parts of handling a Message that the lab can time. */
export const Phase = Schema.Literals(['Update', 'View', 'Patch']);
export type Phase = typeof Phase.Type;

export const SlowWarningReport = Schema.Struct({
  phase: Phase,
  durationMs: Schema.Number,
  thresholdMs: Schema.Number,
  trigger: Schema.String,
  details: Schema.String,
});
export type SlowWarningReport = typeof SlowWarningReport.Type;

/** Foldkit's default thresholds. */
export const THRESHOLD_MS: Record<Phase, number> = {
  Update: 4,
  View: 16,
  Patch: 8,
};

export const DETAILS: Record<Phase, string> = {
  Update: 'CPU work ran inside Update before it returned the next Model.',
  View: 'The View did expensive synchronous work while drawing.',
  Patch: 'Thousands of keyed rows were inserted into the live DOM.',
};

export const report = (
  phase: Phase,
  durationMs: number,
  trigger: string,
): SlowWarningReport => ({
  phase,
  durationMs,
  thresholdMs: THRESHOLD_MS[phase],
  trigger,
  details: DETAILS[phase],
});

export const ACCENT: Record<Phase, string> = {
  Update:
    'border-amber-400 bg-amber-50 text-amber-950 dark:bg-amber-950/30 dark:text-amber-100',
  View: 'border-sky-400 bg-sky-50 text-sky-950 dark:bg-sky-950/30 dark:text-sky-100',
  Patch:
    'border-rose-400 bg-rose-50 text-rose-950 dark:bg-rose-950/30 dark:text-rose-100',
};

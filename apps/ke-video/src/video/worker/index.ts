/*
 * The worker: the process that turns one Video's link into its files, one
 * step at a time, apart from the command that started it. `main.ts` is
 * that process, `run.ts` its run, and `control.ts` how the CLI starts and
 * stops it.
 */
export { requirements, start, stop, WorkerError } from './control.ts';
export type { Job, Outcome, Pipeline, Requirement } from './run.ts';
export { work } from './run.ts';

/*
 * The run lifecycle workflow: runs as their owner asks for them, watches
 * them and cancels them (`runsHandlers`, the Runs group), and as their
 * runners perform them (`runnerHandlers`, the RunnerApi group), on the
 * lifecycle that orders them, times them and ends them (`RunLifecycle`).
 *
 * Later workflows ask for runs with `RunLifecycle.enqueue` and hear how they
 * ended with `RunLifecycle.onFinished`; New Project starts an Inspect with
 * `startInspect`.
 */

export {
  type Alarm,
  type EnqueueInput,
  type FinishedHandler,
  type LifecycleConfig,
  RunLifecycle,
  SILENCE_LIMIT_MS,
  TIMEOUT_MS,
  viewOf,
} from './lifecycle.ts';
export { folderOf, type InspectInput, startInspect } from './inspect.ts';
export { runsHandlers } from './runs.ts';
export {
  RunnerCaller,
  runnerHandlers,
  runnerOf,
  sentByRunner,
} from './runner.ts';

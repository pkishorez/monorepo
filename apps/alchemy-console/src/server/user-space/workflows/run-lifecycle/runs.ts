import { Effect } from 'effect';
import { type InspectInput, startInspect } from './inspect.ts';
import { RunLifecycle } from './lifecycle.ts';

/*
 * The Runs group's handlers: what the owner's tabs ask of a run.
 *
 * - watch    the run, its events and log batches so far, then each change,
 *            until it ends;
 * - cancel   ends a waiting run, asks a running one to stop;
 * - inspect  starts an Inspect of one folder of one of their repositories.
 */

export const runsHandlers = Effect.gen(function* () {
  const lifecycle = yield* RunLifecycle;
  const context =
    yield* Effect.context<Effect.Services<ReturnType<typeof startInspect>>>();
  return {
    'Runs.watch': ({ runId }: { readonly runId: string }) =>
      lifecycle.watch(runId),
    'Runs.cancel': ({ runId }: { readonly runId: string }) =>
      lifecycle.cancel(runId),
    'Runs.inspect': (input: InspectInput) =>
      startInspect(input).pipe(Effect.provideContext(context)),
  };
});

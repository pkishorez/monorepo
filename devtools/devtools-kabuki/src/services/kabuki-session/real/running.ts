import { Effect } from 'effect';
import { History } from '@kestack/kabuki';
import type { Runtime } from '@kestack/kabuki';
import type { AppRuntime } from '@kestack/kabuki/react/types';
import { StepNotFound } from '../../../server/rpc/session/contract/index.ts';
import type { Step } from '../../../server/rpc/session/contract/index.ts';

export const runtimeOf = (app: AppRuntime): Effect.Effect<Runtime> =>
  Effect.suspend(() =>
    app.runtime
      ? Effect.succeed(app.runtime)
      : Effect.callback<Runtime>((resume) => {
          const stop = app.subscribe(() => {
            if (!app.runtime) return;
            stop();
            resume(Effect.succeed(app.runtime));
          });
          return Effect.sync(stop);
        }),
  );

export const stepNotFound = (history: History, step: Step) => {
  const line = History.entries(history);
  return new StepNotFound({
    step,
    oldest: line[0]?.id ?? null,
    newest: line.at(-1)?.id ?? null,
  });
};

export const resolve = (
  history: History,
  at: Step | undefined,
): Effect.Effect<
  { readonly id: number | null; readonly step: Step },
  StepNotFound
> => {
  if (at === undefined) {
    const { head } = history;
    return Effect.succeed({ id: head, step: head ?? 'start' });
  }
  if (at === 'start') return Effect.succeed({ id: null, step: at });
  return History.entry(history, at)
    ? Effect.succeed({ id: at, step: at })
    : Effect.fail(stepNotFound(history, at));
};

export const replayed = <A>(history: History, step: Step, work: () => A) =>
  Effect.try({ try: work, catch: () => stepNotFound(history, step) });

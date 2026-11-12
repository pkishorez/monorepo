import { History } from '@kestack/kabuki';
import type { Entry } from '@kestack/kabuki';
import type { AppRuntime } from '@kestack/kabuki/react/view';

/*
 * Steps, counted the way a reader counts them: 0 is the app right after
 * init, n is the app right after the nth Message on the Head's Branch.
 */

/** The entries from the first to the Head; none before the app is drawn. */
export const lineOf = ({ runtime }: AppRuntime): ReadonlyArray<Entry> =>
  runtime === null ? [] : History.line(runtime.history);

/** The step shown: the last one, the Head, while not Seeking. */
export const stepOf = (app: AppRuntime): number => {
  const line = lineOf(app);
  const { seeking } = app;
  return seeking === null
    ? line.length
    : seeking.entry === null
      ? 0
      : line.findIndex((entry) => entry.id === seeking.entry) + 1;
};

/** The entry a step is right after: `null` for init. */
const entryOf = (line: ReadonlyArray<Entry>, step: number) =>
  step <= 0 ? null : line[step - 1]!.id;

/** Seek a step; the last one is the Head. */
export const showStep = (app: AppRuntime, step: number) => {
  const line = lineOf(app);
  if (step >= line.length) app.toHead();
  else app.seek(entryOf(line, step));
};

/** Carry on from a step: a Fork, growing a new Branch from it. */
export const carryOn = (app: AppRuntime, step: number) =>
  app.fork(entryOf(lineOf(app), step));

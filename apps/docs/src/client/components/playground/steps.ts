import type { AppRuntime } from '@kestack/kabuki/react';

/*
 * Steps, counted the way a reader counts them: 0 is the app right after
 * init, n is the app right after the nth Message on the Branch.
 */

/** The step shown: the last one while live. */
export const stepOf = ({ branch, shown }: AppRuntime): number =>
  shown === null
    ? branch.length
    : shown === 'init'
      ? 0
      : branch.findIndex((entry) => entry.id === shown) + 1;

/** Show a step; the last one is live. */
export const showStep = ({ branch, show }: AppRuntime, step: number) =>
  show(
    step >= branch.length ? null : step <= 0 ? 'init' : branch[step - 1]!.id,
  );

/** Go live from a step, growing a new Branch from it. */
export const carryOn = (runtime: AppRuntime, step: number) => {
  runtime.show(null);
  runtime.start(step <= 0 ? null : runtime.branch[step - 1]!.id);
};

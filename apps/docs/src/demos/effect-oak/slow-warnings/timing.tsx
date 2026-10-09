import { useLayoutEffect } from 'react';
import type { ReactNode } from 'react';
import { burnCpu, VIEW_WORK_MS } from './burn.js';
import { report, THRESHOLD_MS } from './phases.js';
import type { Phase, SlowWarningReport } from './phases.js';

/*
 * Timing slow work from outside the Runtime, which has no slow callback.
 *
 * - Update: `send` handles the Message before it returns, so timing the call
 *   times Update (plus writing the Log).
 * - View and Patch: from when `Timed` starts drawing to its layout effect,
 *   after React has written the DOM. That covers drawing its children and
 *   putting them on the page.
 */

type Tagged = { readonly _tag: string };

/** `send`, timed: an Update over its threshold is reported. */
export const timedSend =
  <M extends Tagged>(
    send: (message: M) => void,
    onSlow: (report: SlowWarningReport) => void,
  ) =>
  (message: M) => {
    const started = performance.now();
    send(message);
    const took = performance.now() - started;
    if (took > THRESHOLD_MS.Update)
      onSlow(report('Update', took, message._tag));
  };

/** Draws its children, and reports if this run's draw was slow. */
export const Timed = ({
  run,
  phase,
  trigger,
  onSlow,
  children,
}: {
  /** A new number for every run; only a new run is timed. */
  readonly run: number;
  /** What this run is timing, if anything. */
  readonly phase: Phase | null;
  readonly trigger: string;
  readonly onSlow: (report: SlowWarningReport) => void;
  readonly children: ReactNode;
}) => {
  const started = performance.now();
  useLayoutEffect(() => {
    if (phase === null) return;
    const took = performance.now() - started;
    if (took > THRESHOLD_MS[phase]) onSlow(report(phase, took, trigger));
  }, [run]);
  return children;
};

/** A drawing that is slow on purpose while `slow` is set. */
export const SlowDraw = ({ slow }: { readonly slow: boolean }) => {
  if (slow) burnCpu(VIEW_WORK_MS);
  return null;
};

import { useEffect, useReducer, useRef } from 'react';
import type { AppRuntime } from 'effect-oak/react';

/** How long the panel may lag behind a busy Log, in milliseconds. */
const EVERY = 100;

/**
 * The runtime as the panel sees it: a flood of Messages reaches it at most
 * once every `EVERY` ms, the last one always, while what the user does (the
 * Step shown, stopping, starting, clearing, forking) reaches it at once.
 */
export const usePaced = (runtime: AppRuntime): AppRuntime => {
  const [, again] = useReducer((n: number) => n + 1, 0);
  const kept = useRef({ runtime, length: runtime.log.length, at: 0 });
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const was = kept.current;
  const now = performance.now();
  const urgent =
    runtime.shown !== was.runtime.shown ||
    runtime.running !== was.runtime.running ||
    runtime.log.length < was.length ||
    (runtime.log.length === was.length && runtime.head !== was.runtime.head);
  if (runtime !== was.runtime) {
    if (urgent || now - was.at >= EVERY) {
      kept.current = { runtime, length: runtime.log.length, at: now };
    } else if (timer.current === undefined) {
      timer.current = setTimeout(
        () => {
          timer.current = undefined;
          again();
        },
        EVERY - (now - was.at),
      );
    }
  }
  // A pending catch-up must not outlive the panel.
  useEffect(() => () => clearTimeout(timer.current), []);
  return kept.current.runtime;
};

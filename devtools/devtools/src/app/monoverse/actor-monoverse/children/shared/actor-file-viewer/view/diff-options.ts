import { useSyncExternalStore } from 'react';
import {
  defaultDiffOptions,
  type DiffOptions,
} from '@kestack/web-platform/ui/viewers/diff-viewer';

/*
 * How a diff is read, kept by the browser for every file alike: one file
 * opens as the last was left, and the next time Monoverse opens too. A
 * view's preference, so no Actor holds it.
 */

const key = 'monoverse:diff-options';
const initial: DiffOptions = {
  ...defaultDiffOptions,
  layout: 'unified',
  wrap: true,
};

const stored = (): DiffOptions => {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    return raw === null || raw === undefined
      ? initial
      : { ...initial, ...(JSON.parse(raw) as Partial<DiffOptions>) };
  } catch {
    return initial;
  }
};

let current = stored();
const listeners = new Set<() => void>();

/** Sets some of the options, keeping the rest. */
export function setDiffOptions(next: Partial<DiffOptions>): void {
  current = { ...current, ...next };
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(current));
  } catch {
    // A browser that keeps nothing still reads this session's options.
  }
  for (const listener of listeners) listener();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export function useDiffOptions(): DiffOptions {
  return useSyncExternalStore(subscribe, () => current);
}

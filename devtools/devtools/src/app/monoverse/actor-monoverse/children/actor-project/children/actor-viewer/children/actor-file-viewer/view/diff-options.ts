import { useSyncExternalStore } from 'react';
import {
  defaultDiffOptions,
  type DiffOptions,
} from '@kestack/web-platform/ui/viewers/diff-viewer';

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

const keepIfTheBrowserAllows = (options: DiffOptions) => {
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(options));
  } catch {}
};

let current = stored();
const listeners = new Set<() => void>();

export function setDiffOptions(next: Partial<DiffOptions>): void {
  current = { ...current, ...next };
  keepIfTheBrowserAllows(current);
  for (const listener of listeners) listener();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export function useDiffOptions(): DiffOptions {
  return useSyncExternalStore(subscribe, () => current);
}

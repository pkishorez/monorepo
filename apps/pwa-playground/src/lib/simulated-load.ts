import { useSyncExternalStore } from 'react';

/**
 * How long a Page Turn's page takes to load, made up for testing: the real
 * load, delayed; a load that fails after a second; or one that never ends,
 * so the turn times out. Kept in localStorage, so it holds across pages.
 */
export type SimulatedLoad = 'real' | '500' | '2000' | '5000' | 'fail' | 'hang';

export const SIMULATED_LOADS: ReadonlyArray<{
  readonly value: SimulatedLoad;
  readonly label: string;
}> = [
  { value: 'real', label: 'Real' },
  { value: '500', label: '0.5 s' },
  { value: '2000', label: '2 s' },
  { value: '5000', label: '5 s' },
  { value: 'fail', label: 'Fails' },
  { value: 'hang', label: 'Hangs' },
];

const KEY = 'pwa-playground:simulated-load';
const listeners = new Set<() => void>();

const read = (): SimulatedLoad => {
  const stored =
    typeof localStorage === 'undefined' ? null : localStorage.getItem(KEY);
  return SIMULATED_LOADS.some((option) => option.value === stored)
    ? (stored as SimulatedLoad)
    : 'real';
};

export const setSimulatedLoad = (value: SimulatedLoad): void => {
  localStorage.setItem(KEY, value);
  for (const listener of listeners) listener();
};

export const useSimulatedLoad = (): SimulatedLoad =>
  useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    read,
    () => 'real',
  );

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** A Page Turn `load`: the router's preload, as slow or broken as the setting says. */
export const simulateLoad = async (
  _to: string,
  preload: () => Promise<void>,
): Promise<void> => {
  const setting = read();
  if (setting === 'real') return preload();
  if (setting === 'hang') return new Promise(() => undefined);
  if (setting === 'fail') {
    await wait(1000);
    throw new Error('Simulated load failure');
  }
  await Promise.all([wait(Number(setting)), preload()]);
};

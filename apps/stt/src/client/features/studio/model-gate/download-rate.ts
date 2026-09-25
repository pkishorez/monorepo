import { useRef } from 'react';

/** How far back the rate looks; long enough to smooth bursts between chunks. */
const windowMs = 3000;

/**
 * Bytes per second over the last few seconds, from the running count of
 * bytes fetched. Null until there is half a second of samples to go on.
 */
export function useDownloadRate(fetched: number): number | null {
  const samples = useRef<
    Array<{ readonly at: number; readonly fetched: number }>
  >([]);
  const now = performance.now();
  const history = samples.current;
  if (history.at(-1)?.fetched !== fetched) history.push({ at: now, fetched });
  while (history.length > 2 && now - history[0]!.at > windowMs) history.shift();
  const first = history[0];
  const last = history.at(-1);
  if (!first || !last || last.at - first.at < 500) return null;
  return ((last.fetched - first.fetched) / (last.at - first.at)) * 1000;
}

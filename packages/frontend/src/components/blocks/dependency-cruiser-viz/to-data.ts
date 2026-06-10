import type { DepcruiseVizData } from './model';

/**
 * Extract renderable {@link DepcruiseVizData} from a raw, untyped devtools
 * report `depcruise` slice.
 *
 * Pass the whole slice (the `{ available }` union). Returns the inner `data`
 * payload when `available: true`, or `null` when the tool is not configured
 * (or the value is absent/malformed). No schema decode is performed — the
 * available shape is trusted via a thin cast.
 */
export function toDepcruiseVizData(raw: unknown): DepcruiseVizData | null {
  if (
    raw &&
    typeof raw === 'object' &&
    (raw as { available?: unknown }).available === true
  ) {
    return (raw as { data: DepcruiseVizData }).data;
  }
  return null;
}
